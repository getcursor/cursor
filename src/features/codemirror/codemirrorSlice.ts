import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
    EditorSelection,
    EditorState,
    Extension,
    StateField,
    Transaction,
    TransactionSpec,
} from '@codemirror/state'
import { FullState, State } from '../window/state'
import { EditorView } from '@codemirror/view'
import {
    customDispatch,
    syncDispatch,
} from '../../components/codemirrorHooks/dispatch'

interface UpsertEditor {
    tabId: number
    editorStateConfig: {
        initialState?: {
            json: any
            fields?: Record<string, StateField<any>>
        }
        config: {
            doc?: string
            selection?:
                | EditorSelection
                | {
                      anchor: number
                      head?: number
                  }
            extensions: Extension[]
        }
    }
    useCustomDispatch?: boolean
}

// THESSE CANNOT be exported, because it must only be modifiable
// on state transitions
// Technically, I think you can sub out things in the middle
let codeMirrorViews: ReadonlyArray<[number, EditorView]> = []

function cleanViews(state: CodeMirrorState) {
    // When we clean the views, we destroy the views that we have deleted from state
    codeMirrorViews
        .filter(([viewId, view]) => !state.editorIds.includes(viewId))
        .forEach(([viewId, view]) => void view.destroy())
    codeMirrorViews = codeMirrorViews.filter(([viewId, view]) =>
        state.editorIds.includes(viewId)
    )
}

function addCodeMirrorView(id: number, view: EditorView) {
    codeMirrorViews = [...codeMirrorViews, [id, view]]
}
// You may now export any of these

export const getCodeMirrorView = (editorId: number) => {
    const view = codeMirrorViews.find(([viewId]) => viewId === editorId)
    if (view) {
        return view[1]
    }
    return null
}

export interface CodeMirrorState {
    editorIds: number[]
    editorMap: {
        // Maps tab ids to editorIds
        [tabId: number]: number
    }
}

export interface FullCodeMirrorState {
    codeMirrorState: CodeMirrorState
    global: State
}

export const initialCodeMirrorState: CodeMirrorState = {
    editorIds: [],
    editorMap: {},
}

function updateSyncViews(codeMirrorState: CodeMirrorState, tabIds: number[]) {
    const views = tabIds.map((tabId) => {
        const editorId = codeMirrorState.editorMap[tabId]
        return getCodeMirrorView(editorId)!
    })
    //
    for (let i = 0; i < tabIds.length; i++) {
        const currentView = views[i]
        const otherViews = views.filter((view) => view !== currentView)
        const customDispatch = (tr: Transaction) =>
            syncDispatch(tr, currentView, ...otherViews)

        currentView.dispatch = (
            ...input: (Transaction | TransactionSpec)[]
        ) => {
            customDispatch(
                input.length == 1 && input[0] instanceof Transaction
                    ? input[0]
                    : currentView.state.update(...(input as TransactionSpec[]))
            )
        }
    }
}

export const upsertEditor = createAsyncThunk(
    'codemirror/createEditor',
    async (
        { tabId, editorStateConfig, useCustomDispatch }: UpsertEditor,
        { getState, dispatch }
    ) => {
        // Upsert the editor
        dispatch(_upsertEditor({ tabId, editorStateConfig, useCustomDispatch }))

        const state = (<FullState>getState()).global
        const fileId = state.tabs[tabId].fileId

        const similarTabIds = Object.keys(state.tabs).filter(
            (otherTabId) =>
                parseInt(otherTabId) !== tabId &&
                state.tabs[parseInt(otherTabId)].fileId === fileId
        )

        // Then we change the other tabs to be the same
        if (similarTabIds.length > 0) {
            const allTabIds = [
                tabId,
                ...similarTabIds.map((id) => parseInt(id)),
            ]
            updateSyncViews(
                (getState() as FullCodeMirrorState).codeMirrorState,
                allTabIds
            )
        }
    }
)

export const removeEditor = createAsyncThunk(
    'codemirror/removeEditor',
    async ({ tabId }: { tabId: number }, { getState, dispatch }) => {
        dispatch(_removeEditor({ tabId }))
        const state = (<FullState>getState()).global
        const fileId = state.tabs[tabId].fileId
        const similarTabIds = Object.keys(state.tabs).filter(
            (otherTabId) =>
                parseInt(otherTabId) !== tabId &&
                state.tabs[parseInt(otherTabId)].fileId === fileId
        )

        // Then we change the other tabs to be the same
        if (similarTabIds.length > 0) {
            updateSyncViews(
                (getState() as FullCodeMirrorState).codeMirrorState,
                similarTabIds.map((id) => parseInt(id))
            )
        }
    }
)

export const codeMirrorSlice = createSlice({
    name: 'codeMirrorState',
    initialState: initialCodeMirrorState as CodeMirrorState,
    extraReducers: (builder) => {
        // Case for installing a language server
    },
    reducers: {
        _upsertEditor: (state, action: PayloadAction<UpsertEditor>) => {
            const {
                tabId,
                editorStateConfig: { initialState, config },
                useCustomDispatch,
            } = action.payload
            // Check if we already have an editor for this tab
            // if (tabId in state.editorMap) {
            //     // we can still update the editor
            //     return
            // }

            const stateCurrent = initialState
                ? EditorState.fromJSON(
                      initialState.json,
                      config,
                      initialState.fields
                  )
                : EditorState.create(config)

            // Otherwise, create a new editor
            let view: EditorView
            view = new EditorView({
                ...stateCurrent,
                dispatch: useCustomDispatch
                    ? (tr) => customDispatch(view, tr)
                    : undefined,
            })

            let nextId
            if (state.editorIds.length == 0) {
                nextId = 1
            } else {
                nextId = Math.max(...state.editorIds) + 1
            }
            addCodeMirrorView(nextId, view)
            state.editorIds.push(nextId)
            state.editorMap[tabId] = nextId
            // Then we clean the views
            cleanViews(state)
        },
        _removeEditor: (state, action: PayloadAction<{ tabId: number }>) => {
            const { tabId } = action.payload

            if (tabId in state.editorMap) {
                const editorId = state.editorMap[tabId]
                // Find the index of the editorId
                delete state.editorMap[tabId]
                // Get the index of the editorId from the editorIds
                state.editorIds = state.editorIds.filter(
                    (eid) => eid !== editorId
                )
            }
            // Then we clean the views
            cleanViews(state)
        },
        transferEditor: (
            state,
            action: PayloadAction<{ oldTabId: number; newTabId: number }>
        ) => {
            const { oldTabId, newTabId } = action.payload
            if (oldTabId in state.editorMap) {
                const editorId = state.editorMap[oldTabId]
                delete state.editorMap[oldTabId]
                state.editorMap[newTabId] = editorId
            }
            // Then we clean the views
            cleanViews(state)
        },
    },
})

export const { _upsertEditor, _removeEditor, transferEditor } =
    codeMirrorSlice.actions
