import { URI } from 'vscode-uri'
import { autocompletion, pickedCompletion } from '@codemirror/autocomplete'
import posthog from 'posthog-js'
import {
    DiagnosticWithAction,
    LanguageServerClient,
    LanguageServerPluginInterface,
    Notification,
} from './stdioClient'
import { gotoDefinition } from '../globalSlice'
import {
    Action,
    ActionTransaction,
    Diagnostic,
    getDiagnostics,
    lintState,
    setDiagnostics,
} from '../linter/lint'
import {
    Decoration,
    DecorationSet,
    EditorView,
    Tooltip,
    ViewPlugin,
    hoverTooltip,
} from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'
import {
    Extension,
    Facet,
    Range,
    StateEffect,
    StateField,
    Text,
} from '@codemirror/state'

import {
    findDeclarationGivenDefinition,
    getCachedComments,
    getCachedFileName,
    getCachedTests,
    getCommentSingle,
    getLanguageFromFilename,
} from '../extensions/utils'
import type {
    Completion,
    CompletionContext,
    CompletionResult,
} from '@codemirror/autocomplete'
import md from 'markdown-it'
import {
    CompletionItemKind,
    CompletionTriggerKind,
    DiagnosticSeverity,
} from 'vscode-languageserver-protocol'

import type { PublishDiagnosticsParams } from 'vscode-languageserver-protocol'
import * as LSP from 'vscode-languageserver-protocol'
import { LanguageSupport, syntaxTree } from '@codemirror/language'
import { languages } from '@codemirror/language-data'

import { vscodeDarkInit } from '../../vscodeTheme'

import { store } from '../../app/store'

interface SemanticToken {
    from: number
    to: number
    type: string
    modifiers: string[]
}

const addToken = StateEffect.define<SemanticToken>({
    map: (token: SemanticToken, change) => ({
        ...token,
        from: change.mapPos(token.from),
        to: change.mapPos(token.to),
    }),
})
// interface SemanticEdit {
//   start: number;
//   deleteCount: number;
//   tokens: SemanticToken[];
// }
export const semanticTokenField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none
    },
    update(underlines, tr) {
        underlines = underlines.map(tr.changes)

        // check if any of the changes are addToken
        const hasAddToken = tr.effects.some((e) => e.is(addToken))
        if (hasAddToken) {
            underlines = underlines.update({
                filter: (from, to) => false,
            })
        }

        for (const e of tr.effects)
            if (e.is(addToken)) {
                const modifierClasses = e.value.modifiers
                    .map((m: string) => `cm-semantic-${e.value.type}-${m}`)
                    .join(' ')
                const className = `cm-semantic ${modifierClasses} cm-semantic-${e.value.type}`
                if (e.value.from < e.value.to) {
                    underlines = underlines.update({
                        add: [
                            Decoration.mark({ class: className }).range(
                                e.value.from,
                                e.value.to
                            ),
                        ],
                    })
                }
            }
        return underlines
    },
    provide: (f) => EditorView.decorations.from(f),
})

// TODO - remove this when done testing autocomplete
import _ from 'lodash'
import { computeAndRenderTest, renderNewTest } from '../tests/testSlice'
const dontComplete = [
    'TemplateString',
    'String',
    'RegExp',
    'LineComment',
    'BlockComment',
    'VariableDefinition',
    'Type',
    'Label',
    'PropertyDefinition',
    'PropertyName',
    'PrivatePropertyDefinition',
    'PrivatePropertyName',
]
const keywords =
    /*@__PURE__*/ 'break case const continue default delete export extends false finally in instanceof let new return static super switch this throw true typeof var yield'
        .split(' ')
        .map((kw) => ({ label: kw, type: 'keyword' }))
// TODO - End of temporarily added stuff

const darkTransparentVscode = vscodeDarkInit({
    settings: { background: 'transparent' },
})

const timeout = 10000
const changesDelay = 100

const CompletionItemKindMap = Object.fromEntries(
    Object.entries(CompletionItemKind).map(([key, value]) => [value, key])
) as Record<CompletionItemKind, string>

export const docPathFacet = Facet.define<string, string>({
    combine: (values) => values[values.length - 1],
})

// A plugin that interacts with the language server client and provides features such as hover, completion, and diagnostics
export class LanguageServerPlugin implements LanguageServerPluginInterface {
    // Tracks the document version for each document
    private documentVersionMap: { [documentPath: string]: number } = {}
    public markedRange: { from: number; to: number } | null = null

    private previousCompletions: {
        path: string
        line: number
        from?: number
        to?: number
        wordCompleted: boolean
        // previousWord: string,
        future: Promise<LSP.CompletionList | null>
        // future: Promise<LSP.CompletionItem[] | LSP.CompletionList | null>
        // result: null | LSP.CompletionItem[] | LSP.CompletionList
        result: null | LSP.CompletionList
    } | null = null

