import {
    Command,
    Decoration,
    DecorationSet,
    EditorView,
    GutterMarker,
    KeyBinding,
    Panel,
    PanelConstructor,
    Tooltip,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
    getPanel,
    gutter,
    hoverTooltip,
    logException,
    showPanel,
    showTooltip,
} from '@codemirror/view'
import {
    EditorState,
    Extension,
    Facet,
    Range,
    RangeSet,
    StateEffect,
    StateField,
    Text,
    Transaction,
    TransactionSpec,
    combineConfig,
} from '@codemirror/state'
import elt from 'crelt'
import { customDispatchEffect } from '../../components/codemirrorHooks/dispatch'
// import { fixErrors } from '../fixLSP/fixLSPSlice'
import posthog from 'posthog-js'

/// Describes a problem or hint for a piece of code.
export interface Diagnostic {
    /// The start position of the relevant text.
    from: number
    /// The end position. May be equal to `from`, though actually
    /// covering text is preferable.
    to: number
    // Added by Aman to make things simpler
    line: number
    col: number
    /// The severity of the problem. This will influence how it is
    /// displayed.
    severity: 'info' | 'warning' | 'error' | 'aiwarning' | 'none'
    /// An optional source string indicating where the diagnostic is
    /// coming from. You can put the name of your linter here, if
    /// applicable.
    source?: string
    /// The message associated with this diagnostic.
    message: string
    /// An optional custom rendering function that displays the message
    /// as a DOM node.
    renderMessage?: () => Node
    /// An optional array of actions that can be taken on this
    /// diagnostic.
    actions?: readonly Action[]
}

/// An action associated with a diagnostic.
export interface Action {
    /// The label to show to the user. Should be relatively short.
    name: string
    /// The function to call when the user activates this action. Is
    /// given the diagnostic's _current_ position, which may have
    /// changed since the creation of the diagnostic, due to editing.

    // Change here to enable global use
    payload: ActionTransaction[]
    //apply: (view: EditorView, from: number, to: number) => void
}

type DiagnosticFilter = (diagnostics: readonly Diagnostic[]) => Diagnostic[]

interface LintConfig {
    /// Time to wait (in milliseconds) after a change before running
    /// the linter. Defaults to 750ms.
    delay?: number
    /// Optional filter to determine which diagnostics produce markers
    /// in the content.
    markerFilter?: null | DiagnosticFilter
    /// Filter applied to a set of diagnostics shown in a tooltip. No
    /// tooltip will appear if the empty set is returned.
    tooltipFilter?: null | DiagnosticFilter
}

interface LintGutterConfig {
    /// The delay before showing a tooltip when hovering over a lint gutter marker.
    hoverTime?: number
    /// Optional filter determining which diagnostics show a marker in
    /// the gutter.
    markerFilter?: null | DiagnosticFilter
    /// Optional filter for diagnostics displayed in a tooltip, which
    /// can also be used to prevent a tooltip appearing.
    tooltipFilter?: null | DiagnosticFilter
}

/// ALL OF BELOW IS CUSTOM CODE AMAN INSERTED
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
export function magicFix(editorView: EditorView) {
    return
}
export type ActionTransaction = ReplaceRange | ReplaceGivenRange | TriggerFixLSP

export interface ReplaceRange {
    type: 'replaceRange'
    text: string
}
export interface ReplaceGivenRange {
    type: 'replaceGivenRange'
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
}

export interface TriggerFixLSP {
    type: 'fixLSP'
}

export const replace = (replaceString: string): ActionTransaction => ({
    type: 'replaceRange',
    text: replaceString,
})

export const actionsToCustomTransaction =
    (action: ActionTransaction[]) =>
    (from: number, to: number): TransactionSpec => {
        const allEffects = action
            .map((action) => {
                switch (action.type) {
                    case 'replaceRange':
                        return customDispatchEffect.of({
                            type: 'insert',
                            text: action.text,
                            from,
                            to,
                        })
                    case 'replaceGivenRange':
                        return customDispatchEffect.of({
                            type: 'insert',
                            text: action.text,
                            from: action.from,
                            to: action.to,
                        })
                    case 'fixLSP':
                        return null
                    default:
                        throw new Error(`Unknown action type: ${action}`)
                }
            })
            .filter((effect) => effect !== null)
        return {
            // @ts-ignore
            effects: allEffects,
        }
    }

export function getDiagnostics(
    value: LintState,
    state: EditorState
): Diagnostic[] {
    const diagIter = value.diagnostics.iter()
    const diagnostics: Diagnostic[] = []
    while (diagIter.value != null) {
        const { from, to, value } = diagIter
        const line = state.doc.lineAt(from).number
        const col = from - state.doc.line(line).from

        const diagnostic = value.spec.diagnostic
        const newDiagnostic = {
            ...diagnostic,
            line,
            col,
            from,
            to,
        }

        diagnostics.push(newDiagnostic)
        diagIter.next()
    }
    return diagnostics
}

/// ABOVE IS CUSTOM CODE AMAN INSERTED
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
class SelectedDiagnostic {
    constructor(
        readonly from: number,
        readonly to: number,
        readonly diagnostic: Diagnostic
    ) {}
}

class LintState {
    constructor(
        readonly diagnostics: DecorationSet,
        readonly panel: PanelConstructor | null,
        readonly selected: SelectedDiagnostic | null
    ) {}

