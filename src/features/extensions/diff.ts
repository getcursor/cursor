/*
This is a codemirror v6 implementation of inline diffs.

How do diffs work now?
We store diffs as a StateField that has a Codemirror Decoration.mark
This means that it is a sequence of ranges.

Then, this provides a DecorationSet of Decoration.Line's.

The reason for this complication is that we can allow codemirror's range changing
logic to work when we make edits to the diff and expand/close them. Though in hindsite
it seems like that feature is never used.
*/
import * as JSDiff from 'diff'
import {
    ChangeSpec,
    EditorState,
    Extension,
    Prec,
    Range,
    RangeSet,
    StateEffect,
    StateField,
    Text,
    Transaction,
} from '@codemirror/state'
import {
    Decoration,
    DecorationSet,
    EditorView,
    GutterMarker,
    Tooltip,
    ViewUpdate,
    WidgetType,
    gutterLineClass,
    keymap,
    showTooltip,
} from '@codemirror/view'
import { invertedEffects } from '@codemirror/commands'
import posthog from 'posthog-js'

// import { WidgetType } from '@codemirror/view'
import { store } from '../../app/store'
import * as cs from '../chat/chatSlice'
import * as csel from '../chat/chatSelectors'
import { setMaxOrigLine } from '../chat/chatSlice'

function chunkEqual(a: Diff.Change, b: Diff.Change) {
    return (
        !!a.added === !!b.added &&
        !!a.removed === !!b.removed &&
        a.value === b.value
    )
}
function partsEqual(a: Diff.Change[], b: Diff.Change[]) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!chunkEqual(a[i], b[i])) return false
    return true
}

// Function to add line numbers to the left of each line of text
function addLineNumbers(text: string): string {
    const lines = text.split('\n')
    const numberedLines = lines.map(
        (line, index) => `${(index + 1).toString().padStart(4, ' ')}: ${line}`
    )
    return numberedLines.join('\n')
}

function getDiffTooltip(
    oldTooltip: Tooltip | undefined,
    oldDiffValue: DiffState,
    diffValue: DiffState
): { loading: boolean; tooltip: Tooltip | undefined } {
    // Get the diff field
    if (!diffValue.diffId) {
        return { loading: false, tooltip: undefined }
    }

    const state = store.getState()
    const isLoading = !csel.getLastBotMessageFinished(state)

    // Then we check the diff state to make sure it makes sense to even update
    if (oldTooltip != undefined) {
        if (oldDiffValue.loading == isLoading) {
            return { loading: isLoading, tooltip: oldTooltip }
        }
    }

    // Get the topmost field. If none, just show at the top of the screen
    let { from, to, value } = diffValue.visibleDeco.iter()
    if (value == null) {
        from = 0
        to = 0
    }

    return {
        loading: isLoading,
        tooltip: {
            pos: from,
            above: true,
            strictSide: false,
            arrow: true,
            create: (view: EditorView) => {
                const state = store.getState()
                const isLoading = !csel.getLastBotMessageFinished(state)
                const hitTokenLimit = csel.getLastBotMessageHitTokenLimit(state)
                const interrupted = csel.getLastBotMessageInterrupted(state)

                let dom: HTMLElement
                if (isLoading) {
                    dom = loadingDom(view, diffValue.diffId!)
                } else {
                    if (view.state.field(diffField).visibleDeco.size > 0) {
                        dom = acceptRejectDom(
                            view,
                            diffValue.diffId!,
                            interrupted,
                            !!hitTokenLimit
                        )
                    } else {
                        dom = nothingDom()
                    }
                }

                const update = (update: ViewUpdate) => {
                    if (update.docChanged) {
                        const state = store.getState()
                        const isLoading = !csel.getLastBotMessageFinished(state)
                        const hitTokenLimit =
                            csel.getLastBotMessageHitTokenLimit(state)
                        const interrupted =
                            csel.getLastBotMessageInterrupted(state)

                        if (
                            update.state.field(diffField).loading != isLoading
                        ) {
                            if (isLoading) {
                                return loadingDom(
                                    update.view,
                                    diffValue.diffId!
                                )
                            } else {
                                if (
                                    update.state.field(diffField).visibleDeco
                                        .size > 0
                                ) {
                                    return acceptRejectDom(
                                        update.view,
                                        diffValue.diffId!,
                                        interrupted,
                                        !!hitTokenLimit
                                    )
                                } else {
                                    return nothingDom()
                                }
                            }
                        }
                    }
                }

                const getCoords = (pos: number) => {
                    const editor = view.dom as HTMLElement
                    const editorTop = editor.getBoundingClientRect().top + 50
                    const editorBottom =
                        editor.getBoundingClientRect().bottom - 300
                    const right = editor.getBoundingClientRect().right - 200

                    // const rangeTop = view.coordsAtPos(from)!.top
                    // const rangeBottom = view.coordsAtPos(from)!.top

                    const coords = view.coordsAtPos(pos)
                    let coordsTop
                    if (coords) {
                        coordsTop = coords.top
                    } else {
                        coordsTop = editorTop
                    }

                    const inEditorTop = Math.max(
                        editorTop,
                        Math.min(editorBottom, coordsTop)
                    )
                    // const inRangeTop = Math.max(
                    //     rangeTop,
                    //     Math.min(rangeBottom, inEditorTop)
                    // )
                    const top = inEditorTop

                    //const left = right - dom.offsetWidth
                    const left = 400
                    const bottom = top + dom.offsetHeight
                    return { top, left, right, bottom }
                }
                return {
                    dom,
                    getCoords,
                    update,
                }
            },
        },
    }
}

