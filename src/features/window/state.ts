import { Action } from '@reduxjs/toolkit'
import { CustomTransaction } from '../../components/codemirrorHooks/dispatch'
import { v4 as uuidv4 } from 'uuid'
import { ExpectedError } from '../../utils'

export interface File {
    parentFolderId: number
    name: string
    renameName: string | null
    isSelected: boolean
    saved: boolean
    indentUnit?: string
    latestAccessTime?: number
    lastSavedTime?: number
    savedTime?: number
    deleted?: boolean
}

export interface Folder {
    parentFolderId: number | null
    name: string
    renameName: string | null
    fileIds: number[]
    folderIds: number[]
    loaded: boolean
    isOpen: boolean
}

export enum HoverState {
    None,
    Full,
    Right,
    Left,
    Top,
    Bottom,
}

export interface Pane {
    contents: string
    isActive: boolean
    tabIds: number[]
}

export type FolderData = {
    folders: { [key: number]: Folder }
    files: { [key: number]: File }
}

export interface PaneState {
    bySplits: any
    byIds: { [key: number]: Pane }
}

export interface Tab {
    isActive: boolean
    isReady: number
    fileId: number
    paneId: number

    isChat: boolean

    isReadOnly: boolean
    generating: boolean
    interrupted: boolean

    isMulti: boolean
    isMultiDiff: boolean
}

export interface CachedFile {
    contents: string
    counter: number
}
export interface ReduxTransaction {
    transactionId: number
    // transactionFunction: (editorView: EditorView) => TransactionSpec;
    transactionFunction: CustomTransaction | CustomTransaction[]
}

export interface ReduxEditorState {
    history: {
        done?: any[]
        undone?: any[]
    }
    doc: string
    selection: {
        main: number
        ranges: {
            anchor: number
            number: number
        }[]
    }
}

export interface CachedTab {
    initialEditorState: ReduxEditorState | null
    pendingTransactions: ReduxTransaction[]
    scrollPos: number | null
    vimState: any
}
export interface RepoProgress {
    progress: number
    state: 'notStarted' | 'uploading' | 'indexing' | 'done' | 'error'
}

export interface State {
    repoId: string | null
    repoProgress: RepoProgress
    paneState: PaneState

    rightClickId: number | null
    isRightClickAFile: boolean | null

    rootPath: string | null
    folders: { [key: number]: Folder }
    files: { [key: number]: File }
    tabs: { [key: number]: Tab }

    fileCache: { [key: string]: CachedFile }
    tabCache: { [key: string]: CachedTab }

    // keyboardBindings: {[id: string]: {key: string, action: Action}};
    keyboardBindings: { [key: string]: Action }

    draggingTabId: number | null

    zoomFactor: number

    showError: boolean
    showRateLimit: boolean
    showNoAuthRateLimit: boolean
    errorValue: ExpectedError | null
    errorType: string
    errorInfo: string

    version: string

    showRemotePopup: boolean
    remoteCommand: string
    remotePath: string
    remoteBad: boolean

    isNotFirstTime: boolean

    terminalOpen: boolean
}

export interface DiffSpan {
    type: 'diff'
    fileId: number

    // Points to the id of the original CodeSpan that
    // this is a diff of.
    origSpanId: number

    startLine: number
    endLine: number
    text: string

    mode:
        | 'accepted'
        | 'rejected'
        | 'showed'
        | 'showing'
        | 'generating'
        | 'creating'
}

export interface Diff {
    content: DiffSpan
    id: number
}

export interface CodeSpan {
    type: 'code'
    fileId: number
    startLine: number
    endLine: number
    text: string
}

export interface TextSpan {
    type: 'text'
    text: string
}

export interface BotTextSpan {
    type: 'botText'
    text: string
}

export interface NewCodeSpan {
    type: 'newCode'
    text: string
    language: string
    shouldEdit?: boolean
}

export type UserChatSpan = CodeSpan | TextSpan
export type BotChatSpan = TextSpan | NewCodeSpan | DiffSpan | BotTextSpan

export interface ChatMessage {
    fromMe: boolean
    spanIds: number[]
}

export interface Conversation {
    messageIds: number[]
    isBotWriting: boolean
}
export type BotMessageType =
    | 'edit'
    | 'continue'
    | 'markdown'
    | 'multifile'
    | 'location'
    | 'interrupt'
    | 'chat_edit'
    | 'lsp_edit'

export interface BotMessage {
    sender: 'bot'
    sentAt: number
    type: BotMessageType
    conversationId: string
    message: string
    currentFile: string | null
    lastToken: string
    finished: boolean
    interrupted: boolean
    rejected?: boolean
    hitTokenLimit?: boolean
    maxOrigLine?: number
    useDiagnostics?: boolean | number
}

export interface CodeBlock {
    fileId: number
    text: string
    startLine: number
    endLine: number
}

export type CodeSymbolType = 'import' | 'function' | 'class' | 'variable'
export interface CodeSymbol {
    fileName: string
    name: string
    type: CodeSymbolType
}

export interface UserMessage {
    sender: 'user'
    conversationId: string
    message: string
    msgType: ResponseType
    sentAt: number
    currentFile: string | null
    precedingCode: string | null
    procedingCode: string | null
    currentSelection: string | null
    // Other pieces of info encoded
    otherCodeBlocks: CodeBlock[]
    codeSymbols: CodeSymbol[]
    selection: { from: number; to: number } | null
    maxOrigLine?: number
}

