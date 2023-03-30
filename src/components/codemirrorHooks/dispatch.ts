import { EditorView } from '@codemirror/view'
import React, { useEffect } from 'react'
import { ReactCodeMirrorRef } from '../react-codemirror'
import {
    Annotation,
    StateEffect,
    Text,
    Transaction,
    TransactionSpec,
} from '@codemirror/state'
import { useAppDispatch } from '../../app/hooks'
import { flushTransactions } from '../../features/globalSlice'
import { LineChange, ReduxTransaction } from '../../features/window/state'
import { showBar } from '../../features/extensions/cmdZBar'

import { reduxTransaction } from '../../features/extensions/utils'
// import { showBar } from '../../features/extensions/cmdZBar'

type TransactionFunction = CustomTransaction | CustomTransaction[]

export function useDispatchHook({
    editorRef,
    oldTabId,
    tabId,
    transactions,
}: {
    editorRef: React.MutableRefObject<ReactCodeMirrorRef>
    tabId: number
    oldTabId: number
    transactions: ReduxTransaction[]
}) {
    const dispatch = useAppDispatch()
    const dispatchTransactions = (
        view: EditorView | undefined,
        transactions: ReduxTransaction[]
    ) => {
        if (transactions.length != 0) {
            if (view != null) {
                const editorView = view
                // Sort transactions by .transactionId. Make it a new array so we don't mutate the original.
                const sortedTransactions = [...transactions].sort(
                    (a, b) => a.transactionId - b.transactionId
                )

                const actualTransactions = sortedTransactions.map(
                    (t) => t.transactionFunction
                )

                for (const transaction of actualTransactions) {
                    const finalTransaction = customToEffect(transaction)
                    editorView?.dispatch(finalTransaction)
                }

                dispatch(
                    flushTransactions({
                        tabId: tabId,
                        transactionIds: transactions.map(
                            (t) => t.transactionId
                        ),
                    })
                )
            }
        }
    }

    useEffect(
        () => void dispatchTransactions(editorRef.current?.view, transactions),
        [transactions, editorRef.current.view, tabId, oldTabId]
    )

    return dispatchTransactions
}

export type CustomTransaction =
    | NewSelection
    | TextInsert
    | TextStartLineInsert
    | BarTransaction
    | GenericTransaction
    | FixLSPDiffTransaction

export interface GenericTransaction {
    type: 'generic'
    genericBlob: { type: string; payload: any }
}

export interface FixLSPDiffTransaction {
    type: 'fixLSPDiff'
    changes: LineChange[]
}

export interface NewSelection {
    type: 'newSelection'
    from:
        | number
        | {
              line: number
              col: number
          }
    to:
        | number
        | {
              line: number
              col: number
          }
    scroll?: 'intoView' | 'center'
    inHistory?: boolean
}

export interface BarTransaction {
    type: 'bar'
    blob: any
}

export interface TextInsert {
    type: 'insert'
    text: string
    from?:
        | number
        | {
              line: number
              col: number
          }
    to?:
        | number
        | {
              line: number
              col: number
          }
        | null
    dontUpdate?: boolean
    scroll?: 'intoView' | 'center'
}

interface TextStartLineInsert {
    type: 'insertStartLine'
    text: string
    from:
        | number
        | {
              line: number
              col: number
          }
    to:
        | number
        | {
              line: number
              col: number
          }
        | null
    dontUpdate?: boolean
    scroll?: 'intoView' | 'center'
}
export function newSelection(
    from: number | { line: number; col: number },
    to: number | { line: number; col: number }
): TransactionSpec {
    return {
        effects: customDispatchEffect.of({
            type: 'newSelection',
            from,
            to,
        }),
    }
}
export function textInsert(
    text: string,
    from: number | { line: number; col: number },
    to: number | { line: number; col: number }
): TransactionSpec {
    return {
        effects: customDispatchEffect.of({
            type: 'insert',
            text,
            from,
            to,
        }),
    }
}

// custom codemirror annotation for dontshow
export const dontShowAnnotation = Annotation.define<boolean>()

function customToEffect(custom: TransactionFunction) {
    if (Array.isArray(custom)) {
        return { effects: [...custom.map((c) => customDispatchEffect.of(c))] }
    } else {
        return { effects: customDispatchEffect.of(custom) }
    }
}
function posFromLineCol(
    doc: Text,
    lineCol: { line: number; col: number }
): number {
    return doc.line(lineCol.line + 1).from + lineCol.col
}