    // The timeout for sending document changes
    private changesTimeout: NodeJS.Timeout | null

    private previousSemanticTokenResultId?: string
    private previousSemanticTokens: SemanticToken[] = []

    constructor(
        // The editor view
        public client: LanguageServerClient,
        private view: EditorView,
        // Whether to allow HTML content in tooltips and documentation
        private allowHTMLContent: boolean = true
    ) {
        this.changesTimeout = null
        this.client.attachPlugin(this)

        // Initialize the document with the server
        this.initialize()
    }
    private getDocPath(view = this.view) {
        return view.state.facet(docPathFacet)
    }
    private getDocText(view = this.view) {
        return view.state.doc.toString()
    }
    private getDocUri(view = this.view) {
        return URI.file(this.getDocPath(view)).toString()
    }

    debouncedSemanticTokens: any = _.debounce((view: EditorView) => {
        this.requestSemanticTokens(view)
    }, 200)

    // Update the plugin when the document changes
    update({ docChanged, view }: ViewUpdate) {
        if (!docChanged) return
        if (this.changesTimeout) clearTimeout(this.changesTimeout)

        this.changesTimeout = setTimeout(async () => {
            await this.client.sendChange({
                documentPath: this.getDocPath(),
                documentText: this.getDocText(),
            })

            if (!this.client.isCopilot) this.debouncedSemanticTokens(view)
        }, changesDelay)
    }

    // Destroy the plugin and detach from the client
    destroy() {
        this.client.detachPlugin(this)
        //this.client.closeDocument({documentPath: this.getDocUri()})
    }

    // Initialize the document with the server
    async initialize() {
        // Wait for the client to be ready
        await this.client.initializePromise

        this.client.maybeOpenDocument({
            documentPath: this.getDocPath(),
            documentText: this.getDocText(),
        })

        this.requestDiagnostics(this.view)
        if (!this.client.isCopilot) this.debouncedSemanticTokens(this.view)
    }
    // Request hover tooltip from the server
    async requestHoverTooltip(
        view: EditorView,
        // The position in the document
        { line, character }: { line: number; character: number }
    ): Promise<Tooltip | null> {
        if (!this.client.ready || !this.client.capabilities!.hoverProvider) {
            return null
        }

        // check if we're focused on the codemirror view
        // const activeElementParent = document.activeElement?.parentElement?.parentElement;
        //
        // if (activeElementParent !== view.dom) {
        //     return null;
        // }

        const documentPath = view.state.facet(docPathFacet)

        const result = await this.client.textDocumentHover({
            textDocument: { uri: URI.file(documentPath).toString() },
            position: { line, character },
        })

        if (!result) return null

        // Extract the contents and the range from the result
        const { contents, range } = result

        // Convert the position and range to offsets
        const pos = posToOffset(view.state.doc, { line, character })!

        // get the end position in the syntax tree
        const nodeWithEnd = syntaxTree(view.state).resolve(pos, 0).node

        const start = nodeWithEnd.from
        const end = nodeWithEnd.to

        if (pos === null) return null

        // Create a tooltip element with the formatted contents
        const outerDom = document.createElement('div')
        outerDom.classList.add('cm-popup-tooltip-outer')

        const upperDom = document.createElement('div')
        upperDom.classList.add('cm-popup-tooltip-upper')

        // perhaps add button
        const node = syntaxTree(view.state).resolve(pos, -1).node
        const valueInNodeRange = view.state.doc.sliceString(node.from, node.to)!
        if (
            [
                'VariableDefinition',
                'PropertyDefinition',
                'VariableName',
            ].includes(node.type.name)
        ) {
            posthog.capture('Show Hover Test/Comment', {})
            const parentNode = findDeclarationGivenDefinition(node)!
            if (false && parentNode != null) {
                const docContents = view.state.doc.toString()
                const functionBody = docContents.slice(
                    parentNode.from,
                    parentNode.to
                )

                // Get the node's parent
                const startLine = view.state.doc.lineAt(node.from).number - 1
                let comments = getCachedComments()
                const tests = getCachedTests()
                // const hasTests = getHasTestFile();

                // create a div to house all buttons
                const buttonDiv = document.createElement('div')
                upperDom.appendChild(buttonDiv)

                buttonDiv.classList.add('cm-popup-tooltip-button-container')

                // comment button
                const commentButton = document.createElement('button')
                commentButton.classList.add('cm-popup-tooltip-comment-button')
                const magicSpan = document.createElement('span')
                magicSpan.classList.add('cm-AI-magic')
                commentButton.appendChild(magicSpan)
                const docstringButton = document.createElement('button')
                const docstringSpan = document.createElement('span')
                docstringSpan.innerText = 'Add Docstring'
                commentButton.appendChild(docstringSpan)

                commentButton.onclick = () => {
                    posthog.capture('Added Comment', {})
                    const line = view.state.doc.lineAt(pos)
                    const startOfLine = line.from
                    let getCommentFunction: any = function () {
                        return getCommentSingle({
                            filename: getCachedFileName()!,
                            functionBody,
                            functionName: valueInNodeRange,
                        })
                    }
                    comments = getCachedComments()
                    if (comments && comments[valueInNodeRange]) {
                        getCommentFunction = function () {
                            return {
                                then(func: any) {
                                    func({
                                        comment:
                                            comments[valueInNodeRange].comment,
                                    })
                                },
                            }
                        }
                    }
                    getCommentFunction().then(
                        ({ comment }: { comment: string | null }) => {
                            if (comment == null) return
                            const toInsert = comment
                            const lineIndentation = line.text.match(/^\s*/)![0]
                            const indented = toInsert
                                .trim()
                                .split('\n')
                                .map((line, i) => {
                                    return lineIndentation + line
                                })
                                .join('\n')
                            // insert before start of line, keep selection
                            view.dispatch({
                                changes: {
                                    from: startOfLine,
                                    insert: indented + '\n',
                                },
                                selection: {
                                    anchor: startOfLine + toInsert.length,
                                },
                            })
                        }
                    )
                }
                buttonDiv.appendChild(commentButton)

                const commentDiv = document.createElement('div')
                commentDiv.classList.add('cm-popup-tooltip-comment')
                if (comments && comments[valueInNodeRange]) {
                    commentDiv.innerText =
                        comments[valueInNodeRange].description
                }
                upperDom.appendChild(commentDiv)

                // test button

                const testButton = document.createElement('button')
                testButton.classList.add('cm-popup-tooltip-comment-button')
                const magicSpanTest = document.createElement('span')
                magicSpanTest.classList.add('cm-AI-magic')
                testButton.appendChild(magicSpanTest)
                const testButtonInner = document.createElement('span')
                testButtonInner.innerText = 'Add Test'
                testButton.appendChild(testButtonInner)

                testButton.onclick = () => {
                    posthog.capture('Added Test', {})
                    if (tests && tests[valueInNodeRange]) {
                        store.dispatch(
                            renderNewTest({
                                filePath: getCachedFileName()!,
                                functionName: valueInNodeRange,
                                startLine,
                            })
                        )
                    } else {
                        store.dispatch(
                            computeAndRenderTest({
                                fileName: getCachedFileName()!,
                                functionBody,
                                startLine,
                            })
                        )
                    }
                }
                buttonDiv.appendChild(testButton)
            }
        }

        const dom = document.createElement('div')
        dom.classList.add('cm-popup-tooltip')

        const mdContents = formatContents(contents)
        dom.innerHTML = mdContents
        await prettifyDom(dom)

        outerDom.appendChild(upperDom)
        outerDom.appendChild(dom)

        // if no text return null
        if (outerDom.innerText.trim() === '') return null

        return {
            pos: start,
            end,
            create: (view) => ({ dom: outerDom }),
            above: true,
        }
    }