function chunkLocationToTooltip({
    diffId,
    startLine,
    endLine,
    editorState,
}: {
    diffId: string
    startLine: number
    endLine: number
    editorState: EditorState
}) {
    return {
        pos: editorState.doc.line(startLine).from,
        above: true,
        strictSide: false,
        arrow: false,
        create: (view: EditorView) => {
            const wrap = document.createElement('div')

            wrap.setAttribute('aria-hidden', 'true')
            wrap.className = 'cm-accept-reject-subdiff'

            const acceptDiv = document.createElement('div')
            acceptDiv.classList.add('cm-subdiff-accept', 'cm__sub_accept_div')
            const acceptSpan = document.createElement('div')
            acceptSpan.textContent = 'Accept'
            const acceptShortcutSpan = document.createElement('span')
            acceptShortcutSpan.innerHTML =
                `<span class="${
                    connector.IS_WINDOWS
                        ? 'windows-platform-shotcut-span-sm'
                        : 'not-windows-platform-shotcut-span-sm'
                }">${connector.PLATFORM_META_KEY}</span>` + 'y'
            acceptShortcutSpan.classList.add('shortcut-span-sm')
            acceptDiv.appendChild(acceptSpan)
            acceptDiv.appendChild(acceptShortcutSpan)

            acceptDiv.onclick = () => {
                acceptSubDiff(diffId, startLine, endLine)(view)
            }

            const rejectDiv = document.createElement('div')
            rejectDiv.classList.add('cm-subdiff-reject', 'cm__sub_reject_div')
            const rejectSpan = document.createElement('div')
            rejectSpan.textContent = 'Reject'
            const rejectShortcutSpan = document.createElement('span')
            rejectShortcutSpan.innerHTML =
                `<span class="${
                    connector.IS_WINDOWS
                        ? 'windows-platform-shotcut-span-sm'
                        : 'not-windows-platform-shotcut-span-sm'
                }">${connector.PLATFORM_META_KEY}</span>` + 'n'
            rejectShortcutSpan.classList.add('shortcut-span-sm')
            rejectDiv.appendChild(rejectSpan)
            rejectDiv.appendChild(rejectShortcutSpan)

            rejectDiv.onclick = () => {
                rejectSubDiff(diffId, startLine, endLine)(view)
            }

            wrap.appendChild(acceptDiv)
            wrap.appendChild(rejectDiv)

            const dom = wrap

            const getCoords = (pos: number) => {
                const editor = view.dom as HTMLElement
                const editorRight = editor.getBoundingClientRect().right - 20
                let top = view.coordsAtPos(pos, -1)?.bottom
                if (
                    top == null ||
                    top < editor.getBoundingClientRect().top + 20
                ) {
                    top = editor.getBoundingClientRect().top - 5000
                }

                const right = editorRight
                const left = right - dom.offsetWidth
                const bottom = top + dom.offsetHeight
                return { top, left, right, bottom }
            }

            return {
                dom,
                getCoords,
            }
        },
    }
}

function getSubDiffTooltips(
    diffValue: DiffState,
    editorState: EditorState
): {
    subDiffTooltips: Tooltip[]
    chunks: { startLine: number; endLine: number }[]
} {
    // Get the diff field
    if (!diffValue.diffId) {
        return { subDiffTooltips: [], chunks: [] }
    }

    const state = store.getState()
    const isLoading = !csel.getLastBotMessageFinished(state)

    // Then we check the diff state to make sure it makes sense to even update
    if (isLoading) {
        return { subDiffTooltips: [], chunks: [] }
    }

    const currentDeco = diffValue.visibleDeco.iter()
    let prevLine: number | null = null
    let firstLine: number | null = null

    const subdiffAcceptRejectLocations: {
        startLine: number
        endLine: number
    }[] = []

    while (currentDeco.value != null) {
        if (currentDeco.value.spec.type == null) {
            currentDeco.next()
            continue
        }

        const line = editorState.doc.lineAt(currentDeco.from).number
        if (prevLine === null || line - prevLine > 1) {
            if (firstLine !== null && prevLine !== null) {
                subdiffAcceptRejectLocations.push({
                    startLine: firstLine,
                    endLine: prevLine,
                })
            }
            firstLine = line
        }
        prevLine = line
        currentDeco.next()
    }

    if (firstLine !== null && prevLine !== null) {
        subdiffAcceptRejectLocations.push({
            startLine: firstLine,
            endLine: prevLine,
        })
    }

    return {
        chunks: subdiffAcceptRejectLocations,
        subDiffTooltips: subdiffAcceptRejectLocations.map(
            ({ startLine, endLine }) =>
                chunkLocationToTooltip({
                    diffId: diffValue.diffId!,
                    startLine,
                    endLine,
                    editorState,
                })
        ),
    }
}

class SubdiffAcceptRejectWidget extends WidgetType {
    constructor(
        private diffId: string,
        private startLine: number,
        private endLine: number
    ) {
        super()
    }
    toDOM(view: EditorView): HTMLElement {
        const element = document.createElement('span')
        const acceptChild = document.createElement('button')
        acceptChild.innerText = 'accept'

        const rejectChild = document.createElement('button')
        rejectChild.innerText = 'reject'

        acceptChild.onclick = () => {
            acceptSubDiff(this.diffId, this.startLine, this.endLine)(view)
        }

        rejectChild.onclick = () => {
            rejectSubDiff(this.diffId, this.startLine, this.endLine)(view)
        }

        element.appendChild(acceptChild)
        element.appendChild(rejectChild)
        return element
    }
}

interface DiffState {
    visibleDeco: DecorationSet
    tooltip?: Tooltip
    subDiffTooltips: Tooltip[]
    chunks: { startLine: number; endLine: number }[]
    loading: boolean
    // Diff metadata stuff
    parts: Diff.Change[]
    origLine: number
    diffId?: string // Except we have optional diffId
    currentLine?: number
}

