import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { SettingsState, initialSettingsState } from '../window/state'

export const changeSettings = createAsyncThunk(
    'settings/changeSettings',
    async (newSettings: any, { getState, dispatch }) => {
        dispatch(changeSettingsNoSideffect(newSettings))

        //@ts-ignore
        connector.changeSettings(getState().settingsState.settings)
    }
)

export const settingsSlice = createSlice({
    name: 'settings',
    initialState: initialSettingsState as SettingsState,
    reducers: {
        toggleSettings(settingsState: SettingsState) {
            settingsState.isOpen = !settingsState.isOpen
        },
        changeSettingsNoSideffect(
            settingsState: SettingsState,
            action: PayloadAction<any>
        ) {
            settingsState.settings = {
                ...settingsState.settings,
                ...action.payload,
            }
        },
    },
})

export const { toggleSettings, changeSettingsNoSideffect } =
    settingsSlice.actions
