import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from 'xterm-addon-search'
import 'xterm/css/xterm.css'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { FullState } from '../features/window/state'
import * as gs from '../features/globalSlice'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes, faPlus, faTerminal } from '@fortawesome/free-solid-svg-icons'
import { throttleCallback } from './componentUtils'
import { faChevronDown, faChevronUp } from '@fortawesome/pro-regular-svg-icons'

export function XTermComponent({ height, id }: { height: number; id: number }) {
    const terminalRef = useRef<HTMLDivElement>(null)
    const searchBarInputRef = useRef<HTMLInputElement>(null)
    const terminal = useRef<Terminal | null>(null)
    const fitAddon = useRef<FitAddon>(new FitAddon())
    const webLinksAddon = useRef<WebLinksAddon>(
        new WebLinksAddon((event: MouseEvent, url: string) => {
            event.preventDefault()
            connector.terminalClickLink(url)
        })
    )
    const searchAddon = useRef<SearchAddon>(new SearchAddon())
    const [searchBarOpen, setSearchBarOpen] = React.useState(false)
    const terminalOpenSelector = useAppSelector(
        (state: FullState) => state.global.terminalOpen
    )

    const handleIncomingData = useCallback(
        (e: { id: number }, data: any) => {
            if (e.id === id && terminal.current) {
                terminal.current.write(data)
            }
        },
        [id]
    )

    useEffect(() => {
        terminal.current = new Terminal({
            theme: {
                background: '#1e1e1e',
                foreground: '#f1f1f1',
            },
        })
        terminal.current.onResize((size: { cols: number; rows: number }) => {
            connector.terminalResize(id, size)
        })

        terminal.current.loadAddon(fitAddon.current)
        terminal.current.loadAddon(webLinksAddon.current)
        terminal.current.loadAddon(searchAddon.current)

        if (terminalRef.current) {
            terminal.current.open(terminalRef.current)
            // Send a single newline character to the terminal when it is first opened
            connector.terminalInto(id, '\n')
        }

        terminal.current.onData((e) => {
            connector.terminalInto(id, e)
        })

        terminal.current.attachCustomKeyEventHandler((e) => {
            if (e.ctrlKey && e.key === 'f') {
                openSearchBar()
                return false
            } else if (e.key === 'Escape') {
                closeSearchBar()
                return false
            }
            return true
        })

        connector.registerIncData(id, handleIncomingData)

        // Make the terminal's size and geometry fit the size of #terminal-container
        fitAddon.current.fit()

        return () => {
            if (terminal.current) {
                terminal.current.dispose()
            }
            connector.deregisterIncData(id, handleIncomingData)
        }
    }, [terminalRef, id, handleIncomingData])

    useEffect(() => {
        if (terminal.current != null) {
            terminal.current.loadAddon(fitAddon.current)
            terminal.current.loadAddon(webLinksAddon.current)
            fitAddon.current.fit()
        }
    }, [height, terminal, fitAddon])

    const openSearchBar = () => {
        setSearchBarOpen(true)
        searchBarInputRef.current?.focus()
    }

    const closeSearchBar = () => {
        setSearchBarOpen(false)
        terminal.current?.focus()
    }

    const findNextSearchResult = () => {
        if (searchBarInputRef.current?.value) {
            searchAddon.current.findNext(searchBarInputRef.current.value)
        }
    }

    const findPreviousSearchResult = () => {
        if (searchBarInputRef.current?.value) {
            searchAddon.current.findPrevious(searchBarInputRef.current.value)
        }
    }
    // Refresh the terminal display when the component is re-rendered
    useEffect(() => {
        if (terminal.current != null) {
            fitAddon.current.fit()
        }
    }, [id])

    useEffect(() => {
        if (terminalOpenSelector) {
            // The terminal was just opened, so focus on the XTermComponent
            if (terminal.current) {
                terminal.current.focus()
            }
        }
    }, [terminalOpenSelector])

    return (
        <div
            className="terminalInnerContainer"
            ref={terminalRef}
            style={{ height: height + 'px', position: 'relative' }}
        >
            {searchBarOpen && (
                <div
                    className="search-input flex justify-end absolute top-1 right-4 z-10 md:w-80"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            closeSearchBar()
                        }
                    }}
                >
                    <input
                        className="search-input w-full"
                        placeholder="Search..."
                        autoFocus
                        ref={searchBarInputRef}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                findNextSearchResult()
                            }
                        }}
                    />
                    <div className="flex">
                        <button
                            className="icon"
                            onClick={() => findPreviousSearchResult()}
                        >
                            <FontAwesomeIcon icon={faChevronUp} />
                        </button>
                        <button
                            className="icon"
                            onClick={() => findNextSearchResult()}
                        >
                            <FontAwesomeIcon icon={faChevronDown} />
                        </button>
                        <button
                            className="icon"
                            onClick={() => closeSearchBar()}
                        >
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

