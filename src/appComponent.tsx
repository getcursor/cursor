import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { faClose } from '@fortawesome/pro-regular-svg-icons'
import Modal from 'react-modal'

import { useAppDispatch, useAppSelector } from './app/hooks'
import { PaneHolder } from './components/pane'
import * as gs from './features/globalSlice'
import * as cs from './features/chat/chatSlice'
import * as ct from './features/chat/chatThunks'
import * as ts from './features/tools/toolSlice'
import * as csel from './features/chat/chatSelectors'
import * as tsel from './features/tools/toolSelectors'
import * as gsel from './features/selectors'

import {
    getFocusedTab,
    getFolders,
    getPaneStateBySplits,
    getRootPath,
    getZoomFactor,
} from './features/selectors'

import { ChatPopup, CommandBar } from './components/markdown'
import { SettingsPopup } from './components/settingsPane'
import { FeedbackArea, LeftSide } from './components/search'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { WelcomeScreen } from './components/welcomeScreen'
import { TitleBar } from './components/titlebar'
import { BottomTerminal } from './components/terminal'
import { throttleCallback } from './components/componentUtils'
import { ErrorPopup } from './components/errors'

const customStyles = {
    overlay: {
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        zIndex: 10000,
    },
    content: {
        padding: 'none',
        top: '150px',
        bottom: 'none',
        background: 'none',
        border: 'none',
        width: 'auto',
        height: 'auto',
        marginLeft: 'auto',
        marginRight: 'auto',
        maxWidth: '700px',
    },
}

function SSHPopup() {
    const showRemotePopup = useAppSelector(gsel.getShowRemotePopup)
    const remoteCommand = useAppSelector(gsel.getRemoteCommand)
    const remotePath = useAppSelector(gsel.getRemotePath)
    const remoteBad = useAppSelector(gsel.getRemoteBad)
    const dispatch = useAppDispatch()
    const textInputRef = useRef<HTMLInputElement>(null)
    const textInputRef2 = useRef<HTMLInputElement>(null)

    function submit() {
        // if the inputs have more than 2 chars each
        if (
            textInputRef.current!.value.length > 2 &&
            textInputRef2.current!.value.length > 2
        ) {
            dispatch(gs.openRemoteFolder(null))
        }
    }

    return (
        <Modal
            isOpen={showRemotePopup}
            onRequestClose={() => {
                dispatch(gs.closeRemotePopup())
            }}
            style={customStyles}
        >
            <div className="errorPopup">
                <div className="errorPopup__title">
                    <div className="errorPopup__title_text">
                        Connect to SSH directory
                    </div>
                    <div
                        className="remotePopup__title_close"
                        onClick={() => dispatch(gs.closeRemotePopup())}
                    >
                        <FontAwesomeIcon icon={faClose} />
                    </div>
                </div>
                {remoteBad && (
                    <div className="errorPopup__body">
                        The SSH command or path you entered is invalid. Please
                        try again.
                    </div>
                )}
                <div className="remotePopup__body">
                    <div className="settings__item_title">SSH Command</div>
                    <div className="settings__item_description">
                        Same command you would put in the terminal
                    </div>
                    <input
                        type="text"
                        placeholder="ssh -i ~/keys/mypemfile.pem ubuntu@ec2dns.aws.com"
                        ref={textInputRef}
                        value={remoteCommand}
                        onChange={(e) =>
                            dispatch(gs.setRemoteCommand(e.target.value))
                        }
                    />
                </div>
                <div className="remotePopup__body">
                    <div className="settings__item_title">Target Folder</div>
                    <div className="settings__item_description">
                        Must be an absolute path
                    </div>
                    <input
                        type="text"
                        placeholder="/home/ubuntu/portal/"
                        value={remotePath}
                        ref={textInputRef2}
                        onChange={(e) =>
                            dispatch(gs.setRemotePath(e.target.value))
                        }
                        onKeyDown={(event: any) => {
                            if (event.key === 'Enter') {
                                submit()
                            }
                        }}
                    />
                </div>
                <div className="submit-button-parent">
                    <button
                        className="submit-button-ssh"
                        onClick={() => {
                            submit()
                        }}
                    >
                        Submit
                    </button>
                </div>
            </div>
        </Modal>
    )
}

// A component that renders a button to open a file dialog
function FileDialog() {
    // Get the dispatch function from the app context
    const dispatch = useAppDispatch()
    return (
        // Render a div with a click handler that dispatches an action to open a folder
        <div
            className="filedialog"
            onClick={() => dispatch(gs.openFolder(null))}
        >
            Open Folder
        </div>
    )
}

