import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { API_ROOT } from '../../utils'
import { FullState, LoggingState, initialLoggingState } from '../window/state'

export const sendFeedbackMessage = createAsyncThunk(
    'chat/getResponse',
    async (payload: null, { getState, dispatch }) => {
        const state = <FullState>getState()
        const message = state.loggingState.feedbackMessage
        dispatch(updateFeedbackMessage(''))
        dispatch(closeChat(null))

        const response = await fetch(`${API_ROOT}/save_message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
            }),
        })
    }
)

export const loggingSlice = createSlice({
    name: 'settings',
    initialState: initialLoggingState as LoggingState,
    reducers: {
        updateFeedbackMessage(
            loggingState: LoggingState,
            action: PayloadAction<string>
        ) {
            loggingState.feedbackMessage = action.payload
        },
        toggleFeedback(
            loggingState: LoggingState,
            action: PayloadAction<null>
        ) {
            loggingState.isOpen = !loggingState.isOpen
        },
        closeChat(loggingState: LoggingState, action: PayloadAction<null>) {
            loggingState.isOpen = false
        },
    },
})

export const { updateFeedbackMessage, toggleFeedback, closeChat } =
    loggingSlice.actions