export type Message = UserMessage | BotMessage

/// idk - don't know what the response type should be
/// freeform - the response type is chat markdown
/// generate - the response type is some generation in the current file
/// edit - the response type is some edit in the current file
/// chat_diff - the respone type is some edit in the current_file started from the chat
export type ResponseType =
    | 'idk'
    | 'freeform'
    | 'generate'
    | 'edit'
    | 'chat_edit'
    | 'lsp_edit'

export interface ChatState {
    generating: boolean
    pos?: number
    msgType?: ResponseType
    isCommandBarOpen: boolean
    commandBarText: string
    conversations: string[]
    currentConversationId: string
    draftMessages: { [key: string]: UserMessage }
    userMessages: UserMessage[]
    botMessages: BotMessage[]
    fireCommandK: boolean
    chatIsOpen: boolean
    chatHistoryIsOpen: boolean
    commandBarHistoryIndex: number
}

export interface Settings {
    keyBindings: 'none' | 'vim' | 'emacs'
    useFour: string
    contextType: string
    textWrapping: string
    openAIKey?: string
    useOpenAIKey?: boolean
    openAIModel?: string
    tabSize?: string
}

export interface SettingsState {
    settings: Settings
    isOpen: boolean
}

export interface LineChange {
    startLine: number
    endLine: number
    newText: string
}

export interface FixLSPFile {
    changes: LineChange[]
    doDiagnosticsExist: boolean
}

export interface FixLSPState {
    fixes: { [key: number]: FixLSPFile }
}

export interface CommentFunction {
    comment: string
    description: string
    originalFunctionBody: string
    marked?: boolean
}

export interface CommentState {
    fileThenNames: { [key: string]: { [key: string]: CommentFunction } }
}

export interface ToolState {
    openLeftTab: 'search' | 'filetree'
    leftTabActive: boolean
    fileSearchTriggered: boolean
    commandPaletteTriggered: boolean
    aiCommandPaletteTriggered: boolean
    leftSideExpanded: boolean
    cursorLogin: {
        accessToken?: string
        profile?: string
        stripeId?: string
    }
}

export interface LoggingState {
    feedbackMessage: string
    isOpen: boolean
}

interface LanguageServer {
    languageServer: string
    installed: boolean
    running: boolean
}

export interface LanguageServerState {
    languageServers: { [key: string]: LanguageServer }
    copilotSignedIn: boolean
    copilotEnabled: boolean
}

export interface FullState {
    global: State
    chatState: ChatState
    settingsState: SettingsState
    toolState: ToolState
    loggingState: LoggingState
    languageServerState: LanguageServerState
    commentState: CommentState
    fixLSPState: FixLSPState
}

// INITIAL STATE

export const initialLoggingState: LoggingState = {
    feedbackMessage: '',
    isOpen: false,
}

const startUuid = uuidv4()
export const initialChatState: ChatState = {
    generating: false,
    isCommandBarOpen: false,
    currentConversationId: startUuid,
    commandBarText: '',
    conversations: [],
    userMessages: [],
    botMessages: [],
    draftMessages: {},
    fireCommandK: false,
    chatIsOpen: false,
    chatHistoryIsOpen: false,
    commandBarHistoryIndex: -1,
}

export const initialSettingsState = {
    isOpen: false,
    settings: {
        keyBindings: 'none',
        useFour: 'disabled',
        contextType: 'none',
        textWrapping: 'disabled',
        tabSize: undefined,
    },
}

export const initialState = {
    repoId: null,
    repoProgress: {
        progress: 0,
        state: 'notStarted',
    },
    files: {},
    folders: {
        0: {
            parentFolderId: null,
            name: '',
            renameName: '',
            fileIds: [],
            folderIds: [],
            loaded: true,
            isOpen: false,
        },
    },
    fileCache: {},
    tabCache: {},
    tabs: {},
    rightClickId: null as number | null,
    isRightClickAFile: false,
    rootPath: null as string | null,
    keyboardBindings: {},
    draggingTabId: null as number | null,

    zoomFactor: 0.75,

    paneState: {
        byIds: {},
        bySplits: [] as any,
    },

    showError: false,
    showNoAuthRateLimit: false,
    showRateLimit: false,
    errorValue: null,
    errorType: 'server',
    errorInfo: '404, request bad',

    version: '0.0.11',

    showRemotePopup: false,
    remoteCommand: '',
    remotePath: '',
    remoteBad: false,

    isNotFirstTime: true,
    terminalOpen: false,
} as State

export function nextValue(keys: string[]) {
    if (keys.length == 0) {
        return 1
    } else {
        return Math.max(...keys.map((x) => parseInt(x))) + 1
    }
}
export function nextId(byIds: object) {
    return nextValue(Object.keys(byIds))
}
export function nextTabID(state: State) {
    return nextId(state.tabs)
}
export function nextPaneID(state: State) {
    return nextId(state.paneState.byIds)
}
export function nextFolderID(state: State) {
    return nextId(state.folders)
}
export function nextFileID(state: State) {
    return nextId(state.files)
}
