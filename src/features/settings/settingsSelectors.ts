import { FullState, SettingsState } from '../window/state'
import { createSelector } from 'reselect'

const availableServerModels = ['gpt-4', 'gpt-3.5-turbo']

export const getSettingsIsOpen = createSelector(
    (state: FullState) => state.settingsState,
    (settings: SettingsState) => settings.isOpen
)

export const getSettings = createSelector(
    (state: FullState) => state.settingsState,
    (settings: SettingsState) => settings.settings
)

export async function getModels(secretKey: string) {
    return await fetch('https://api.openai.com/v1/models', {
        headers: {
            Authorization: `Bearer ${secretKey}`,
        },
    }).then(async (response) => {
        if (response.status == 401) {
            return {
                models: [],
                isValidKey: false,
            }
        }
        const models = (await response.json()) as { data: { id: string }[] }
        return {
            models: models.data
                .filter((datum) => availableServerModels.includes(datum.id))
                .map((datum) => datum.id),
            isValidKey: true,
        }
    })
}