    parseSemanticTokens(view: EditorView, data: number[]) {
        // decode the lsp semantic token types
        const tokens = []
        for (let i = 0; i < data.length; i += 5) {
            tokens.push({
                deltaLine: data[i],
                startChar: data[i + 1],
                length: data[i + 2],
                tokenType: data[i + 3],
                modifiers: data[i + 4],
            })
        }

        // convert the tokens into an array of {to, from, type} objects
        const tokenTypes =
            this.client.capabilities!.semanticTokensProvider!.legend.tokenTypes
        const tokenModifiers =
            this.client.capabilities!.semanticTokensProvider!.legend
                .tokenModifiers
        const tokenRanges: any = []
        let curLine = 0
        let prevStart = 0
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i]
            const tokenType = tokenTypes[token.tokenType]
            // get a list of modifiers
            const tokenModifier = []
            for (let j = 0; j < tokenModifiers.length; j++) {
                if (token.modifiers & (1 << j)) {
                    tokenModifier.push(tokenModifiers[j])
                }
            }

            if (token.deltaLine != 0) prevStart = 0

            const tokenRange = {
                from: posToOffset(view.state.doc, {
                    line: curLine + token.deltaLine,
                    character: prevStart + token.startChar,
                })!,
                to: posToOffset(view.state.doc, {
                    line: curLine + token.deltaLine,
                    character: prevStart + token.startChar + token.length,
                })!,
                type: tokenType,
                modifiers: tokenModifier,
            }
            tokenRanges.push(tokenRange)

