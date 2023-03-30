import React, { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
    getCurrentTab,
    getDraggingTabId,
    getPane,
    getTab,
} from '../features/selectors'
import { moveDraggingTabToPane, selectPane } from '../features/globalSlice'
import { HoverState } from '../features/window/state'

import { TabBar } from './tabs'
import { Page } from './editor'
import { throttleCallback } from './componentUtils'
import { selectFixesByFileId } from '../features/fixLSP/fixLSPSelectors'
import { fixErrors } from '../features/fixLSP/fixLSPSlice'

// FixErrorsButton component
export function FixErrorsButton({ tabId }: { tabId: number }) {
    const dispatch = useAppDispatch()
    const fileId = useAppSelector(getTab(tabId))?.fileId
    // use redux selector to get list of errors
    const fixLSPFile = useAppSelector(selectFixesByFileId(fileId))
    // check if list has length greater than 0
    const hasErrors = fixLSPFile == null ? false : fixLSPFile.doDiagnosticsExist

    return (
        <>
            {hasErrors && (
                <button
                    onClick={() => {
                        // dispatch action to fix errors
                        dispatch(fixErrors({ tabId }))
                    }}
                    style={{
                        color: 'white',
                    }}
                >
                    Fix Errors
                </button>
            )}
        </>
    )
}

export function Pane({ paneId }: { paneId: number }) {
    const dispatch = useAppDispatch()
    const pane = useAppSelector(getPane(paneId))
    const activeTabId = useAppSelector(getCurrentTab(paneId))
    const draggingTabId = useAppSelector(getDraggingTabId)
    const paneDiv = React.useRef<HTMLDivElement>(null)
    const [hoverState, setHoverState] = useState(HoverState.None)
    const [initialSelectPaneMousePosition, setInitialSelectPaneMousePosition] =
        useState<{ x: number; y: number } | null>(null)

    let paneHoverClassName = 'pane__hover'
    if (hoverState == HoverState.Left) paneHoverClassName += ' pane__hover_left'
    if (hoverState == HoverState.Right)
        paneHoverClassName += ' pane__hover_right'
    if (hoverState == HoverState.Top) paneHoverClassName += ' pane__hover_top'
    if (hoverState == HoverState.Bottom)
        paneHoverClassName += ' pane__hover_bottom'
    if (hoverState == HoverState.Full) paneHoverClassName += ' pane__hover_full'

    function xyToPaneHoverState(x: number, y: number) {
        if (!paneDiv.current) return HoverState.None
        const rect = paneDiv.current!.getBoundingClientRect()

        const horizMargin = rect.width / 4
        const vertMargin = rect.height / 4
        const xInDiv = x - rect.left
        const yInDiv = y - rect.top

        // take into account the title-bar height and the position of the mouse when start dragging the tab
        const titleBarHeightPx = 47
        const yCalculated =
            y - (initialSelectPaneMousePosition?.y as number) - titleBarHeightPx
        if (yCalculated > 0) {
            if (xInDiv < horizMargin) return HoverState.Left
            if (xInDiv > rect.width - horizMargin) return HoverState.Right
            if (yInDiv < vertMargin) return HoverState.Top
            if (yInDiv > rect.height - vertMargin) return HoverState.Bottom
        }
        return HoverState.Full
    }

    function xyToTabPosition(x: number, y: number) {
        const paneRect = paneDiv.current!.getBoundingClientRect()
        const tabs = paneDiv.current?.getElementsByClassName('tab') || []
        let totalWidth = 0
        const relativePosX = x - paneRect.left
        let tabPosition = null
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i]
            totalWidth += tab.clientWidth
            if (relativePosX < totalWidth) {
                tabPosition = i
                break
            }
        }
        if (tabPosition === null) {
            tabPosition = tabs.length - 1
        }
        return tabPosition
    }

    const isDraggingTabInPane =
        draggingTabId == null ? false : pane.tabIds.includes(draggingTabId)
    const shouldDrag = pane.tabIds.length > 1 || !isDraggingTabInPane
    const onDragCallback = (event: any) => {
        if (shouldDrag) {
            event.preventDefault()
            const newHoverState = xyToPaneHoverState(
                event.clientX,
                event.clientY
            )
            setHoverState(newHoverState)
        }
    }

    const onDropCallback = (event: any) => {
        if (shouldDrag) {
            event.preventDefault()
            const newHoverState = xyToPaneHoverState(
                event.clientX,
                event.clientY
            )
            const newTabPosition = xyToTabPosition(event.clientX, event.clientY)
            dispatch(
                moveDraggingTabToPane({
                    paneId: paneId,
                    hoverState: newHoverState,
                    tabPosition: newTabPosition,
                })
                // moveDraggingTabToPane({
                //     paneId: paneId,
                //     hoverState: newHoverState,
                // })
            )
            setHoverState(HoverState.None)
        }
    }

    const onDragLeave = (event: any) => {
        if (shouldDrag) {
            event.preventDefault()
            setHoverState(HoverState.None)
        }
    }

    let paneClass = 'pane'
    if (!pane.isActive) paneClass += ' pane__inactive'

    return (
        <div className={paneClass} ref={paneDiv}>
            <div
                className={paneHoverClassName}
                onDragOver={onDragCallback}
                onDrop={onDropCallback}
                onDragLeave={onDragLeave}
            />
            <div
                className="pane__content"
                onDragStart={(event) => {
                    if (initialSelectPaneMousePosition === null) {
                        setInitialSelectPaneMousePosition({
                            x: event.clientX,
                            y: event.clientY,
                        })
                    }
                }}
                onDragEnd={() => {
                    setInitialSelectPaneMousePosition(null)
                }}
                onDragOver={onDragCallback}
                onDrop={onDropCallback}
                onDragLeave={onDragLeave}
                onClick={() => {
                    dispatch(selectPane(paneId))
                }}
            >
                <TabBar
                    tabIds={pane.tabIds}
                    activeTabId={activeTabId ?? null}
                />
                {activeTabId && <Page tid={activeTabId} />}
            </div>
        </div>
    )
}

