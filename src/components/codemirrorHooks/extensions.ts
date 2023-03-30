import { useEffect, useMemo } from 'react'
import {
    Compartment,
    EditorState,
    Extension,
    Prec,
    RangeSetBuilder,
} from '@codemirror/state'
import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    closeHoverTooltips,
    keymap,
    scrollPastEnd,
} from '@codemirror/view'
import { syntaxBundle } from '../../features/extensions/syntax'
import { indentationMarkers } from '../../features/extensions/indentLines'
// import { indentationMarkers } from '@replit/codemirror-indentation-markers';
import { diffExtension } from '../../features/extensions/diff'
import { hackExtension } from '../../features/extensions/hackDiff'
import { diagnosticsField, lintGutter } from '../../features/linter/lint'
import { autocompleteView } from '../../features/extensions/autocomplete'
import { acceptCompletion } from '@codemirror/autocomplete'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import * as csel from '../../features/chat/chatSelectors'
import * as ssel from '../../features/settings/settingsSelectors'
import { Tab } from '../../features/window/state'
import { ReactCodeMirrorRef } from '../react-codemirror'
import { getFileIndentUnit } from '../../features/selectors'
import { indentUnit, syntaxTree } from '@codemirror/language'
import { vim } from '../codemirror-vim'
import { moveToPane, saveFile } from '../../features/globalSlice'
import { closeTab } from '../../features/globalThunks'
import { languageBundle } from '../../features/extensions/lsp'
import {
    completionDecoration,
    copilotBundle,
    getClient,
    rejectSuggestionCommand,
} from '../../features/extensions/ghostText'
import {
    copilotStatus,
    languageServerStatus,
} from '../../features/lsp/languageServerSelector'
import { getLanguageFromFilename } from '../../features/extensions/utils'
import { scrollbarPlugin } from '../../features/extensions/minimap'
import { cursorTooltip } from '../../features/extensions/selectionTooltip'
// import { activeGutter } from '../../features/extensions/activeLineGutter'

import { indentSelection } from '@codemirror/commands'
import { emacs } from '@replit/codemirror-emacs'

import { newLineText } from '../../features/extensions/newLineText'

import { Tree } from '@lezer/common'
import { barExtension } from '../../features/extensions/cmdZBar'
import { updateCommentsEffect } from '../../features/extensions/comments'
import { Tag, getStyleTags, tags } from '@lezer/highlight'
import { fixLintExtension } from '../../features/linter/fixLSPExtension'
import { storePaneIdExtensions } from '../../features/extensions/storePane'
import { store } from '../../app/store'
import { triggerFileSearch } from '../../features/tools/toolSlice'

const getTagName = (tag: Tag) => {
    for (const key of Object.keys(tags)) {
        // Turn key to string
        const keyString = key.toString() as keyof typeof tags
        const currentTag = tags[keyString]

        if ('id' in currentTag && 'id' in tag) {
            if (currentTag.id === tag.id) {
                return keyString
            }
        }
    }
}

const syntaxCompartment = new Compartment(),
    keyBindingsCompartment = new Compartment(),
    domCompartment = new Compartment(),
    commandBarCompartment = new Compartment(),
    diffCompartment = new Compartment(),
    indentCompartment = new Compartment(),
    copilotCompartment = new Compartment(),
    lsCompartment = new Compartment(),
    commentCompartment = new Compartment(),
    readOnlyCompartment = new Compartment()

const OPEN_BRACKETS = ['{', '[', '(']
const CLOSE_BRACKETS = ['}', ']', ')']
const ALL_BRACKETS = [...OPEN_BRACKETS, ...CLOSE_BRACKETS]
class TreeHighlighter {
    decorations: DecorationSet
    tree: Tree
    markCache: { [cls: string]: Decoration } = Object.create(null)
    levels: Decoration[] = [
        Decoration.mark({ class: 'bracketone' }),
        Decoration.mark({ class: 'brackettwo' }),
        Decoration.mark({ class: 'bracketthree' }),
    ]

    constructor(view: EditorView) {
        this.tree = syntaxTree(view.state)
        this.decorations = this.buildDeco(view)
    }

    update(update: ViewUpdate) {
        const tree = syntaxTree(update.state)
        if (tree != this.tree || update.viewportChanged) {
            this.tree = tree
            this.decorations = this.buildDeco(update.view)
        }
    }

    buildDeco(view: EditorView) {
        if (!this.tree.length) return Decoration.none

        const builder = new RangeSetBuilder<Decoration>()
        let level = -1
        const cursor = this.tree.cursor()
        do {
            const tagData = getStyleTags(cursor.node)
            //
            //     name: cursor.name,
            //     str: view.state.doc.sliceString(cursor.from, cursor.to),
            //     tags: tagData?.tags?.map(getTagName),
            //     tagData
            // })

            if (
                cursor != null &&
                ALL_BRACKETS.includes(cursor.name) &&
                cursor.from != null &&
                cursor.to != null
            ) {
                if (OPEN_BRACKETS.includes(cursor.name)) {
                    level += 1
                }
                if (level >= 0)
                    builder.add(
                        cursor.from,
                        cursor.to,
                        this.levels[level % this.levels.length]
                    )
                if (CLOSE_BRACKETS.includes(cursor.name)) {
                    level = Math.max(-1, level - 1)
                }
            }
        } while (cursor.next())
        return builder.finish()
    }
}