// A state field that holds the diff information for each line
export const diffField = StateField.define<DiffState>({
    // I've let this become too bloated. It needs to be split apart into multiple different chunks
    create() {
        return {
            parts: [],
            subDiffTooltips: [],
            chunks: [],
            origLine: 0,
            loading: false,
            visibleDeco: Decoration.none,
        }
    },
    update(allDecos: DiffState, tr: Transaction) {
        // If the transaction has any addDiff effects, map them to decorations and update the decoration set
        // First modify the decoration set to stay on the same lines if the transaction is a line change
        let {
            parts,
            visibleDeco,
            diffId,
            origLine,
            currentLine,
            tooltip,
            subDiffTooltips,
            loading,
            chunks,
        } = allDecos

        let isChanged = false
        // First we check for if we have modified the diff
        if (
            tr.effects.some(
                (effect) =>
                    effect.is(modifiedDiffEffect) ||
                    effect.is(undoAcceptRejectDiffEffect) ||
                    effect.is(undoAcceptRejectSubDiffEffect)
            )
        ) {
            const lastEffect = tr.effects
                .filter(
                    (effect) =>
                        effect.is(modifiedDiffEffect) ||
                        effect.is(undoAcceptRejectDiffEffect) ||
                        effect.is(undoAcceptRejectSubDiffEffect)
                )
                .at(-1)!

            if (lastEffect.is(undoAcceptRejectDiffEffect)) {
                // In the case of undoing an accept/reject, we ensure that we mark as not rejected/interrupted
                store.dispatch(cs.undoRejectMessage(lastEffect.value.diffId))
            }

            const {
                parts: newParts,
                origLine: newOrigLine,
                diffId: newDiffId,
                currentLine: newCurrentLine,
            } = lastEffect.value as DiffMetadata
            isChanged = true

            if (
                parts.length == 0 ||
                diffId == undefined ||
                lastEffect.is(undoAcceptRejectSubDiffEffect)
            ) {
                parts = newParts
                origLine = newOrigLine
                diffId = newDiffId
                currentLine = newCurrentLine

                const newDecorations: Range<Decoration>[] = []

                // Set the current line
                if (currentLine != null) {
                    newDecorations.push(
                        Decoration.line({
                            class: 'cm-diff-current-line',
                            diffId: diffId,
                        }).range(tr.state.doc.line(currentLine).from)
                    )
                }

                let lineOffset = 0
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i]
                    const className = part.added
                        ? 'cm-diff-added'
                        : part.removed
                        ? 'cm-diff-removed'
                        : null
                    if (className) {
                        const from = tr.state.doc.line(
                            origLine + lineOffset
                        ).from
                        const to = from + part.value.length
                        // Iterate through the lines in the part
                        let offset = 0
                        const seenLines = new Set()
                        for (const line of tr.state.doc.iterRange(from, to)) {
                            const lineNumber = tr.state.doc.lineAt(
                                from + offset
                            )
                            if (seenLines.has(lineNumber)) continue

                            seenLines.add(lineNumber)
                            newDecorations.push(
                                Decoration.line({
                                    class: className,
                                    partIndex: i,
                                    type:
                                        className == 'cm-diff-added'
                                            ? 'added'
                                            : 'removed',
                                    diffId: diffId,
                                }).range(from + offset)
                            )

                            offset += line.length
                        }
                    }
                    lineOffset += part.count ?? 0
                }
                visibleDeco = Decoration.set(newDecorations, true)
            } else {
                // Determine which decorations to remove from visibleDeco and which ones to add/keep
                const toRemovePartIndices: number[] = []
                const toAdd: Range<Decoration>[] = []

                // Iterate through old and new parts until they differ
                let i = 0
                let newLineOffset = 0
                for (i = 0; i < Math.min(parts.length, newParts.length); i++) {
                    if (
                        !!parts[i].added != !!newParts[i].added ||
                        !!parts[i].removed != !!newParts[i].removed
                    ) {
                        break
                    } else if (parts[i].value != newParts[i].value) {
                        break
                    } else {
                        newLineOffset += parts[i].count ?? 0
                    }
                }
                // Now i gives the index of the first differing part
                // Remove decorations from the old parts starting from index i
                for (let j = i; j < parts.length; j++) {
                    toRemovePartIndices.push(j)
                }

                // Add all the line decorations starting from j to the end of newParts
                for (let j = i; j < newParts.length; j++) {
                    const part = newParts[j]
                    const className = part.added
                        ? 'cm-diff-added'
                        : part.removed
                        ? 'cm-diff-removed'
                        : null
                    if (className) {
                        const from = tr.state.doc.line(
                            origLine + newLineOffset
                        ).from
                        const to = from + part.value.length
                        // Iterate through the lines in the part
                        let offset = 0
                        const seenLines = new Set()
                        for (const line of tr.state.doc.iterRange(from, to)) {
                            const lineNumber = tr.state.doc.lineAt(
                                from + offset
                            )
                            if (seenLines.has(lineNumber)) continue

                            seenLines.add(lineNumber)
                            toAdd.push(
                                Decoration.line({
                                    class: className,
                                    partIndex: j,
                                    type:
                                        className == 'cm-diff-added'
                                            ? 'added'
                                            : 'removed',
                                    diffId: diffId,
                                }).range(from + offset)
                            )

                            offset += line.length
                        }
                    }
                    newLineOffset += part.count ?? 0
                }

                // Update the decoration set by removing and adding the necessary decorations
                visibleDeco = visibleDeco.update({
                    add: toAdd,
                    filter: (from, to, value) =>
                        !toRemovePartIndices.includes(value.spec.partIndex),
                })

                // Update the diff metadata
                parts = newParts
                origLine = newOrigLine
                diffId = newDiffId
                currentLine = newCurrentLine
            }
        } else {
            // First do the acceptRejectSubDiffEffects before mapping the changes
            for (const effect of tr.effects) {
                if (effect.is(acceptRejectSubDiffEffect)) {
                    // We remove the decorations on the relevant range
                    const { startLine, endLine } = effect.value

                    visibleDeco = visibleDeco.update({
                        filter: (from, to, value) => {
                            const line = tr.startState.doc.lineAt(from).number
                            return line < startLine || line > endLine
                        },
                    })
                    isChanged = true
                }
            }
            if (tr.docChanged && visibleDeco != Decoration.none) {
                isChanged = true
                visibleDeco = visibleDeco.map(tr.changes)
            }

            for (const effect of tr.effects) {
                if (effect.is(removeDiff)) {
                    isChanged = true
                    // Reset all values here
                    parts = []
                    visibleDeco = Decoration.none

                    diffId = undefined

                    origLine = 0
                    currentLine = 0
                    loading = false
                } else if (effect.is(acceptRejectDiffEffect)) {
                    // let { diffId } = effect.value
                    isChanged = true

                    parts = []
                    visibleDeco = Decoration.none
                    diffId = undefined
                    loading = false
                } else if (effect.is(acceptRejectSubDiffEffect)) {
                } else if (effect.is(updateCurrentLineEffect)) {
                    currentLine = effect.value
                    isChanged = true
                    loading = false
                    // filter out old line
                    if (currentLine) {
                        store.dispatch(setMaxOrigLine(currentLine))
                        visibleDeco = visibleDeco.update({
                            filter: (from, to, value) =>
                                value.spec.class != 'cm-diff-current-line',
                        })

                        // ad new deco
                        visibleDeco = visibleDeco.update({
                            add: [
                                Decoration.line({
                                    class: 'cm-diff-current-line',
                                    diffId: diffId,
                                }).range(tr.state.doc.line(currentLine).from),
                            ],
                        })
                    }
                }
            }
        }
        let newDiffValue = {
            parts,
            visibleDeco,
            diffId,
            origLine,
            currentLine,
            tooltip,
            subDiffTooltips,
            loading,
            chunks,
        }

        if (isChanged) {
            newDiffValue = {
                ...newDiffValue,
                ...getDiffTooltip(tooltip, allDecos, newDiffValue),
                ...getSubDiffTooltips(newDiffValue, tr.state),
            }
        }
        return newDiffValue
    },
    provide: (field: StateField<DiffState>) => {
        return [
            EditorView.decorations.from(field, (value) => {
                return value.visibleDeco
            }),
            showTooltip.computeN([field], (state) => {
                const tooltip = state.field(field).tooltip
                const subDiffTooltips = state.field(field).subDiffTooltips
                if (tooltip) {
                    return [tooltip, ...subDiffTooltips]
                } else {
                    return subDiffTooltips
                }
            }),
        ]
    },
})

