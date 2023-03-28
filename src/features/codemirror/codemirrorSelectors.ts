/*
* The idea with codemirror views is we actually have 
* multipled different stores

* There is the redux store
* and there is the codemirror store
* We need a way to make sure that the stores are in sync, which happens
*/
import { FullCodeMirrorState, getCodeMirrorView } from './codemirrorSlice'

export const getViewId = (tabId: number | null) => (state: {}) => {
    if (!tabId) return
    const castState = state as FullCodeMirrorState
    if (tabId in castState.codeMirrorState.editorMap) {
        return castState.codeMirrorState.editorMap[tabId]
    }
}

/// null - means there is no codemirror instance in frame
/// true - means there is a selection
/// false - means there is no selection
export const hasSelection = (viewId: number) => {
    if (viewId) {
        const view = getCodeMirrorView(viewId)
        if (view) {
            return (
                view.state.selection.main.from !== view.state.selection.main.to
            )
        }
    }
    return null
}
