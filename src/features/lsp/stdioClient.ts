/*
* Documentation/rant about language servers.
* This things are generally very poorly documented, so it is always a pain to add a new feature
* Right now, we have a single file source of truth here that acts like the client. We will probably
* want to separate this all into separate subclasses that all inherit from the base LanguageServerClient
* and each one has its own set of capabilities, features, etc that the lsp implements. Not sure if the 
* right split is the file level for each of thesee

* But there are lots of annoying things that differ across servers. They all need to support a few common
* things, which is where a multiple LSPlugins may attach themselves to a running client which talks to the
* server. These LSPlugins implement the shared set of behaviors

* The details that differ are small, but important.
* For example, in registering capabilities upon an additional request, python and rust-analyzer
* take the form:
* {
    "pylsp": {
        INSERT_SETTINGS
    }
}
{
    "rustAnalyzer": {
        INSERT_SETTINGS
    }
}

But for gopls, it looks like:
[{
    SETTING_1
},
{
    SETTING_2
}
]


This is only really documented in this obscure issue: https://github.com/golang/go/issues/38819
*/
import { URI } from 'vscode-uri'
import type * as LSP from 'vscode-languageserver-protocol'
import type { PluginValue } from '@codemirror/view'
import { getLanguageFromFilename } from '../extensions/utils'
import { Action } from '../linter/lint'
import { v4 as uuidv4 } from 'uuid'

export const LSLanguages = [
    /*'copilot', */
    'typescript', // Also javascript
    'html',
    'css',
    'python',
    'c', // Also c++
    'rust',
    'go',
    'csharp',
    'java',
    // God knows why we support php
    'php',
] //'go', 'java', 'c', 'rust', 'csharp']
export type Language = (typeof LSLanguages)[number]

interface CopilotSignInInitiateParams {}
interface CopilotSignInInitiateResult {
    verificationUri: string
    status: string
    userCode: string
    expiresIn: number
    interval: number
}

interface CopilotSignInConfirmParams {
    userCode: string
}
type CopilotStatus =
    | 'SignedIn'
    | 'AlreadySignedIn'
    | 'MaybeOk'
    | 'NotAuthorized'
    | 'NotSignedIn'
    | 'OK'
interface CopilotSignInConfirmResult {
    status: CopilotStatus
    user: string
}

interface CopilotSignOutParams {}
interface CopilotSignOutResult {
    status: CopilotStatus
}

export interface LSPCustomCompletionParams extends LSP.CompletionParams {
    wordBefore: string
}

export interface CopilotGetCompletionsParams {
    doc: {
        source: string
        tabSize: number
        indentSize: number
        insertSpaces: boolean
        path: string
        uri: string
        relativePath: string
        languageId: string
        position: {
            line: number
            character: number
        }
    }
}

interface CopilotGetCompletionsResult {
    completions: {
        text: string
        position: {
            line: number
            character: number
        }
        uuid: string
        range: {
            start: {
                line: number
                character: number
            }
            end: {
                line: number
                character: number
            }
        }
        displayText: string
        point: {
            line: number
            character: number
        }
        region: {
            start: {
                line: number
                character: number
            }
            end: {
                line: number
                character: number
            }
        }
    }[]
}

interface CopilotAcceptCompletionParams {
    uuid: string
}

interface CopilotRejectCompletionParams {
    uuids: string[]
}

interface LSPNewDefinition {
    originSelectionRange: LSP.Range
    targetRange: LSP.Range
    targetSelectionRange: LSP.Range
    targetUri: string
}

export interface DiagnosticWithAction extends LSP.Diagnostic {
    actions?: Action[]
}

