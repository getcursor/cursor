import * as React from 'react'
import { useEffect, useRef } from 'react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClose } from '@fortawesome/free-solid-svg-icons'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { getFile, getRelativeFilePath, getTab } from '../features/selectors'
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
    const tabDiv = React.useRef<HTMLDivElement>(null)

    let name = tab.isMulti ? 'multifile' : file.name
    if (!tab.isMulti && !file.saved) name += ' *'

    function revertTabsChildrenEvents() {
        if (tabDiv.current) {
            tabDiv.current.style.background = ''
            const tabs =
                tabDiv.current.parentElement?.getElementsByClassName('tab')
            for (const tab of tabs || []) {
                tab.childNodes.forEach((child) => {
                    const childElement = child as HTMLElement
                    childElement.style.pointerEvents = ''
                })
            }
        }
    }

    return (
        <div
            draggable="true"
            onDragStart={(e) => {
                dispatch(setDraggingTab(tid))
            }}
            onDragEnd={(e) => {
                revertTabsChildrenEvents() // revert for current pane
                dispatch(stopDraggingTab())
            }}
            className={`tab ${tab.isActive ? 'tab__is_active' : ''} ${
                file.deleted == true ? 'tab__is_deleted' : ''
            }`}
            onClick={() => {
                dispatch(gs.selectTab(tid))
            }}
            onDragOver={(event) => {
                event.preventDefault()
                if (tabDiv.current) {
                    tabDiv.current.style.background = 'rgba(255, 255, 255, 0.3)'
                    tabDiv.current.childNodes.forEach((child) => {
                        const childElement = child as HTMLElement
                        childElement.style.pointerEvents = 'none' // we don't want onDragLeave event for tab children while reordering
                    })
                }
            }}
            onDragLeave={(event) => {
                event.preventDefault()
                if (tabDiv.current) {
                    tabDiv.current.style.background = ''
                }
            }}
            onDrop={(event) => {
                event.preventDefault()
                revertTabsChildrenEvents() // revert for new pane
            }}
            ref={tabDiv}
            onContextMenu={() => dispatch(gs.rightClickTab(tid))}
        >
            <div
                onMouseDown={(e) => {
                    if (e.button == 1) {
                        // middle click
                        e.stopPropagation()
                        dispatch(gt.closeTab(tid))
                    }
                }}
            >
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

function TabRemainder({ children }: { children: React.ReactNode }) {
    const containerDiv = useRef<HTMLDivElement>(null)
    function revertTabsChildrenEvents() {
        if (containerDiv.current) {
            containerDiv.current.style.background = ''
            const tabs =
                containerDiv.current.parentElement?.getElementsByClassName(
                    'tab'
                )
            for (const tab of tabs || []) {
                tab.childNodes.forEach((child) => {
                    const childElement = child as HTMLElement
                    childElement.style.pointerEvents = ''
                })
            }
        }
    }
    return (
        <div
            className="w-full"
            ref={containerDiv}
            onDragOver={(event) => {
                event.preventDefault()
                if (containerDiv.current) {
                    containerDiv.current.style.background =
                        'rgba(255, 255, 255, 0.3)'
                    containerDiv.current.childNodes.forEach((child) => {
                        const childElement = child as HTMLElement
                        childElement.style.pointerEvents = 'none' // we don't want onDragLeave event for tab children while reordering
                    })
                }
            }}
            onDragLeave={(event) => {
                event.preventDefault()
                if (containerDiv.current) {
                    containerDiv.current.style.background = ''
                }
            }}
            onDrop={(event) => {
                event.preventDefault()
                revertTabsChildrenEvents() // revert for new pane
            }}
        >
            {children}
        </div>
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
                <div className="w-full flex" ref={tabBarRef}>
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
                    <TabRemainder>
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
                    </TabRemainder>
                </div>
            </div>

            {activeTabId != null ? <TabPath tid={activeTabId} /> : null}
        </div>
    )
}