type TerminalWrapper = {
    id: number
}

type TerminalTabsProps = {
    terminals: TerminalWrapper[]
    activeTerminal: TerminalWrapper
    switchTerminal: (terminal: TerminalWrapper) => void
    removeTerminal: (terminal: TerminalWrapper) => void
    rootFolder: string
}

const TerminalTabs: React.FC<TerminalTabsProps> = ({
    terminals,
    activeTerminal,
    switchTerminal,
    removeTerminal,
    rootFolder,
}) => {
    return (
        <div className="terminal-tabs">
            {terminals.map((terminal: TerminalWrapper) => (
                <div
                    className={`terminal-tab${
                        activeTerminal.id === terminal.id ? ' active' : ''
                    }`}
                    key={terminal.id}
                    onClick={() => switchTerminal(terminal)}
                >
                    <FontAwesomeIcon icon={faTerminal} />
                    <span>{rootFolder}</span>
                    <button
                        className="close-tab-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            removeTerminal(terminal)
                        }}
                    >
                        <FontAwesomeIcon
                            icon={faTimes}
                            style={{ fontSize: '1.1rem' }}
                        />
                    </button>
                </div>
            ))}
        </div>
    )
}

export const BottomTerminal: React.FC = () => {
    const dispatch = useAppDispatch()
    const terminalOpenSelector = useAppSelector(
        (state: FullState) => state.global.terminalOpen
    )
    const rootPathSelector = useAppSelector(
        (state: FullState) => state.global.rootPath
    )

    const [terminals, setTerminals] = React.useState([{ id: 0 }])
    const [activeTerminal, setActiveTerminal] = React.useState(terminals[0])

    const [terminalOpen, setTerminalOpen] = React.useState(false)

    const addTerminal = () => {
        if (terminals.length >= 10) {
            return
        }
        connector.createNewTerminal()
        const newTerminal = { id: Math.max(...terminals.map((t) => t.id)) + 1 }
        setTerminals([...terminals, newTerminal])
        setActiveTerminal(newTerminal)
    }

    const removeTerminal = (terminalToRemove: TerminalWrapper) => {
        if (terminals.length > 1) {
            setTerminals(
                terminals.filter(
                    (terminal) => terminal.id !== terminalToRemove.id
                )
            )
            if (activeTerminal.id === terminalToRemove.id) {
                setActiveTerminal(terminals[0] || {})
            }
        } else {
            console.log('Cannot remove all terminals!')
        }
    }

    const switchTerminal = (terminal: TerminalWrapper) => {
        setActiveTerminal(terminal)
        connector.sendSigCont(terminal.id)
    }

    useEffect(() => {
        if (terminalOpenSelector) {
            setTerminalOpen(true)
        }
    }, [terminalOpenSelector])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === '`' && event.ctrlKey) {
                dispatch(gs.toggleTerminal())
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [])

    const [terminalInnerContainerHeight, setTerminalInnerContainerHeight] =
        React.useState<number>(300)
    // const handleDrag = (e: any, data: any) => {
    //     const newHeight = 300 - data.y
    //
    //     setTerminalInnerContainerHeight(newHeight)
    // }
    const [dragging, setDragging] = React.useState(false)
    useEffect(() => {
        const throttledMouseMove = throttleCallback((event: any) => {
            if (dragging) {
                event.preventDefault()
                event.stopPropagation()

                const diff = window.innerHeight - event.clientY - 50

                setTerminalInnerContainerHeight(diff)
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
            {terminalOpen ? (
                <div className="terminalOuterContainer">
                    <div
                        className="dragHandle"
                        onMouseDown={() => {
                            setDragging(true)
                        }}
                        style={{
                            cursor: 'row-resize',
                            height: '4px',
                            background: 'rgb(61, 66, 77)',
                        }}
                    ></div>
                    <div
                        className={`terminalContainer${
                            terminalOpenSelector ? '' : ' hidden'
                        }`}
                    >
                        <div className="header">
                            <div className="terminalTitle">TERMINAL</div>
                            <button
                                className="createButton"
                                onClick={addTerminal}
                            >
                                <FontAwesomeIcon icon={faPlus} />
                            </button>

                            <button
                                className="closeButton"
                                onClick={() => {
                                    dispatch(gs.closeTerminal())
                                }}
                            >
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <div className="terminal-content">
                            {terminals.map(
                                (terminal) =>
                                    activeTerminal.id === terminal.id && (
                                        <XTermComponent
                                            key={terminal.id}
                                            height={
                                                terminalInnerContainerHeight
                                            }
                                            id={terminal.id}
                                        />
                                    )
                            )}
                            <TerminalTabs
                                terminals={terminals}
                                activeTerminal={activeTerminal}
                                switchTerminal={switchTerminal}
                                removeTerminal={removeTerminal}
                                rootFolder={
                                    rootPathSelector?.split('/').pop() ?? ''
                                }
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    )
}
