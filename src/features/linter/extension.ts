import { syntaxTree } from '@codemirror/language'
import { Diagnostic, getDiagnostics, lintState, linter, replace } from './lint'

// async function backendLint = async (source) => {
//   let diagnostics: Diagnostic[] = []
//   let text = view.state.doc.toString()
//   let response = await fetch("https://example.com/lint", {
//     method: "POST",
//     body: JSON.stringify({text})
//   })
//   let {errors} = await response.json()
//   for (let {from, to, message} of errors)
//     diagnostics.push({from, to, message})
//   return diagnostics
//

// export const regexpLinter = [];
export const regexpLinter = linter((view) => {
    const diagnostics: Diagnostic[] = []
    syntaxTree(view.state)
        .cursor()
        .iterate((node) => {
            if (node.name == 'RegExp') {
                const line = view.state.doc.lineAt(node.from).number
                const col = node.from - view.state.doc.line(line).from
                diagnostics.push({
                    from: node.from,
                    to: node.to,
                    // Temp changes added
                    line,
                    col,
                    // Finished temp changes
                    severity: 'aiwarning',
                    message: 'Cursor says Regular expressions are FORBIDDEN',
                    actions: [
                        {
                            name: 'Remove',
                            payload: [replace('')],
                        },
                    ],
                    source: 'Cursor AI',
                })
            }
        })
    let notAIDiagnostics: Diagnostic[]
    const lintField = view.state.field(lintState, false)
    if (!lintField) return diagnostics
    notAIDiagnostics = getDiagnostics(lintField, view.state).filter(
        (d) => d.severity != 'aiwarning'
    )
    return [...diagnostics, ...notAIDiagnostics]
})