function changeDiffFocus(view: EditorView, direction: 'up' | 'down') {
    const diff = view.state.field(diffField)
    if (diff.chunks.length == 0) return false
    // Get current line number
    const lineNumber = view.state.doc.lineAt(
        view.state.selection.main.head
    ).number
    // Iterate through diff.chunks to find the newChunkIndex and position

    let newChunkIndex

    if (direction === 'up') {
        for (let i = diff.chunks.length - 1; i >= 0; i--) {
            if (diff.chunks[i].startLine < lineNumber) {
                newChunkIndex = i
                break
            }
        }
        if (newChunkIndex == null) {
            newChunkIndex = diff.chunks.length - 1
        }
    } else if (direction === 'down') {
        for (let i = 0; i < diff.chunks.length; i++) {
            if (diff.chunks[i].startLine > lineNumber) {
                newChunkIndex = i
                break
            }
        }
        if (newChunkIndex == null) {
            newChunkIndex = 0
        }
    }

    const chunk = diff.chunks[newChunkIndex ?? 0]
    const fromPos = view.state.doc.line(chunk.startLine).from

    // Scroll to the new position
    view.dispatch({
        selection: { anchor: fromPos },
        scrollIntoView: true,
    })
    return true
}

function loadingDom(view: EditorView, diffId: string) {
    const wrap = document.createElement('div')
    wrap.setAttribute('aria-hidden', 'true')
    wrap.className = 'cm-diff-loading'
    wrap.setAttribute('data-diff-id', diffId)

    const cancelButton = document.createElement('div')
    cancelButton.classList.add('cm-diff-cancel')

    const cancelText = document.createElement('div')
    cancelText.textContent = 'Cancel'
    const cancelShortcutSpan = document.createElement('span')
    cancelShortcutSpan.innerHTML =
        `<span class="${
            connector.IS_WINDOWS
                ? 'windows-platform-shotcut-span'
                : 'not-windows-platform-shotcut-span'
        }">${connector.PLATFORM_META_KEY}</span>` + '⌫'
    cancelShortcutSpan.classList.add('shortcut-span')
    cancelButton.appendChild(cancelText)
    cancelButton.appendChild(cancelShortcutSpan)
    cancelButton.onclick = () => {
        store.dispatch(cs.interruptGeneration(diffId))
    }

    const loadingSpinner = document.createElement('div')
    loadingSpinner.classList.add('cm-diff-loading-spinner')
    const spinnerIcon = document.createElement('i')
    spinnerIcon.classList.add('fas', 'fa-spinner', 'fa-spin')
    loadingSpinner.appendChild(spinnerIcon)

    wrap.appendChild(loadingSpinner)
    wrap.appendChild(cancelButton)

    return wrap
}

function nothingDom() {
    const wrap = document.createElement('div')
    wrap.setAttribute('aria-hidden', 'true')
    wrap.className = 'cm-accept-reject'

    const nothingDiv = document.createElement('div')
    nothingDiv.classList.add('cm-diff-continue', 'cm__continue_div')
    const acceptSpan = document.createElement('div')
    acceptSpan.textContent = 'No changes proposed!'
    nothingDiv.appendChild(acceptSpan)
    wrap.appendChild(nothingDiv)
    return wrap
}

function acceptRejectDom(
    view: EditorView,
    diffId: string,
    interrupted: boolean,
    hitTokenLimit: boolean
) {
    const wrap = document.createElement('div')
    wrap.setAttribute('aria-hidden', 'true')
    wrap.className = 'cm-accept-reject'

    const acceptDiv = document.createElement('div')
    acceptDiv.classList.add('cm-diff-accept', 'cm__accept_div')
    const acceptSpan = document.createElement('div')
    acceptSpan.textContent = 'Accept All'
    const acceptShortcutSpan = document.createElement('span')
    acceptShortcutSpan.innerHTML =
        `<span class="${
            connector.IS_WINDOWS
                ? 'windows-platform-shotcut-span'
                : 'not-windows-platform-shotcut-span'
        }">${connector.PLATFORM_META_KEY}</span>` + '⏎'
    acceptShortcutSpan.classList.add('shortcut-span')
    acceptDiv.appendChild(acceptSpan)
    acceptDiv.appendChild(acceptShortcutSpan)

    acceptDiv.onclick = () => {
        acceptDiff(diffId)(view)
    }

    const rejectDiv = document.createElement('div')
    rejectDiv.classList.add('cm-diff-reject', 'cm__reject_div')
    const rejectSpan = document.createElement('div')
    rejectSpan.textContent = 'Reject All'
    const rejectShortcutSpan = document.createElement('span')
    rejectShortcutSpan.innerHTML =
        `<span class="${
            connector.IS_WINDOWS
                ? 'windows-platform-shotcut-span'
                : 'not-windows-platform-shotcut-span'
        }">${connector.PLATFORM_META_KEY}</span>` + '⌫'
    rejectShortcutSpan.classList.add('shortcut-span')
    rejectDiv.appendChild(rejectSpan)
    rejectDiv.appendChild(rejectShortcutSpan)

    rejectDiv.onclick = () => {
        rejectDiff(diffId)(view)
    }

    wrap.appendChild(acceptDiv)
    wrap.appendChild(rejectDiv)
    return wrap
}

type DiffType = 'added' | 'removed'
interface DiffMetadata {
    parts: Diff.Change[]
    origLine: number
    diffId: string
    currentLine?: number
    // origText: string,
    // endPos: number,
}

interface SubDiffMetadata extends DiffMetadata {
    startLine: number
    endLine: number
}

// A state effect that can be used to set the diff information for a given range
const modifiedDiffEffect = StateEffect.define<DiffMetadata>()