// A map of request methods and their parameters and return types
export type LSPRequestMap = {
    initialize: [LSP.InitializeParams, LSP.InitializeResult]
    'textDocument/hover': [LSP.HoverParams, LSP.Hover]
    'textDocument/completion': [
        LSPCustomCompletionParams,
        LSP.CompletionItem[] | LSP.CompletionList | null
    ]
    'textDocument/documentSymbol': [
        LSP.DocumentSymbolParams,
        LSP.DocumentSymbol[]
    ]

    notifyAccepted: [CopilotAcceptCompletionParams, any]
    notifyRejected: [CopilotRejectCompletionParams, any]
    // Back to text document types
    'textDocument/definition': [
        LSP.DefinitionParams,
        LSP.Location | LSP.Location[] | LSP.LocationLink[] | null
    ]
    'textDocument/references': [LSP.ReferenceParams, LSP.Location[]]
    'textDocument/documentHighlight': [
        LSP.DocumentHighlightParams,
        LSP.DocumentHighlight[]
    ]
    'textDocument/symbol': [LSP.DocumentSymbolParams, LSP.SymbolInformation[]]
    'textDocument/codeAction': [
        LSP.CodeActionParams,
        (LSP.CodeAction | LSP.Command)[]
    ]
    'textDocument/documentLink': [LSP.DocumentLinkParams, LSP.DocumentLink[]]

    // Add a new entry for the workspace/symbol request and response
    'workspace/symbol': [LSP.WorkspaceSymbolParams, LSP.SymbolInformation[]]
    'workspaceSymbol/resolve': [LSP.SymbolInformation, LSP.SymbolInformation]

    // Copilot Commands
    checkStatus: [{}, { status: CopilotStatus }]
    signInInitiate: [CopilotSignInInitiateParams, CopilotSignInInitiateResult]
    signInConfirm: [CopilotSignInConfirmParams, CopilotSignInConfirmResult]
    signOut: [CopilotSignOutParams, CopilotSignOutResult]
    getCompletions: [CopilotGetCompletionsParams, CopilotGetCompletionsResult]
    'textDocument/semanticTokens/full': [
        LSP.SemanticTokensParams,
        LSP.SemanticTokens
    ]
    'textDocument/semanticTokens/full/delta': [
        LSP.SemanticTokensDeltaParams,
        LSP.SemanticTokensDelta
    ]
    'textDocument/semanticTokens': [
        LSP.SemanticTokensParams,
        LSP.SemanticTokens
    ]
    'completionItem/resolve': [LSP.CompletionItem, LSP.CompletionItem]
}

// A map of notification methods and their parameters
export type LSPNotifyMap = {
    initialized: LSP.InitializedParams
    'textDocument/didChange': LSP.DidChangeTextDocumentParams
    'textDocument/didOpen': LSP.DidOpenTextDocumentParams
    'textDocument/didClose': LSP.DidCloseTextDocumentParams

    'workspace/didChangeConfiguration': LSP.DidChangeConfigurationParams
}

// A map of event methods and their parameters
export interface LSPEventMap {
    'textDocument/publishDiagnostics': LSP.PublishDiagnosticsParams
    'window/logMessage': LSP.LogMessageParams
    'window/showMessage': LSP.ShowMessageParams
}

export interface LSRequestMap {
    'workspace/configuration': [LSP.ConfigurationParams, any]
    'client/registerCapability': [LSP.RegistrationParams, any]
}

// A type for notifications from the server
export type Notification = {
    [key in keyof LSPEventMap]: {
        jsonrpc: '2.0'
        id?: null | undefined
        method: key
        params: LSPEventMap[key]
    }
}[keyof LSPEventMap]

export type LSRequest = {
    [key in keyof LSRequestMap]: {
        jsonrpc: '2.0'
        id?: null | undefined
        method: key
        params: LSRequestMap[key][0]
    }
}[keyof LSRequestMap]

export interface LSPProcess {
    command: string
    args: string[]
}

// A type for the options to create a language server client
export interface LanguageServerClientOptions {
    language: Language
    rootUri: string | null
    workspaceFolders: LSP.WorkspaceFolder[] | null
    autoClose?: boolean
    isCopilot?: boolean
}