    static init(
        diagnostics: readonly Diagnostic[],
        panel: PanelConstructor | null,
        state: EditorState
    ) {
        // Filter the list of diagnostics for which to create markers
        let markedDiagnostics = diagnostics
        const diagnosticFilter = state.facet(lintConfig).markerFilter
        if (diagnosticFilter)
            markedDiagnostics = diagnosticFilter(markedDiagnostics)

        const ranges = Decoration.set(
            markedDiagnostics.map((d: Diagnostic) => {
                // For zero-length ranges or ranges covering only a line break, create a widget
                return d.from == d.to ||
                    (d.from == d.to - 1 &&
                        state.doc.lineAt(d.from).to == d.from)
                    ? Decoration.widget({
                          widget: new DiagnosticWidget(d),
                          diagnostic: d,
                      }).range(d.from)
                    : Decoration.mark({
                          attributes: {
                              class: 'cm-lintRange cm-lintRange-' + d.severity,
                          },
                          diagnostic: d,
                      }).range(d.from, d.to)
            }),
            true
        )
        return new LintState(ranges, panel, findDiagnostic(ranges))
    }
}

function findDiagnostic(
    diagnostics: DecorationSet,
    diagnostic: Diagnostic | null = null,
    after = 0
): SelectedDiagnostic | null {
    let found: SelectedDiagnostic | null = null
    diagnostics.between(after, 1e9, (from, to, { spec }) => {
        if (diagnostic && spec.diagnostic != diagnostic) return
        found = new SelectedDiagnostic(from, to, spec.diagnostic)
        return false
    })
    return found
}

function hideTooltip(tr: Transaction, tooltip: Tooltip) {
    return !!(
        tr.effects.some((e) => e.is(setDiagnosticsEffect)) ||
        tr.changes.touchesRange(tooltip.pos)
    )
}

function maybeEnableLint(
    state: EditorState,
    effects: readonly StateEffect<unknown>[]
) {
    return state.field(lintState, false)
        ? effects
        : effects.concat(
              StateEffect.appendConfig.of([
                  lintState,
                  EditorView.decorations.compute([lintState], (state) => {
                      const { selected, panel } = state.field(lintState)
                      return !selected || !panel || selected.from == selected.to
                          ? Decoration.none
                          : Decoration.set([
                                activeMark.range(selected.from, selected.to),
                            ])
                  }),
                  hoverTooltip(lintTooltip, { hideOn: hideTooltip }),
                  baseTheme,
              ])
          )
}

/// Returns a transaction spec which updates the current set of
/// diagnostics, and enables the lint extension if if wasn't already
/// active.
export function setDiagnostics(
    state: EditorState,
    diagnostics: readonly Diagnostic[]
): TransactionSpec {
    return {
        effects: maybeEnableLint(state, [setDiagnosticsEffect.of(diagnostics)]),
    }
}

/// The state effect that updates the set of active diagnostics. Can
/// be useful when writing an extension that needs to track these.
export const setDiagnosticsEffect = StateEffect.define<readonly Diagnostic[]>()

const togglePanel = StateEffect.define<boolean>()

const movePanelSelection = StateEffect.define<SelectedDiagnostic>()

export const diagnosticsField = StateField.define<Diagnostic[]>({
    create() {
        const out: Diagnostic[] = []
        return out
    },
    toJSON: (value, state) => {
        const lintStateField = state.field(lintState, false)
        if (!lintStateField) return []
        const diagnostics = getDiagnostics(lintStateField, state)
        return diagnostics
    },
    fromJSON: (value, state) => {
        return value
    },
    update(value, tr) {
        return value
    },
})

export const lintState = StateField.define<LintState>({
    create() {
        return new LintState(Decoration.none, null, null)
    },
    update(value, tr) {
        if (tr.docChanged) {
            const mapped = value.diagnostics.map(tr.changes)
            let selected: SelectedDiagnostic | null = null
            if (value.selected) {
                const selPos = tr.changes.mapPos(value.selected.from, 1)
                selected =
                    findDiagnostic(mapped, value.selected.diagnostic, selPos) ||
                    findDiagnostic(mapped, null, selPos)
            }
            value = new LintState(mapped, value.panel, selected)
        }

        for (const effect of tr.effects) {
            if (effect.is(setDiagnosticsEffect)) {
                value = LintState.init(effect.value, value.panel, tr.state)
            } else if (effect.is(togglePanel)) {
                value = new LintState(
                    value.diagnostics,
                    effect.value ? LintPanel.open : null,
                    value.selected
                )
            } else if (effect.is(movePanelSelection)) {
                value = new LintState(
                    value.diagnostics,
                    value.panel,
                    effect.value
                )
            }
        }

        return value
    },
    provide: (f) => [
        showPanel.from(f, (val) => val.panel),
        EditorView.decorations.from(f, (s) => s.diagnostics),
    ],
    // Convert to JSON so that it can be serialized
    toJSON: getDiagnostics,
    // Convert from JSON so that it can be deserialized
    fromJSON: (value: Diagnostic[], state: EditorState) => {
        // let origLintState = new LintState(Decoration.none, null, null)
        // return LintState.init(value, origLintState.panel, state);
        return new LintState(Decoration.none, null, null)
    },
})

/// Returns the number of active lint diagnostics in the given state.
export function diagnosticCount(state: EditorState) {
    const lint = state.field(lintState, false)
    return lint ? lint.diagnostics.size : 0
}

const activeMark = Decoration.mark({
    class: 'cm-lintRange cm-lintRange-active',
})

export const setActiveLint = StateEffect.define<{
    line: number
    message: string
} | null>()
export const activeLintField = StateField.define<{
    line: number
    message: string
} | null>({
    create() {
        return null
    },
    update(value, tr) {
        if (tr.docChanged) {
            return null
        }

        for (const effect of tr.effects) {
            if (effect.is(setActiveLint)) {
                return effect.value
            }
        }

        return value
    },
})

