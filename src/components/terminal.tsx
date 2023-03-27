import React, { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useAppSelector, useAppDispatch } from '../app/hooks'
import { FullState } from '../features/window/state'
import * as gs from '../features/globalSlice'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { throttleCallback } from './componentUtils'

export function XTermComponent({ height }: { height: number }) {
    const terminalRef = useRef<HTMLDivElement>(null)
    const terminal = useRef<Terminal | null>(null)
    const fitAddon = useRef<FitAddon>(new FitAddon())

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

        if (terminalRef.current) {
            terminal.current.open(terminalRef.current)
        }

        connector.terminalInto('\n')

        terminal.current.onData((e) => {
            connector.terminalInto(e)
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
            fitAddon.current.fit()
        }
    }, [height, terminal, fitAddon])

    return (
        <div
            className="terminalInnerContainer"
            ref={terminalRef}
            style={{ height: height + 'px' }}
        ></div>
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
                dispatch(gs.toggleTerminal(null))
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
                                    dispatch(gs.closeTerminal(null))
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