            curLine += token.deltaLine
            prevStart += token.startChar
        }

        // sort by from
        tokenRanges.sort((a: any, b: any) => a.from - b.from)
        return tokenRanges
    }

    async requestSemanticTokens(view: EditorView) {
        if (
            !this.client.ready ||
            !this.client.capabilities!.semanticTokensProvider
        ) {
            return null
        }

        if (view.state.doc.lines >= 1000) {
            return null
        }
        const path = this.getDocPath()
        const text = this.getDocText()
        const result = await this.client.textDocumentSemanticTokensFull({
            textDocument: { uri: URI.file(path).toString() },
        })
        if (!result) return null

        const { resultId, data } = result
        this.previousSemanticTokenResultId = resultId
        this.previousSemanticTokens = this.parseSemanticTokens(view, data)

        const effects: StateEffect<SemanticToken | Extension>[] =
            this.previousSemanticTokens.map((tokenRange: any) =>
                addToken.of(tokenRange)
            )

        view.dispatch({ effects })
    }

    // Request completion from the server
    async requestCompletion(
        // The completion context
        context: CompletionContext,
        // The position in the document
        { line, character }: { line: number; character: number },
        // The trigger kind and character
        {
            triggerKind,
            triggerCharacter,
        }: {
            triggerKind: CompletionTriggerKind
            triggerCharacter: string | undefined
        }
    ): Promise<CompletionResult | null> {
        // Do nothing if the client is not ready or does not support completion

        if (!this.client.ready || !this.client.capabilities!.completionProvider)
            return null

        const path = this.getDocPath()
        // let previousWord = context.tokenBefore([])!.text
        let result

        // Future to determine if this has been interrupted
        const interruptedFuture = new Promise<'failed'>((resolve) => {
            context.addEventListener('abort', () => {
                resolve('failed')
            })
        })

        // Getting the start of where the current completion is
        const beforeMatch = context.matchBefore(/\w*/)

        const from = beforeMatch?.from
        // Get the current text

        const maybeResult = async (
            resultFuture: Promise<// LSP.CompletionList | LSP.CompletionItem[] | null
            LSP.CompletionList | null>
        ) => {
            const multiOptions = await Promise.race([
                resultFuture,
                interruptedFuture,
            ])
            if (multiOptions == 'failed') {
                return 'failed'
            } else {
                return multiOptions
            }
        }

        // Do we await for some future result?
        let stillWaitFutureResult = false
        if (
            this.previousCompletions != null &&
            this.previousCompletions.path === path &&
            this.previousCompletions.line === line &&
            this.previousCompletions.from === from // &&
            // this.previousCompletions.
            // (this.previousCompletions.to && this.previousCompletions.to <= context.pos)
        ) {
            const maybeFinishedResult = await maybeResult(
                this.previousCompletions.future
            )

            if (maybeFinishedResult == 'failed') {
                return null
            } else {
                result = maybeFinishedResult
                if (!this.previousCompletions.wordCompleted) {
                    stillWaitFutureResult = true
                }
                // if (this.previousCompletions.to == context.pos) {
                //     stillWaitFutureResult = true
                // }
            }
        }

        if (result == null || stillWaitFutureResult) {
            const resultFuture =
                new Promise<// LSP.CompletionList | LSP.CompletionItem[] | null
                LSP.CompletionList | null>(async (resolve, reject) => {
                    const text = this.getDocText()
                    this.client.sendChange({
                        documentPath: this.getDocPath(),
                        documentText: text,
                    })

                    const wordBefore = context.matchBefore(/\w+/)?.text
                    const tosend = {
                        textDocument: { uri: URI.file(path).toString() },
                        position: { line, character },
                        context: {
                            triggerKind,
                            triggerCharacter,
                        },
                        // Custom addition by me
                        wordBefore: wordBefore ?? '',
                    }

                    const awaitedResult =
                        await this.client.textDocumentCompletion(tosend)

                    if (!awaitedResult) return null
                    if (!Array.isArray(awaitedResult)) {
                        // && !awaitedResult.isIncomplete) {
                        // resolve([]);
                        resolve(awaitedResult)
                    } else {
                        resolve(null)
                    }
                })
            const clientName = this.client.getName()

            if (clientName && !['python', 'csharp'].includes(clientName)) {
                // Python doesnt use this so we only cache when not in python
                this.previousCompletions = {
                    path,
                    line,
                    from,
                    wordCompleted: false,
                    // to: from && (from + 1), // Think this does the right thing
                    // previousWord,
                    future: resultFuture,
                    result: null,
                }
            }

            if (result == null) {
                const maybeFinishedResult = await maybeResult(resultFuture)
                if (maybeFinishedResult == 'failed') {
                    return null
                } else if (maybeFinishedResult == null) {
                    return null
                } else {
                    result = maybeFinishedResult
                }
            } else {
                const maybeFinishedResult = await Promise.race([
                    resultFuture,
                    new Promise<'SLOW'>((resolve) =>
                        setTimeout(() => resolve('SLOW'), 2)
                    ),
                ])
                if (maybeFinishedResult == 'SLOW') {
                    // Do nothing
                } else if (maybeFinishedResult != null) {
                    result = maybeFinishedResult
                }
            }
        }

        // Extract the items from the result
        const items = 'items' in result ? result.items : result

        if (items.length == 0) return null

        // Map the items to the completion interface
        let textEdited = 0

        // let options = items.filter((item => !item.insertTextFormat || item.insertTextFormat == 1))
        let options = items.map((item) => {
            const {
                detail,
                label,
                kind,
                textEdit,
                documentation,
                sortText,
                filterText,
                insertText,
            } = item
            const completion: Completion & {
                filterText: string
                sortText?: string
                pickText: string
            } = {
                label: label.trim(),
                detail,
                pickText: textEdit?.newText ?? insertText ?? label,
                apply: async (
                    view: EditorView,
                    completion: Completion,
                    from: number,
                    to: number
                ) => {
                    const pickText = textEdit?.newText ?? insertText ?? label
                    let changesText: {
                        from: number
                        to: number
                        insert: string
                    }[] = []
                    try {
                        if (textEdit) {
                            textEdited += 1
                            // const ughTs = textEdit as any;
                            // const range = ughTs.range || ughTs.insert;
                            // const { newText } = textEdit;
                            // const { start, end } = range;
                            // const from = view.state.doc.lineAt(start.line).from + start.character;
                            // const to = view.state.doc.lineAt(end.line).from + end.character;

                            const completionItemResolve =
                                await this.client.completionItemResolve(item)

                            // get the changes
                            const additionalChanges =
                                completionItemResolve.additionalTextEdits
                            if (additionalChanges != null) {
                                changesText = additionalChanges.map(
                                    (change: any) => {
                                        const { newText, range } = change
                                        const { start, end } = range
                                        const from =
                                            view.state.doc.line(start.line + 1)
                                                .from + start.character
                                        const to =
                                            view.state.doc.line(end.line + 1)
                                                .from + end.character
                                        return { from, to, insert: newText }
                                    }
                                )
                            }
                        }
                    } catch (e) {
                        console.error(e)
                    }
                    const changes = [{ from, to, insert: pickText }].concat(
                        changesText
                    )
                    view.dispatch({
                        changes: changes,
                        annotations: [pickedCompletion.of(completion)],
                    })
                },
                type: kind && CompletionItemKindMap[kind].toLowerCase(),
                sortText: sortText,
                filterText: filterText ?? label,
            }
            if (documentation) {
                completion.info = formatContents(documentation)
            }
            return completion
        })

        // Find the matching span and token
        let { pos } = context
        const [span, match] = prefixMatch(options)
        const token = context.matchBefore(match)
        if (token) {
            pos = token.from
        }

        const preFiltered = result.itemDefaults?.data?.filter == true
        // Filter options if result.itemDefaults.data.filter is not null
        if (preFiltered) {
            options = options.filter(
                (item: { label: string; filterText?: string }) => {
                    if (token == null) return true
                    // Check if wordBefore is a non-contiguous substring of the label
                    // First check if the label is the same size
                    let label = item.label.toLowerCase()
                    if (item.filterText != null) {
                        label = item.filterText.toLowerCase()
                    }
                    if (label.length < token.text.length) {
                        return false
                    }

                    let i = 0,
                        j = 0
                    while (i < token.text.length && j < label.length) {
                        if (token.text[i] == label[j]) {
                            i++
                        }
                        j++
                    }
                    return i == token.text.length
                }
            )
        }

        // Add a boost to each result
        let boost = 99
        const boostDecr = 150 / options.length
        options = options.map((item) => {
            item.boost = boost
            boost -= boostDecr
            return item
        })

        if (result.isIncomplete) {
            return {
                from: pos,
                options,
                filter: !preFiltered,
                // filter: false
            }
        } else {
            if (this.previousCompletions?.to) {
                this.previousCompletions.wordCompleted = true
            }
            return {
                from: pos,
                options,
                // validFor: /^\w+$/,
                filter: !preFiltered,
                // filter: false
            }
        }
    }

    // Process notifications from the server
    processNotification(notification: Notification) {
        //
        try {
            switch (notification.method) {
                case 'textDocument/publishDiagnostics':
                    // return this.debouncedProcessDiagnostics(notification.params);
                    if (notification.params.uri == this.getDocUri())
                        return this.debouncedProcessDiagnostics(
                            notification.params
                        )
                    else return
                default:
                    return
                // case "window/logMessage":
                //   break
                // case "window/showMessage":
                //   break
            }
        } catch (error) {
            console.error(error)
        }
    }

    debouncedProcessDiagnostics = _.debounce(this.processDiagnostics, 100)

    processDiagnostics(params: PublishDiagnosticsParams) {
        // Ignore diagnostics for other documents
        if (params.uri !== this.getDocUri()) return

        const getCodeActions = async () => {
            if (
                !this.client.ready ||
                !this.client.capabilities!.codeActionProvider
            ) {
                return []
            }
            const diagnosticsWithActionParams = params.diagnostics.map(
                (diagnostic) => {
                    return {
                        diagnostic,
                        codeActionParams: {
                            textDocument: {
                                uri: params.uri,
                            },
                            range: diagnostic.range,
                            context: LSP.CodeActionContext.create([diagnostic]),
                        },
                    }
                }
            )

            const processEdits = (edits: LSP.TextEdit[]) => {
                if (edits == null) {
                    return []
                } else {
                    return edits.map((edit) => {
                        // return replace(edit.newText);
                        return {
                            type: 'replaceGivenRange',
                            text: edit.newText,
                            from: {
                                line: edit.range.start.line,
                                col: edit.range.start.character,
                            },
                            to: {
                                line: edit.range.end.line,
                                col: edit.range.end.character,
                            },
                        } as ActionTransaction
                    })
                }
            }

            const rawActionToCM = (action: LSP.CodeAction | LSP.Command) => {
                // Check if action is a LSP.WorkspaceEdit
                const actionTransactions: ActionTransaction[] = []
                if ('edit' in action) {
                    if (action?.edit?.changes != null) {
                        for (const key in action.edit.changes) {
                            if (key == params.uri) {
                                actionTransactions.push(
                                    ...processEdits(action.edit.changes[key])
                                )
                            }
                        }
                    }
                }
                if ('command' in action && typeof action.command != 'string') {
                    if (action.command?.arguments != null) {
                        action.command.arguments.forEach(
                            (arg: {
                                documentChanges: { edits: LSP.TextEdit[] }[]
                            }) => {
                                if (arg.documentChanges != null)
                                    arg.documentChanges.forEach(({ edits }) => {
                                        actionTransactions.push(
                                            ...processEdits(edits)
                                        )
                                    })
                            }
                        )
                    }
                }
                if (actionTransactions.length == 0) {
                    return null
                } else {
                    return {
                        name: action.title,
                        payload: actionTransactions,
                    } as Action
                }
            }

            const start = performance.now()
            const diagnostics = await Promise.all(
                diagnosticsWithActionParams.map(
                    async ({ diagnostic, codeActionParams }) => {
                        const rawCodeAction =
                            await this.client.textDocumentCodeAction(
                                codeActionParams
                            )
                        const usableCodeActions = rawCodeAction
                            .map(rawActionToCM)
                            .filter((action) => action != null)
                        return {
                            ...diagnostic,
                            actions: usableCodeActions,
                        } as DiagnosticWithAction
                    }
                )
            )
            this.updateDiagnostics(diagnostics)
        }
        // this.updateDiagnostics(params.diagnostics);
        getCodeActions()
    }
    updateDiagnostics(lspDiagnostics: DiagnosticWithAction[]) {
        type severityType = 'error' | 'warning' | 'info'
        const diagnostics = lspDiagnostics
            .map(({ range, message, severity, source, actions }) => ({
                from: posToOffset(this.view.state.doc, range.start)!,
                to: posToOffset(this.view.state.doc, range.end)!,
                // Addition by aman
                line: range.start.line,
                col: range.start.character,
                // Above addition by Aman
                severity: (
                    {
                        [DiagnosticSeverity.Error]: 'error',
                        [DiagnosticSeverity.Warning]: 'warning',
                        [DiagnosticSeverity.Information]: 'info',
                        [DiagnosticSeverity.Hint]: 'info',
                    } as const
                )[severity!],
                message,
                source,
                actions,
            }))
            .map((diagnostic) => {
                if (
                    diagnostic.source == 'pyflakes' &&
                    diagnostic.severity == 'warning'
                ) {
                    return {
                        ...diagnostic,
                        severity: 'info' as severityType,
                    }
                } else {
                    return diagnostic
                }
            })
            .filter(
                ({ from, to, severity }) =>
                    from !== null &&
                    to !== null &&
                    from !== undefined &&
                    to !== undefined
            )
            .sort((a, b) => {
                switch (true) {
                    case a.from < b.from:
                        return -1
                    case a.from > b.from:
                        return 1
                }
                return 0
            })
        // .map((diagnostic) => {
        //     if (diagnostic.severity !== 'error') return diagnostic
        //     const aiQuickFix: Action = {
        //         name: 'Fix all with AI',
        //         payload: [
        //             {
        //                 type: 'fixLSP',
        //             },
        //         ],
        //     }
        //     return {
        //         ...diagnostic,
        //         actions: [
        //             ...(diagnostic.actions == null
        //                 ? []
        //                 : diagnostic.actions),
        //             aiQuickFix,
        //         ],
        //     }
        // })

        // Update the view with the diagnostics
        // Get existing diagnostics
        let aiDiagnostics: Diagnostic[]
        const lintField = this.view.state.field(lintState, false)
        if (!lintField) {
            this.view.dispatch(setDiagnostics(this.view.state, diagnostics))
            return
        }

        aiDiagnostics = getDiagnostics(lintField, this.view.state).filter(
            (diag) => diag.severity == 'aiwarning'
        )

        this.view.dispatch(
            setDiagnostics(this.view.state, [...aiDiagnostics, ...diagnostics])
        )
    }
    // Request diagnostics from the server
    requestDiagnostics(view: EditorView) {
        // Send a document change to trigger diagnostics
        this.client.sendChange({
            documentText: this.getDocText(view),
            documentPath: this.getDocPath(view),
        })
    }

    async copilotSignIn() {
        if (this.client.isCopilot) {
            const first = await this.client.signInInitiate({})
            const { userCode } = first
            return await this.client.signInConfirm({ userCode })
        }
    }
    async copilotComplete(relativePath: string) {
        if (this.client.isCopilot) {
            const source = this.view.state.doc.toString()
            const position = offsetToPos(
                this.view.state.doc,
                this.view.state.selection.main.head
            )

            const tabSize = this.view.state.tabSize
            const indentSize = 1
            const insertSpaces = true
            const path = this.getDocPath()
            const uri = `file://${path}`

            const { completions } = await this.client.getCompletion({
                doc: {
                    source,
                    tabSize,
                    indentSize,
                    insertSpaces,
                    path,
                    uri,
                    relativePath,
                    languageId: getLanguageFromFilename(path),
                    position,
                },
            })
            if (completions.length > 0) {
                return completions[0]
            }
        }
    }
}

