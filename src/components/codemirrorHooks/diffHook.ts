import { EditorView } from '@codemirror/view'
import { BotMessage } from '../../features/window/state'
import { useEffect, useRef } from 'react'
import { EditorState, Text } from '@codemirror/state'
import { rejectDiff, setDiff } from '../../features/extensions/diff'
import { editBoundaryState } from '../../features/extensions/hackDiff'
import { useAppDispatch } from '../../app/hooks'
// Import chatslice
// Hook to get the previous value of lastBotMessage
function usePrevious<T>(value: T) {
    const ref = useRef<T>()
    useEffect(() => {
        ref.current = value
    }, [value])
    return ref.current
}

export function useSetDiff({
    lastBotMessage,
    view,
    filePath,
}: {
    lastBotMessage?: BotMessage
    view?: EditorView
    filePath: string
}) {
    const previousBotMessage = usePrevious(lastBotMessage)
    const lastDiffParameters = useRef<any>(null)
    const origEditorState = useRef<EditorState>()
    const dispatch = useAppDispatch()
    useEffect(() => {
        try {
            const diffId = lastBotMessage?.conversationId!
            if (view != null) {
                if (
                    lastBotMessage != null &&
                    lastBotMessage.currentFile == filePath &&
                    !lastBotMessage.rejected
                ) {
                    // Always reject a diff if it exsts when the lastBotMessage is not null,
                    // corresponds to the currentFile. When not rejected, we dont add the rejection
                    // to history, which is the second argument or rejectDiff
                    if (!origEditorState.current) {
                        origEditorState.current = view.state
                        lastDiffParameters.current = null
                    }
                    // We should be guaranteed here origEditorState.current is not null

                    // When we are an edit with a nontrivial length, enter here
                    if (
                        lastBotMessage.type == 'edit' &&
                        lastBotMessage.message.length > 2
                    ) {
                        // remove selection range from codemirror as otherwise it looks hacky
                        view.dispatch({
                            selection: {
                                anchor: view.state.selection.main.from,
                                head: view.state.selection.main.from,
                            },
                        })
                        const edit =
                            origEditorState.current.field(editBoundaryState)
                        if (
                            lastBotMessage.finished &&
                            !lastBotMessage.interrupted
                        ) {
                            // If we are finished, and haven't been interrupted, then we show the
                            // full diff
                            const diffParameters = {
                                origText: origEditorState.current.doc,
                                diffId,
                                origLine: origEditorState.current.doc.lineAt(
                                    edit?.start!
                                ).number,
                                origEndLine: origEditorState.current.doc.lineAt(
                                    edit?.end!
                                ).number,
                                newText: Text.of(
                                    lastBotMessage.message.split('\n')
                                ),
                                isFinished: true,
                                isFinalDiff: true,
                            }
                            if (
                                previousBotMessage?.finished &&
                                lastBotMessage?.finished
                            )
                                return
                            setDiff(diffParameters)(view)
                        } else {
                            // This is the logic for streaming diffs. It is insanely busted right now
                            const diffParameters = {
                                origText: origEditorState.current.doc,
                                diffId,
                                origLine: origEditorState.current.doc.lineAt(
                                    edit?.start!
                                ).number,
                                origEndLine: origEditorState.current.doc.lineAt(
                                    edit?.end!
                                ).number,
                                newText: Text.of(
                                    lastBotMessage.message.split('\n')
                                ),
                                isFinalDiff: false,
                                isInterrupted:
                                    lastBotMessage.interrupted &&
                                    lastBotMessage.finished,
                                isFinished: lastBotMessage.finished,
                                hitTokenLimit: lastBotMessage.hitTokenLimit,
                            }
                            if (
                                previousBotMessage?.finished &&
                                lastBotMessage?.finished
                            )
                                return
                            if (
                                lastBotMessage.interrupted &&
                                !lastBotMessage.finished
                            ) {
                                // debugger
                            }
                            setDiff(diffParameters)(view)
                        }
                    } else if (lastBotMessage.type == 'continue') {
                        rejectDiff(diffId, false)(view)
                    }
                } else {
                    if (
                        lastBotMessage?.type != 'chat_edit' &&
                        lastBotMessage?.type != 'lsp_edit'
                    ) {
                        rejectDiff(diffId)(view)
                        if (origEditorState.current) {
                            origEditorState.current = undefined
                        }
                        if (lastDiffParameters.current) {
                            lastDiffParameters.current = null
                        }
                    }
                }
            }
        } catch (e) {
            console.error(e)
        }
    }, [lastBotMessage])
}