function lintTooltip(view: EditorView, pos: number, side: -1 | 1) {
    const { diagnostics } = view.state.field(lintState)

    let found: Diagnostic[] = [],
        stackStart = 2e8,
        stackEnd = 0

    diagnostics.between(
        pos - (side < 0 ? 1 : 0),
        pos + (side > 0 ? 1 : 0),
        (from, to, { spec }) => {
            if (
                pos >= from &&
                pos <= to &&
                (from == to ||
                    ((pos > from || side > 0) && (pos < to || side < 0)))
            ) {
                found.push(spec.diagnostic)
                stackStart = Math.min(from, stackStart)
                stackEnd = Math.max(to, stackEnd)
            }
        }
    )

    const diagnosticFilter = view.state.facet(lintConfig).tooltipFilter
    if (diagnosticFilter) found = diagnosticFilter(found)

    if (!found.length) return null

    return {
        pos: stackStart,
        end: stackEnd,
        // above: view.state.doc.lineAt(stackStart).to < stackEnd,
        above: true,
        create() {
            return { dom: diagnosticsTooltip(view, found) }
        },
    }
}

function diagnosticsTooltip(
    view: EditorView,
    diagnostics: readonly Diagnostic[]
) {
    // Check for severe diagnostics
    const severeDiagnostics = diagnostics.filter((d) => d.severity === 'error')
    const isSerious = severeDiagnostics.length > 0
    const button = elt(
        'div',
        { class: 'cm-AI-fix-container' },
        elt(
            'button',
            {
                class: 'cm-AI-fix',
                type: 'button',
                name: 'fix all',
                'aria-label': view.state.phrase('fix all'),
                onclick: () => {
                    // Trigger cmd+shift+enter key event

                    // Necessary to avoid circular dependencies
                    const event = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        shiftKey: true,
                        metaKey: true,
                    })
                    document.dispatchEvent(event)
                },
            },
            elt(
                'span',
                {
                    class: 'cm-AI-magic',
                },
                ''
            ),
            'Fix All',
            elt(
                'span',
                {
                    class: 'cm-AI-fix-key',
                },
                connector.PLATFORM_META_KEY + '⇧⏎'
            )
        )
    )
    const singularButton = elt(
        'div',
        { class: 'cm-AI-fix-container' },
        elt(
            'button',
            {
                class: 'cm-AI-sub-fix',
                type: 'button',
                name: 'fix this',
                'aria-label': view.state.phrase('fix this'),
                onclick: () => {
                    // Trigger cmd+shift+enter key event
                    if (isSerious) {
                        const diagnostic = severeDiagnostics[0]
                        view.dispatch({
                            effects: setActiveLint.of({
                                line: diagnostic.line + 1,
                                message: diagnostic.message,
                            }),
                        })
                        // Necessary to avoid circular dependencies
                        const event = new KeyboardEvent('keydown', {
                            key: 'e',
                            shiftKey: true,
                            metaKey: true,
                        })
                        // Dispatch cmd+shift+e
                        document.dispatchEvent(event)
                    }
                },
            },
            elt(
                'span',
                {
                    class: 'cm-AI-magic',
                },
                ''
            ),
            'Fix this',
            elt(
                'span',
                {
                    class: 'cm-AI-fix-key',
                },
                connector.PLATFORM_META_KEY + '⇧e'
            )
        )
    )
    return elt(
        'ul',
        { class: 'cm-tooltip-lint' },
        isSerious ? button : null,
        isSerious ? singularButton : null,
        diagnostics.map((d) => renderDiagnostic(view, d, false))
    )
}

/// Command to open and focus the lint panel.
export const openLintPanel: Command = (view: EditorView) => {
    const field = view.state.field(lintState, false)
    if (!field || !field.panel)
        view.dispatch({
            effects: maybeEnableLint(view.state, [togglePanel.of(true)]),
        })
    const panel = getPanel(view, LintPanel.open)
    if (panel)
        (panel.dom.querySelector('.cm-panel-lint ul') as HTMLElement).focus()
    return true
}

/// Command to close the lint panel, when open.
export const closeLintPanel: Command = (view: EditorView) => {
    const field = view.state.field(lintState, false)
    if (!field || !field.panel) return false
    view.dispatch({ effects: togglePanel.of(false) })
    return true
}

/// Move the selection to the next diagnostic.
export const nextDiagnostic: Command = (view: EditorView) => {
    const field = view.state.field(lintState, false)
    if (!field) return false
    let sel = view.state.selection.main,
        next = field.diagnostics.iter(sel.to + 1)
    if (!next.value) {
        next = field.diagnostics.iter(0)
        if (!next.value || (next.from == sel.from && next.to == sel.to))
            return false
    }
    view.dispatch({
        selection: { anchor: next.from, head: next.to },
        scrollIntoView: true,
    })
    return true
}

/// A set of default key bindings for the lint functionality.
///
/// - Ctrl-Shift-m (Cmd-Shift-m on macOS): [`openLintPanel`](#lint.openLintPanel)
/// - F8: [`nextDiagnostic`](#lint.nextDiagnostic)
export const lintKeymap: readonly KeyBinding[] = [
    { key: 'Mod-Shift-m', run: openLintPanel, preventDefault: true },
    { key: 'F8', run: nextDiagnostic },
]

/// The type of a function that produces diagnostics.
export type LintSource = (
    view: EditorView
) => readonly Diagnostic[] | Promise<readonly Diagnostic[]>

