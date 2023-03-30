/*
This is a codemirror v6 implementation of inline diffs.

There are state fields that store the information for the diffs present in a 
block of code. 
*/
import { Extension, StateEffect, StateField } from '@codemirror/state'

export interface EditBoundary {
    start: number
    end: number
}
export const editBoundaryEffect = StateEffect.define<EditBoundary>({
    map: (val, mapping) => ({
        start: mapping.mapPos(val.start),
        end: mapping.mapPos(val.end),
    }),
})
export const editBoundaryState = StateField.define<EditBoundary | null>({
    create: () => null,
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(editBoundaryEffect)) {
                value = effect.value
            }
        }
        return value
    },
})
export interface ContinueCursor {
    pos: number
}
export const insertCursorEffect = StateEffect.define<ContinueCursor>({
    map: (val, mapping) => ({ pos: mapping.mapPos(val.pos) }),
})
export const insertCursorState = StateField.define<ContinueCursor | null>({
    create: () => null,
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(insertCursorEffect)) {
                value = effect.value
            }
        }
        return value
    },
})

export const hackLockEffect = StateEffect.define<{ on: boolean }>({
    map: (val, mapping) => ({ on: val.on }),
})
export const hackLockState = StateField.define<{ on: boolean }>({
    create: () => ({ on: false }),
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(hackLockEffect)) {
                value = effect.value
            }
        }
        return value
    },
})

export const hackExtension = [
    editBoundaryState,
    insertCursorState,
    hackLockState,
] as Extension
