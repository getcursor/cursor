import {
    IconDefinition,
    faHistory,
    faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { faChevronsLeft } from '@fortawesome/pro-regular-svg-icons'
import { setChatOpen, toggleChatHistory } from '../features/chat/chatSlice'
import { store } from './store'

export type Tip = [string, string, IconDefinition, () => void]
interface ActionTipsInterface {
    [key: string]: Tip
}
export const ActionTips: ActionTipsInterface = {
    CLOSE: ['Close', 'Esc', faTimes, () => store.dispatch(setChatOpen(false))],
    HISTORY: [
        'History',
        'Cmd+H',
        faHistory,
        () => store.dispatch(toggleChatHistory()),
    ],
    CLOSE_HISTORY: [
        'Close History',
        'Cmd+H',
        faChevronsLeft,
        () => store.dispatch(toggleChatHistory()),
    ],
}