// // Undo analog
const removeDiff = StateEffect.define<DiffMetadata>()

// Just uses it to store for undo
const acceptRejectDiffEffect = StateEffect.define<DiffMetadata>()
const undoAcceptRejectDiffEffect = StateEffect.define<DiffMetadata>()

const acceptRejectSubDiffEffect = StateEffect.define<SubDiffMetadata>()
const undoAcceptRejectSubDiffEffect = StateEffect.define<SubDiffMetadata>()

const updateCurrentLineEffect = StateEffect.define<number | undefined>()

// A function that creates a decoration for a diff range
// We store the original type and the fromLine in order
// to be able to undo the effect

const diffAddColor = 'rgba(0, 255, 0, 0.2) !important'
const diffBrightAddColor = '#ccffd8'

const diffDeleteColor = 'rgba(255, 0, 0, 0.2) !important'
const diffBrightDeleteColor = '#ffcccc'
const diffTheme = EditorView.theme({
    '.cm-diff-added': {
        backgroundColor: diffAddColor,
    },
    '.cm-diff-removed': {
        backgroundColor: diffDeleteColor,
    },
    // For cm-diff-current-line, give a whiteish gray background that is somewhat transparent
    '.cm-diff-current-line': {
        backgroundColor: 'rgba(211, 211, 211, 0.5)',
    },
})

const diffAdded = new (class extends GutterMarker {
    elementClass = 'cm-diff-added'
})()
const diffRemoved = new (class extends GutterMarker {
    elementClass = 'cm-diff-removed'
})()
const diffCurrentLine = new (class extends GutterMarker {
    elementClass = 'cm-diff-current-line'
})()

const gutterDiffHighlighter = gutterLineClass.compute([diffField], (state) => {
    const marks = [],
        last = -1
    const diff = state.field(diffField)
    const diffIter = diff.visibleDeco.iter()
    while (diffIter.value) {
        // This gets just the added removed line decos
        if (diffIter.value.spec.widget != null) {
            diffIter.next()
            continue
        }
        if (diffIter.value.spec.class == 'cm-diff-added') {
            marks.push(diffAdded.range(diffIter.from))
        } else if (diffIter.value.spec.class == 'cm-diff-removed') {
            marks.push(diffRemoved.range(diffIter.from))
        } else if (diffIter.value.spec.class == 'cm-diff-current-line') {
            marks.push(diffCurrentLine.range(diffIter.from))
        } else {
            throw new Error(`Invalid diff type: ${diffIter.value.spec.type}`)
        }

        diffIter.next()
    }
    return RangeSet.of(marks)
})

