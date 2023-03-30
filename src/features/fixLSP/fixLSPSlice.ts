import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { FixLSPState, FullState, LineChange } from '../window/state'

import { API_ROOT } from '../../utils'

import { getPathForFileId } from '../window/fileUtils'
import { globalViews } from '../../components/globalViews'
import {
    applyLineChangesToView,
    getFixLSPBlobForServerWithSideEffects,
} from '../linter/fixLSPExtension'

export const fixErrors = createAsyncThunk(
    'fixLSP/fixErrors',
    async (payload: { tabId: number }, { getState, dispatch }) => {
        const state = getState() as FullState
        const tab = state.global.tabs[payload.tabId]
        const fileId = state.global.tabs[payload.tabId].fileId
        const filePath = getPathForFileId(state.global, fileId)

        const view = globalViews[tab.paneId]
        const blob = getFixLSPBlobForServerWithSideEffects(view)
        if (blob == null) return null

        const response = await fetch(`${API_ROOT}/fixLSP`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            //credentials: 'include',
            body: JSON.stringify({
                filename: filePath,
                ...blob,
            }),
        })
        const json = await response.json()

        // mock response
        // const json = {
        //     changes: [
        //         {
        //             startLine: 1,
        //             endLine: 1,
        //             newText: "mock change"
        //         },
        //         {
        //             startLine: 4,
        //             endLine: 4,
        //             newText: "mock change 2"
        //         }
        //     ]
        // };

        //

        // json.changes.forEach((lineChange, ind) => {
        //     const origLine = lineChange.startLine
        //     const origEndLine = lineChange.endLine
        //     const diffPayload = {
        //         origText: view.state.doc,
        //         diffId: `${ind}`,
        //         origLine,
        //         origEndLine,
        //         newText: Text.of(lineChange.newText.split('\n')),
        //     }
        //     setDiff(diffPayload, true)(globalViews[tab.paneId])
        // })

        applyLineChangesToView(view, json)
    }
)

// export const fixErrors = createAsyncThunk(
//     'fixLSP/fixErrors',
//     async (payload: { tabId: number }, { getState, dispatch }) => {
//         const state = getState() as FullState
//         const fileId = state.global.tabs[payload.tabId].fileId
//         const fixFile = state.fixLSPState.fixes[fileId]
//         if (fixFile == null) return
//         const transaction: FixLSPDiffTransaction = {
//             type: 'fixLSPDiff',
//             changes: fixFile.changes,
//         }
//         dispatch(
//             addTransaction({
//                 tabId: payload.tabId,
//                 transactionFunction: transaction,
//             })
//         )
//     }
// )

// export const submitDiagnostics = createAsyncThunk(
//     'fixLSP/submitDiagnostics',
//     async (payload: { blob: any; fileId: number }, { getState, dispatch }) => {
//         const filePath = getPathForFileId(
//             (getState() as FullState).global,
//             payload.fileId,
//             false
//         )
//         const response = await fetch(`${API_ROOT}/fixLSP`, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             //credentials: 'include',
//             body: JSON.stringify({
//                 filename: filePath,
//                 ...payload.blob,
//             }),
//         })
//         // parse json
//         const json = await response.json()

//         // mock response
//         // const json = {
//         //     changes: [
//         //         {
//         //             startLine: 1,
//         //             endLine: 2,
//         //             newText: "mock change"
//         //         },
//         //         {
//         //             startLine: 4,
//         //             endLine: 5,
//         //             newText: "mock change 2"
//         //         }
//         //     ]
//         // };

//         dispatch(addChanges({ fileId: payload.fileId, changes: json }))
//     }
// )

const initialState: FixLSPState = {
    fixes: {},
}

function initFixLSPFile(state: FixLSPState, fileId: number) {
    if (state.fixes[fileId] == null) {
        state.fixes[fileId] = {
            changes: [],
            doDiagnosticsExist: true,
        }
    }
}

export const fixLSPSlice = createSlice({
    name: 'fixLSPState',
    initialState: initialState as FixLSPState,
    reducers: {
        addChanges(
            state,
            action: PayloadAction<{ fileId: number; changes: LineChange[] }>
        ) {
            initFixLSPFile(state, action.payload.fileId)
            state.fixes[action.payload.fileId].changes = action.payload.changes
        },
        markDoDiagnosticsExit(
            state,
            action: PayloadAction<{
                fileId: number
                doDiagnosticsExist: boolean
            }>
        ) {
            initFixLSPFile(state, action.payload.fileId)

            state.fixes[action.payload.fileId].doDiagnosticsExist =
                action.payload.doDiagnosticsExist
        },
    },
})

export const { addChanges, markDoDiagnosticsExit } = fixLSPSlice.actions
