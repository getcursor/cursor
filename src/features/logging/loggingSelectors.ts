import {
    Settings,
    FullState,
    SettingsState,
    LoggingState,
} from '../window/state'
import { createSelector } from 'reselect'

export const getFeedbackMessage = (state: FullState) =>
    state.loggingState.feedbackMessage
export const getIsOpen = (state: FullState) => state.loggingState.isOpen