/*
    * A plugin that adds a diff view to the editor
    Make the line 1-indexed
*/
export const setDiff =
    ({
        origLine,
        origEndLine,
        origText,
        newText,
        diffId,
        isInterrupted = false,
        isFinalDiff = false,
        isFinished = false,
        hitTokenLimit = false,
        setCurrentActiveLine = true,
    }: {
        origLine: number
        origEndLine: number
        origText: Text
        newText: Text
        diffId: string
        // Useful for when this diff is the final one to be accepted/rejected
        isFinalDiff?: boolean
        // Useful for when we should continue
        isInterrupted?: boolean
        // Useful for when we should treat this as being streamed
        isFinished?: boolean
        hitTokenLimit?: boolean
        setCurrentActiveLine?: boolean
    }) =>
    (view: EditorView) => {
        const bounded = (pos: number) => Math.min(pos, view.state.doc.length)

        if (newText.sliceString(0, 1) == '\n') {
            newText = newText.slice(1, newText.length)
        }
        if (
            isFinalDiff &&
            newText.sliceString(newText.length - 1, newText.length) == '\n'
        ) {
            newText = newText.slice(0, newText.length - 1)
        }

        if (isFinished) {
        }
        // Get only the relevant chunk
        const origTextString = origText.sliceString(
            origText.line(origLine).from,
            origText.line(origEndLine).to
        )

        let newTextString: string
        // let replacedLastNewLine = false;

        if (!isFinished || isInterrupted) {
            let newTextLines = newText.toJSON()
            // Replace the last
            newTextLines = newTextLines.slice(0, newTextLines.length - 1)
            if (newTextLines.length != 0) {
                newTextString = newTextLines.join('\n') + '\n'
                // replaceLastNewLine = true;
            } else {
                newTextString = ''
            }
        } else {
            newTextString = newText.toString()
        }

        // Now we can try using the new diff algo
        const chunks = JSDiff.diffLines(origTextString, newTextString, {
            ignoreWhitespace: false,
        })

        // Relevant pos is the last unchanged chunk
        let currentLine

        //

        if (!isFinished || isInterrupted) {
            if (chunks.length > 0) {
                let lineCounter = 0
                for (let i = 0; i < chunks.length; i++) {
                    lineCounter += chunks[i].count ?? 0 // Should probs be at least 1 here
                    if (!chunks[i].added && !chunks[i].removed) {
                        currentLine = origLine + (lineCounter - 1)
                    }
                }
                if (!setCurrentActiveLine && currentLine) {
                    // Otherwise get the last line of the second to last chunk
                    currentLine =
                        currentLine - (chunks[chunks.length - 1].count ?? 0) + 1
                }

                if (chunks[chunks.length - 1].removed) {
                    chunks[chunks.length - 1].removed = false
                    chunks[chunks.length - 1].added = false
                } else if (chunks.length >= 2) {
                    // Otherwise, is it of the form: removed a bunch then added 1 line
                    const secondLastChunk = chunks[chunks.length - 2]
                    const lastChunk = chunks[chunks.length - 1]
                    if (
                        secondLastChunk.removed &&
                        lastChunk.added &&
                        (!lastChunk.count || lastChunk.count <= 3)
                    ) {
                        // In this case, we will ignore the new addition, and turn the preceding chunks
                        // into a kept chunk
                        secondLastChunk.removed = false
                        chunks.pop()
                    } else if (secondLastChunk.removed && lastChunk.added) {
                        // Put the green before the red, and turn the red to a kept chunk
                        secondLastChunk.removed = false
                        chunks[chunks.length - 2] = lastChunk
                        chunks[chunks.length - 1] = secondLastChunk
                    }
                }
            }
        }

        // Merge contiguous chunks of the same type
        const mergedChunks = []
        for (let i = 0; i < chunks.length; i++) {
            const currentChunk = chunks[i]
            // Note that !! converts truthy/falsy val to boolean
            while (
                i + 1 < chunks.length &&
                !!currentChunk.added == !!chunks[i + 1].added &&
                !!currentChunk.removed === !!chunks[i + 1].removed
            ) {
                currentChunk.value += chunks[i + 1].value
                currentChunk.count =
                    (currentChunk.count ?? 0) + (chunks[i + 1].count ?? 0)
                i++
            }
            mergedChunks.push(currentChunk)
        }

        const parts = mergedChunks

        const useHistory = isFinished || isInterrupted

        // Convert the list of parts into chunks of contiguous parts of the same type
        const diff = view.state.field(diffField)
        if (diff.visibleDeco.size > 0) {
            //

            // Compute a diff between the current state and the new state
            // We also know that the old startLine will be the same as the current
            const { parts: oldParts } = diff

            const oldPartsText = oldParts
                .map((part) =>
                    part.value.endsWith('\n') ? part.value : part.value + '\n'
                )
                .join('')
            // Naively, we can replace all text covered by the old parts with the new parts

            const insertionText = parts
                .map((part) =>
                    part.value.endsWith('\n') ? part.value : part.value + '\n'
                )
                .join('')

            //
            if (setCurrentActiveLine) {
                view.dispatch({
                    effects: updateCurrentLineEffect.of(currentLine),
                })
            }

            if (!useHistory && oldPartsText == insertionText) {
                // If not the last one, we can afford to not do tats
                if (!partsEqual(oldParts, parts)) {
                    //
                    view.dispatch({
                        effects: modifiedDiffEffect.of({
                            diffId,
                            origLine,
                            parts,
                            currentLine,
                            // origText: origTextString, // Not really necessary here
                            // endPos
                        }),
                        annotations: Transaction.addToHistory.of(false),
                    })
                } else {
                    //
                }
                return
            }

            // *************************************************************
            // ***************** Update Text Section ***********************
            // *************************************************************

            // Ok, now we update only where necessary. Iterate through the parts simultaneously, and start where they differ
            // Iterate through oldParts and parts at the same time, find the first line number in the text that they differ
            let lineNumber = origLine
            let offset = origLine
            let startPartIndex = 0
            for (let i = 0; i < Math.min(oldParts.length, parts.length); i++) {
                if (
                    !!oldParts[i].added !== !!parts[i].added ||
                    !!oldParts[i].removed !== !!parts[i].removed
                ) {
                    lineNumber = offset
                    startPartIndex = offset - origLine
                    break
                } else if (oldParts[i].value !== parts[i].value) {
                    // Split the old and new part values into lines
                    const oldLines = oldParts[i].value.split('\n')
                    const newLines = parts[i].value.split('\n')

                    // Find the particular line number in this chunk where the two differ
                    let finishedHere = false
                    for (
                        let j = 0;
                        j < Math.min(oldLines.length, newLines.length);
                        j++
                    ) {
                        if (oldLines[j] !== newLines[j]) {
                            lineNumber = offset + j
                            startPartIndex = offset + j - origLine
                            finishedHere = true
                            break
                        }
                    }
                    if (!finishedHere) {
                        // Maybe the -1 helps?
                        lineNumber =
                            offset +
                            Math.min(oldLines.length, newLines.length) -
                            1
                        startPartIndex =
                            offset +
                            Math.min(oldLines.length, newLines.length) -
                            1 -
                            origLine
                    }
                    break
                }
                offset += oldParts[i].count ?? 0
            }

            let endLineNumber
            let endPartIndex

            // Now we look at the last chunk
            if (oldParts.length > 1 && parts.length > 1) {
                const lastOldChunk = oldParts[oldParts.length - 1]
                const lastNewChunk = parts[parts.length - 1]
                if (
                    !lastOldChunk.added &&
                    !lastOldChunk.removed &&
                    !lastNewChunk.added &&
                    !lastNewChunk.removed
                ) {
                    //
                    // In this case, look where they differ from reverse
                    // First get the start pos
                    let oldLineStart = 0,
                        newLineStart = 0
                    for (let i = 0; i < oldParts.length - 1; i++) {
                        oldLineStart += oldParts[i].count ?? 0
                    }
                    for (let i = 0; i < parts.length - 1; i++) {
                        newLineStart += parts[i].count ?? 0
                    }

                    const oldLines = lastOldChunk.value.split('\n')
                    const newLines = lastNewChunk.value.split('\n')
                    let i

                    let finishedHere = false
                    for (
                        i = 0;
                        i < Math.min(oldLines.length, newLines.length);
                        i++
                    ) {
                        const newLineIdx = newLines.length - 1 - i
                        const oldLineIdx = oldLines.length - 1 - i
                        //
                        //
                        //

                        if (oldLines[oldLineIdx] != newLines[newLineIdx]) {
                            // The line number is the current idx in the last blob + the idx of the last blob + orig line
                            endLineNumber = oldLineIdx + oldLineStart + origLine

                            // The line number is the current idx in the last blob + the idx of the last blob + orig line
                            endPartIndex = newLineStart + newLineIdx

                            finishedHere = true
                            break
                        }
                        // We reached the end
                    }
                    if (!finishedHere) {
                        const newLineIdx = newLines.length - 1 - (i - 1)
                        const oldLineIdx = oldLines.length - 1 - (i - 1)

                        endPartIndex = newLineStart + newLineIdx
                        endLineNumber = oldLineIdx + oldLineStart + origLine
                    }
                    //
                }
            }

            // Ok, now we know that the difference lies between lineNumber and endLineNumber
            const from = view.state.doc.line(lineNumber).from
            const to = bounded(
                endLineNumber
                    ? view.state.doc.line(endLineNumber).from
                    : view.state.doc.line(origLine).from + oldPartsText.length
            )

            let newInsertionText
            if (endPartIndex) {
                newInsertionText = insertionText
                    .split('\n')
                    .slice(startPartIndex, endPartIndex)
                    .join('\n')
                // if end part index doesn't go to the very end
                if (endPartIndex != newInsertionText.split('\n').length) {
                    newInsertionText += '\n'
                }
            } else {
                newInsertionText = insertionText
                    .split('\n')
                    .slice(startPartIndex)
                    .join('\n')
            }

            //
            //
            //
            //
            //
            //     'range',
            //     startPartIndex + 1,
            //     endPartIndex && endPartIndex + 1
            // )
            //
            //
            //
            //
            //
            //
            //
            //

            //

            // This should result in the proper streaming logic now, but wow that was annoying
            let change = {
                from,
                to,
                insert: newInsertionText,
            }
            const endPos = from + oldPartsText.length + insertionText.length

            // In the case of isFinished or isInterrupted, we must first set to orig Text, then dispatch the final change
            // to make history work
            if (useHistory) {
                // debugger
                let oldText = ''
                for (const part of parts) {
                    if (!part.added) {
                        oldText += part.value
                    }
                }
                const from = view.state.doc.line(origLine).from
                const to = bounded(from + oldPartsText.length)

                view.dispatch({
                    changes: {
                        from: view.state.doc.line(origLine).from,
                        to: bounded(
                            view.state.doc.line(origLine).from +
                                oldPartsText.length
                        ),
                        insert: oldText,
                    },
                    effects: removeDiff.of({
                        diffId,
                        origLine,
                        parts,
                        currentLine,
                    }),
                    annotations: Transaction.addToHistory.of(false),
                })

                // And we make the change re-insert properly
                change = {
                    from,
                    to: bounded(from + oldText.length),
                    insert: insertionText,
                }
            }

            // Send the modifiedDiffEffect as an effect with the new parts
            try {
                view.dispatch({
                    changes: change,
                    effects: modifiedDiffEffect.of({
                        diffId,
                        origLine,
                        parts,
                        currentLine,
                        // origText: origTextString, // Not really necessary here
                        // endPos
                    }),
                    annotations: Transaction.addToHistory.of(useHistory),
                })
            } catch (e) {
                console.error(e)
            }
            if (useHistory) {
                // debugger
            }
        } else {
            // We first add all of the green chunks
            const changes: { from: number; to: number; insert: string }[] = []

            // Iterate through parts and create changes for added text
            const lineNumber = origLine
            let greenLines = 0
            let lineOffset = 0

            // Keeps track of the end for an edit
            let endPos = view.state.doc.line(origEndLine).to

            parts.forEach((part) => {
                if (part.added) {
                    const insertLineNumber =
                        lineNumber + (lineOffset - greenLines)
                    changes.push({
                        from: view.state.doc.line(insertLineNumber).from,
                        to: view.state.doc.line(insertLineNumber).from,
                        // TODO - this may introduce a bug when the green parts look like \n\n or something
                        // For now I think this is fine, because it only happens when on the final diff
                        insert: part.value.endsWith('\n')
                            ? part.value
                            : part.value + '\n',
                    })

                    greenLines += part.count ?? 0

                    endPos += part.value.length + 1
                    // On any insertion, we increase where the end lies
                }
                lineOffset += part.count ?? 0
            })

            // Then we need to dispatch an effect with the decoration changes:
            view.dispatch({
                changes,
                effects: modifiedDiffEffect.of({
                    diffId,
                    origLine,
                    parts,
                    currentLine: currentLine ?? origLine,
                    // origText: origTextString,
                    // endPos
                }),
                annotations: Transaction.addToHistory.of(useHistory),
            })
        }
    }

