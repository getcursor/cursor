import * as gs from '../features/globalSlice'
import * as gt from '../features/globalThunks'
import * as cs from '../features/chat/chatSlice'
import * as ss from '../features/settings/settingsSlice'
import * as ls from '../features/logging/loggingSlice'
import * as ts from '../features/tools/toolSlice'
import * as csel from '../features/chat/chatSelectors'
import * as gsel from '../features/selectors'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { useEffect, useState } from 'react'
import SearchFiles from './searchFiles'
import CommandPalette from './commandPalette'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faCog,
    faHandWave,
    faMinus,
    faRobot,
    faSquare,
    faSquareTerminal,
    faTimes,
} from '@fortawesome/pro-regular-svg-icons'

function Menu({
    title,
    options,
    open,
    onClick,
}: {
    title: string
    options: [string, () => void, string?][]
    open: boolean
    onClick: () => void
}) {
    return (
        <div className="menu" onClick={onClick}>
            {title}
            {open && (
                <div className="menu__options">
                    {options.map(([action, callback, accelerator], index) => (
                        <div
                            className="menu__option"
                            key={index}
                            onClick={callback}
                        >
                            {action}
                            {accelerator && (
                                <div className="menu__option__accelerator">
                                    {accelerator}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function MenuBar() {
    const dispatch = useAppDispatch()
    const [openMenu, setOpenMenu] = useState(-1)

    // if theres a click somewhere off screen
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (e.target instanceof HTMLElement) {
                if (!e.target.closest('.menuGroup')) {
                    setOpenMenu(-1)
                }
            }
        }
        window.addEventListener('click', handleClick)
        return () => {
            window.removeEventListener('click', handleClick)
        }
    }, [])

    return (
        <div className="menuGroup">
            <Menu
                title="File"
                options={[
                    [
                        'New File',
                        () => {
                            dispatch(gs.newFile({ parentFolderId: null }))
                        },
                        connector.PLATFORM_META_KEY + 'N',
                    ],
                    [
                        'Open Folder',
                        () => {
                            dispatch(gs.openFolder(null))
                        },
                        connector.PLATFORM_META_KEY + 'O',
                    ],
                    [
                        'Open SSH Folder',
                        () => {
                            dispatch(gs.openRemotePopup())
                        },
                        '',
                    ],
                    [
                        'Save File',
                        () => {
                            dispatch(gs.saveFile(null))
                        },
                        connector.PLATFORM_META_KEY + 'S',
                    ],
                    [
                        'Close Tab',
                        () => {
                            dispatch(gt.closeTab(null))
                        },
                        connector.PLATFORM_META_KEY + 'W',
                    ],
                ]}
                open={openMenu === 0}
                onClick={() => {
                    if (openMenu !== 0) setOpenMenu(0)
                    else setOpenMenu(-1)
                }}
            />

            <Menu
                title="Edit"
                options={[
                    [
                        'Cut',
                        () => {
                            document.execCommand('cut')
                        },
                        connector.PLATFORM_META_KEY + 'X',
                    ],
                    [
                        'Copy',
                        () => {
                            document.execCommand('copy')
                        },
                        connector.PLATFORM_META_KEY + 'C',
                    ],
                    [
                        'Paste',
                        () => {
                            document.execCommand('paste')
                        },
                        connector.PLATFORM_META_KEY + 'V',
                    ],
                    [
                        'Select All',
                        () => {
                            document.execCommand('selectAll')
                        },
                        connector.PLATFORM_META_KEY + 'A',
                    ],
                ]}
                open={openMenu === 1}
                onClick={() => {
                    if (openMenu !== 1) setOpenMenu(1)
                    else setOpenMenu(-1)
                }}
            />

            <Menu
                title="View"
                options={[
                    [
                        'Zoom In',
                        () => {
                            connector.zoomIn()
                        },
                        connector.PLATFORM_META_KEY + 'plus',
                    ],
                    [
                        'Zoom Out',
                        () => {
                            connector.zoomOut()
                        },
                        connector.PLATFORM_META_KEY + 'minus',
                    ],
                    [
                        'Reset Zoom',
                        () => {
                            connector.zoomReset()
                        },
                        connector.PLATFORM_META_KEY + '0',
                    ],
                    [
                        'Search',
                        () => {
                            dispatch(ts.openSearch())
                        },
                        connector.PLATFORM_META_KEY + 'shift+f',
                    ],
                    [
                        'File Search',
                        () => {
                            dispatch(ts.triggerFileSearch())
                        },
                        connector.PLATFORM_META_KEY + 'p',
                    ],
                    [
                        'Command Palette',
                        () => {
                            dispatch(ts.triggerCommandPalette())
                        },
                        connector.PLATFORM_META_KEY + 'shift+p',
                    ],
                ]}
                open={openMenu === 2}
                onClick={() => {
                    if (openMenu !== 2) setOpenMenu(2)
                    else setOpenMenu(-1)
                }}
            />
        </div>
    )
}

function WindowsFrameButtons() {
    const dispatch = useAppDispatch()

    return (
        <div className="windows__framebuttons">
            <div
                className="titlebar__right_button"
                onClick={() => {
                    connector.minimize()
                }}
            >
                <FontAwesomeIcon icon={faMinus} />
            </div>
            <div
                className="titlebar__right_button"
                onClick={() => {
                    connector.maximize()
                }}
            >
                <FontAwesomeIcon icon={faSquare} />
            </div>
            <div
                className="titlebar__right_button windows__closebutton"
                onClick={() => {
                    connector.close()
                }}
            >
                <FontAwesomeIcon icon={faTimes} />
            </div>
        </div>
    )
}

export function TitleBar({
    titleHeight,
    useButtons = true,
}: {
    titleHeight: string
    useButtons?: boolean
}) {
    const dispatch = useAppDispatch()
    const generating = useAppSelector(csel.getGenerating)
    const appVersion = useAppSelector(gsel.getVersion)

    const [isWindows, setIsWindows] = useState(false)

    useEffect(() => {
        connector.getPlatform().then((platform: string | null) => {
            setIsWindows(platform !== 'darwin')
        })
    }, [])

    return (
        <div
            className="titlebar"
            style={{ height: titleHeight }}
            onDoubleClick={() => connector.maximize()}
        >
            <SearchFiles />
            <CommandPalette />
            <div className="titleOnTitleBar">Cursor - v{appVersion}</div>
            <div className="titlebar__left">
                {isWindows && <MenuBar />}
                <div className="titlebar__left_rest"></div>
            </div>
            {useButtons && (
                <div
                    className="titlebar__right"
                    onDoubleClick={(e) => {
                        // Prevent double click from triggering maximize
                        e.stopPropagation()
                    }}
                >
                    {generating && (
                        <div className="titlebar__right_button_spinner">
                            <div className="loader"></div>
                        </div>
                    )}

                    {generating && (
                        <div
                            className="titlebar__right_button_with_text"
                            onClick={() => {
                                dispatch(cs.interruptGeneration(null))
                            }}
                        >
                            Cancel
                            <span className="titlebar-shortcut-span">
                                {connector.PLATFORM_META_KEY}⌫
                            </span>
                        </div>
                    )}
                    <div
                        className="titlebar__ai_button"
                        onClick={() => {
                            dispatch(ts.triggerAICommandPalette())
                        }}
                    >
                        <FontAwesomeIcon icon={faRobot} />
                    </div>

                    <div
                        className="titlebar__right_button"
                        onClick={() => {
                            dispatch(gs.toggleTerminal())
                        }}
                    >
                        <FontAwesomeIcon icon={faSquareTerminal} />
                    </div>

                    <div
                        className="titlebar__right_button"
                        onClick={() => {
                            dispatch(ls.toggleFeedback(null))
                        }}
                    >
                        <FontAwesomeIcon icon={faHandWave} />
                    </div>

                    <div
                        className="titlebar__right_button"
                        onClick={() => {
                            dispatch(ss.toggleSettings())
                        }}
                    >
                        <FontAwesomeIcon icon={faCog} />
                    </div>
                </div>
            )}
            <div className="titlebar__right_filler"></div>
            {isWindows && <WindowsFrameButtons />}
        </div>
    )
}
