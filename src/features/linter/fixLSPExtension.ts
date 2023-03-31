import { StateEffect, StateField, Text } from '@codemirror/state'

import { setDiff } from '../extensions/diff'
import { EditorView } from '@codemirror/view'
import { activeLintField, getDiagnostics, lintState } from './lint'
import { LineChange } from '../window/state'

// Define the resetLineNumbers effect
export const resetLineNumbersEffect = StateEffect.define<void>()
export const lineNumbersState = StateField.define<number[]>({
    create() {
        return []
    },

    update(value, tr) {
        // Update the positions of the start of lines when the document changes
        if (tr.docChanged) {
            const newLineStartPositions = []
            for (const lineStartPosition of value) {
                const newPos = tr.changes.mapPos(lineStartPosition, 1)
                newLineStartPositions.push(newPos)
            }
            value = newLineStartPositions
        }

        // Mark all the positions of the start of lines in the file when the resetLineNumbers effect is submitted
        for (const effect of tr.effects) {
            if (effect.is(resetLineNumbersEffect)) {
                const lineStartPositions = []
                for (let i = 0; i < tr.state.doc.lines; i++) {
                    lineStartPositions.push(tr.state.doc.line(i + 1).from)
                }
                value = lineStartPositions
            }
        }

        return value
    },
})

export function applyLineChangesToView(
    view: EditorView,
    lineChanges: LineChange[]
) {
    // TODO - change this in accordance with how diffID corresponds to a conversation id now!

    // Get the line numbers state
    const lineNumbers = view.state.field(lineNumbersState)

    let ind = 2
    for (const lineChange of lineChanges) {
        const fromLine = lineChange.startLine
        const toLine = lineChange.endLine

        // get new line positions
        const fromPos = lineNumbers[fromLine - 1]
        const toPos = lineNumbers[toLine - 1]

        const origLine = view.state.doc.lineAt(fromPos).number
        const origEndLine = view.state.doc.lineAt(toPos).number

        const diffPayload = {
            origText: view.state.doc,
            diffId: `${ind}`,
            origLine,
            origEndLine,
            newText: Text.of(lineChange.newText.split('\n')),
            isFinalDiff: true,
        }

        setDiff(diffPayload)(view)

        ind += 1
    }
}

export function getFixLSPBlobForServerWithSideEffects(
    view: EditorView,
    diagnosticLineNumber?: number
) {
    const diagnostics = getDiagnostics(view.state.field(lintState), view.state)
    const seriousDiagnostics = diagnostics.filter((d) => d.severity == 'error')

    if (seriousDiagnostics.length == 0) return null
    view.dispatch({
        effects: [resetLineNumbersEffect.of()],
    })

    let results = []
    for (const diagnostic of seriousDiagnostics) {
        const line = view.state.doc.lineAt(diagnostic.from).number
        const message = diagnostic.message
        results.push({ line, message })
    }

    if (diagnosticLineNumber) {
        results = results.filter((r) => r.line == diagnosticLineNumber)
    }

    const contents = view.state.doc.toString()

    return {
        contents,
        diagnostics: results,
    }
}

// function dispatchDiagnostics(
//     view: EditorView,
//     diagnostics: readonly Diagnostic[]
// ) {
//
//     const fileId = getCurrentFileId()
//     debounce(() => {
//
//         if (diagnostics.length == 0) return
//         view.dispatch({
//             effects: [resetLineNumbersEffect.of()],
//         })

//         const results = []
//         for (let diagnostic of diagnostics) {
//             let line = view.state.doc.lineAt(diagnostic.from).number
//             let message = diagnostic.message
//             results.push({ line, message })
//         }

//         const contents = view.state.doc.toString()

//         store.dispatch(
//             submitDiagnostics({
//                 fileId: fileId,
//                 blob: {
//                     contents,
//                     diagnostics: results,
//                 },
//             })
//         )
//     }, 1000)()
// }

// export const lintViewPlugin = ViewPlugin.fromClass(
//     class {
//         constructor(readonly view: EditorView) {}

//         update(update: ViewUpdate) {
//             // Check if the update has setDiagnosticsEffect
//             if (
//                 update.transactions.some((tr) =>
//                     tr.effects.some((e) => e.is(setDiagnosticsEffect))
//                 )
//             ) {
//                 // Get the diagnostics from the update
//                 let diagnostics = getDiagnostics(
//                     update.state.field(lintState),
//                     update.state
//                 )
//
//                 const seriousDiagnostics = diagnostics.filter(
//                     (d) => d.severity == 'error'
//                 )
//
//                 const fileId = getViewFileId(this.view)
//                 // dispatchDiagnostics(this.view, seriousDiagnostics)
//                 store.dispatch(
//                     markDoDiagnosticsExit({
//                         fileId: fileId,
//                         doDiagnosticsExist: seriousDiagnostics.length > 0,
//                     })
//                 )
//
//             }
//         }
//     }
// )

export const fixLintExtension = [
    lineNumbersState,
    // lintState,
    activeLintField,
    // lintViewPlugin,
    // Prec.highest(
    //     keymap.of([
    //         {
    //             key: connector.PLATFORM_CM_KEY + '-Shift-Enter',
    //             run: (view) => {
    //
    //                 store.dispatch(fixErrors({ tabId: getViewTabId(view) }))
    //                 return true
    //             },
    //         },
    //     ])
    // ),
]
