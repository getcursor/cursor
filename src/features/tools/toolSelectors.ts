import { createSelector } from '@reduxjs/toolkit'
import { FullState, ToolState } from '../window/state'

export const getLeftTab = createSelector(
    (state: FullState) => state.toolState,
    (tool: ToolState) => tool.openLeftTab
)

export const getLeftTabActive = createSelector(
    (state: FullState) => state.toolState,
    (tool: ToolState) => tool.leftTabActive
)

export const fileSearchTriggered = createSelector(
    (state: FullState) => state.toolState,
    (tool: ToolState) => tool.fileSearchTriggered
)
export const commandPaletteTriggeredSelector = createSelector(
    (state: FullState) => state.toolState,
    (tool: ToolState) => {
        return tool.commandPaletteTriggered
    }
)
export const aiCommandPaletteTriggeredSelector = createSelector(
    (state: FullState) => state.toolState,
    (tool: ToolState) => {
        return tool.aiCommandPaletteTriggered
    }
)

export const getLeftSideExpanded = createSelector(
    (state: FullState) => state.toolState,
    (tool: ToolState) => tool.leftSideExpanded
)

export const loginStatus = createSelector(
    (state: FullState) => state.toolState,
    (tool: ToolState) => ({
        signedIn: !!(tool.cursorLogin.accessToken && tool.cursorLogin.profile),
        proVersion: !!tool.cursorLogin.stripeId,
    })
)
