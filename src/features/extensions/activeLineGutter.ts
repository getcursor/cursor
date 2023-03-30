/* This file isn't currently being used */
import { EditorView, GutterMarker, gutter } from '@codemirror/view'
import { RangeSet } from '@codemirror/state'

// We arent doing this anymore
const activeLineMarker = new (class extends GutterMarker {
    toDOM() {
        const div = document.createElement('div')
        const btn = document.createElement('button')
        btn.addEventListener('click', () => {
            // do something
        })

        // add fontawsome icon
        const icon = document.createElement('i')
        icon.className = 'fas fa-plus'
        btn.appendChild(icon)
        // div.appendChild(btn);

        return btn
    }
})()

export const activeGutter = [
    gutter({
        class: 'cm-my-gutter',
        markers: (view) => {
            let markersRangeSet: RangeSet<GutterMarker> = RangeSet.empty
            const pos = view.state.selection.main.head
            const line = view.state.doc.lineAt(pos)
            const startOfLine = line.from
            if (view.state.selection.main.empty) {
                markersRangeSet = markersRangeSet.update({
                    add: [activeLineMarker.range(startOfLine)],
                })
            }
            return markersRangeSet
        },
        initialSpacer: () => activeLineMarker,
    }),
    EditorView.baseTheme({
        '.cm-my-gutter .cm-gutterElement': {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '& button': {
                color: '#fff',
                backgroundColor: '#438ad6',
                borderRadius: '5px',
                fontSize: '12px',
                padding: '1px 3px 1px 4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '16px',
            },
        },
    }),
]
