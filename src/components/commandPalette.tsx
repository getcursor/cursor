import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnyAction, Dispatch } from '@reduxjs/toolkit'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import cx from 'classnames'
import {
    openRemotePopup,
    openTerminal,
    splitCurrentPane,
} from '../features/globalSlice'
import { HoverState } from '../features/window/state'
import {
    openFileTree,
    openSearch,
    triggerFileSearch,
    untriggerAICommandPalette,
    untriggerCommandPalette,
} from '../features/tools/toolSlice'
import { toggleSettings } from '../features/settings/settingsSlice'
import {
    aiCommandPaletteTriggeredSelector,
    commandPaletteTriggeredSelector,
} from '../features/tools/toolSelectors'
import { Combobox } from '@headlessui/react'
import { toggleFeedback } from '../features/logging/loggingSlice'
import { selectFocusedTabId } from '../features/selectors'
import { getViewId } from '../features/codemirror/codemirrorSelectors'
import { getCodeMirrorView } from '../features/codemirror/codemirrorSlice'
import { toggleChatHistory } from '../features/chat/chatSlice'
import { pressAICommand } from '../features/chat/chatThunks'

const commandKey = connector.PLATFORM_META_KEY + ''

type AICommandIds = 'edit' | 'generate' | 'freeform' | 'freeform_select'
type splitPaneCommandIds =
    | 'splitPaneRight'
    | 'splitPaneLeft'
    | 'splitPaneUp'
    | 'splitPaneDown'
type MainCommandIds =
    | 'terminal'
    | 'ssh'
    | 'chatHistory'
    | 'search'
    | 'searchFiles'
    | 'settings'
    | 'fileTree'
    | 'feedback'

type CommandIds = AICommandIds | splitPaneCommandIds | MainCommandIds

const otherCommandIds: CommandIds[] = [
    'splitPaneRight',
    'splitPaneLeft',
    'splitPaneUp',
    'splitPaneDown',
    // main commands
    'terminal',
    'ssh',
    'chatHistory',
    'search',
    'searchFiles',
    'settings',
    'fileTree',
    'feedback',
]

interface Command {
    id: CommandIds
    type: string
    name: string
    description: string
    hint?: string
    error?: string
    shortcut?: string[]
    action: (dispatch: Dispatch<AnyAction>) => void
}
interface AICommand extends Command {
    type: 'ai'
    hintFileOpen?: string
}

const aiCommands: { [key in AICommandIds]: AICommand } = {
    edit: {
        id: 'edit',
        type: 'ai',
        name: 'Edit Selection',
        description: 'Changes the highlighted code',
        hint: 'Changes the highlighted code',
        error: 'Try highlighting code',
        shortcut: [commandKey + 'K'],
        action: (dispatch: any) => {
            dispatch(pressAICommand('k'))
        },
    },
    generate: {
        id: 'generate',
        type: 'ai',
        name: 'Generate',
        description: 'Writes new code',
        hint: 'Writes new code',
        error: 'Try opening a file',
        shortcut: [commandKey + 'K'],
        action: (dispatch: any) => {
            dispatch(pressAICommand('k'))
        },
    },
    freeform: {
        id: 'freeform',
        type: 'ai',
        name: 'Chat',
        hint: 'Answers questions about anything',
        hintFileOpen: 'Answers questions about the current file or anything',
        error: 'Try unhighlighting',
        description: 'Ask a question about the current file or anything',
        shortcut: [commandKey + 'L'],
        action: (dispatch: any) => {
            dispatch(pressAICommand('l'))
        },
    },
    freeform_select: {
        id: 'freeform_select',
        type: 'ai',
        name: 'Chat Selection',
        hint: 'Answers questions about the highlighted code',
        error: 'Try highlighting code',
        description: 'Ask a question about the current file',
        shortcut: [commandKey + 'L'],
        action: (dispatch: any) => {
            dispatch(pressAICommand('l'))
        },
    },
}

const splitPaneCommands: { [key in splitPaneCommandIds]: Command } = {
    splitPaneRight: {
        id: 'splitPaneRight',
        type: 'normal',
        name: 'View: Split Editor Right',
        description: 'Split the current pane to the right',
        action: (dispatch: any) => {
            dispatch(splitCurrentPane(HoverState.Right))
        },
    },
    splitPaneDown: {
        id: 'splitPaneDown',
        type: 'normal',
        name: 'View: Split Editor Down',
        description: 'Split the current pane downwards',
        action: (dispatch: any) => {
            dispatch(splitCurrentPane(HoverState.Bottom))
        },
    },
    splitPaneLeft: {
        id: 'splitPaneLeft',
        type: 'normal',
        name: 'View: Split Editor Left',
        description: 'Split the current pane to the left',
        action: (dispatch: any) => {
            dispatch(splitCurrentPane(HoverState.Left))
        },
    },
    splitPaneUp: {
        id: 'splitPaneUp',
        type: 'normal',
        name: 'View: Split Editor Up',
        description: 'Split the current pane upwards',
        action: (dispatch: any) => {
            dispatch(splitCurrentPane(HoverState.Top))
        },
    },
}