export function App() {
    const dispatch = useAppDispatch()
    const isNotFirstTime = useAppSelector(gsel.getIsNotFirstTime)
    const rootPath = useAppSelector(getRootPath)
    const folders = useAppSelector(getFolders)
    const leftSideExpanded = useAppSelector(tsel.getLeftSideExpanded)

    const paneSplits = useAppSelector(getPaneStateBySplits)

    const zoomFactor = useAppSelector(getZoomFactor)
    const titleHeight = Math.round((1.0 / zoomFactor) * 35) + 'px'

    // set window height to 100 vh - titlebar height
    const windowHeight = 'calc(100vh - ' + titleHeight + ')'

    const commandBarOpen = useAppSelector(csel.getIsCommandBarOpen)
    const currentActiveTab = useAppSelector(getFocusedTab)

    // Get the currently opened filename
    const activeFilePath = useAppSelector(gsel.getCurrentFilePath)

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const AI_KEYS = ['k', 'l', 'Backspace', 'Enter']
            //
            const isControl = connector.PLATFORM_CM_KEY === 'Ctrl'
            if ((isControl && e.ctrlKey) || (!isControl && e.metaKey)) {
                if (AI_KEYS.includes(e.key)) {
                    if (e.shiftKey && e.key == 'Enter') {
                        dispatch(ct.pressAICommand('Shift-Enter'))
                        e.stopPropagation()
                    } else {
                        dispatch(
                            ct.pressAICommand(
                                e.key as 'k' | 'l' | 'Backspace' | 'Enter'
                            )
                        )
                        if (e.key != 'Backspace' && e.key != 'Enter') {
                            // Bug where I'm not sure why this is needed
                            e.stopPropagation()
                        }
                    }
                } else if (e.key == 'e' && e.shiftKey) {
                    dispatch(ct.pressAICommand('singleLSP'))
                    e.stopPropagation()
                } else if (e.key == 'h') {
                    dispatch(ct.pressAICommand('history'))
                    e.stopPropagation()
                }
            }

            // if meta key is pressed, focus can be anywhere
            if (e.metaKey) {
                if (e.key === 'b') {
                    dispatch(ts.toggleLeftSide())
                }
            }

            // if the escape key
            if (e.key === 'Escape') {
                dispatch(cs.setChatOpen(false))
                if (commandBarOpen) {
                    dispatch(cs.abortCommandBar())
                }
            }
        },
        [dispatch, currentActiveTab, commandBarOpen]
    )

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown, { capture: true })
        // Don't forget to clean up
        return function cleanup() {
            document.removeEventListener('keydown', handleKeyDown, {
                capture: true,
            })
        }
    }, [handleKeyDown])

    useLayoutEffect(() => {
        if (rootPath == null) {
            dispatch(gs.initState(null))
        }
    }, [rootPath])

    const screenState =
        isNotFirstTime == false
            ? 'welcome'
            : Object.keys(folders).length <= 1
            ? 'folder'
            : 'normal'

    const [dragging, setDragging] = useState(false)
    const [leftSideWidth, setLeftSideWidth] = useState(250)
    useEffect(() => {
        const throttledMouseMove = throttleCallback((event: any) => {
            if (dragging) {
                event.preventDefault()
                event.stopPropagation()

                const diff = event.clientX

                setLeftSideWidth(diff)
            }
        }, 10)
        document.addEventListener('mousemove', throttledMouseMove)
        return () => {
            document.removeEventListener('mousemove', throttledMouseMove)
        }
    }, [dragging])
    useEffect(() => {
        function handleMouseUp() {
            setDragging(false)
        }
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [])

    return (
        <>
            {commandBarOpen && <CommandBar parentCaller={'commandBar'} />}
            <TitleBar
                titleHeight={titleHeight}
                useButtons={screenState === 'normal'}
            />
            <div className="window relative" style={{ height: windowHeight }}>
                {screenState === 'welcome' && <WelcomeScreen />}
                {screenState === 'folder' && (
                    <>
                        <SSHPopup />
                        <FileDialog />
                    </>
                )}
                {screenState === 'normal' && (
                    <>
                        <div
                            className={`app__lefttopwrapper ${
                                leftSideExpanded ? 'flex' : 'hidden'
                            }`}
                            style={{ width: leftSideWidth + 'px' }}
                        >
                            <LeftSide />
                        </div>
                        <div
                            className="leftDrag"
                            onMouseDown={() => {
                                setDragging(true)
                            }}
                        ></div>
                        <div className="app__righttopwrapper">
                            <div className="app__paneholderwrapper">
                                <PaneHolder paneIds={paneSplits} depth={1} />
                            </div>
                            <div className="app__terminalwrapper">
                                <BottomTerminal />
                            </div>
                        </div>
                        <ChatPopup />
                        <ErrorPopup />
                        <SettingsPopup />
                        <FeedbackArea />
                        <SSHPopup />
                    </>
                )}
            </div>
        </>
    )
}