export function PaneHolder({
    paneIds,
    depth,
    paneIndex,
    onClickBorder,
    width,
}: {
    paneIds: number[] | number
    depth: number
    paneIndex?: number
    onClickBorder?: (paneIndex: number) => void
    width?: number
}) {
    // dragging state
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
    const [widths, setWidths] = useState<number[]>([1])
    const paneHolderDiv = React.useRef<HTMLDivElement>(null)

    const horiz = depth % 2 == 0
    const className = horiz ? 'paneholder__horizontal' : 'paneholder__vertical'
    const hasBorder = paneIndex != null && paneIndex > 0
    const afterClassname = horiz
        ? 'paneholder__vertical_split'
        : 'paneholder__horizontal_split'

    // set document mouse up ahndler
    React.useEffect(() => {
        function handleMouseUp() {
            setDraggingIndex(null)
        }
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [])

    function initWidths() {
        if (typeof paneIds == 'number') {
            setWidths([1])
        } else {
            setWidths(Array(paneIds.length).fill(1 / paneIds.length))
        }
    }

    // when paneIds changes, reset widths
    React.useEffect(() => {
        initWidths()
    }, [paneIds])

    // on init, set widths
    React.useEffect(() => {
        initWidths()
    }, [])

    // set mouse move handler
    React.useEffect(() => {
        if (draggingIndex != null) {
            const throttledMouseMove = throttleCallback((event: any) => {
                if (draggingIndex != null) {
                    event.preventDefault()
                    event.stopPropagation()

                    // adjust the widths
                    const newWidths = [...widths]
                    // get the x coord of the mouse
                    const x = horiz ? event.clientX : event.clientY

                    // get the x coord within the paneholderdiv
                    const rect = paneHolderDiv.current!.getBoundingClientRect()
                    const xInDiv = horiz ? x - rect.left : x - rect.top

                    // get the percentage of the x coord within the paneholderdiv
                    const clickXPercent = horiz
                        ? xInDiv / rect.width
                        : xInDiv / rect.height

                    // get the current xpercent of the dragging index - 1

                    const currentLeftXPercent = widths
                        .slice(0, draggingIndex)
                        .reduce((a, b) => a + b, 0)
                    const deltaXPercent = clickXPercent - currentLeftXPercent
                    newWidths[draggingIndex - 1] += deltaXPercent
                    newWidths[draggingIndex] -= deltaXPercent

                    setWidths(newWidths)
                }
            }, 10)
            document.addEventListener('mousemove', throttledMouseMove)
            return () => {
                document.removeEventListener('mousemove', throttledMouseMove)
            }
        }
    }, [draggingIndex])

    function onChildBorderClick(paneIndex: number) {
        setDraggingIndex(paneIndex)
    }

    const widthPercent = width != null ? width * 100 + '%' : '100%'
    // need to compensate for border size, located in css
    const widthExpression = hasBorder
        ? 'calc(' + widthPercent + ' - 4px)'
        : widthPercent
    const styleDict = !horiz
        ? { width: widthExpression }
        : { height: widthExpression }

    return (
        <>
            {hasBorder && (
                <div
                    className={afterClassname}
                    onMouseDown={() => {
                        if (onClickBorder != null) {
                            onClickBorder(paneIndex!)
                        }
                    }}
                ></div>
            )}
            <div className={className} ref={paneHolderDiv} style={styleDict}>
                {typeof paneIds === 'number' ? (
                    <Pane paneId={paneIds} />
                ) : (
                    paneIds.map((paneId, newPaneIndex) => (
                        <PaneHolder
                            key={newPaneIndex}
                            paneIndex={newPaneIndex}
                            paneIds={paneId}
                            depth={depth + 1}
                            width={widths[newPaneIndex]}
                            onClickBorder={onChildBorderClick}
                        />
                    ))
                )}
            </div>
        </>
    )
}
