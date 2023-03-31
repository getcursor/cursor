import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { addTransaction } from '../globalSlice'
import { FullState, State, initialState } from '../window/state'
import { getFilePath } from '../selectors'
import { API_ROOT, streamSource } from '../../utils'

const API_ENDPOINT = '/long_complete'

export const startCompletion = createAsyncThunk(
    'generation/start_completion',
    async (tabId: number, { getState, dispatch }) => {
        const getTab = () => (<FullState>getState()).global.tabs[tabId]

        // If already generating, we do nothing
        if (getTab().generating) {
            return
        }

        const state = <FullState>getState()
        const initialEditorState =
            state.global.tabCache[tabId].initialEditorState
        const fileId = state.global.tabs[tabId].fileId

        const file = getFilePath(fileId)(state)
        const content = initialEditorState!.doc.toString()
        const pos = initialEditorState!.selection.ranges[0].anchor

        const path = API_ROOT + API_ENDPOINT
        const data = {
            file,
            content,
            pos: pos,
        }

        dispatch(generationSlice.actions.pending(tabId))
        try {
            const response = await fetch(path, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify(data),
            })

            let notStarted = true
            let currentPos = pos
            for await (const token of streamSource(response)) {
                if (notStarted) {
                    notStarted = false
                    dispatch(generationSlice.actions.starting(tabId))
                }

                // If interrupted, we stop
                if (getTab().interrupted) break

                // TODO - move this logic to the generationSlice
                dispatch(
                    addTransaction({
                        tabId: tabId,
                        transactionFunction: {
                            type: 'insert',
                            from: currentPos,
                            to: currentPos,
                            text: token,
                        },
                    })
                )
                currentPos += token.length
            }
        } finally {
            dispatch(generationSlice.actions.completed(tabId))
        }
    }
)

export const generationSlice = createSlice({
    name: 'generation',
    initialState,
    reducers: {
        init(stobj: Object, action: PayloadAction<number>) {
            const state = <State>stobj
            const tabId = action.payload
            //state.keyboardBindings['Cmd-e'] = ''
        },
        pending(stobj: Object, action: PayloadAction<number>) {
            const state = <State>stobj
            const tabId = action.payload
            const tab = state.tabs[tabId]

            // set Tab to Read only
            tab.isReadOnly = true
            tab.generating = true
            tab.interrupted = false

            state.keyboardBindings['Ctrl-c'] =
                generationSlice.actions.interrupt(tabId)
        },
        starting(stobj: Object, action: PayloadAction<number>) {},
        completed(stobj: Object, action: PayloadAction<number>) {
            const state = <State>stobj
            const tabId = action.payload

            const tab = state.tabs[tabId]

            // set Tab to not Read only
            tab.isReadOnly = false
            tab.generating = false
            tab.interrupted = false
            delete state.keyboardBindings['Ctrl-c']
        },
        interrupt(stobj: Object, action: PayloadAction<number>) {
            const state = <State>stobj
            const tabId = action.payload
            const tab = state.tabs[tabId]

            if (tab.generating) {
                tab.interrupted = true
                delete state.keyboardBindings['Ctrl-c']
            }
        },
    },
})