const lintPlugin = ViewPlugin.fromClass(
    class {
        lintTime: number
        timeout: NodeJS.Timeout | number = -1
        set = true

        constructor(readonly view: EditorView) {
            const { delay } = view.state.facet(lintConfig)
            this.lintTime = Date.now() + delay
            this.run = this.run.bind(this)
            this.timeout = setTimeout(this.run, delay)
        }

        run() {
            const now = Date.now()
            if (now < this.lintTime - 10) {
                setTimeout(this.run, this.lintTime - now)
            } else {
                this.set = false
                const { state } = this.view,
                    { sources } = state.facet(lintConfig)
                Promise.all(
                    sources.map((source) => Promise.resolve(source(this.view)))
                ).then(
                    (annotations) => {
                        const all = annotations.reduce((a, b) => a.concat(b))
                        if (this.view.state.doc == state.doc)
                            this.view.dispatch(
                                setDiagnostics(this.view.state, all)
                            )
                    },
                    (error) => {
                        logException(this.view.state, error)
                    }
                )
            }
        }

        update(update: ViewUpdate) {
            const config = update.state.facet(lintConfig)
            if (
                update.docChanged ||
                config != update.startState.facet(lintConfig)
            ) {
                this.lintTime = Date.now() + config.delay
                if (!this.set) {
                    this.set = true
                    this.timeout = setTimeout(this.run, config.delay)
                }
            }
        }

        force() {
            if (this.set) {
                this.lintTime = Date.now()
                this.run()
            }
        }

        destroy() {
            clearTimeout(this.timeout)
        }
    }
)

const lintConfig = Facet.define<
    { source: LintSource; config: LintConfig },
    Required<LintConfig> & { sources: readonly LintSource[] }
>({
    combine(input) {
        return {
            sources: input.map((i) => i.source),
            ...combineConfig(
                input.map((i) => i.config),
                {
                    delay: 750,
                    markerFilter: null,
                    tooltipFilter: null,
                }
            ),
        }
    },
    enables: lintPlugin,
})

/// Given a diagnostic source, this function returns an extension that
/// enables linting with that source. It will be called whenever the
/// editor is idle (after its content changed).
export function linter(source: LintSource, config: LintConfig = {}): Extension {
    return lintConfig.of({ source, config })
}

/// Forces any linters [configured](#lint.linter) to run when the
/// editor is idle to run right away.
export function forceLinting(view: EditorView) {
    const plugin = view.plugin(lintPlugin)
    if (plugin) plugin.force()
}

function assignKeys(actions: readonly Action[] | undefined) {
    const assigned: string[] = []
    if (actions)
        actions: for (const { name } of actions) {
            for (let i = 0; i < name.length; i++) {
                const ch = name[i]
                if (
                    /[a-zA-Z]/.test(ch) &&
                    !assigned.some((c) => c.toLowerCase() == ch.toLowerCase())
                ) {
                    assigned.push(ch)
                    continue actions
                }
            }
            assigned.push('')
        }
    return assigned
}