// A type for the plugins that can attach to the client
export interface LanguageServerPluginInterface extends PluginValue {
    processNotification: (notification: Notification) => void
    // processRequest: (request: LSRequest) => any
}

// The language server client class
export class LanguageServerClient {
    private connectionName: string | null = null
    // private connection: rpc.MessageConnection;

    public ready: boolean
    public capabilities: LSP.ServerCapabilities<any>

    private plugins: LanguageServerPluginInterface[]

    private autoClose?: boolean

    public initializePromise: Promise<void>

    // Tracks the document version for each document
    private documentVersionMap: { [documentPath: string]: number } = {}

    public isCopilot: boolean
    private copilotSignedIn = false
    private queuedUids: string[] = []
    public uuid = ''

    constructor(options: LanguageServerClientOptions) {
        // this.childProcess = cp.spawn(options.process.command, options.process.args);
        // this.childProcess = cp.spawn(options.process.command, options.process.args);
        // this.connection = rpc.createMessageConnection(
        //   new rpc.StreamMessageReader(this.childProcess.stdout!),
        //   new rpc.StreamMessageWriter(this.childProcess.stdin!)
        // );

        this.ready = false
        this.capabilities = {}

        this.plugins = []
        this.initializePromise = this.initialize(options)

        this.isCopilot = options.language == 'copilot'
        this.queuedUids = []
        this.uuid = uuidv4()
    }
    getName() {
        return this.connectionName
    }
    // Initialize the connection with the server
    async initialize(options: LanguageServerClientOptions) {
        const rootURI = (options.rootUri ||
            options.workspaceFolders?.at(-1)?.uri)!
        const rootDir = URI.parse(rootURI).path

        this.connectionName = await connector.startLS(options.language, rootDir)

        connector.addNotificationCallback((data: any) => {
            this.processNotification(data)
        }, this.connectionName!)

        connector.addRequestCallback((data: any) => {
            return this.processRequest(data)
        }, this.connectionName!)

        // Now ready for normal work
        const workspaceFolder = {
            uri: options.rootUri!,
            name: 'root',
        }

        const initializationParameters: LSP.InitializeParams = {
            capabilities: {
                textDocument: {
                    publishDiagnostics: {
                        relatedInformation: true,
                        codeDescriptionSupport: true,
                        dataSupport: true,
                    },
                    hover: {
                        dynamicRegistration: true,
                        contentFormat: ['markdown', 'plaintext'],
                    },
                    moniker: {},
                    synchronization: {
                        dynamicRegistration: true,
                        willSave: false,
                        didSave: false,
                        willSaveWaitUntil: false,
                    },
                    // include support for additionalTextEdits
                    completion: {
                        dynamicRegistration: true,
                        completionItem: {
                            snippetSupport: true,
                            commitCharactersSupport: true,
                            documentationFormat: ['markdown', 'plaintext'],
                            deprecatedSupport: false,
                            preselectSupport: false,
                            insertReplaceSupport: true,
                            resolveSupport: {
                                properties: [
                                    'documentation',
                                    'detail',
                                    'additionalTextEdits',
                                ],
                            },
                        },
                        contextSupport: false,
                    },
                    signatureHelp: {
                        dynamicRegistration: true,
                        signatureInformation: {
                            documentationFormat: ['markdown', 'plaintext'],
                        },
                    },
                    declaration: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    definition: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    typeDefinition: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    implementation: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    codeAction: {
                        codeActionLiteralSupport: {
                            codeActionKind: {
                                valueSet: [
                                    'quickfix',
                                    'refactor',
                                    // 'source.organizeImports',
                                    // 'refactor.rewrite',
                                    // 'refactor.inline'
                                ],
                            },
                        },
                    },
                },
                workspace: {
                    didChangeConfiguration: {
                        dynamicRegistration: true,
                    },
                    workspaceFolders: true,
                    configuration: true,
                },
            },
            processId: null,
            rootUri: null,
            workspaceFolders: [workspaceFolder],
            //options.workspaceFolders,
        }

        if (!this.isCopilot && this.getName() != 'html') {
            // Copilot and html cant do initialization options
            // In the future, we will need a more principled way of
            // doing this

            initializationParameters.initializationOptions = {
                semanticTokens: true,
            }
            initializationParameters.capabilities.textDocument!.semanticTokens =
                {
                    dynamicRegistration: true,
                    requests: {
                        full: {
                            delta: true,
                        },
                    },
                    tokenTypes: [
                        'comment',
                        'keyword',
                        'string',
                        'number',
                        'regexp',
                        'operator',
                        'namespace',
                        'type',
                        'struct',
                        'class',
                        'interface',
                        'enum',
                        'typeParameter',
                        'function',
                        'member',
                        'property',
                        'macro',
                        'variable',
                        'parameter',
                        'label',
                        'method',
                    ],
                    tokenModifiers: [
                        'declaration',
                        'deprecated',
                        'documentation',
                        'deduced',
                        'readonly',
                        'static',
                        'abstract',
                        'dependantName',
                        'defaultLibrary',
                        'usedAsMutableReference',
                        'functionScope',
                        'classScope',
                        'fileScope',
                        'globalScope',
                        'modification',
                        'async',
                    ],
                    formats: ['relative'],
                }
        }
        const { capabilities } = await this.request(
            'initialize',
            initializationParameters
        )

        this.capabilities = capabilities

        this.notify('initialized', {})

        this.ready = true
        this.autoClose = options.autoClose

        // DISABLED WHEN USING PYRIGHT
        // Adding config settings for python
        if (this.getName() == 'python') {
            const settings = {
                pylsp: {
                    plugins: {
                        pycodestyle: { enabled: false },
                        mccabe: { enabled: false },
                    },
                },
            }
            this.sendConfiguration(settings)
        }
    }
    // Send a request to the server and return the response or error
    protected async request<K extends keyof LSPRequestMap>(
        method: K,
        params: LSPRequestMap[K][0]
    ): Promise<LSPRequestMap[K][1]> {
        const payload = { language: this.connectionName!, method, params }
        // @ts-ignore
        return await connector.sendRequestLS(payload)
    }