const maybeAcceptRejectSubDiff =
    ({ typeRemoved }: { typeRemoved: DiffType }) =>
    (view: EditorView) => {
        const diff = view.state.field(diffField)
        if (!diff.diffId || diff.chunks.length == 0) {
            return false
        }

        const currentLineNumber = view.state.doc.lineAt(
            view.state.selection.main.head
        ).number
        // Iterate through diff.chunks to check if currentLineNumber is within any range
        for (const chunk of diff.chunks) {
            const startLine = chunk.startLine
            const endLine = chunk.endLine

            // If currentLineNumber is within the range, call acceptRejectSubDiff for that chunk
            if (
                currentLineNumber >= startLine &&
                currentLineNumber <= endLine
            ) {
                acceptRejectSubDiff({ typeRemoved })(
                    diff.diffId,
                    startLine,
                    endLine
                )(view)
                return true
            }
        }
        return false
    }

const acceptRejectSubDiff =
    ({ typeRemoved }: { typeRemoved: DiffType }) =>
    (diffId: string, startLine: number, endLine: number, addToHistory = true) =>
    (view: EditorView) => {
        if (typeRemoved == 'removed') {
            posthog.capture('Accepted Diff')
        }

        const diff = view.state.field(diffField)
        if (!diff.diffId) {
            return
        }

        const lineDeco = diff.visibleDeco.update({
            filter: (from, to, value) => value.spec.type != null,
        })
        const lineIter = lineDeco.iter()
        const changes: ChangeSpec[] = []

        let uncountedLines = 0

        // Then we apply the stored diff to the selection and save this in history if appropriate
        while (lineIter.value != null) {
            if (
                lineIter.value.spec.diffId === diffId &&
                lineIter.value.spec.type != null
            ) {
                if (
                    view.state.doc.lineAt(lineIter.from).number >= startLine &&
                    view.state.doc.lineAt(lineIter.to).number <= endLine
                ) {
                    if (lineIter.value.spec.type === typeRemoved) {
                        changes.push({
                            from: lineIter.from,
                            // Now get the end of the line
                            to: Math.min(
                                view.state.doc.lineAt(lineIter.from).to + 1,
                                view.state.doc.length
                            ),
                            insert: '',
                        })
                    }
                } else {
                    uncountedLines += 1
                }
            }
            lineIter.next()
        }
        if (uncountedLines == 0) {
            acceptRejectDiff({ typeRemoved })(diffId, addToHistory)(view)
        } else {
            view.dispatch({
                changes,
                effects: acceptRejectSubDiffEffect.of({
                    ...diff,
                    startLine,
                    endLine,
                } as SubDiffMetadata),
                annotations: Transaction.addToHistory.of(addToHistory),
            })
        }
    }

const acceptRejectDiff =
    ({ typeRemoved }: { typeRemoved: DiffType }) =>
    (diffId: string, addToHistory = true) =>
    (view: EditorView) => {
        //
        if (typeRemoved == 'removed') {
            posthog.capture('Accepted Diff')
        }
        const diff = view.state.field(diffField)
        if (!diff.diffId) {
            return
        }

        const lineDeco = diff.visibleDeco.update({
            filter: (from, to, value) => value.spec.type != null,
        })
        const lineIter = lineDeco.iter()
        const changes: ChangeSpec[] = []
        const notRemovedDiffs: Range<Decoration>[] = []

        // Then we apply the stored diff to the selection and save this in history if appropriate
        while (lineIter.value != null) {
            if (lineIter.value.spec.diffId === diffId) {
                const currentRange = lineIter.value.range(lineIter.from)
                notRemovedDiffs.push(currentRange)
                if (lineIter.value.spec.type === typeRemoved) {
                    changes.push({
                        from: lineIter.from,
                        // Now get the end of the line
                        to: Math.min(
                            view.state.doc.lineAt(lineIter.from).to + 1,
                            view.state.doc.length
                        ),
                        insert: '',
                    })
                }
            }
            lineIter.next()
        }

        view.dispatch({
            changes,
            effects: acceptRejectDiffEffect.of(diff as DiffMetadata),
            annotations: Transaction.addToHistory.of(addToHistory),
        })
    }

