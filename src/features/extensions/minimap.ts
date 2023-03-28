import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { getDiagnostics, lintState } from '../linter/lint'

function getDiagnosticsPositions(
    editorView: EditorView
): { from: number; to: number; severity: string }[] {
    const currentLintState = editorView.state.field(lintState, false)
    if (!currentLintState) {
        return []
    }
    const diagnostics = getDiagnostics(currentLintState, editorView.state)
    const numLines = editorView.state.doc.lines
    const origDiagnostics = diagnostics.map((d) => {
        const fromLine = editorView.state.doc.lineAt(d.from)
        const toLine = editorView.state.doc.lineAt(d.to)
        const from = fromLine.number / numLines
        const to = (toLine.number + 1) / numLines
        const roundedFrom = Math.round(from * 10000) / 10000
        const roundedTo = Math.round(to * 10000) / 10000
        return {
            from: roundedFrom,
            to: roundedTo,
            severity: d.severity,
        }
    })
    const diagSet = new Set(origDiagnostics)
    return Array.from(diagSet)
}
function renderBlocks(
    scrollbar: HTMLElement,
    diagnosticsPositions: { from: number; to: number; severity: string }[]
) {
    // Clear any existing blocks
    scrollbar.innerHTML = ''
    // Loop through the diagnostics positions
    for (const { from, to, severity } of diagnosticsPositions) {
        // Create a div for each block
        const block = document.createElement('div')

        const fromPx = from * scrollbar.clientHeight
        const toPx = to * scrollbar.clientHeight
        // Set its position and size to span from to to as a fraction of the view height
        block.style.position = 'absolute'
        block.style.left = '0'
        block.style.right = '0'
        block.style.top = `${fromPx}px`
        block.style.height = `${toPx - fromPx}px`
        // Set its background color based on the severity
        switch (severity) {
            case 'error':
                block.style.backgroundColor = 'red'
                break
            case 'warning':
                block.style.backgroundColor = 'yellow'
                break
            case 'info':
                block.style.backgroundColor = 'gray'
                break
            default:
                break
        }
        // Set its opacity to a low value so it doesn't obscure the scrollbar
        block.style.opacity = '0.5'
        // Append the block to the scrollbar
        scrollbar.appendChild(block)
    }
}

function createScrollbarElement(
    diagnosticsPositions: { from: number; to: number; severity: string }[]
) {
    // Create a div that will overlay the scrollbar
    const scrollbar = document.createElement('div')
    // Set its position and size to match the scrollbar
    scrollbar.style.height = '100%'
    scrollbar.style.position = 'absolute'
    scrollbar.style.right = '0'
    scrollbar.style.top = '0'
    scrollbar.style.bottom = '0'
    scrollbar.style.width = '10px' // Adjust this to match the scrollbar width
    // Set its pointer events to none so it doesn't interfere with scrolling
    scrollbar.style.pointerEvents = 'none'
    // Set its z-index to a high value so it appears above the scrollbar
    scrollbar.style.zIndex = '1000'
    // Set its background to transparent
    scrollbar.style.backgroundColor = 'transparent'

    // Create a function that renders the blocks on the scrollbar

    // Call the render function initially
    renderBlocks(scrollbar, diagnosticsPositions)

    // Return an object with the element and a function to update it
    return scrollbar
}

function compareArrays(arr1: any[], arr2: any[]) {
    if (arr1.length !== arr2.length) return false
    return JSON.stringify(arr1.sort()) === JSON.stringify(arr2.sort())
}

const CursorScrollbar = ViewPlugin.fromClass(
    class {
        private element: HTMLElement | null = null
        private margin = { right: 64 }
        private diagnosticsPositions: {
            from: number
            to: number
            severity: string
        }[] = []
        constructor(view: EditorView) {
            this.diagnosticsPositions = getDiagnosticsPositions(view)
            this.tryToInitElement(view)
        }
        tryToInitElement(view: EditorView) {
            if (view.dom.parentNode != null && this.element == null) {
                this.element = createScrollbarElement(this.diagnosticsPositions)
                view.dom.appendChild(this.element)
            }
        }
        update(update: ViewUpdate) {
            this.tryToInitElement(update.view)
            if (this.element) {
                const newDiags = getDiagnosticsPositions(update.view)
                if (!compareArrays(this.diagnosticsPositions, newDiags)) {
                    this.diagnosticsPositions = newDiags
                    renderBlocks(this.element, this.diagnosticsPositions)
                }
            }
        }
    }
)

export const scrollbarPlugin = []
// [
//     CursorScrollbar,
//     EditorView.scrollMargins.of((v) => ({ right: 80}))
// ]