    // Send a notification to the server
    protected async notify<K extends keyof LSPNotifyMap>(
        method: K,
        params: LSPNotifyMap[K]
    ): Promise<void> {
        const payload = { language: this.connectionName!, method, params }
        // @ts-ignore
        return await connector.sendNotificationLS({
            language: this.connectionName!,
            method,
            params,
        })
    }

    // Process a notification from the server and dispatch it to the plugins
    private processNotification(notification: Notification) {
        for (const plugin of this.plugins) {
            plugin.processNotification(notification)
        }
    }
    private processRequest(request: LSRequest) {
        // TODO incorporate the return type

        switch (request.method) {
            case 'workspace/configuration':
                switch (this.getName()) {
                    case 'python':
                        return {
                            pylsp: {
                                plugins: {
                                    pycodestyle: { enabled: false },
                                    mccabe: { enabled: false },
                                },
                            },
                        }
                    case 'go':
                        return [
                            {
                                // gopls: {
                                'ui.semanticTokens': true,
                                // ui: { semanticTokens: true },
                            },
                        ]
                    case 'java':
                        return [
                            { 'java.format.tabSize': 4 },
                            { 'java.format.insertSpaces': true },
                        ]
                    default:
                        return
                }
            case 'client/registerCapability':
                request.params.registrations.forEach((registration) => {
                    // First we split the method name into the plugin name and the method
                    const method = registration.method as
                        | keyof LSPNotifyMap
                        | keyof LSPRequestMap
                    switch (method) {
                        case 'textDocument/semanticTokens':
                            this.capabilities.semanticTokensProvider =
                                registration.registerOptions || true
                            return
                        case 'textDocument/completion':
                            this.capabilities.completionProvider =
                                registration.registerOptions || true
                            return
                        case 'textDocument/hover':
                            this.capabilities.hoverProvider =
                                registration.registerOptions || true
                            return
                        case 'textDocument/documentHighlight':
                            this.capabilities.documentHighlightProvider =
                                registration.registerOptions || true
                            return
                        case 'textDocument/documentLink':
                            this.capabilities.documentLinkProvider =
                                registration.registerOptions || true
                            return
                        case 'textDocument/definition':
                            this.capabilities.definitionProvider =
                                registration.registerOptions || true
                            return
                        case 'workspace/symbol':
                            this.capabilities.workspaceSymbolProvider =
                                registration.registerOptions || true
                            return
                        default:
                            break
                    }
                })
                break
            default:
                return
        }
    }
    /// All Notifications
    textDocumentDidOpen(params: LSP.DidOpenTextDocumentParams) {
        this.notify('textDocument/didOpen', params)
    }
    textDocumentDidClose(params: LSP.DidCloseTextDocumentParams) {
        this.notify('textDocument/didClose', params)
    }
    textDocumentDidChange(params: LSP.DidChangeTextDocumentParams) {
        this.notify('textDocument/didChange', params)
    }
    workspaceDidChangeConfiguration(params: LSP.DidChangeConfigurationParams) {
        this.notify('workspace/didChangeConfiguration', params)
    }