const treeHighlighter = Prec.high(
    ViewPlugin.fromClass(TreeHighlighter, {
        decorations: (v) => v.decorations,
    })
)

const globalExtensions = [
    // Prec.highest(keymap.of([
    //         {
    //             key: connector.PLATFORM_CM_KEY + '-Backspace',
    //             run: (view) => {
    //
    //                 // return true
    //                 return true
    //             }

    //         }
    //     ])
    // ),
    EditorView.lineWrapping,
    indentationMarkers(),
    newLineText,
    diffExtension,
    hackExtension,
    lintGutter(),
    barExtension(),
    diagnosticsField,
    autocompleteView,
    storePaneIdExtensions,
    fixLintExtension,
    cursorTooltip(),
    scrollPastEnd(),
    // history({
    //     joinToEvent: (tr: Transaction, isAdjacent: boolean) => {
    //         return true
    //     },
    // }),
    //Prec.high(activeGutter),
    // TODO - remove

    // regexpLinter,
    Prec.highest(
        keymap.of([
            {
                key: connector.PLATFORM_CM_KEY + '-p',
                run: (view) => {
                    store.dispatch(triggerFileSearch())
                    return true
                },
            },
        ])
    ),
    Prec.high(
        keymap.of([
            {
                key: 'Tab',
                run: acceptCompletion,
            },
        ])
    ),
    Prec.highest(
        keymap.of([
            {
                key: connector.PLATFORM_CM_KEY + '-t',
                run: (view) => {
                    indentSelection({
                        state: view.state,
                        dispatch: (transaction) => view.update([transaction]),
                    })
                    return true
                },
            },
        ])
    ),
    scrollbarPlugin,
    treeHighlighter,
    syntaxCompartment.of([]),
    lsCompartment.of([]),
    keyBindingsCompartment.of([]),
    domCompartment.of([]),
    commandBarCompartment.of([]),
    diffCompartment.of([]),
    indentCompartment.of([]),
    copilotCompartment.of([]),
    commentCompartment.of([]),
    readOnlyCompartment.of([]),
]

function getSelectedPos(view: EditorView) {
    const selection = view.state.selection.main

    const startLine = view.state.doc.lineAt(selection.from).number
    const endLine = view.state.doc.lineAt(selection.to).number

    const startLinePos = view.state.doc.line(startLine).from
    const endLinePos = view.state.doc.line(endLine).to

    return { startLinePos, endLinePos }
}

function getSelectedText(view: EditorView) {
    const selection = view.state.selection.main
    const { startLinePos, endLinePos } = getSelectedPos(view)
    const selectedText =
        selection.from == selection.to
            ? null
            : view.state.doc.sliceString(startLinePos, endLinePos)
    return selectedText
}

function getCurrentSelection(view: EditorView) {
    const selection = view.state.selection.main

    const startLine = view.state.doc.lineAt(selection.from).number
    const endLine = view.state.doc.lineAt(selection.to).number

    const startLinePos = view.state.doc.line(startLine).from
    const endLinePos = view.state.doc.line(endLine).to

    const selectedText = view.state.doc.sliceString(startLinePos, endLinePos)

    return {
        text: selectedText,
        startLine: startLine,
        endLine: endLine,
    }
}

