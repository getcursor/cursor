import React, { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from 'xterm-addon-search'
import 'xterm/css/xterm.css'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { FullState } from '../features/window/state'
import * as gs from '../features/globalSlice'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { throttleCallback } from './componentUtils'
import { faChevronDown, faChevronUp } from '@fortawesome/pro-regular-svg-icons'

export function XTermComponent({ height }: { height: number }) {
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

    const handleIncomingData = (e: any, data: any) => {
        terminal.current!.write(data)
    }

    useEffect(() => {
        terminal.current = new Terminal({
            theme: {
                background: '#1e1e1e',
                foreground: '#f1f1f1',
            },
        })
        terminal.current.onResize((size: { cols: number; rows: number }) => {
            connector.terminalResize(size)
        })

        terminal.current.loadAddon(fitAddon.current)
        terminal.current.loadAddon(webLinksAddon.current)
        terminal.current.loadAddon(searchAddon.current)

        if (terminalRef.current) {
            terminal.current.open(terminalRef.current)
        }

        connector.terminalInto('\n')

        terminal.current.onData((e) => {
            connector.terminalInto(e)
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

        connector.registerIncData(handleIncomingData)

        // Make the terminal's size and geometry fit the size of #terminal-container
        fitAddon.current.fit()

        return () => {
            if (terminal.current != null) terminal.current.dispose()
            connector.deregisterIncData(handleIncomingData)
        }
    }, [terminalRef])

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
export const BottomTerminal: React.FC = () => {
    const dispatch = useAppDispatch()
    const terminalOpenSelector = useAppSelector(
        (state: FullState) => state.global.terminalOpen
    )
    const [terminalOpen, setTerminalOpen] = React.useState(false)

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
                                className="closeButton"
                                onClick={() => {
                                    dispatch(gs.closeTerminal())
                                }}
                            >
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <XTermComponent height={terminalInnerContainerHeight} />
                    </div>
                </div>
            ) : null}
        </>
    )
}
