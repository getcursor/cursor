import { getIdentifier } from './languageServerSlice'
import { LanguageServerState } from '../window/state'
import { createSelector } from '@reduxjs/toolkit'

export const getLanguages = createSelector(
    (state: { languageServerState: LanguageServerState }) =>
        state.languageServerState,
    (languageServerState) => Object.keys(languageServerState.languageServers)
)

export const copilotStatus = createSelector(
    (state: { languageServerState: LanguageServerState }) =>
        state.languageServerState,
    (languageServerState) => ({
        signedIn: languageServerState.copilotSignedIn,
        enabled: languageServerState.copilotEnabled,
    })
)

export const languageServerStatus = (languageServer: string) =>
    createSelector(
        (state: { languageServerState: LanguageServerState }) =>
            state.languageServerState,
        (languageServerState) => {
            const languageServerName = getIdentifier(languageServer)
            if (languageServerName === null) {
                return null
            }
            return languageServerState.languageServers[languageServerName]
        }
    )