    /// All Requests
    async textDocumentHover(params: LSP.HoverParams) {
        return await this.request('textDocument/hover', params)
    }
    async textDocumentCompletion(params: LSPCustomCompletionParams) {
        return await this.request('textDocument/completion', params)
    }

    async textDocumentDefinition(params: LSP.DefinitionParams) {
        return await this.request('textDocument/definition', params)
    }

    async textDocumentReferences(params: LSP.ReferenceParams) {
        return await this.request('textDocument/references', params)
    }
    async textDocumentSymbol(params: LSP.DocumentSymbolParams) {
        return await this.request('textDocument/documentSymbol', params)
    }

    async textDocumentSemanticTokensFull(params: LSP.SemanticTokensParams) {
        return await this.request('textDocument/semanticTokens/full', params)
    }

    async textDocumentSemanticTokensFullDelta(
        params: LSP.SemanticTokensDeltaParams
    ) {
        return await this.request(
            'textDocument/semanticTokens/full/delta',
            params
        )
    }

    async textDocumentCodeAction(params: LSP.CodeActionParams) {
        return await this.request('textDocument/codeAction', params)
    }

    async textDocumentDocumentLink(params: LSP.DocumentLinkParams) {
        return await this.request('textDocument/documentLink', params)
    }

    async completionItemResolve(params: LSP.CompletionItem) {
        return await this.request('completionItem/resolve', params)
    }

    // Add a new function for getting symbols
    async workspaceSymbol(params: LSP.WorkspaceSymbolParams) {
        return await this.request('workspace/symbol', params)
    }
    async workspaceSymbolResolve(params: LSP.SymbolInformation) {
        return await this.request('workspaceSymbol/resolve', params)
    }

    async signOut() {
        return await this.request('signOut', {})
    }

    async signInInitiate(params: CopilotSignInInitiateParams) {
        return await this.request('signInInitiate', params)
    }

    async signInConfirm(params: CopilotSignInConfirmParams) {
        return await this.request('signInConfirm', params)
    }
    async acceptCompletion(params: CopilotAcceptCompletionParams) {
        return await this.request('notifyAccepted', params)
    }
    async rejectCompletions(params: CopilotRejectCompletionParams) {
        return await this.request('notifyRejected', params)
    }

    // Close the connection with the server
    close() {
        // @ts-ignore
        connector.killLS(this.connectionName!)

        // @ts-ignore
        connector.removeNotificationCallback(this.connectionName!)

        // @ts-ignore
        connector.removeRequestCallback(this.connectionName!)
    }

    maybeOpenDocument({
        documentPath,
        documentText,
    }: {
        documentPath: string
        documentText: string
    }) {
        if (!(documentPath in this.documentVersionMap)) {
            this.openDocument({ documentPath, documentText })
        }
    }

