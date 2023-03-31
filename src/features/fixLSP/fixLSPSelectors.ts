import { FixLSPState, FullState } from '../window/state'
import { createSelector } from 'reselect'

export const selectFixesByFileId = (fileId: number) =>
    createSelector(
        (state: FullState) => state.fixLSPState.fixes,
        (fixes: FixLSPState['fixes']) => fixes[fileId]
    )