export function posToOffset(
    doc: Text,
    pos: { line: number; character: number }
): number | null {
    if (pos.line >= doc.lines) return null
    const offset = doc.line(pos.line + 1).from + pos.character
    if (offset > doc.length) return null
    return offset
}

export function offsetToPos(doc: Text, offset: number) {
    const line = doc.lineAt(offset)
    return {
        line: line.number - 1,
        character: offset - line.from,
    }
}
// A helper function to get the language mode from the class attribute of a code element
async function getLanguage(className: string): Promise<LanguageSupport | null> {
    if (className.startsWith('language-')) {
        const lang = className.slice(9)
        const data = languages.find((l) => l.alias.includes(lang))
        if (data) return await data.load()
    }
    return null
}

// A helper function to create a codemirror view for a code element
async function createCodeMirrorView(
    code: Element,
    newElement: Element,
    syntax: LanguageSupport | null = null
): Promise<LanguageSupport | null> {
    if (syntax === null) {
        syntax = await getLanguage(
            code.getAttribute('class') ?? code.getAttribute('className') ?? ''
        )
    }

    const view = new EditorView({
        doc: (code.textContent ?? '').trim(),

        extensions: [
            syntax ?? [],
            EditorView.editable.of(false),
            darkTransparentVscode,
            EditorView.lineWrapping,
            EditorView.domEventHandlers({
                click: (event, view) => {
                    const target = event.target as HTMLElement
                    if (target.tagName === 'A') {
                        window.open(target.getAttribute('href') ?? '', '_blank')
                    }
                },
            }),
        ],

        parent: newElement,
    })
    // // code.textContent = '';

    return syntax
}

