import * as React from 'react'
import { useEffect, useRef } from 'react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClose } from '@fortawesome/free-solid-svg-icons'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { getTab, getFile, getRelativeFilePath } from '../features/selectors'
import { setDraggingTab, stopDraggingTab } from '../features/globalSlice'

import { getIconElement } from './filetree'

import * as gs from '../features/globalSlice'
import * as gt from '../features/globalThunks'
import * as ts from '../features/tools/toolSlice'
import * as gsel from '../features/selectors'
import * as tsel from '../features/tools/toolSelectors'
import { faTableColumns, faTableRows } from '@fortawesome/pro-regular-svg-icons'
import { HoverState } from '../features/window/state'

// Actions needed for this component
// selectTab(tid: number) - select a tab
// closeTab(tid: number) - close a tab

// Selectors needed for this component
// getActiveTabs() - get the list of active tabs

// Objects needed for this component
// Tab - {id: number, name: string, path: string, is_active: boolean}

function Tab({ tid }: { tid: number }) {
    const dispatch = useAppDispatch()
    const tab = useAppSelector(getTab(tid))
    const file = useAppSelector(getFile(tab.fileId))

    let name = tab.isMulti ? 'multifile' : file.name
    if (!tab.isMulti && !file.saved) name += ' *'

    return (
        <div
            draggable="true"
            onDragStart={(e) => {
                dispatch(setDraggingTab(tid))
            }}
            onDragEnd={(e) => {
                dispatch(stopDraggingTab(null))
            }}
            className={`tab ${tab.isActive ? 'tab__is_active' : ''} ${
                file.deleted == true ? 'tab__is_deleted' : ''
            }`}
            onClick={() => {
                dispatch(gs.selectTab(tid))
            }}
        >
            <div onMouseDown={
                (e) => {
                    if(e.button == 1) { // middle click
                        e.stopPropagation()
                        dispatch(gt.closeTab(tid))
                    }
                }
            }>
                <div className="tab__icon">{getIconElement(file.name)}</div>
                <div className="tab__name">{name}</div>
                <div
                    className="tab__close"
                    onClick={(e) => {
                        e.stopPropagation()
                        dispatch(gt.closeTab(tid))
                    }}
                >
                    <FontAwesomeIcon icon={faClose} />
                </div>
            </div>
        </div>
    )
}

function TabPath({ tid }: { tid: number }) {
    const tab = useAppSelector(getTab(tid))
    const filePath = useAppSelector(getRelativeFilePath(tab.fileId))
    const splitPaths = filePath.split(connector.PLATFORM_DELIMITER)
    const delimeter = '〉'

    return (
        <>
            {!tab.isMulti && (
                <div className="tab__path">
                    {splitPaths.map((path, i) => (
                        <div key={i} className="whitespace-nowrap">
                            <span>{path}</span>

                            {i < splitPaths.length - 1 ? (
                                <span
                                    className="ml-4 mr-4"
                                    style={{ width: '5px' }}
                                >
                                    {delimeter}
                                </span>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

export function TabBar({
    tabIds,
    activeTabId = null,
}: {
    tabIds: number[]
    activeTabId?: number | null
}) {
    // Add event listener to translate vertical scroll to horizontal scroll
    const dispatch = useAppDispatch()
    const tabBarRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const tabBar = tabBarRef.current
        if (tabBar) {
            tabBar.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault()
                    tabBar.scrollLeft += e.deltaY
                }
            })
        }
    }, [tabBarRef])

    const currentPane = useAppSelector(gsel.getCurrentPane)
    const currentTab = useAppSelector(gsel.getCurrentTab(currentPane!))

    const leftSideExpanded = useAppSelector(tsel.getLeftSideExpanded)

    const handleExpandLeftSideClick = () => {
        dispatch(ts.expandLeftSide())
    }

    return (
        <div className="window__tabbarcontainer">
            <div className="tabbar" ref={tabBarRef}>
                <div className="tabs-container flex" ref={tabBarRef}>
                    {!leftSideExpanded && (
                        <div className=" h-full flex items-center justify-center">
                            <button
                                className={`leftside__tab opacity-75`}
                                onClick={() => handleExpandLeftSideClick()}
                            >
                                <div>
                                    <i className="fas fa-chevrons-right"></i>
                                </div>
                            </button>
                        </div>
                    )}

                    {tabIds.map((tabId) => (
                        <Tab key={tabId} tid={tabId} />
                    ))}
                </div>

                {currentPane != null && currentTab != null && (
                    <div className="tabbar__hoverbuttons">
                        <div
                            className="tabbar__hoverbutton"
                            onClick={(e) => {
                                e.stopPropagation()
                                dispatch(
                                    gs.splitPaneAndOpenFile({
                                        paneId: currentPane,
                                        hoverState: HoverState.Right,
                                    })
                                )
                            }}
                        >
                            <FontAwesomeIcon icon={faTableColumns} />
                        </div>
                        <div
                            className="tabbar__hoverbutton"
                            onClick={(e) => {
                                e.stopPropagation()
                                dispatch(
                                    gs.splitPaneAndOpenFile({
                                        paneId: currentPane,
                                        hoverState: HoverState.Bottom,
                                    })
                                )
                            }}
                        >
                            <FontAwesomeIcon icon={faTableRows} />
                        </div>
                    </div>
                )}
            </div>

            {activeTabId != null ? <TabPath tid={activeTabId} /> : null}
        </div>
    )
}