const mainCommands: { [key in MainCommandIds]: Command } = {
    terminal: {
        id: 'terminal',
        type: 'normal',
        name: 'Terminal',
        description: 'Open the integrated terminal',
        shortcut: ['Ctrl+`'],
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(openTerminal())
        },
    },
    ssh: {
        id: 'ssh',
        type: 'normal',
        name: 'Open SSH Folder',
        description: 'Open a remote folder over ssh',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(openRemotePopup())
        },
    },
    chatHistory: {
        id: 'chatHistory',
        type: 'normal',
        name: 'Open Chat History',
        description: 'Shows past chat conversations',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(toggleChatHistory())
        },
    },
    search: {
        id: 'search',
        type: 'normal',
        name: 'Search',
        description: 'Exact match/regex match search through the repo',
        shortcut: [commandKey + 'F'],
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(openSearch())
        },
    },
    searchFiles: {
        id: 'searchFiles',
        type: 'normal',
        name: 'Search Files',
        description: 'Search for a specific file',
        shortcut: [commandKey + 'P'],
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(triggerFileSearch())
        },
    },
    settings: {
        id: 'settings',
        type: 'normal',
        name: 'Settings',
        description: 'Open the settings menu',
        shortcut: [commandKey + 'H'],
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(toggleSettings())
        },
    },
    fileTree: {
        id: 'fileTree',
        type: 'normal',
        name: 'File Tree',
        description: 'Open the file tree',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(openFileTree())
        },
    },
    feedback: {
        id: 'feedback',
        type: 'normal',
        name: 'Feedback',
        description: 'Open the feedback form',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(toggleFeedback(null))
        },
    },
}
const allCommands = { ...aiCommands, ...splitPaneCommands, ...mainCommands }

export default function CommandPalettes() {
    const dispatch = useAppDispatch()
    const commandPaletteTriggeredFocus = useAppSelector(
        commandPaletteTriggeredSelector
    )
    const commandPaletteCloseTrigger = useCallback(
        () => dispatch(untriggerCommandPalette()),
        [dispatch]
    )

    const aiCommandPaletteTriggeredFocus = useAppSelector(
        aiCommandPaletteTriggeredSelector
    )
    const aiCommandPaletteCloseTrigger = useCallback(
        () => dispatch(untriggerAICommandPalette()),
        [dispatch]
    )

    return (
        <>
            <InnerCommandPalette
                openingTrigger={commandPaletteTriggeredFocus}
                aiOnly={false}
                closeTrigger={commandPaletteCloseTrigger}
            />
            <InnerCommandPalette
                openingTrigger={aiCommandPaletteTriggeredFocus}
                aiOnly={true}
                closeTrigger={aiCommandPaletteCloseTrigger}
            />
        </>
    )
}

interface AIResult {
    id: AICommandIds
    clickable: boolean
}

const useAIResults = () => {
    const tabId = useAppSelector(selectFocusedTabId)
    const viewId = useAppSelector(getViewId(tabId))
    const view = useMemo(() => viewId && getCodeMirrorView(viewId), [viewId])
    const selection = view && view.state.selection.main
    const [results, setResults] = useState<AIResult[]>([])

    useEffect(() => {
        if (!viewId) {
            setResults([
                { id: 'freeform', clickable: true },
                { id: 'edit', clickable: false },
                { id: 'generate', clickable: false },
                { id: 'freeform_select', clickable: false },
            ])
        } else {
            // This only needs to be done once when opened
            if (selection == null || selection == 0) {
                // In this case there is no tab open
                setResults([
                    { id: 'freeform', clickable: true },
                    { id: 'edit', clickable: false },
                    { id: 'generate', clickable: false },
                    { id: 'freeform_select', clickable: false },
                ])
            } else if (selection.from == selection.to) {
                // Tab open but no selection
                setResults([
                    { id: 'generate', clickable: true },
                    { id: 'freeform', clickable: true },
                    { id: 'edit', clickable: false },
                    { id: 'freeform_select', clickable: false },
                ])
            } else {
                // Tab open and selection
                setResults([
                    { id: 'edit', clickable: true },
                    { id: 'freeform_select', clickable: true },
                    { id: 'freeform', clickable: false },
                    { id: 'generate', clickable: false },
                ])
            }
        }
    }, [selection])

    return { results }
}