// The main function to prettify the dom
async function prettifyDom(dom: HTMLElement) {
    // Find all the code elements in the dom

    // Change the dom fontFamily to 'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace'
    // dom.style.fontFamily = 'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace';

    const codes = dom.querySelectorAll('pre > code')
    let syntax = null
    let newElement = null
    let payload
    for (let i = 0; i < codes.length; i++) {
        // Replace the code element with a codemirror view
        if (i == 0) {
            newElement = document.createElement('div')
        } else {
            newElement = document.createElement('span')
        }

        syntax = await createCodeMirrorView(codes[i], newElement, syntax)
        codes[i].replaceWith(newElement)
    }
}
function formatContents(
    contents: LSP.MarkupContent | LSP.MarkedString | LSP.MarkedString[]
): string {
    if (Array.isArray(contents)) {
        return contents.map((c) => formatContents(c) + '\n\n').join('')
    } else if (typeof contents === 'string') {
        if (contents.trim() !== '') return md().render(contents)
        else return ''
        // return contents;
    } else {
        // return contents.value;

        // Check if contents.value is empty before rendering
        return contents.value.trim() !== '' ? md().render(contents.value) : ''
    }
}

function toSet(chars: Set<string>) {
    let preamble = ''
    let flat = Array.from(chars).join('')
    const words = /\w/.test(flat)
    if (words) {
        preamble += '\\w'
        flat = flat.replace(/\w/g, '')
    }
    return `[${preamble}${flat.replace(/[^\w\s]/g, '\\$&')}]`
}