    openDocument({
        documentPath,
        documentText,
    }: {
        documentPath: string
        documentText: string
    }) {
        // Send a didOpen notification with the document information
        this.documentVersionMap[documentPath] = 0

        const textDocument = {
            textDocument: {
                uri: URI.file(documentPath).toString(),
                languageId: getLanguageFromFilename(documentPath),
                text: documentText,
                version: this.documentVersionMap[documentPath],
            },
        }
        this.textDocumentDidOpen(textDocument)
    }

    closeDocument({ documentPath }: { documentPath: string }) {
        // Send a didClose notification with the document information
        const textDocument = {
            textDocument: {
                uri: URI.file(documentPath).toString(),
            },
        }
        this.textDocumentDidClose(textDocument)
        delete this.documentVersionMap[documentPath]
    }

    // Send a document change to the server
    async sendChange({
        documentPath,
        documentText,
    }: {
        documentPath: string
        documentText: string
    }) {
        // Do nothing if the client is not ready
        if (!this.ready) return
        //

        const documentChange = {
            textDocument: {
                uri: URI.file(documentPath).toString(),
                version: ++this.documentVersionMap[documentPath],
            },
            contentChanges: [{ text: documentText }],
        }

        try {
            this.textDocumentDidChange(documentChange)
        } catch (e) {
            console.error(e)
        }
    }

    async sendConfiguration(settings: any) {
        this.workspaceDidChangeConfiguration({ settings })
    }

    async getDefinition(params: { path: string; pos: LSP.Position }) {
        const { path, pos } = params

        const payload = {
            textDocument: {
                uri: URI.file(path).toString(),
            },
            position: pos,
        }

        const origResult = await this.textDocumentDefinition(payload)
        let result: LSP.Location | LSP.LocationLink

        if (origResult == null) {
            return
        } else if (Array.isArray(origResult)) {
            result = origResult[0]
        } else {
            result = origResult
        }

        let uri: string
        let range: LSP.Range

        // Check if result has targetUri attr
        if ('targetUri' in result) {
            uri = result.targetUri
            range = result.targetSelectionRange
        } else {
            uri = result.uri
            range = result.range
        }

        // Weird edge case where we get a result that doesn't start with /
        if (!uri.startsWith('file:///')) {
            if (uri.startsWith('file://')) {
                uri = uri.replace('file://', 'file:///')
            }
        }
        const newPath = URI.parse(uri).path

        return { newPath, range }
    }

    // Attach a plugin to the client
    attachPlugin(plugin: LanguageServerPluginInterface) {
        this.plugins.push(plugin)
    }

    // Detach a plugin from the client
    detachPlugin(plugin: LanguageServerPluginInterface) {
        const i = this.plugins.indexOf(plugin)
        if (i === -1) return
        this.plugins.splice(i, 1)
        if (this.autoClose) this.close()
    }

    async copilotSignOut() {
        if (this.copilotSignedIn) {
            await this.signOut()
        }
    }
    async signedIn() {
        const { status } = await this.request('checkStatus', {})
        if (
            status == 'SignedIn' ||
            status == 'AlreadySignedIn' ||
            status == 'OK'
        ) {
            return true
        } else {
            return false
        }
    }

    async getCompletion(params: CopilotGetCompletionsParams) {
        const response = await this.request('getCompletions', params)
        //
        this.queuedUids = [...response.completions.map((c) => c.uuid)]
        return response
    }

    async accept(uuid: string) {
        const badUids = this.queuedUids.filter((u) => u != uuid)
        this.queuedUids = []
        await this.acceptCompletion({ uuid })
        await this.rejectCompletions({ uuids: badUids })
    }

    async reject() {
        const badUids = this.queuedUids
        this.queuedUids = []
        return await this.rejectCompletions({ uuids: badUids })
    }
}

export class CopilotServerClient extends LanguageServerClient {}
