import { Settings, FullState, SettingsState } from '../window/state'
import { createSelector } from 'reselect'

export const getSettingsIsOpen = createSelector(
    (state: FullState) => state.settingsState,
    (settings: SettingsState) => settings.isOpen
)

export const getSettings = createSelector(
    (state: FullState) => state.settingsState,
    (settings: SettingsState) => settings.settings
)