function prefixMatch(options: any[]) {
    const first = new Set<string>()
    const rest = new Set<string>()

    for (const { pickText } of options) {
        const stringApply = pickText as string
        const initial = stringApply[0]
        const restStr = stringApply.slice(1)

        first.add(initial)
        for (const char of restStr) {
            rest.add(char)
        }
    }

    const source = toSet(first) + toSet(rest) + '*$'
    return [new RegExp('^' + source), new RegExp(source)]
}

interface LanguageServerPluginOptions {
    client: LanguageServerClient
    allowHTMLContent?: boolean
}

export function copilotServer(options: LanguageServerPluginOptions) {
    let plugin: LanguageServerPlugin
    return ViewPlugin.define(
        (view) =>
            (plugin = new LanguageServerPlugin(
                options.client,
                view,
                options?.allowHTMLContent ?? false
            ))
    )
}

const commandClickEffect = StateEffect.define<Range<Decoration> | null>()

const commandClickField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none
    },
    update(value, tr) {
        if (tr.docChanged) {
            return Decoration.none
        }

        if (tr.effects.some((e) => e.is(commandClickEffect))) {
            for (const effect of tr.effects) {
                if (effect.is(commandClickEffect)) {
                    if (effect.value == null) {
                        return Decoration.none
                    } else {
                        return Decoration.set(effect.value)
                    }
                }
            }
        }
        return value
    },
    provide: (f) => EditorView.decorations.from(f),
})

