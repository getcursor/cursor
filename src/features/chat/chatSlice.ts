import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
    BotMessage,
    BotMessageType,
    ChatState,
    CodeBlock,
    CodeSymbol,
    ResponseType,
    UserMessage,
    initialChatState,
} from '../window/state'
import { v4 as uuidv4 } from 'uuid'

import posthog from 'posthog-js'

export interface ChatSpanUpdate {
    spanId: number | null
    text?: string
}

export interface CodeInputSelection {
    text: string
    startLine: number
    endLine: number
    fileId: number
    shouldEdit?: boolean
}

// custom error for when they cancel a prompt
export class PromptCancelledError extends Error {
    constructor() {
        super('Prompt cancelled')
        this.name = 'PromptCancelledError'
    }
}

const blankDraftMessage = (
    conversationId: string,
    sentAt: number
): UserMessage => ({
    sender: 'user',
    sentAt,
    message: '',
    conversationId,
    currentFile: null,
    currentSelection: null,
    precedingCode: null,
    procedingCode: null,
    otherCodeBlocks: [],
    codeSymbols: [],
    selection: null,
    msgType: 'freeform',
})

export function getLastBotMessage(
    state: ChatState,
    conversationId: string | null = null
) {
    if (!conversationId) {
        conversationId = state.currentConversationId
    }
    return state.botMessages
        .filter((m) => m.conversationId === conversationId)
        .at(-1)
}

