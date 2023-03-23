import {
    faTimes,
    faHistory,
    IconDefinition,
    faChevronLeft,
    faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import {
    faChevronsLeft,
    faChevronsRight,
} from '@fortawesome/pro-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
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