export function languageServer(options: LanguageServerPluginOptions) {
    let plugin: LanguageServerPlugin

    return [
        commandClickField,
        ViewPlugin.define(
            (view) =>
                (plugin = new LanguageServerPlugin(
                    options.client,
                    view,
                    options?.allowHTMLContent ?? false
                )),
            {
                eventHandlers: {
                    mouseover: (event, view) => {
                        const pos = view.posAtCoords({
                            x: event.clientX,
                            y: event.clientY,
                        })
                        if (pos != null) {
                            const word = view.state.wordAt(pos)
                            // Check if meta key is pressed
                            if (event.metaKey && word) {
                                view.dispatch({
                                    effects: commandClickEffect.of(
                                        Decoration.mark({
                                            class: 'command-click',
                                        }).range(word.from, word.to)
                                    ),
                                })
                            }
                        }
                    },
                    click: (event, view) => {
                        const pos = view.posAtCoords({
                            x: event.clientX,
                            y: event.clientY,
                        })
                        if (pos != null) {
                            const word = view.state.wordAt(pos)
                            const marked = view.state.field(
                                commandClickField,
                                false
                            )
                            if (marked && word != null) {
                                const remaining = marked.update({
                                    filter: (from, to) =>
                                        from == word.from && to == word.to,
                                })
                                if (remaining.size != 0) {
                                    store.dispatch(
                                        gotoDefinition({
                                            path: view.state.facet(
                                                docPathFacet
                                            ),
                                            offset: pos,
                                        })
                                    )
                                }
                            }
                        }
                    },
                    keyup: (event, view) => {
                        if (event.key == 'Meta') {
                            view.dispatch({
                                effects: commandClickEffect.of(null),
                            })
                        }
                    },
                    // TODO - figure out mouse position and listen for click
                    // onkeypress: (event, view) => {
                    //     if (event.key == 'Meta') {
                    //         view.dispatch({
                    //             effects: commandClickEffect.of(null)
                    //         })
                    //     }
                    // },
                },
            }
        ),
        hoverTooltip(
            (view, pos) =>
                plugin?.requestHoverTooltip(
                    view,
                    offsetToPos(view.state.doc, pos)
                ) ?? null,
            {
                hideOn: () => false,
            }
        ),

        autocompletion({
            closeOnBlur: false,
            override: [
                async (context) => {
                    if (plugin == null) return null

                    const { state, pos, explicit } = context
                    const line = state.doc.lineAt(pos)
                    let trigKind: CompletionTriggerKind =
                        CompletionTriggerKind.Invoked
                    let trigChar: string | undefined

                    if (
                        !explicit &&
                        plugin.client.capabilities?.completionProvider?.triggerCharacters?.includes(
                            line.text[pos - line.from - 1]
                        )
                    ) {
                        trigKind = CompletionTriggerKind.TriggerCharacter
                        trigChar = line.text[pos - line.from - 1]
                    }
                    if (
                        trigKind === CompletionTriggerKind.Invoked &&
                        !context.matchBefore(/\w+$/)
                    ) {
                        return null
                    }
                    const completion = await plugin.requestCompletion(
                        context,
                        offsetToPos(state.doc, pos),
                        {
                            triggerKind: trigKind,
                            triggerCharacter: trigChar,
                        }
                    )

                    if (completion == null) return null

                    return completion
                },
            ],
        }),
    ]
}
