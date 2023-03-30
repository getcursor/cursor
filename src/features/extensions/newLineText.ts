import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
} from '@codemirror/view'
import { Range } from '@codemirror/state'

class LineText extends WidgetType {
    constructor(readonly checked: boolean) {
        super()
    }

    toDOM() {
        const wrap = document.createElement('span')
        wrap.setAttribute('aria-hidden', 'true')
        wrap.className = 'cm-newline-text'
        wrap.textContent = `Type ${connector.PLATFORM_META_KEY}K to generate.`
        return wrap
    }
}

function checkboxes(view: EditorView) {
    const widgets: Range<Decoration>[] = []

    const pos = view.state.selection.main.head
    const line = view.state.doc.lineAt(pos)
    const emptySelection = view.state.selection.main.empty
    const emtpyLine = line.text.trim().length == 0
    if (emptySelection && emtpyLine) {
        widgets.push(
            Decoration.widget({ widget: new LineText(true), side: 1 }).range(
                pos
            )
        )
    }

    return Decoration.set(widgets)
}

export const newLineText = [
    ViewPlugin.fromClass(
        class {
            decorations: DecorationSet

            constructor(view: EditorView) {
                this.decorations = checkboxes(view)
            }

            update(update: ViewUpdate) {
                if (
                    update.docChanged ||
                    update.viewportChanged ||
                    update.selectionSet
                )
                    this.decorations = checkboxes(update.view)
            }
        },
        {
            decorations: (v) => v.decorations,
        }
    ),
    EditorView.baseTheme({
        '.cm-newline-text': {
            color: 'rgba(118, 164, 214, 0.5)',
        },
    }),
]
