import { FullState } from '../window/state'

export const getFeedbackMessage = (state: FullState) =>
    state.loggingState.feedbackMessage
export const getIsOpen = (state: FullState) => state.loggingState.isOpen
