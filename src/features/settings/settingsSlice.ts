import {
    createAsyncThunk,
    createSlice,
    PayloadAction,
    ActionCreatorWithoutPayload,
} from '@reduxjs/toolkit'
import {
    FullState,
    Settings,
    SettingsState,
    initialSettingsState,
} from '../window/state'
import { current } from 'immer'

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