export function InnerCommandPalette({
    openingTrigger,
    closeTrigger,
    aiOnly,
}: {
    openingTrigger: boolean
    closeTrigger: () => void
    aiOnly?: boolean
}) {
    const [selected, setSelected] = useState<Command>()
    const [query, setQuery] = useState('')
    const [showing, setShowing] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const comboBtn = useRef<HTMLButtonElement>(null)
    const comboOptionsRef = useRef<HTMLUListElement>(null)

    const dispatch = useAppDispatch()

    const { results: aiResults } = useAIResults()
    const otherResults = useMemo(
        () =>
            aiOnly
                ? []
                : otherCommandIds.map((cid) => ({ id: cid, clickable: null })),
        [aiOnly]
    )

    const filteredResults = useMemo(() => {
        return [...aiResults, ...otherResults].filter((obj) => {
            return allCommands[obj.id].name
                .toLowerCase()
                .includes(query.toLowerCase())
        })
    }, [query, aiResults, otherResults])

    const comboRef = useRef<HTMLInputElement>(null)
    const fullComboRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (selectedIndex != 0 && selectedIndex >= filteredResults.length) {
            setSelectedIndex(filteredResults.length - 1)
        }
    }, [selectedIndex, filteredResults])

    useEffect(() => {
        if (openingTrigger) {
            setShowing(true)
            setSelectedIndex(0)
        } else {
            setShowing(false)
        }
    }, [openingTrigger])

    // effect for when becomes unfocused
    useEffect(() => {
        if (
            showing &&
            comboRef.current &&
            comboBtn.current &&
            fullComboRef.current
        ) {
            comboRef.current.focus()
            const handleBlur = (event: any) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    // This is here in order to prevent the command palette from
                    // immediately closing when the user clicks on a command
                    setTimeout(() => {
                        setShowing(false)
                        closeTrigger()
                        setQuery('')
                    }, 100)
                    // setShowing(false)
                } else {
                }
            }
            // click the hidden combo button
            // check if the combo button
            // Check comboOptionsRef
            if (!comboOptionsRef.current) comboBtn.current.click()

            comboRef.current.addEventListener('blur', handleBlur)
            return () => {
                comboRef.current?.removeEventListener('blur', handleBlur)
            }
        }
    }, [showing, comboRef.current, comboBtn.current])

    useEffect(() => {
        const dataTestId = `command-item-${selectedIndex}`
        const selected = comboOptionsRef?.current?.querySelector(
            `div[data-test-id="${dataTestId}"]`
        )
        if (selected) {
            selected?.scrollIntoView({
                behavior: 'smooth',
                block: 'end',
            })
        }
    }, [selectedIndex]) // Only run when selectedIndex changes

    const keyDownHandler = useCallback(
        (e: { key: string; preventDefault: () => void }) => {
            const lastIndex = filteredResults.length - 1
            if (e.key === 'Enter') {
                e.preventDefault()
                // click on the selected item
                if (filteredResults[selectedIndex]) {
                    closeTrigger()
                    allCommands[filteredResults[selectedIndex].id].action(
                        dispatch
                    )

                    setQuery('')
                }
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                let newIndex = 0
                if (selectedIndex < lastIndex) {
                    newIndex = Math.min(selectedIndex + 1, lastIndex)
                }
                setSelectedIndex(newIndex)
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                let newIndex = Math.max(0, selectedIndex - 1)
                if (selectedIndex <= 0) {
                    newIndex = lastIndex
                }
                setSelectedIndex(newIndex)
            } else if (e.key === 'Escape') {
                e.preventDefault()
                closeTrigger()
            }
        },
        [selectedIndex, filteredResults, dispatch, setQuery]
    )

    //
    //
    //
    return (
        <>
            {openingTrigger && (
                <div
                    className="absolute top-2.5 left-1/2 
                transform -translate-x-1/2 z-50"
                    style={{ display: showing ? 'block' : 'none' }}
                    id="fileSearchId"
                >
                    <Combobox value={selected} onChange={setSelected}>
                        <div ref={fullComboRef}>
                            <Combobox.Input
                                className="w-[36rem] bg-neutral-700 rounded-md 
                        text-white py-0.5 px-1 !outline-none"
                                placeholder="Enter command..."
                                displayValue={(command: Command) =>
                                    command.name
                                }
                                onChange={(event: any) => {
                                    setQuery(event.target.value)
                                    setSelectedIndex(0)
                                }}
                                onKeyDown={keyDownHandler}
                                ref={comboRef}
                            />
                            <Combobox.Button
                                className="hidden"
                                ref={comboBtn}
                            ></Combobox.Button>
                            <Combobox.Options
                                className="absolute mt-1 w-full 
                        overflow-auto rounded-md bg-neutral-800 z-[50] command_result_area"
                                ref={comboOptionsRef}
                            >
                                {filteredResults.map(
                                    (
                                        obj: {
                                            id: CommandIds
                                            clickable: boolean | null
                                        },
                                        index: number
                                    ) => {
                                        const command = allCommands[obj.id]
                                        const toret = null
                                        if (obj.clickable === null) {
                                            return (
                                                <CommandResult
                                                    key={command.id}
                                                    dataTestId={`command-item-${index}`}
                                                    command={command}
                                                    query={query}
                                                    closeTrigger={closeTrigger}
                                                    isSelected={
                                                        index == selectedIndex
                                                    }
                                                />
                                            )
                                        } else {
                                            return (
                                                <AICommandResult
                                                    key={command.id}
                                                    dataTestId={`command-item-${index}`}
                                                    command={command}
                                                    query={query}
                                                    isClickable={obj.clickable}
                                                    closeTrigger={closeTrigger}
                                                    isSelected={
                                                        index == selectedIndex
                                                    }
                                                />
                                            )
                                        }
                                    }
                                )}
                            </Combobox.Options>
                        </div>
                    </Combobox>
                </div>
            )}
        </>
    )
}

