import { EditorView, Tooltip, showTooltip } from '@codemirror/view'
import { EditorState, StateField } from '@codemirror/state'
import { store } from '../../app/store'
import { pressAICommand } from '../chat/chatThunks'

const cursorTooltipField = StateField.define<readonly Tooltip[]>({
    create: getCursorTooltips,

    update(tooltips, tr) {
        // if the viewport changed, update the tooltips
        if (!tr.docChanged && !tr.selection) return tooltips
        // I think this is REALLY inefficient
        return getCursorTooltips(tr.state)
    },

    provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
})

function getCursorTooltips(state: EditorState): readonly Tooltip[] {
    return state.selection.ranges
        .filter((range) => !range.empty)
        .map((range) => {
            return {
                pos: range.from,
                above: true,
                strictSide: false,
                arrow: true,
                create: (view: EditorView) => {
                    const dom = document.createElement('div')
                    dom.className = 'cm-tooltip-cursor'
                    function btn(
                        titleText: string,
                        cmdText: string,
                        callback: any
                    ) {
                        // create one edit button and one chat button
                        const editButton = document.createElement('button')
                        // two spans
                        const editSpan = document.createElement('span')
                        editSpan.className = 'title-text'
                        const cmdKspan = document.createElement('span')
                        cmdKspan.className = 'cmd-text'
                        // add the text to the spans
                        editSpan.textContent = titleText
                        cmdKspan.textContent = cmdText
                        // add the spans to the button
                        editButton.appendChild(editSpan)
                        editButton.appendChild(cmdKspan)
                        editButton.addEventListener('click', callback)
                        return editButton
                    }

                    dom.appendChild(
                        btn('Edit', connector.PLATFORM_META_KEY + 'K', () => {
                            store.dispatch(pressAICommand('k'))
                        })
                    )
                    dom.appendChild(
                        btn('Chat', connector.PLATFORM_META_KEY + 'L', () => {
                            store.dispatch(pressAICommand('l'))
                        })
                    )
                    // dom.appendChild(btn('Test', connector.PLATFORM_META_KEY+'T', () => {
                    //     commandK("test", false, store.dispatch)
                    // }))

                    return {
                        dom,
                        getCoords: (pos: number) => {
                            const editor = view.dom as HTMLElement
                            const editorTop =
                                editor.getBoundingClientRect().top + 50
                            const editorBottom =
                                editor.getBoundingClientRect().bottom - 50

                            const rangeTop = view.coordsAtPos(range.from)!.top
                            const rangeBottom = view.coordsAtPos(range.to)!.top

                            const coords = view.coordsAtPos(pos)!
                            const { left, top: coordsTop } = coords

                            const inEditorTop = Math.max(
                                editorTop,
                                Math.min(editorBottom, coordsTop)
                            )
                            const inRangeTop = Math.max(
                                rangeTop,
                                Math.min(rangeBottom, inEditorTop)
                            )
                            const top = inRangeTop

                            const right = left + dom.offsetWidth
                            const bottom = top + dom.offsetHeight
                            return { top, left, right, bottom }
                        },
                    }
                },
            }
        })
}

const cursorTooltipBaseTheme = EditorView.baseTheme({
    '.cm-tooltip.cm-tooltip-cursor': {
        backgroundColor: '#438ad6',
        color: 'white',
        border: 'none',
        padding: '0px',
        borderRadius: '4px',
        zIndex: 49,
        '& .cm-tooltip-arrow:before': {
            borderTopColor: '#438ad6',
        },
        '& .cm-tooltip-arrow:after': {
            borderTopColor: 'transparent',
        },
        // for buttons
        '& button': {
            backgroundColor: 'transparent',
            border: 'none',
            color: 'white',
            padding: '4px 12px',
            cursor: 'pointer',
            '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
            },
            '& .cmd-text': {
                color: 'rgba(255, 255, 255, 0.6)',
                marginLeft: '4px',
            },
        },
    },
})

export function cursorTooltip() {
    return [cursorTooltipField, cursorTooltipBaseTheme]
}
