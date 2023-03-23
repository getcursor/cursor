import { ViewUpdate, ViewPlugin, DecorationSet, keymap } from '@codemirror/view'
import { EditorView, Decoration } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { WidgetType } from '@codemirror/view'
import { RangeSet, Range } from '@codemirror/state'
import { store } from '../../app/store'
import { Prec } from '@codemirror/state'

class LineText extends WidgetType {
    constructor(readonly checked: boolean) {
        super()
    }

    toDOM() {
        let wrap = document.createElement('span')
        wrap.setAttribute('aria-hidden', 'true')
        wrap.className = 'cm-newline-text'
        wrap.textContent = `Type ${connector.PLATFORM_META_KEY}K to generate.`
        return wrap
    }
}

function checkboxes(view: EditorView) {
    let widgets: Range<Decoration>[] = []

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
