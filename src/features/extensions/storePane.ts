import { StateEffect, StateField } from '@codemirror/state'

// StateEffect to update the current pane id
export const updatePaneId = StateEffect.define<number>()

// StateField to store the current pane id
export const paneIdField = StateField.define<number>({
    create: () => -1,
    update: (paneId, tr) => {
        for (const effect of tr.effects) {
            if (effect.is(updatePaneId)) {
                paneId = effect.value
            }
        }
        return paneId
    },
})

// Export the StateField and StateEffect
export const storePaneIdExtensions = [paneIdField]