export function CommandResult({
    command,
    query,
    isSelected,
    closeTrigger,
    dataTestId,
}: {
    command: Command
    query: string
    isSelected: boolean
    dataTestId: string
    closeTrigger: () => void
}) {
    const dispatch = useAppDispatch()

    const executeCommand = useCallback(
        (e: { stopPropagation: () => void }) => {
            closeTrigger()
            command.action(dispatch)
            e.stopPropagation()
        },
        [dispatch, command]
    )

    return (
        <div
            className={cx('command_line', { selected_command: isSelected })}
            onClick={executeCommand}
            data-test-id={dataTestId}
        >
            <div className="file__name">
                {command.name
                    .split(new RegExp(`(${query})`, 'gi'))
                    .map((part, index) =>
                        part.toLowerCase() === query.toLowerCase() ? (
                            <mark key={index}>{part}</mark>
                        ) : (
                            <span key={index}>{part}</span>
                        )
                    )}
            </div>

            {command.hint && (
                <div className="text-xs text-white truncate flex items-end mb-0.5">
                    {command.hint}
                </div>
            )}
            <div className="file__shortcuts ml-auto whitespace-nowrap">
                {command.shortcut?.map((key, index) => (
                    <div
                        key={index}
                        className="shortcut__block rounded-md p-0.5 text-center text-sm text-gray-400 mr-1 inline-block min-w-[25px]"
                    >
                        {key}
                    </div>
                ))}
            </div>
        </div>
    )
}
export function AICommandResult({
    command,
    query,
    isClickable,
    isSelected,
    closeTrigger,
    dataTestId,
}: {
    command: Command
    query: string
    isClickable: boolean
    isSelected: boolean
    closeTrigger: () => void
    dataTestId: string
}) {
    const dispatch = useAppDispatch()
    const executeCommand = useCallback(
        (e: { stopPropagation: () => void }) => {
            if (isClickable) {
                closeTrigger()
                command.action(dispatch)
            }
            e.stopPropagation()
        },
        [dispatch, command]
    )

    const dummyCommand = () => null

    const clickable = isClickable

    return (
        <div
            className={cx(
                'command_line',
                'ai_command_result',
                { selected_command: isSelected },
                { disabled_command: !clickable }
            )}
            data-test-id={dataTestId}
            onMouseDown={clickable ? executeCommand : dummyCommand}
            // onClick={() =>
        >
            <div className={cx('file__name')}>
                {command.name
                    .split(new RegExp(`(${query})`, 'gi'))
                    .map((part, index) =>
                        part.toLowerCase() === query.toLowerCase() ? (
                            <mark key={index}>{part}</mark>
                        ) : (
                            <span key={index}>{part}</span>
                        )
                    )}
            </div>

            {clickable
                ? command.hint && (
                      <div className="file__path">{command.hint}</div>
                  )
                : command.error && (
                      <div className="file__path">{command.error}</div>
                  )}
            <div className="file__shortcuts ml-auto whitespace-nowrap">
                {command.shortcut?.map((key, index) => (
                    <div
                        key={index}
                        className="shortcut__block bg-gray-800 rounded-md p-0.5 text-center text-sm text-gray-400 mr-1 inline-block min-w-[25px]"
                    >
                        {key}
                    </div>
                ))}
            </div>
        </div>
    )
}