export const acceptDiff = acceptRejectDiff({ typeRemoved: 'removed' })
export const rejectDiff = acceptRejectDiff({ typeRemoved: 'added' })

export const acceptSubDiff = acceptRejectSubDiff({ typeRemoved: 'removed' })
export const rejectSubDiff = acceptRejectSubDiff({ typeRemoved: 'added' })

/*
 * This saves the diff effects to the undo/redo stack
 * It also saves the diff effects when a piece of code
 * is deleted that also deletes a part of a diff
 */
const invertDiff = invertedEffects.of((tr) => {
    // Goal here is to undo the decorations effects of diffs I am adding comments because this is very dense
    const found = []
    if (tr.annotation(Transaction.addToHistory)) {
        for (const e of tr.effects) {
            // If we have just added a diff decoration, undoing it is removing it
            if (e.is(modifiedDiffEffect)) {
                found.push(removeDiff.of(e.value))
            }
            // If we have just removed a diff decoration, undoing it is adding it
            else if (e.is(removeDiff)) {
                found.push(modifiedDiffEffect.of(e.value))
            }
            // We have a custom effect for accepting or rejecting diffs
            // What we do is store the lines of the diff where the decorations
            // are removed, but the text still exists.
            // So if we accept a diff, then we store all green lines. If we reject
            // a diff, we store all red lines
            else if (e.is(acceptRejectDiffEffect))
                found.push(undoAcceptRejectDiffEffect.of(e.value))
            else if (e.is(undoAcceptRejectDiffEffect))
                found.push(acceptRejectDiffEffect.of(e.value))
            // Subdiff stuff
            else if (e.is(acceptRejectSubDiffEffect))
                found.push(undoAcceptRejectSubDiffEffect.of(e.value))
            else if (e.is(undoAcceptRejectSubDiffEffect))
                found.push(acceptRejectSubDiffEffect.of(e.value))
        }
        const ranges = tr.startState.field(diffField).visibleDeco.update({
            filter: (_, __, value) => value.spec.type != null,
        })
    } else {
        for (const e of tr.effects) {
            if (e.is(removeDiff)) {
                found.push(modifiedDiffEffect.of(e.value))
            }
        }
    }
    return found
})
// An extension that enables the diff feature
export const diffExtension = [
    diffField,
    gutterDiffHighlighter,
    diffTheme,
    invertDiff,
    Prec.highest(keymap.of([])),
    Prec.highest(
        keymap.of([
            {
                // Enter
                key: connector.PLATFORM_CM_KEY + '-Enter',
                run: (view) => {
                    const state = view.state
                    // is active diff
                    const diff = state.field(diffField)
                    if (diff.diffId) {
                        //accept diff
                        acceptDiff(diff.diffId)(view)
                        return true
                    }
                    return false
                },
            },
            {
                // backspacende
                key: connector.PLATFORM_CM_KEY + '-Backspace',
                run: (view) => {
                    const state = view.state
                    const diff = state.field(diffField)
                    if (diff.diffId) {
                        const diffId = diff.diffId
                        // is active diff
                        const lastMessage = csel.getLastBotMessageById(diffId)(
                            store.getState()
                        )
                        if (lastMessage) {
                            const isFinished = lastMessage.finished
                            const isChatOpen = csel.isChatOpen(store.getState())
                            if (isFinished) {
                                // In the case where done loading, we reject the message
                                // store.dispatch(cs.interruptGeneration(diffId))
                                rejectDiff(diffId)(view)
                                store.dispatch(cs.rejectMessage(diffId))
                                store.dispatch(cs.setChatOpen(false))
                                // Aman: I think this was the source of a big bug. Need to stop keypress from going through!
                                return true
                            } else if (!isFinished || isChatOpen) {
                                store.dispatch(cs.interruptGeneration(diffId))
                                // store.dispatch(cs.setChatOpen(false))
                                return true
                            }
                        }
                    } else {
                        // Otherwise interrupt the current message
                        const lastMessage = csel.getLastBotMessage(
                            store.getState()
                        )
                        if (lastMessage) {
                            const isFinished = lastMessage.finished
                            if (!isFinished) {
                                store.dispatch(cs.interruptGeneration(null))
                                return true
                            }
                        }
                    }
                    return false
                },
            },

            {
                // k
                key: connector.PLATFORM_CM_KEY + '-k',
                run: (view) => {
                    const state = view.state
                    // is active diff
                    const diff = state.field(diffField)
                    if (diff.diffId) {
                        const reduxState = store.getState()
                        const diffId = diff.diffId
                        //accept diff
                        const lastBotMessage =
                            csel.getLastBotMessageById(diffId)(reduxState)
                        if (lastBotMessage) {
                            const isInterrupted = lastBotMessage.interrupted
                            const isFinished = lastBotMessage.finished
                            if (isInterrupted && isFinished) {
                                // We just dont do anything and return true
                                // store.dispatch(cs.continueGeneration(diffId))
                                return true
                            }
                        }
                    }
                    return false
                },
            },
            {
                key: connector.PLATFORM_CM_KEY + '-1',
                run: (view) => {
                    return changeDiffFocus(view, 'up')
                },
            },
            {
                key: connector.PLATFORM_CM_KEY + '-2',
                run: (view) => {
                    return changeDiffFocus(view, 'down')
                },
            },
            {
                // cmd-y
                key: connector.PLATFORM_CM_KEY + '-y',
                run: (view) => {
                    return maybeAcceptRejectSubDiff({ typeRemoved: 'removed' })(
                        view
                    )
                },
            },
            {
                // cmd-n
                key: connector.PLATFORM_CM_KEY + '-n',
                run: (view) => {
                    return maybeAcceptRejectSubDiff({ typeRemoved: 'added' })(
                        view
                    )
                },
            },
        ])
    ),
] as Extension
