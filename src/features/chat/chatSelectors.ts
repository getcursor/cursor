import { FullState, Message } from '../window/state'
import { createSelector } from 'reselect'
import { getLastBotMessage as getLastBotMessageMain } from './chatSlice'

export const getIsCommandBarOpen = (state: FullState) =>
    state.chatState.isCommandBarOpen

export const getCurrentDraftMessage = (state: FullState) =>
    state.chatState.draftMessages[state.chatState.currentConversationId]

export const getLastBotMessage = (state: FullState) => {
    return getLastBotMessageMain(state.chatState)
}
export const getLastBotMessageById =
    (conversationId: string) => (state: FullState) => {
        return getLastBotMessageMain(state.chatState, conversationId)
    }
export const getLastBotMessageIndex = (state: FullState) => {
    const botMessages = state.chatState.botMessages
    return botMessages.length - 1
}

export const getLastBotMessageFinished = (state: FullState) => {
    const botMessages = state.chatState.botMessages
    const msg = botMessages[botMessages.length - 1]
    if (msg == null) return true
    return msg.finished
}
export const getLastBotMessageHitTokenLimit = (state: FullState) => {
    const botMessages = state.chatState.botMessages
    const msg = botMessages[botMessages.length - 1]
    if (msg == null) return false
    return msg.hitTokenLimit
}
export const getLastBotMessageInterrupted = (state: FullState) => {
    const botMessages = state.chatState.botMessages
    const msg = botMessages[botMessages.length - 1]
    if (msg == null) return false
    return msg.interrupted
}

export const getGenerating = (state: FullState) => state.chatState.generating

export const getMessages = (conversationId: string) =>
    createSelector(
        (state: FullState) =>
            state.chatState.botMessages.filter(
                (m) => m.conversationId === conversationId
            ),
        (state: FullState) =>
            state.chatState.userMessages.filter(
                (m) => m.conversationId === conversationId
            ),
        (botMessages, userMessages): Message[] => {
            // Interleave starting with orig userMessage
            const messages = []
            let i = 0
            let j = 0
            while (i < botMessages.length || j < userMessages.length) {
                if (j < userMessages.length) {
                    messages.push(userMessages[j])
                    j++
                }
                if (i < botMessages.length) {
                    messages.push(botMessages[i])
                    i++
                }
            }
            return messages
        }
    )

export const getConversationIds = createSelector(
    (state: FullState) => state.chatState.userMessages,
    (userMessages) =>
        userMessages
            .filter((m) => m.msgType === 'freeform')
            .map((m) => m.conversationId)
            .filter((value, index, self) => self.indexOf(value) === index)
)

export const getConversationPrompts = (
    conversationIds: string[],
    order: 'forward' | 'reverse' = 'forward'
) =>
    createSelector(
        ...conversationIds.map(getMessages),
        (...messageLists: Message[][]) =>
            messageLists.reduce((acc, messages) => {
                return order === 'forward'
                    ? [...acc, messages[0]]
                    : [messages[0], ...acc]
            }, [])
    )

export const isChatOpen = createSelector(
    (state: FullState) => state.chatState.currentConversationId,
    (state: FullState) => state.chatState.msgType,
    (state: FullState) => state.chatState.userMessages,
    (state: FullState) => state.chatState.botMessages,
    (state: FullState) => state.chatState.chatIsOpen,
    (conversationId, messageType, userMessages, botMessages, chatIsOpen) => {
        if (!chatIsOpen) {
            return false
        }
        const someMarkdownMessages = botMessages.some(
            (m) => m.conversationId === conversationId && m.type === 'markdown'
        )
        return someMarkdownMessages
    }
)

export const isChatHistoryOpen = createSelector(
    (state: FullState) => state.chatState.chatIsOpen,
    (state: FullState) => state.chatState.chatHistoryIsOpen,
    (chatIsOpen, isChatHistoryOpen) => {
        return chatIsOpen && isChatHistoryOpen
    }
)

export const getLastUserMessage = (state: FullState) => {
    const userMessages = state.chatState.userMessages.filter(
        (m) => m.conversationId === state.chatState.currentConversationId
    )
    return userMessages[userMessages.length - 1]
}

export const getUserMessages = (state: FullState) => {
    return state.chatState.userMessages
}

export const getLastCodeBlocks = (state: FullState) => {
    const userMessages = state.chatState.userMessages
    return userMessages[userMessages.length - 1].otherCodeBlocks
}

export const getLastMarkdownMessage = (state: FullState) => {
    const botMessages = state.chatState.botMessages
    for (let i = botMessages.length - 1; i >= 0; i--) {
        if (botMessages[i].type === 'markdown') {
            return botMessages[i]
        }
    }
}

export const getCurrentConversationMessages = () =>
    createSelector(
        (state: FullState) => state.chatState.currentConversationId,
        (state: FullState) => (id: string) => getMessages(id)(state),
        (id, getter) => getter(id)
    )

export const getIsChatHistoryAvailable = createSelector(
    (state: FullState) => state.chatState.userMessages,
    (userMessages) => userMessages.length > 0
)

export const getFireCommandK = (state: FullState) =>
    state.chatState.fireCommandK
export const getMsgType = (state: FullState) => state.chatState.msgType
