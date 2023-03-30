import {
    Action,
    PreloadedState,
    ThunkAction,
    combineReducers,
    configureStore,
} from '@reduxjs/toolkit'
import globalReducer from '../features/globalSlice'
import { initialState } from '../features/window/state'
import { fileSlice } from '../features/window/fileUtils'
import { generationSlice } from '../features/generation/generate'
import { chatSlice } from '../features/chat/chatSlice'
import { settingsSlice } from '../features/settings/settingsSlice'
import { toolSlice } from '../features/tools/toolSlice'
import { loggingSlice } from '../features/logging/loggingSlice'
import { languageServerSlice } from '../features/lsp/languageServerSlice'
import { commentSlice } from '../features/comment/commentSlice'
import { testSlice } from '../features/tests/testSlice'
import { fixLSPSlice } from '../features/fixLSP/fixLSPSlice'
import { codeMirrorSlice } from '../features/codemirror/codemirrorSlice'

const reduceReducers = (...args: any) => {
    const initialState = typeof args[0] !== 'function' && args.shift()
    const reducers = args

    if (typeof initialState === 'undefined') {
        throw new TypeError(
            'The initial state may not be undefined. If you do not want to set a value for this reducer, you can use null instead of undefined.'
        )
    }

    return (prevState: any, value: any, ...args: any) => {
        const prevStateIsUndefined = typeof prevState === 'undefined'
        const valueIsUndefined = typeof value === 'undefined'

        if (prevStateIsUndefined && valueIsUndefined && initialState) {
            return initialState
        }

        return reducers.reduce(
            (newState: any, reducer: any, index: number) => {
                if (typeof reducer === 'undefined') {
                    throw new TypeError(
                        `An undefined reducer was passed in at index ${index}`
                    )
                }
                return reducer(newState, value, ...args)
            },
            prevStateIsUndefined && !valueIsUndefined && initialState
                ? initialState
                : prevState
        )
    }
}

const logReducer = (state: object, action: object) => {
    //
    //
    return state
}

export const fullReducer = combineReducers({
    global: reduceReducers(
        initialState,
        globalReducer,
        generationSlice.reducer,
        fileSlice.reducer
    ),
    chatState: chatSlice.reducer,
    settingsState: settingsSlice.reducer,
    toolState: toolSlice.reducer,
    loggingState: loggingSlice.reducer,
    languageServerState: languageServerSlice.reducer,
    codeMirrorState: codeMirrorSlice.reducer,
    commentState: commentSlice.reducer,
    fixLSPState: fixLSPSlice.reducer,
    test: testSlice.reducer,
})

export const store = configureStore({
    reducer: fullReducer,
    // middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    //   serializableCheck: false,
    //   immutableCheck: false
    // }),
})

export function setupStore(preloadedState?: PreloadedState<RootState>) {
    return configureStore({
        reducer: fullReducer,
        preloadedState,
    })
}

export type AppStore = ReturnType<typeof setupStore>
export type AppDispatch = typeof store.dispatch
export type RootState = ReturnType<typeof store.getState>
export type AppThunk<ReturnType = void> = ThunkAction<
    ReturnType,
    RootState,
    unknown,
    Action<string>
>