function getTransaction(
    view: EditorView,
    customTransaction: CustomTransaction
): TransactionSpec | null {
    let from = 0,
        to = 0
    if (
        customTransaction.type !== 'generic' &&
        customTransaction.type !== 'bar' &&
        customTransaction.type !== 'fixLSPDiff'
    ) {
        if (!customTransaction.from) {
            from = view.state.selection.main.from
        } else if (typeof customTransaction.from === 'number') {
            from = customTransaction.from
        } else {
            from = posFromLineCol(view.state.doc, customTransaction.from)
        }

        // this is very hacky lord forgive me
        if (customTransaction.to === null) {
            to = view.state.doc.length
        } else if (customTransaction.to === undefined) {
            to = view.state.selection.main.to
        } else if (typeof customTransaction.to === 'number') {
            to = customTransaction.to
        } else {
            to = posFromLineCol(view.state.doc, customTransaction.to)
        }

        if (customTransaction.scroll == 'center') {
            view.requestMeasure({
                read() {
                    return {
                        cursor: view.coordsAtPos(
                            view.state.selection.main.from
                        ),
                        scroller: view.scrollDOM.getBoundingClientRect(),
                    }
                },
                write({ cursor, scroller }) {
                    if (cursor) {
                        const curMid = (cursor.top + cursor.bottom) / 2
                        const eltMid = (scroller.top + scroller.bottom) / 2
                        if (Math.abs(curMid - eltMid) > 5)
                            view.scrollDOM.scrollTop += curMid - eltMid
                    }
                },
            })
        }
    }

    switch (customTransaction.type) {
        case 'newSelection':
            return {
                selection: {
                    anchor: from,
                    head: to,
                },
                scrollIntoView: customTransaction.scroll == 'intoView',
                annotations: [
                    Transaction.addToHistory.of(
                        customTransaction.inHistory == true
                    ),
                ],
            }
        case 'insert':
            return {
                changes: { from, to, insert: customTransaction.text },
                selection: {
                    anchor: from + customTransaction.text.length,
                    head: from + customTransaction.text.length,
                },
                scrollIntoView: customTransaction.scroll == 'intoView',
                annotations: [dontShowAnnotation.of(false)],
            }
        case 'insertStartLine':
            // get the position of the start of the line
            const currentLine = view.state.doc.lineAt(from)
            const lineStart = currentLine.from
            const lineEnd = currentLine.to
            // Check if the current line just has whitespace
            const isWhitespace = currentLine.text.trim().length == 0
            if (isWhitespace) {
                return {
                    changes: {
                        from: lineStart,
                        to: lineEnd,
                        insert: customTransaction.text,
                    },
                    selection: {
                        anchor: lineStart + customTransaction.text.length,
                        head: lineStart + customTransaction.text.length,
                    },
                    scrollIntoView: customTransaction.scroll == 'intoView',
                    annotations: [dontShowAnnotation.of(false)],
                }
            } else {
                return {
                    changes: { from, to, insert: customTransaction.text },
                    selection: {
                        anchor: from + customTransaction.text.length,
                        head: from + customTransaction.text.length,
                    },
                    scrollIntoView: customTransaction.scroll == 'intoView',
                    annotations: [dontShowAnnotation.of(false)],
                }
            }
        case 'bar':
            return {
                effects: showBar.of(customTransaction.blob),
                // annotations: [Transaction.addToHistory.of(false)],
            }
        case 'generic':
            return {
                effects: reduxTransaction.of(customTransaction.genericBlob),
                annotations: [Transaction.addToHistory.of(false)],
            }

        // TODO - change this if necessary using new diff format
        // case 'fixLSPDiff':
        //     let lineChanges = customTransaction.changes

        //     // Get the line numbers state
        //     let lineNumbers = view.state.field(lineNumbersState)

        //     // Loop through the line changes and match up with the lines in the line numbers state
        //     // to get the ranges to output diffs for
        //     let ind = 2
        //     for (let lineChange of lineChanges) {
        //         let fromLine = lineChange.startLine
        //         let toLine = lineChange.endLine
        //         // get new line positions
        //         let fromPos = lineNumbers[fromLine - 1]
        //         let toPos = lineNumbers[toLine - 1]
        //         let origLine = view.state.doc.lineAt(fromPos).number
        //         let origEndLine = view.state.doc.lineAt(toPos).number

        //         const diffPayload = {
        //             origText: view.state.doc,
        //             diffId: `${ind}`,
        //             origLine,
        //             origEndLine,
        //             newText: Text.of(lineChange.newText.split('\n')),
        //         }
        //         setDiff(diffPayload, true)(view)
        //         ind += 1
        //     }
        //     return null

        default:
            throw new Error(
                `Unknown custom transaction type: ${customTransaction}`
            )
    }
}

export const customDispatchEffect = StateEffect.define<CustomTransaction>()

const runningaverage: number[] = []
export function customDispatch(view: EditorView, tr: Transaction) {
    const start = performance.now()
    // First we handle the original default transaction
    view.update([tr])

    // Handle custom transactions next
    try {
        const customDispatchEffects = tr.effects.filter((e) =>
            e.is(customDispatchEffect)
        )
        const newTransactions: TransactionSpec[] = []
        for (const effect of customDispatchEffects) {
            const customTransaction = effect.value
            const tr = getTransaction(view, customTransaction)
            if (tr != null) newTransactions.push(tr)
        }
        if (newTransactions.length != 0) {
            const transaction = view.state.update(...newTransactions)
            view.update([transaction])
        }
    } catch (e) {
        console.error(e)
    }
    // runningaverage.push(end-start);
    // if (runningaverage.length > 10) {
    //     runningaverage.shift();
    // }
    // const average = runningaverage.reduce((a, b) => a + b, 0) / runningaverage.length;

    const end = performance.now()
    const timeTaken = end - start

    if (timeTaken > 30) {
    }
}

const syncAnnotation = Annotation.define<boolean>()

export function syncDispatch(
    tr: Transaction,
    view: EditorView,
    ...others: EditorView[]
) {
    customDispatch(view, tr)
    if (!tr.changes.empty && !tr.annotation(syncAnnotation)) {
        const annotations: Annotation<any>[] = [syncAnnotation.of(true)]
        const userEvent = tr.annotation(Transaction.userEvent)
        if (userEvent) annotations.push(Transaction.userEvent.of(userEvent))
        for (const other of others) {
            other.dispatch({ changes: tr.changes, annotations })
        }
    }
}
