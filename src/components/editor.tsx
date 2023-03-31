// import keybinding and keymap
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorView, ViewUpdate } from '@codemirror/view'
import { vimStateField } from './codemirror-vim/index'
import { historyField } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { vscodeDark } from '../vscodeTheme'

import CodeMirror, { ReactCodeMirrorRef } from './react-codemirror/index'
import { throttleCallback } from './componentUtils'
import {
    getCachedTab,
    getFileContents,
    getFileIndentUnit,
    getFileName,
    getFilePath,
    getFileRenameName,
    getKeyListeners,
    getPageType,
    getPaneIsActive,
    getPendingTransactions,
    getRelativeFilePath,
    getTab,
} from '../features/selectors'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { CachedTab, ReduxTransaction, Tab } from '../features/window/state'
import {
    codeUpdate,
    editorCreated,
    scrollUpdate,
} from '../features/globalSlice'
import * as csel from '../features/chat/chatSelectors'

//import { useRenderDiffs} from './chat/hooks';
import { diagnosticsField, setDiagnostics } from '../features/linter/lint'
import {
    customDispatch,
    dontShowAnnotation,
    useDispatchHook,
} from './codemirrorHooks/dispatch'
import { getSettings } from '../features/settings/settingsSelectors'
import { useExtensions } from './codemirrorHooks/extensions'
import { useSetDiff } from './codemirrorHooks/diffHook'

export function getPrecedingLines(view: EditorView, numLines: number) {
    return view.state.doc.sliceString(0, view.state.selection.main.from)
    // const {startLinePos, endLinePos} = getPrecedingLinesPos(view, numLines);
    // const selectedText = view.state.doc.sliceString(startLinePos, endLinePos);
    // return selectedText;
}
export function getProcedingLines(view: EditorView) {
    return view.state.doc.sliceString(
        view.state.selection.main.to,
        view.state.doc.length
    )
    // const selection = view.state.selection.main;
    // const endLine = view.state.doc.lineAt(selection.from).number;
    // const endLinePos = view.state.doc.line(endLine).to;
    // const selectedText = view.state.doc.sliceString(selection.from, endLinePos);
    // return selectedText;
}

export function getSelectedPos(view: EditorView) {
    const selection = view.state.selection.main

    const startLine = view.state.doc.lineAt(selection.from).number
    const endLine = view.state.doc.lineAt(selection.to).number

    const startLinePos = view.state.doc.line(startLine).from
    const endLinePos = view.state.doc.line(endLine).to

    return { startLinePos, endLinePos }
}

export function getSelectedText(view: EditorView) {
    const selection = view.state.selection.main
    const { startLinePos, endLinePos } = getSelectedPos(view)
    const selectedText =
        selection.from == selection.to
            ? null
            : view.state.doc.sliceString(startLinePos, endLinePos)
    return selectedText
}

const STATE_FIELDS = {
    history: historyField,
    vim: vimStateField,
    diagnostics: diagnosticsField,
    // lint: lintState
}

interface EditorHookProps {
    cachedTab: CachedTab
    cachedContent: string
    isPaneActive: boolean
    isRenaming: string | null
    keyListeners: any
    fileName: string
    relativeFilePath: string
    filePath: string
    fileIndentUnit: string | undefined
    initialState: any
    tab: Tab
    readOnly: boolean
}
function useEditorHook({ tabId }: { tabId: number }): EditorHookProps {
    const tab = useAppSelector(getTab(tabId))
    const filePath = useAppSelector(getFilePath(tab.fileId))
    const relativeFilePath = useAppSelector(getRelativeFilePath(tab.fileId))
    const fileName = useAppSelector(getFileName(tab.fileId))
    const fileIndentUnit = useAppSelector(getFileIndentUnit(tab.fileId))
    const keyListeners = useAppSelector(getKeyListeners)

    // want to force a redraw when pane active changes so that we autofocus
    const isPaneActive = useAppSelector(getPaneIsActive(tab.paneId))
    const isRenaming = useAppSelector(getFileRenameName(tab.fileId))

    const cachedTab = useAppSelector(getCachedTab(tabId))
    const cachedContent = useAppSelector(getFileContents(tab.fileId))

    const readOnly = tab.isReadOnly

    const initialState = useMemo(() => {
        return cachedTab == null || cachedTab.initialEditorState == null
            ? null
            : ({
                  json: cachedTab.initialEditorState,
                  fields: STATE_FIELDS,
              } as any)
    }, [tabId])

    return {
        cachedTab,
        cachedContent,
        isPaneActive,
        isRenaming,
        keyListeners,
        fileName,
        relativeFilePath,
        filePath,
        fileIndentUnit,
        initialState,
        tab,
        readOnly,
    }
}
function usePrevious(value: ReactCodeMirrorRef) {
    const ref = useRef<ReactCodeMirrorRef>(value)
    useEffect(() => {
        ref.current = value
    })

    return ref
}

function usePreviousNumber(value: number) {
    const ref = useRef<number>(value)
    useEffect(() => {
        ref.current = value
    })
    return ref.current
}
const hashString = (str: string) => {
    let hash = 0
    if (str.length == 0) return hash
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32bit integer
    }
    return String(hash)
}

