import { createAsyncThunk } from '@reduxjs/toolkit'
import { FullState } from './window/state'
import { getActiveTabId } from './window/paneUtils'
import { forceCloseTab, saveFile } from './globalSlice'
import { getPathForFileId } from './window/fileUtils'
import { removeEditor } from './codemirror/codemirrorSlice'

export const closeTab = createAsyncThunk(
    'global/closeTab',
    async (tabId: number | null, { getState, dispatch }) => {
        const state = (<FullState>getState()).global
        tabId = tabId || getActiveTabId(state)
        if (tabId == null) return

        const fileId = state.tabs[tabId].fileId
        const file = state.files[fileId]
        if (!file.saved) {
            const result = await connector.checkCloseTab(
                getPathForFileId(state, fileId)
            )
            if (result === 'cancel') return
            if (result === 'save') {
                await dispatch(saveFile(fileId))
            }
        }
        // Delete the view before closing the tab
        dispatch(removeEditor({ tabId }))
        // Then close the tab
        dispatch(forceCloseTab(tabId))
    }
)

export const closeAllTabs = createAsyncThunk(
    'global/closeAllTabs',
    async (_, { getState, dispatch }) => {
        const state = (<FullState>getState()).global
        const tabIds = Object.keys(state.tabs)

        for (const tabId of tabIds) {
            await dispatch(closeTab(parseInt(tabId, 10)))
        }
    }
)