export const beforeAppendResponse = createAsyncThunk(
    'chat/appendResponse',
    async (
        payload: { text: string; token: string },
        { getState, dispatch }
    ) => {}
)
export const chatSlice = createSlice({
    name: 'chat',
    initialState: initialChatState as ChatState,
    extraReducers: (builder) => {},
    reducers: {
        addOtherBlockToMessage(
            chatState: ChatState,
            action: PayloadAction<CodeBlock>
        ) {
            const block = action.payload
            const conversationId = chatState.currentConversationId
            const draftMessage = chatState.draftMessages[conversationId]
            draftMessage.otherCodeBlocks.push(block)
            //chatState.isCommandBarOpen = true;
        },
        addSymbolToMessage(
            chatState: ChatState,
            action: PayloadAction<CodeSymbol>
        ) {
            const symbol = action.payload
            const conversationId = chatState.currentConversationId
            const draftMessage = chatState.draftMessages[conversationId]

            draftMessage.codeSymbols.push(symbol)
            chatState.isCommandBarOpen = true
        },
        // Probs bad practice to have a setter as a redux action/reducer
        setCurrentConversation(chatState, action: PayloadAction<string>) {
            chatState.currentConversationId = action.payload
        },
        newResponse(
            chatState: ChatState,
            action: PayloadAction<{
                type: BotMessageType
                useDiagnostics?: boolean | number
            }>
        ) {
            if (action.payload.type === 'markdown') {
                chatState.chatIsOpen = true
            }

            const lastUserMessage = chatState.userMessages.at(-1)!
            const type = action.payload.type
            chatState.botMessages.push({
                sender: 'bot',
                sentAt: Date.now(),
                conversationId: chatState.currentConversationId,
                type: type as BotMessageType,
                message: '',
                lastToken: '',
                finished: false,
                currentFile: lastUserMessage.currentFile,
                interrupted: false,
                useDiagnostics: action.payload.useDiagnostics,
            } as BotMessage)
        },
        removeCodeBlock(chatState: ChatState, action: PayloadAction<number>) {
            const index = action.payload
            const conversationId = chatState.currentConversationId
            const draftMessage = chatState.draftMessages[conversationId]
            draftMessage.otherCodeBlocks.splice(index, 1)
        },
        removeCodeSymbol(chatState: ChatState, action: PayloadAction<number>) {
            const index = action.payload
            const conversationId = chatState.currentConversationId
            const draftMessage = chatState.draftMessages[conversationId]
            draftMessage.codeSymbols = draftMessage.codeSymbols.splice(index, 1)
        },
        appendResponse(
            chatState: ChatState,
            action: PayloadAction<{ text: string; token: string }>
        ) {
            const text = action.payload.text
            const token = action.payload.token
            const currentConversationId = chatState.currentConversationId
            const lastBotMessage = chatState.botMessages
                .filter((bm) => bm.conversationId == currentConversationId)
                .at(-1)!

            // Setting last bot message text and token accordingly
            lastBotMessage.message = text
            lastBotMessage.lastToken = token
        },
        doSetMessages(
            chatState: ChatState,
            action: PayloadAction<{
                userMessages: UserMessage[]
                botMessages: BotMessage[]
            }>
        ) {
            const { userMessages, botMessages } = action.payload
            if (userMessages != null) {
                chatState.userMessages = userMessages
            }
            if (botMessages) {
                chatState.botMessages = botMessages
            }
        },
        doSetChatState(chatState: ChatState, action: PayloadAction<ChatState>) {
            const newState = action.payload
            chatState.userMessages = newState.userMessages
            chatState.botMessages = newState.botMessages
            chatState.currentConversationId = newState.currentConversationId
            chatState.draftMessages = newState.draftMessages
        },
        endFinishResponse(chatState: ChatState) {
            const lastMessage = chatState.botMessages.at(-1)!
            lastMessage.finished = true
            chatState.generating = false
            // if (['continue'].includes(lastMessage.type)) {
            //     // if not ends with a newline
            //     //if (!lastMessage.message.endsWith('\n')) lastMessage.message += '\n';
            // }
        },
        testMessage(chatState: ChatState) {
            const lastUserMessage = chatState.userMessages.at(-1)!
            // to do
            chatState.botMessages.push({
                sender: 'bot',
                sentAt: Date.now(),
                type: 'markdown',
                conversationId: lastUserMessage.conversationId,
                lastToken: '',
                message:
                    '# Hello World\n## This is a title\n###Lorem Ipsum\n this is a test',
                finished: false,
                currentFile: lastUserMessage.currentFile,
                interrupted: false,
            })
        },
        activateDiffFromEditor(
            chatState: ChatState,
            action: PayloadAction<{
                currentFile: string | null
                precedingCode: string | null
                procedingCode: string | null
                currentSelection: string | null
                pos: number
                selection: { from: number; to: number } | null
            }>
        ) {
            const payload = action.payload
            // This was Neal's line, which I think is wrong
            // if (!chatState.isCommandBarOpen) {

            if (chatState.isCommandBarOpen) {
                const conversationId = chatState.currentConversationId
                chatState.draftMessages[conversationId] = {
                    sender: 'user',
                    sentAt: Date.now(),
                    message: '',
                    conversationId: chatState.currentConversationId,
                    otherCodeBlocks: [],
                    codeSymbols: [],
                    currentFile: payload.currentFile,
                    precedingCode: payload.precedingCode,
                    procedingCode: payload.procedingCode,
                    currentSelection: payload.currentSelection,
                    selection: payload.selection,
                    msgType: 'freeform',
                }
                chatState.pos = payload.pos
                chatState.commandBarHistoryIndex = -1
                // chatState.commandBarText = ''
            }
        },
        startNewMessage(
            chatState: ChatState,
            action: PayloadAction<{ currentFile?: string; message?: string }>
        ) {
            const newConversationId = uuidv4()
            const { currentFile, message } = action.payload
            chatState.currentConversationId = newConversationId
            chatState.draftMessages[newConversationId] = blankDraftMessage(
                newConversationId,
                Date.now()
            )
            chatState.draftMessages[newConversationId].currentFile =
                currentFile || null

            chatState.draftMessages[newConversationId].message = message || ''

            if (chatState.msgType) {
                chatState.draftMessages[newConversationId].msgType =
                    chatState.msgType
            }
        },
        interruptGeneration(
            chatState: ChatState,
            action: PayloadAction<string | null>
        ) {
            const lastBotMessage = getLastBotMessage(chatState, action.payload)
            if (lastBotMessage) {
                lastBotMessage.interrupted = true
            }
            const conversationId = chatState.currentConversationId
            chatState.draftMessages[conversationId] = {
                sender: 'user',
                sentAt: Date.now(),
                message: '',
                conversationId: chatState.currentConversationId,
                otherCodeBlocks: [],
                codeSymbols: [],
                currentFile: null,
                precedingCode: null,
                procedingCode: null,
                currentSelection: null,
                selection: null,
                msgType: 'freeform',
            }
            chatState.generating = false
        },
        tokenLimitInterrupt(chatState: ChatState) {
            const lastBotMessage = chatState.botMessages.at(-1)
            if (lastBotMessage) {
                lastBotMessage.interrupted = true
                lastBotMessage.hitTokenLimit = true
            }
            const conversationId = chatState.currentConversationId
            chatState.draftMessages[conversationId] = {
                sender: 'user',
                sentAt: Date.now(),
                message: '',
                conversationId: chatState.currentConversationId,
                otherCodeBlocks: [],
                codeSymbols: [],
                currentFile: null,
                precedingCode: null,
                procedingCode: null,
                currentSelection: null,
                selection: null,
                msgType: 'freeform',
            }
            chatState.generating = false
        },
        rejectMessage(chatState: ChatState, action: PayloadAction<string>) {
            const lastBotMessage = getLastBotMessage(chatState, action.payload)
            if (lastBotMessage) lastBotMessage.rejected = true
        },
        undoRejectMessage(chatState: ChatState, action: PayloadAction<string>) {
            const lastBotMessage = getLastBotMessage(chatState, action.payload)
            if (lastBotMessage) lastBotMessage.rejected = false
        },
        setGenerating(chatState: ChatState, action: PayloadAction<boolean>) {
            chatState.generating = action.payload
        },
        openCommandBar(chatState: ChatState) {
            chatState.isCommandBarOpen = true
            chatState.chatIsOpen = false
            const newConversationId = uuidv4()

            chatState.currentConversationId = newConversationId
            chatState.draftMessages[newConversationId] = blankDraftMessage(
                newConversationId,
                Date.now()
            )

            posthog.capture('Opened Command Bar', { type: chatState.msgType })
            posthog.capture('Opened ' + chatState.msgType, {})
        },
        toggleChatHistory(chatState: ChatState) {
            if (chatState.chatIsOpen && chatState.chatHistoryIsOpen) {
                chatState.chatHistoryIsOpen = false
            } else {
                if (chatState.userMessages.length > 0) {
                    chatState.chatHistoryIsOpen = true
                    chatState.chatIsOpen = true
                    chatState.isCommandBarOpen = false
                    chatState.currentConversationId =
                        chatState.userMessages.at(-1)?.conversationId || ''
                }
            }
        },
        _submitCommandBar(chatState: ChatState) {
            const draftMessage =
                chatState.draftMessages[chatState.currentConversationId]
            chatState.userMessages.push({
                ...draftMessage,
                sentAt: Date.now(),
            })
            // If we just submitted a chat response (freeform), then draft message should look like the current
            // Use message, but with the current date
            if (chatState.msgType == 'freeform') {
                chatState.draftMessages[chatState.currentConversationId] = {
                    ...draftMessage,
                    sentAt: Date.now(),
                    message: '',
                }
            } else {
                chatState.draftMessages[chatState.currentConversationId] =
                    blankDraftMessage(
                        chatState.currentConversationId,
                        Date.now()
                    )
            }

            chatState.isCommandBarOpen = false
        },
        resumeGeneration(
            chatState: ChatState,
            conversationAction: PayloadAction<string>
        ) {
            const conversationId = conversationAction.payload
            const lastBotMessage = chatState.botMessages
                .filter((bm) => bm.conversationId == conversationId)
                .at(-1)
            if (lastBotMessage) {
                lastBotMessage.finished = false
                lastBotMessage.interrupted = false
                lastBotMessage.rejected = false
                lastBotMessage.hitTokenLimit = false
                lastBotMessage.maxOrigLine = undefined
            }
        },
        manufacturedConversation(
            chatState: ChatState,
            action: PayloadAction<{
                userMessage: string
                botMessage?: string
                messageType?: ResponseType
                currentFile?: string
                precedingCode?: string
                procedingCode?: string
                currentSelection?: string
                userMaxOrigLine?: number
                botMaxOrigLine?: number
            }>
        ) {
            const newConversationId = uuidv4()

            chatState.currentConversationId = newConversationId
            chatState.chatIsOpen = true
            chatState.msgType = action.payload.messageType || 'freeform'

            const newUserMessage: UserMessage = {
                sender: 'user' as const,
                sentAt: Date.now(),
                message: action.payload.userMessage,
                conversationId: newConversationId,
                otherCodeBlocks: [],
                codeSymbols: [],
                currentFile: action.payload.currentFile ?? null,
                precedingCode: action.payload.precedingCode ?? null,
                procedingCode: action.payload.procedingCode ?? null,
                currentSelection: action.payload.currentSelection ?? null,
                maxOrigLine: action.payload.userMaxOrigLine,
                selection: null,
                msgType: 'freeform' as ResponseType,
            }

            chatState.userMessages.push(newUserMessage)

            if (action.payload.botMessage) {
                chatState.botMessages.push({
                    sender: 'bot',
                    sentAt: Date.now(),
                    type: 'markdown',
                    conversationId: newConversationId,
                    lastToken: '',
                    message: action.payload.botMessage,
                    finished: true,
                    currentFile: null,
                    interrupted: false,
                    maxOrigLine: action.payload.botMaxOrigLine,
                } as BotMessage)
            }
            // Ready for another message in this conversation
            chatState.draftMessages[newConversationId] = {
                ...newUserMessage,
                message: '',
            }
        },
        setCurrentDraftMessage(
            chatState: ChatState,
            action: PayloadAction<string>
        ) {
            const conversationId = chatState.currentConversationId
            chatState.draftMessages[conversationId].message = action.payload
        },
        abortCommandBar(chatState: ChatState) {
            const conversationId = chatState.currentConversationId
            chatState.isCommandBarOpen = false
        },
        turnOnCommandK(chatState: ChatState) {
            chatState.fireCommandK = true
        },
        turnOffCommandK(chatState: ChatState) {
            chatState.fireCommandK = false
        },
        changeMsgType(
            chatState: ChatState,
            action: PayloadAction<ResponseType>
        ) {
            chatState.msgType = action.payload
        },
        changeDraftMsgType(
            chatState: ChatState,
            action: PayloadAction<ResponseType>
        ) {
            chatState.draftMessages[chatState.currentConversationId].msgType =
                action.payload
        },
        setChatOpen(chatState: ChatState, action: PayloadAction<boolean>) {
            chatState.chatIsOpen = action.payload
        },
        updateLastUserMessageMsgType(
            chatState: ChatState,
            action: PayloadAction<null>
        ) {
            const lastUserMessage =
                chatState.userMessages[chatState.userMessages.length - 1]
            if (lastUserMessage) {
                lastUserMessage.msgType = chatState.msgType!
            }
        },
        setMaxOrigLine(chatState: ChatState, action: PayloadAction<number>) {
            const lastBotMessage = getLastBotMessage(chatState)!
            // Bad - I added lots of tech debt today and will fix later
            lastBotMessage.maxOrigLine = action.payload
        },
        setHitTokenLimit(
            chatState: ChatState,
            action: PayloadAction<{
                conversationId: string
                hitTokenLimit: boolean
            }>
        ) {
            const lastBotMessage = getLastBotMessage(
                chatState,
                action.payload.conversationId
            )!
            lastBotMessage.hitTokenLimit = action.payload.hitTokenLimit
        },
        moveCommandBarHistory(
            chatState: ChatState,
            action: PayloadAction<'up' | 'down'>
        ) {
            if (action.payload === 'down') {
                chatState.commandBarHistoryIndex = Math.max(
                    -1,
                    chatState.commandBarHistoryIndex - 1
                )
            } else {
                chatState.commandBarHistoryIndex = Math.min(
                    chatState.commandBarHistoryIndex + 1,
                    chatState.userMessages.length - 1
                )
            }
            const index =
                chatState.userMessages.length -
                1 -
                chatState.commandBarHistoryIndex

            const historyMessage = chatState.userMessages.at(index)
            if (historyMessage) {
                // chatState.currentConversationId = historyMessage.conversationId
                const currentConversationId = chatState.currentConversationId
                const currentDraftMessage =
                    chatState.draftMessages[currentConversationId]
                currentDraftMessage.message = historyMessage.message
            }
            // if (historyMessage) {
            //     chatState.commandBarText = historyMessage.message
            // } else {
            //     chatState.commandBarText = ''
            // }
        },
    },
})

export const {
    appendResponse,
    newResponse,
    activateDiffFromEditor,
    abortCommandBar,
    endFinishResponse,
    testMessage,
    addOtherBlockToMessage,
    removeCodeBlock,
    openCommandBar,
    interruptGeneration,
    tokenLimitInterrupt,
    setGenerating,
    addSymbolToMessage,
    removeCodeSymbol,
    turnOnCommandK,
    turnOffCommandK,
    changeMsgType,
    changeDraftMsgType,
    setChatOpen,
    toggleChatHistory,
    moveCommandBarHistory,
    manufacturedConversation,
    setCurrentConversation,
    setCurrentDraftMessage,
    rejectMessage,
    undoRejectMessage,
    updateLastUserMessageMsgType,
    resumeGeneration,
    startNewMessage,
    doSetMessages,
    doSetChatState,
    setHitTokenLimit,
    _submitCommandBar: dummySubmitCommandBar,
    // Bad - I added tech debt and will fix later
    setMaxOrigLine,
} = chatSlice.actions