function renderDiagnostic(
    view: EditorView,
    diagnostic: Diagnostic,
    inPanel: boolean
) {
    const keys = inPanel ? assignKeys(diagnostic.actions) : []

    return elt(
        'li',
        { class: 'cm-diagnostic cm-diagnostic-' + diagnostic.severity },
        elt(
            'div',
            { class: 'cm-diagnostic-body' },
            // inPanel ? elt("div", {class: "cm-lint-marker cm-lint-marker-" + diagnostic.severity}) : null,
            elt(
                'span',
                { class: 'cm-diagnosticText' },
                diagnostic.renderMessage
                    ? diagnostic.renderMessage()
                    : diagnostic.message
            ),
            diagnostic.source &&
                elt(
                    'span',
                    { class: 'cm-diagnosticSource' },
                    diagnostic.source
                ),
            inPanel
                ? elt(
                      'span',
                      { class: 'cm-diagnosticSource' },
                      `[Ln ${diagnostic.line}, Col ${diagnostic.col}]`
                  )
                : null
        ),
        diagnostic.actions &&
            elt(
                'div',
                { class: 'cm-diagnostic-action' },
                diagnostic.actions?.map((action, i) => {
                    const click = (e: Event) => {
                        e.preventDefault()
                        const found = findDiagnostic(
                            view.state.field(lintState).diagnostics,
                            diagnostic
                        )
                        if (found) {
                            posthog.capture('Clicked Quick-Fix', {})
                            view.dispatch(
                                actionsToCustomTransaction(action.payload)(
                                    found.from,
                                    found.to
                                )
                            )
                        }
                        //action.apply(view, found.from, found.to)
                    }
                    const { name }: { name: string } = action
                    const keyIndex = keys[i] ? name.indexOf(keys[i]) : -1
                    const nameElt =
                        keyIndex < 0
                            ? name
                            : [
                                  name.slice(0, keyIndex),
                                  elt('u', name.slice(keyIndex, keyIndex + 1)),
                                  name.slice(keyIndex + 1),
                              ]
                    const btn = elt(
                        'button',
                        {
                            type: 'button',
                            class: 'cm-diagnosticAction',
                            onclick: click,
                            'aria-label': ` Action: ${name}${
                                keyIndex < 0 ? '' : ` (access key "${keys[i]})"`
                            }.`,
                        },
                        nameElt
                    )
                    if (i == 0) {
                        return btn
                    } else {
                        return [elt('br'), btn]
                    }
                })
            )
    )
}

class DiagnosticWidget extends WidgetType {
    constructor(readonly diagnostic: Diagnostic) {
        super()
    }

    eq(other: DiagnosticWidget) {
        return other.diagnostic == this.diagnostic
    }

    toDOM() {
        return elt('span', {
            class: 'cm-lintPoint cm-lintPoint-' + this.diagnostic.severity,
        })
    }
}

class PanelItem {
    id = 'item_' + Math.floor(Math.random() * 0xffffffff).toString(16)
    dom: HTMLElement

    constructor(view: EditorView, readonly diagnostic: Diagnostic) {
        this.dom = renderDiagnostic(view, diagnostic, true)
        this.dom.id = this.id
        this.dom.setAttribute('role', 'option')
    }
}

class LintPanel implements Panel {
    items: PanelItem[] = []
    dom: HTMLElement
    list: HTMLElement

    constructor(readonly view: EditorView) {
        const onkeydown = (event: KeyboardEvent) => {
            if (event.keyCode == 27) {
                // Escape
                closeLintPanel(this.view)
                this.view.focus()
            } else if (event.keyCode == 38 || event.keyCode == 33) {
                // ArrowUp, PageUp
                this.moveSelection(
                    (this.selectedIndex - 1 + this.items.length) %
                        this.items.length
                )
            } else if (event.keyCode == 40 || event.keyCode == 34) {
                // ArrowDown, PageDown
                this.moveSelection((this.selectedIndex + 1) % this.items.length)
            } else if (event.keyCode == 36) {
                // Home
                this.moveSelection(0)
            } else if (event.keyCode == 35) {
                // End
                this.moveSelection(this.items.length - 1)
            } else if (event.keyCode == 13) {
                // Enter
                this.view.focus()
            } else if (
                event.keyCode >= 65 &&
                event.keyCode <= 90 &&
                this.selectedIndex >= 0
            ) {
                // A-Z
                const { diagnostic } = this.items[this.selectedIndex],
                    keys = assignKeys(diagnostic.actions)
                for (let i = 0; i < keys.length; i++)
                    if (keys[i].toUpperCase().charCodeAt(0) == event.keyCode) {
                        const found = findDiagnostic(
                            this.view.state.field(lintState).diagnostics,
                            diagnostic
                        )
                        if (found)
                            view.dispatch(
                                actionsToCustomTransaction(
                                    diagnostic.actions![i].payload
                                )(found.from, found.to)
                            )
                        // if (found) view.dispatch(...diagnostic.actions![i].apply)//diagnostic.actions![i].apply(view, found.from, found.to)
                    }
            } else {
                return
            }
            event.preventDefault()
        }
        const onclick = (event: MouseEvent) => {
            for (let i = 0; i < this.items.length; i++) {
                if (this.items[i].dom.contains(event.target as HTMLElement))
                    this.moveSelection(i)
            }
        }
        const severeDiagnostics = getDiagnostics(
            view.state.field(lintState),
            view.state
        ).filter((d) => d.severity === 'error')
        const isSerious = severeDiagnostics.length > 0

        this.list = elt('ul', {
            tabIndex: 0,
            role: 'listbox',
            'aria-label': this.view.state.phrase('Diagnostics'),
            onkeydown,
            onclick,
        })
        this.dom = elt(
            'div',
            { class: 'cm-panel-lint' },
            elt(
                'div',
                { class: 'cm-panel-lint-header' },
                elt('span', { class: 'cm-panel-lint-title' }, 'Problems'),
                elt(
                    'div',
                    { class: 'cm-panel-buttons' },
                    isSerious
                        ? elt(
                              'button',
                              {
                                  class: 'cm-AI-fix',
                                  type: 'button',
                                  name: 'fix all',
                                  'aria-label': view.state.phrase('fix all'),
                                  onclick: () => {
                                      // Trigger cmd+shift+e key event

                                      // Necessary to avoid circular dependencies
                                      const event = new KeyboardEvent(
                                          'keydown',
                                          {
                                              key: 'E',
                                              code: 'KeyE',
                                              shiftKey: true,
                                              metaKey: true,
                                          }
                                      )
                                      document.dispatchEvent(event)
                                  },
                              },
                              elt(
                                  'span',
                                  {
                                      class: 'cm-AI-magic',
                                  },
                                  ''
                              ),
                              'Fix All',
                              elt(
                                  'span',
                                  {
                                      class: 'cm-AI-fix-key',
                                  },
                                  connector.PLATFORM_META_KEY + '⇧⏎'
                              )
                          )
                        : null,
                    elt(
                        'button',
                        {
                            type: 'button',
                            name: 'close',
                            'aria-label': this.view.state.phrase('close'),
                            onclick: () => closeLintPanel(this.view),
                        },
                        elt(
                            'span',
                            {
                                class: 'fa fa-times',
                            },
                            ''
                        )
                    )
                )
            ),
            this.list
        )
        this.update()
    }

    get selectedIndex() {
        const selected = this.view.state.field(lintState).selected
        if (!selected) return -1
        for (let i = 0; i < this.items.length; i++)
            if (this.items[i].diagnostic == selected.diagnostic) return i
        return -1
    }

    update() {
        const { diagnostics, selected } = this.view.state.field(lintState)
        let i = 0,
            needsSync = false,
            newSelectedItem: PanelItem | null = null
        diagnostics.between(
            0,
            this.view.state.doc.length,
            (_start, _end, { spec }) => {
                let found = -1,
                    item
                for (let j = i; j < this.items.length; j++)
                    if (this.items[j].diagnostic == spec.diagnostic) {
                        found = j
                        break
                    }
                if (found < 0) {
                    item = new PanelItem(this.view, spec.diagnostic)
                    this.items.splice(i, 0, item)
                    needsSync = true
                } else {
                    item = this.items[found]
                    if (found > i) {
                        this.items.splice(i, found - i)
                        needsSync = true
                    }
                }
                if (selected && item.diagnostic == selected.diagnostic) {
                    if (!item.dom.hasAttribute('aria-selected')) {
                        item.dom.setAttribute('aria-selected', 'true')
                        newSelectedItem = item
                    }
                } else if (item.dom.hasAttribute('aria-selected')) {
                    item.dom.removeAttribute('aria-selected')
                }
                i++
            }
        )
        while (
            i < this.items.length &&
            !(this.items.length == 1 && this.items[0].diagnostic.from < 0)
        ) {
            needsSync = true
            this.items.pop()
        }
        if (this.items.length == 0) {
            this.items.push(
                new PanelItem(this.view, {
                    from: -1,
                    to: -1,
                    line: -1,
                    col: -1,
                    severity: 'none',
                    message: this.view.state.phrase('No diagnostics'),
                })
            )
            needsSync = true
        }
        if (newSelectedItem) {
            this.list.setAttribute('aria-activedescendant', newSelectedItem!.id)
            this.view.requestMeasure({
                key: this,
                read: () => ({
                    sel: newSelectedItem!.dom.getBoundingClientRect(),
                    panel: this.list.getBoundingClientRect(),
                }),
                write: ({ sel, panel }) => {
                    if (sel.top < panel.top)
                        this.list.scrollTop -= panel.top - sel.top
                    else if (sel.bottom > panel.bottom)
                        this.list.scrollTop += sel.bottom - panel.bottom
                },
            })
        } else if (this.selectedIndex < 0) {
            this.list.removeAttribute('aria-activedescendant')
        }
        if (needsSync) this.sync()
    }

    sync() {
        let domPos: ChildNode | null = this.list.firstChild
        function rm() {
            const prev = domPos!
            domPos = prev.nextSibling
            prev.remove()
        }

        for (const item of this.items) {
            if (item.dom.parentNode == this.list) {
                while (domPos != item.dom) rm()
                domPos = item.dom.nextSibling
            } else {
                this.list.insertBefore(item.dom, domPos)
            }
        }
        while (domPos) rm()
    }

    moveSelection(selectedIndex: number) {
        if (this.selectedIndex < 0) return
        const field = this.view.state.field(lintState)
        const selection = findDiagnostic(
            field.diagnostics,
            this.items[selectedIndex].diagnostic
        )
        if (!selection) return
        this.view.dispatch({
            selection: { anchor: selection.from, head: selection.to },
            scrollIntoView: true,
            effects: movePanelSelection.of(selection),
        })
    }

    static open(view: EditorView) {
        return new LintPanel(view)
    }
}

function svg(content: string, attrs = `viewBox="0 0 40 40"`) {
    return `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${encodeURIComponent(
        content
    )}</svg>')`
}

function underline(color: string) {
    return svg(
        `<path d="m0 2.5 l2 -1.5 l1 0 l2 1.5 l1 0" stroke="${color}" fill="none" stroke-width=".7"/>`,
        `width="6" height="3"`
    )
}

const baseTheme = EditorView.baseTheme({
    '.cm-diagnostic': {
        padding: '3px 6px 3px 8px',
        marginLeft: '-1px',
        display: 'block',
        whiteSpace: 'pre-wrap',
    },
    '.cm-diagnostic-info': {},
    '.cm-diagnostic-error': {},
    '.cm-diagnostic-warning': {},
    // Make this a purple color, since it's not a standard severity level
    '.cm-diagnostic-aiwarning': {},

    '.cm-diagnosticAction': {
        font: 'inherit',
        border: 'none',
        padding: '2px 4px',
        backgroundColor: '#317d46',
        color: '#fff',
        borderRadius: '3px',
        marginLeft: '8px',
        cursor: 'pointer',
        margin: '4px 0px',
    },

    '.cm-diagnostic-body': {
        display: 'flex',
    },

    // All children of .cm-diagnostic-body should have right padding of 5px
    '.cm-diagnostic-body > *': {
        paddingRight: '10px',
    },

    '.cm-diagnosticSource': {
        // fontSize: "70%",
        opacity: 0.5,
    },

    '.cm-lintRange': {
        backgroundPosition: 'left bottom',
        backgroundRepeat: 'repeat-x',
        paddingBottom: '0.7px',
    },

    '.cm-lintRange-error': { backgroundImage: underline('#d11') },
    '.cm-lintRange-warning': { backgroundImage: underline('orange') },
    '.cm-lintRange-info': { opacity: 0.6 },
    '.cm-lintRange-aiwarning': { backgroundImage: underline('#a0a') },
    //".cm-lintRange-active": { backgroundColor: "#ffdd9980" },
    // RGB equivalent
    '.cm-lintRange-active': { backgroundColor: 'rgba(255, 221, 153, 0.2)' },

    '.cm-tooltip-lint': {
        padding: 0,
        margin: 0,
        marginBottom: '4px',
        borderRadius: '5px',
        backgroundColor: '#333',
    },

    '.cm-lintPoint': {
        position: 'relative',

        '&:after': {
            content: '""',
            position: 'absolute',
            bottom: 0,
            left: '-2px',
            borderLeft: '3px solid transparent',
            borderRight: '3px solid transparent',
            borderBottom: '4px solid #d11',
        },
    },

    '.cm-lintPoint-warning': {
        '&:after': { borderBottomColor: 'orange' },
    },
    '.cm-lintPoint-info': {
        '&:after': { borderBottomColor: '#999' },
    },
    '.cm-lintPoint-aiwarning': {
        '&:after': { borderBottomColor: '#a0a' },
    },

    // Look for descendents of .cm-panel with classname cm-diagnosticText
    '.cm-panel.cm-panel-lint .cm-diagnosticText': {
        // Make the text get cutoff with ellipsis
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    '.cm-panel-buttons': {
        display: 'flex',
        gap: '15px',
    },

    '.cm-panel-lint-header': {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderTop: '1px solid #333',
        color: '#ddd',
        padding: '12px 0px 4px 0px',

        // direction: "rtl",
        // height: "30px",
        // Align to the right
        // alignItems: "flex-end",
        // textAlign: "right",
    },
    '.cm-panel-lint-title': {
        font: 'inherit',
        fontSize: '16px',
        // fontWeight: "bold",
        paddingLeft: '12px',
        paddingTop: '0px',
        paddingBottom: '0px',
        textTransform: 'uppercase',
    },

    '.cm-panel.cm-panel-lint': {
        // position: "relative",
        // Add a border to the top of the panel that is a light gray color:
        // Make the background color of all children #303030;
        backgroundColor: '#1e1e1e',
        '& ul': {
            border: 'none',
            maxHeight: '300px',
            overflowY: 'auto',
            '&': {
                paddingBottom: '5px',
            },

            '& li': {
                color: '#ccc',
                paddingLeft: '20px',
            },
            '& li:hover': {
                cursor: 'pointer',
            },
            '& li:hover:not([aria-selected])': {
                // Make it a light gray background color
                backgroundColor: '#303030',
            },
            '& [aria-selected]': {
                backgroundColor: 'rgb(3, 57, 92)',
                '& u': { textDecoration: 'underline' },
            },
            // "&:focus [aria-selected]": {
            //   // background_fallback: "rgb(3, 57, 92)",
            //   // backgroundColor: "Highlight",
            //   // color_fallback: "rgb(3, 57, 92)",
            //   // color: "HighlightText"
            // },
            '& u': { textDecoration: 'none' },
            paddingBottom: '50px',
            margin: 0,
        },
        '& [name=close]': {
            // position: "relative",
            // align: "right",
            // float: "right";,
            // marginRight: "2px",
            // marginTop: "2px",
            // width: "30px",
            // height: "30px",
            border: 'none',
            font: 'inherit',
            fontSize: '24px',
            marginRight: '32px',
            // padding: 0,
            // margin: 0
        },
    },
})

const a = Transaction
class LintGutterMarker extends GutterMarker {
    severity: 'info' | 'warning' | 'error' | 'aiwarning' | 'none'
    constructor(readonly diagnostics: readonly Diagnostic[]) {
        super()
        this.severity = diagnostics.reduce((max, d) => {
            const s = d.severity
            return s == 'error' ||
                s == 'warning' ||
                (s == 'aiwarning' && max == 'info')
                ? s
                : max
        }, 'info' as 'info' | 'warning' | 'error' | 'aiwarning')
    }

    toDOM(view: EditorView) {
        const elt = document.createElement('div')
        elt.className = 'cm-lint-marker cm-lint-marker-' + this.severity

        let diagnostics = this.diagnostics
        const diagnosticsFilter =
            view.state.facet(lintGutterConfig).tooltipFilter
        if (diagnosticsFilter) diagnostics = diagnosticsFilter(diagnostics)

        if (diagnostics.length)
            elt.onmouseover = () =>
                gutterMarkerMouseOver(view, elt, diagnostics)

        return elt
    }
}

const enum Hover {
    Time = 300,
    Margin = 10,
}

function trackHoverOn(view: EditorView, marker: HTMLElement) {
    const mousemove = (event: MouseEvent) => {
        const rect = marker.getBoundingClientRect()
        if (
            event.clientX > rect.left - Hover.Margin &&
            event.clientX < rect.right + Hover.Margin &&
            event.clientY > rect.top - Hover.Margin &&
            event.clientY < rect.bottom + Hover.Margin
        )
            return
        for (
            let target = event.target as Node | null;
            target;
            target = target.parentNode
        ) {
            if (
                target.nodeType == 1 &&
                (target as HTMLElement).classList.contains('cm-tooltip-lint')
            )
                return
        }
        window.removeEventListener('mousemove', mousemove)
        if (view.state.field(lintGutterTooltip))
            view.dispatch({ effects: setLintGutterTooltip.of(null) })
    }
    window.addEventListener('mousemove', mousemove)
}

function gutterMarkerMouseOver(
    view: EditorView,
    marker: HTMLElement,
    diagnostics: readonly Diagnostic[]
) {
    function hovered() {
        const line = view.elementAtHeight(
            marker.getBoundingClientRect().top + 5 - view.documentTop
        )
        const linePos = view.coordsAtPos(line.from)
        if (linePos) {
            view.dispatch({
                effects: setLintGutterTooltip.of({
                    pos: line.from,
                    above: false,
                    create() {
                        return {
                            dom: diagnosticsTooltip(view, diagnostics),
                            getCoords: () => marker.getBoundingClientRect(),
                        }
                    },
                }),
            })
        }
        marker.onmouseout = marker.onmousemove = null
        trackHoverOn(view, marker)
    }

    const { hoverTime } = view.state.facet(lintGutterConfig)

    let hoverTimeout = setTimeout(hovered, hoverTime)
    marker.onmouseout = () => {
        clearTimeout(hoverTimeout)
        marker.onmouseout = marker.onmousemove = null
    }
    marker.onmousemove = () => {
        clearTimeout(hoverTimeout)
        hoverTimeout = setTimeout(hovered, hoverTime)
    }
}

function markersForDiagnostics(doc: Text, diagnostics: readonly Diagnostic[]) {
    const byLine: { [line: number]: Diagnostic[] } = Object.create(null)
    for (const diagnostic of diagnostics) {
        const line = doc.lineAt(diagnostic.from)
        ;(byLine[line.from] || (byLine[line.from] = [])).push(diagnostic)
    }
    const markers: Range<GutterMarker>[] = []
    for (const line in byLine) {
        markers.push(new LintGutterMarker(byLine[line]).range(+line))
    }
    return RangeSet.of(markers, true)
}

const lintGutterExtension = gutter({
    class: 'cm-gutter-lint',
    markers: (view) => view.state.field(lintGutterMarkers),
})

const lintGutterMarkers = StateField.define<RangeSet<GutterMarker>>({
    create() {
        return RangeSet.empty
    },
    update(markers, tr) {
        markers = markers.map(tr.changes)
        const diagnosticFilter = tr.state.facet(lintGutterConfig).markerFilter
        for (const effect of tr.effects) {
            if (effect.is(setDiagnosticsEffect)) {
                let diagnostics = effect.value
                //
                if (diagnosticFilter)
                    diagnostics = diagnosticFilter(diagnostics || [])
                markers = markersForDiagnostics(
                    tr.state.doc,
                    diagnostics.slice(0)
                )
            }
        }
        return markers
    },
})

const setLintGutterTooltip = StateEffect.define<Tooltip | null>()

const lintGutterTooltip = StateField.define<Tooltip | null>({
    create() {
        return null
    },
    update(tooltip, tr) {
        if (tooltip && tr.docChanged)
            tooltip = hideTooltip(tr, tooltip)
                ? null
                : { ...tooltip, pos: tr.changes.mapPos(tooltip.pos) }
        return tr.effects.reduce(
            (t, e) => (e.is(setLintGutterTooltip) ? e.value : t),
            tooltip
        )
    },
    provide: (field) => showTooltip.from(field),
})

const errorSvg = svg(
    `<path fill-rule="evenodd" clip-rule="evenodd" d="M8.59975 0.999985C10.1998 1.09999 11.6998 1.89999 12.7998 2.99999C14.0998 4.39999 14.7998 6.09999 14.7998 8.09999C14.7998 9.69999 14.1998 11.2 13.1998 12.5C12.1998 13.7 10.7998 14.6 9.19975 14.9C7.59975 15.2 5.99975 15 4.59975 14.2C3.19975 13.4 2.09975 12.2 1.49975 10.7C0.899753 9.19999 0.799753 7.49999 1.29975 5.99999C1.79975 4.39999 2.69975 3.09999 4.09975 2.19999C5.39975 1.29999 6.99975 0.899985 8.59975 0.999985ZM9.09975 13.9C10.3998 13.6 11.5998 12.9 12.4998 11.8C13.2998 10.7 13.7998 9.39999 13.6998 7.99999C13.6998 6.39999 13.0998 4.79999 11.9998 3.69999C10.9998 2.69999 9.79975 2.09999 8.39975 1.99999C7.09975 1.89999 5.69975 2.19999 4.59975 2.99999C3.49975 3.79999 2.69975 4.89999 2.29975 6.29999C1.89975 7.59999 1.89975 8.99999 2.49975 10.3C3.09975 11.6 3.99975 12.6 5.19975 13.3C6.39975 14 7.79975 14.2 9.09975 13.9ZM7.89974 7.5L10.2997 5L10.9997 5.7L8.59974 8.2L10.9997 10.7L10.2997 11.4L7.89974 8.9L5.49974 11.4L4.79974 10.7L7.19974 8.2L4.79974 5.7L5.49974 5L7.89974 7.5Z" fill="#F48771"/>`,
    `viewBox="0 0 16 16"`
)
const warningSvg = svg(
    `<path fill-rule="evenodd" clip-rule="evenodd" d="M7.55976 1H8.43976L14.9798 13.26L14.5398 14H1.43976L0.999756 13.26L7.55976 1ZM7.99976 2.28L2.27976 13H13.6998L7.99976 2.28ZM8.62476 12V11H7.37476V12H8.62476ZM7.37476 10V6H8.62476V10H7.37476Z" fill="#FFCC00"/>`,
    `viewBox="0 0 16 16"`
)
const aiWarningSvg = svg(
    `<path fill-rule="evenodd" clip-rule="evenodd" d="M7.55976 1H8.43976L14.9798 13.26L14.5398 14H1.43976L0.999756 13.26L7.55976 1ZM7.99976 2.28L2.27976 13H13.6998L7.99976 2.28ZM8.62476 12V11H7.37476V12H8.62476ZM7.37476 10V6H8.62476V10H7.37476Z" fill="#a0a"/>`,
    `viewBox="0 0 16 16"`
)

const lintGutterTheme = EditorView.baseTheme({
    '.cm-gutter-lint': {
        width: '1.4em',
        '& .cm-gutterElement': {
            padding: '.2em',
        },
    },
    '.cm-lint-marker': {
        width: '1em',
        height: '1em',
    },
    // ".cm-lint-marker-info": {
    // content: svg(`<path fill="#aaf" stroke="#77e" stroke-width="6" stroke-linejoin="round" d="M5 5L35 5L35 35L5 35Z"/>`)
    // },
    '.cm-lint-marker-warning': {
        content: warningSvg,
    },
    '.cm-lint-marker-error': {
        content: errorSvg,
    },
    '.cm-lint-marker-aiwarning': {
        content: aiWarningSvg,
    },
})

const lintGutterConfig = Facet.define<
    LintGutterConfig,
    Required<LintGutterConfig>
>({
    combine(configs) {
        return combineConfig(configs, {
            hoverTime: Hover.Time,
            markerFilter: null,
            tooltipFilter: null,
        })
    },
})

/// Returns an extension that installs a gutter showing markers for
/// each line that has diagnostics, which can be hovered over to see
/// the diagnostics.
export function lintGutter(config: LintGutterConfig = {}): Extension {
    return [
        lintGutterConfig.of(config),
        lintGutterMarkers,
        lintGutterExtension,
        lintGutterTheme,
        lintGutterTooltip,
    ]
}

/// Iterate over the marked diagnostics for the given editor state,
/// calling `f` for each of them. Note that, if the document changed
/// since the diagnostics were created, the `Diagnostic` object will
/// hold the original outdated position, whereas the `to` and `from`
/// arguments hold the diagnostic's current position.
export function forEachDiagnostic(
    state: EditorState,
    f: (d: Diagnostic, from: number, to: number) => void
) {
    const lState = state.field(lintState, false)
    if (lState && lState.diagnostics.size)
        for (
            let iter = RangeSet.iter([lState.diagnostics]);
            iter.value;
            iter.next()
        )
            f(iter.value.spec.diagnostic, iter.from, iter.to)
}