export default function Editor({ tabId }: { tabId: number }) {
    const dispatch = useAppDispatch()

    const editorRef = useRef<ReactCodeMirrorRef>({})

    const oldEditorRef = usePrevious(editorRef.current)
    const oldTabId = usePreviousNumber(tabId)
    const [justCreated, setJustCreated] = useState(false)
    const commandBarOpen = useAppSelector(csel.getIsCommandBarOpen)

    // const [origEditorState, setOrigEditorState] = useState<EditorState>()

    const settings = useAppSelector(getSettings)
    const textWrapping = settings.textWrapping == 'enabled'

    //const [seenDiffs, setSeenDiffs] = useState<any[]>([]);
    const transactions: ReduxTransaction[] = useAppSelector(
        getPendingTransactions(tabId)
    )

    const {
        cachedTab,
        cachedContent,
        isPaneActive,
        isRenaming,
        fileName,
        readOnly,
        filePath,
        relativeFilePath,
        initialState,
        tab,
    } = useEditorHook({ tabId })

    const isGenerating = useAppSelector(csel.getGenerating)
    const botMessage = useAppSelector(csel.getLastBotMessage)

    const fullReadOnly = useMemo(() => {
        return readOnly || (isGenerating && botMessage?.currentFile == filePath)
    }, [readOnly, isGenerating, botMessage?.currentFile, filePath])

    const extensions = useExtensions({
        editorRef,
        filePath,
        relativeFilePath,
        tab,
        justCreated,
        readOnly: fullReadOnly,
    })

    // Allows transactions to be flushed to the codemirror instance
    const transactionDispatcher = useDispatchHook({
        oldTabId,
        tabId,
        editorRef,
        transactions,
    })

    //const diffReadOnly = useRenderDiffs({editorRef, tabId});
    const lastBotMessage = useAppSelector(csel.getLastBotMessage)
    const lastUserMessage = useAppSelector(csel.getLastUserMessage)

    const updateRemoteState = () => {
        if (oldEditorRef.current?.view?.state != null && oldTabId != null) {
            const view = oldEditorRef.current.view
            dispatch(
                codeUpdate({
                    code: view.state.doc.toString(),
                    update: view.state.toJSON(STATE_FIELDS),
                    tabId: oldTabId,
                    canMarkNotSaved: false,
                })
            )
        }
    }

    useEffect(() => {
        if (!commandBarOpen && isPaneActive) {
            editorRef.current.view?.focus()
        }
    }, [commandBarOpen])

    useEffect(() => {
        if (oldTabId != tabId) {
            updateRemoteState()
        }
    }, [tabId])

    useEffect(() => {
        if (!isPaneActive) {
            // If the pane was just made inactive, we want to update the redux state of the
            // current contents
            updateRemoteState()
        }
    }, [isPaneActive])

    // useEffect on the last bot message
    useSetDiff({
        view: editorRef.current?.view,
        lastBotMessage,
        filePath,
    })

    return (
        <>
            <div
                className={`editor__container ${
                    textWrapping ? '' : 'no_text_wrapping'
                }`}
            >
                <CodeMirror
                    // Needs to be filePath otherwise opening another file with the same name, the
                    // editor will not change
                    tabId={tabId}
                    key={filePath}
                    viewKey={tab.paneId}
                    theme={vscodeDark}
                    ref={editorRef}
                    customDispatch={customDispatch}
                    autoFocus={isPaneActive && isRenaming == null}
                    className="window__editor"
                    height="100%"
                    onCreateEditor={(view: EditorView, state: EditorState) => {
                        setJustCreated((old) => !old)

                        if (cachedTab != null && cachedTab.scrollPos != null) {
                            view.dispatch({
                                effects: EditorView.scrollIntoView(
                                    cachedTab.scrollPos,
                                    {
                                        y: 'start',
                                        yMargin: 0,
                                    }
                                ),
                            })
                        } else {
                            view.dispatch({
                                effects: EditorView.scrollIntoView(0, {
                                    y: 'start',
                                    yMargin: 0,
                                }),
                            })
                        }
                        transactionDispatcher(view, transactions)
                        view.scrollDOM.addEventListener(
                            'scroll',
                            throttleCallback(() => {
                                dispatch(
                                    scrollUpdate({
                                        scrollPos: view.elementAtHeight(
                                            view.scrollDOM.scrollTop
                                        ).from,
                                        tabId: tabId,
                                    })
                                )
                            }, 400)
                        )
                        dispatch(editorCreated(tabId))

                        const diagnostics = view.state.field(diagnosticsField)
                        view.dispatch(setDiagnostics(view.state, diagnostics))
                    }}
                    onChange={throttleCallback(
                        (code: string, update: ViewUpdate) => {
                            const start = performance.now()
                            // do any of the transactiosn contain the dontshow annotation
                            const canMarkNotSaved = !update.transactions.some(
                                (t) => {
                                    return (
                                        t.annotation(dontShowAnnotation) !=
                                        undefined
                                    )
                                }
                            )
                            dispatch(
                                codeUpdate({
                                    code,
                                    update: update.state.toJSON(STATE_FIELDS),
                                    tabId: tabId,
                                    canMarkNotSaved,
                                })
                            )
                        },
                        100
                    )}
                    value={cachedContent}
                    fileName={fileName}
                    filePath={filePath}
                    extensions={extensions}
                    initialState={initialState}
                />
            </div>
        </>
    )
}

export function Page({ tid }: { tid: number }) {
    const pageType = useAppSelector(getPageType(tid))

    let page
    const randomId = String(Math.random())
    if (pageType == 'editor') {
        page = <Editor tabId={tid} />
    } else {
        throw new Error(`Invalid page type ${pageType}`)
    }
    return (
        <div className="window__editorcontainer">
            {page}
            <div className="cover-bar" />
        </div>
    )
}