export function useExtensions({
    editorRef,
    filePath,
    relativeFilePath,
    tab,
    justCreated,
    readOnly,
}: {
    editorRef: React.MutableRefObject<ReactCodeMirrorRef>
    filePath: string
    relativeFilePath: string
    tab: Tab
    justCreated: boolean
    readOnly: boolean
}) {
    const commandBarOpen = useAppSelector(csel.getIsCommandBarOpen)
    const chatOpen = useAppSelector(csel.isChatOpen)
    const dispatch = useAppDispatch()
    const settings = useAppSelector(ssel.getSettings)
    const fileIndentUnit = useAppSelector(getFileIndentUnit(tab.fileId))
    const languageName = useMemo(
        () => getLanguageFromFilename(filePath),
        [filePath]
    )
    const lsStatus = useAppSelector(languageServerStatus(languageName))
    const isGenerating = useAppSelector(csel.getGenerating)
    const { signedIn, enabled } = useAppSelector(copilotStatus)
    const commentsInFile = useAppSelector(
        (state) => state.commentState.fileThenNames[filePath]
    )

    useEffect(() => {
        let copilot
        if (signedIn && enabled && !isGenerating) {
            copilot = copilotBundle({ filePath, relativeFilePath })
        } else {
            copilot = []
        }
        if (editorRef.current?.view != null) {
            if (
                editorRef.current.view.state.field(completionDecoration, false)
            ) {
                rejectSuggestionCommand(getClient(), editorRef.current.view)
            }
            editorRef.current.view.dispatch({
                effects: copilotCompartment.reconfigure(copilot),
            })
        }
    }, [justCreated, isGenerating, editorRef.current, signedIn, enabled])

    useEffect(() => {
        if (editorRef.current?.view != null) {
            if (readOnly) {
                editorRef.current.view.dispatch({
                    effects: readOnlyCompartment.reconfigure(
                        Prec.highest(EditorState.readOnly.of(true))
                    ),
                })
            } else {
                editorRef.current.view.dispatch({
                    effects: readOnlyCompartment.reconfigure([]),
                })
            }
        }
    }, [justCreated, readOnly, editorRef.current])

    useEffect(() => {
        let lsPlugin: Extension[]
        if (lsStatus && lsStatus.installed && lsStatus.running) {
            lsPlugin = languageBundle(filePath)
        } else {
            lsPlugin = []
        }
        editorRef.current.view?.dispatch({
            effects: lsCompartment.reconfigure(lsPlugin),
        })
    }, [lsStatus, filePath, justCreated, editorRef.current])

    useEffect(() => {
        const main = async () => {
            const syntax = await syntaxBundle(filePath)
            editorRef.current.view?.dispatch({
                effects: syntaxCompartment.reconfigure(syntax),
            })
        }
        main()
    }, [filePath, editorRef.current, settings, justCreated])

    useEffect(() => {
        const newDom = Prec.high(
            EditorView.domEventHandlers({
                auxclick: (event, view) => {
                    view.dispatch({
                        effects: closeHoverTooltips,
                    })
                    // get the text of the current selection
                    if (event.button === 2) {
                        // Get the text at the current position
                        const pos = view.posAtCoords({
                            x: event.clientX,
                            y: event.clientY,
                        })!

                        const cursorPos = view.state.selection.main.from
                        // dispatch(cs.activateDiffFromEditor({
                        //     currentFile: filePath,
                        //     precedingCode: getPrecedingLines(view, 20)!,
                        //     procedingCode: getProcedingLines(view),
                        //     currentSelection: getSelectedText(view)!,
                        //     pos: cursorPos,
                        // }));

                        // Open the menu
                        const selection = getCurrentSelection(view)

                        connector.rightMenuAtToken({
                            offset: pos,
                            path: filePath,
                            includeAddToPrompt: commandBarOpen || chatOpen,
                            codeBlock: {
                                fileId: tab.fileId,
                                ...selection,
                            },
                        })

                        //remove seelction
                        view.dispatch({
                            selection: { anchor: pos },
                        })
                    }
                },
            })
        )

        editorRef.current.view?.dispatch({
            effects: domCompartment.reconfigure(newDom),
        })
    }, [
        commandBarOpen,
        chatOpen,
        filePath,
        tab.fileId,
        editorRef.current,
        justCreated,
    ])

    useEffect(() => {
        let keyBindingsExtension: Extension = []
        switch (settings.keyBindings) {
            case 'vim':
                keyBindingsExtension = Prec.high(
                    vim({
                        callbacks: {
                            save: () => {
                                dispatch(saveFile(null))
                            },
                            saveAndExit: () => {
                                dispatch(saveFile(null))
                                dispatch(closeTab(null))
                            },
                            exit: () => {
                                dispatch(closeTab(null))
                            },
                            toPane: (paneDirection) => () => {
                                dispatch(moveToPane({ paneDirection }))
                            },
                        },
                    })
                )
                break
            case 'emacs':
                keyBindingsExtension = Prec.high(emacs())
                break
            default:
                break
        }

        editorRef.current.view?.dispatch({
            effects: keyBindingsCompartment.reconfigure(keyBindingsExtension),
        })
    }, [settings.keyBindings, editorRef.current, justCreated])

    // useEffect(() => {
    //     editorRef.current.view?.dispatch({
    //         effects: diffCompartment.reconfigure(diffShortcuts),
    //     })
    // }, [filePath, editorRef.current, justCreated])

    useEffect(() => {
        editorRef.current.view?.dispatch({
            effects: [updateCommentsEffect.of(true)],
        })
    }, [commentsInFile])

    useEffect(() => {
        // left empty for now
        const commandBarExtension: Extension[] = []

        editorRef.current.view?.dispatch({
            effects: commandBarCompartment.reconfigure(commandBarExtension),
        })
    }, [commandBarOpen, filePath, editorRef.current, justCreated])

    useEffect(() => {
        if (fileIndentUnit != null) {
            const fileIndent = [
                indentUnit.of(fileIndentUnit),
                EditorState.tabSize.of(fileIndentUnit.length),
            ]
            editorRef.current.view?.dispatch({
                effects: indentCompartment.reconfigure(fileIndent),
            })
        }
    }, [fileIndentUnit, editorRef.current, justCreated])

    useEffect(() => {
        if (settings.tabSize != undefined) {
            editorRef.current.view?.dispatch({
                effects: indentCompartment.reconfigure([
                    indentUnit.of(' '.repeat(Number(settings.tabSize))),
                    EditorState.tabSize.of(Number(settings.tabSize)),
                ]),
            })
        }
    }, [settings.tabSize, editorRef.current, justCreated])

    return globalExtensions
}
