import React, {
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import cx from 'classnames'
import { ActionTips, Tip } from '../app/constants'
import {
    CodeBlock as CodeBlockType,
    CodeSymbolType,
    Message,
} from '../features/window/state'
import { faArrowUp, faClose } from '@fortawesome/pro-regular-svg-icons'
import { getIconElement } from '../components/filetree'
import * as gs from '../features/globalSlice'

import {
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    lineNumbers,
} from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { languages } from '@codemirror/language-data'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { syntaxBundle } from '../features/extensions/syntax'
import {
    getCurrentFilePath,
    getFile,
    getFilePath,
    getFolderPath,
} from '../features/selectors'
import { ContextBuilder } from '../features/chat/context'

import * as csel from '../features/chat/chatSelectors'

import { removeBeginningAndEndingLineBreaks } from '../utils'
import ReactMarkdown from 'react-markdown'

import { diffExtension } from '../features/extensions/diff'
import * as cs from '../features/chat/chatSlice'
import * as ct from '../features/chat/chatThunks'

import { vscodeDark } from '../vscodeTheme'
import { vim } from './codemirror-vim'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/sharp-solid-svg-icons'

import ReactTextareaAutocomplete from '@webscopeio/react-textarea-autocomplete'

import Modal from 'react-modal'

export function PreBlock({ children }: { children: ReactNode | ReactNode[] }) {
    function getResult(child: ReactNode) {
        if (React.isValidElement(child)) {
            if (child.props.className) {
                return (
                    <CodeBlock className={child.props.className}>
                        {child.props.children}
                    </CodeBlock>
                )
            } else {
                return (
                    <CodeBlock className="language-plaintext">
                        {child.props.children}
                    </CodeBlock>
                )
            }
        }
    }
    if (Array.isArray(children)) {
        return <>{children.map(getResult)}</>
    } else {
        return <>{getResult(children)}</>
    }
}

export function CodeBlock({
    children,
    className = '',
    startLine = null,
    setDiffArgs = null,
    isEditable = false,
    copyable = true,
}: {
    className?: string
    children: ReactNode | ReactNode[]
    startLine?: number | null
    setDiffArgs?: any
    isEditable?: boolean
    copyable?: boolean
}) {
    // Get child that is code

    // Extract the language name from the className
    const dispatch = useAppDispatch()
    const [codeButton, setCodeButton] = useState(false)
    let language: string

    if (children == null) {
        return <> </>
    } else if (Array.isArray(children)) {
        children = children[0]
    }

    if (className == '') {
        language = 'plaintext'
    } else {
        language = className.replace('language-', '')
    }
    const ref = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const [blockStarted, setBlockStarted] = useState(false)

    useEffect(() => {
        const startBlock = async () => {
            if (ref.current) {
                // Find the language mode from the Codemirror language data
                const langPackage = languages.find(
                    (lang) => lang.name.toLowerCase() == language.toLowerCase()
                )
                let extension
                if (langPackage == null) {
                    extension = []
                } else {
                    extension = await langPackage.load()
                }
                // Create the editor state with the code value, language mode, and theme
                const toset = removeBeginningAndEndingLineBreaks(
                    (children as string).trimEnd()
                )
                const state = EditorState.create({
                    // doc: (children as string).trim(),
                    doc: toset,
                    extensions: [
                        diffExtension,
                        startLine == null
                            ? []
                            : lineNumbers({
                                  formatNumber: (
                                      n: number,
                                      state: EditorState
                                  ) => String(n + startLine),
                              }),
                        EditorView.editable.of(isEditable),
                        isEditable
                            ? [
                                  vim(),
                                  highlightActiveLine(),
                                  highlightActiveLineGutter(),
                              ]
                            : [],
                        await syntaxBundle(`text.${language}`),
                        extension,
                        vscodeDark,
                        EditorView.lineWrapping,
                    ],
                })

                // Create the editor view and attach it to the ref
                const view = new EditorView({
                    state,
                    parent: ref.current,
                })
                viewRef.current = view

                // Dont think this is used, but idk
                // if (setDiffArgs != null) {
                //     setDiff(
                //         {
                //             origText: view.state.doc,
                //             diffId: '1',
                //             ...setDiffArgs,
                //         },
                //         true
                //     )(view)
                // }

                // Return a cleanup function to destroy the view
                return () => view.destroy()
            }
        }
        if (className != '' && viewRef.current == null) {
            setCodeButton(true)
            startBlock()
            setBlockStarted(true)
        } else if (children !== '' && !blockStarted) {
            setCodeButton(false)
            // append a code span to div ref
            const codeSpan = document.createElement('span')
            codeSpan.className = 'code__span'
            codeSpan.innerText = removeBeginningAndEndingLineBreaks(
                children as string
            )
            ref.current?.appendChild(codeSpan)
        }
    }, [className, setDiffArgs])

    useEffect(() => {
        if (viewRef.current) {
            viewRef.current.dispatch({
                changes: {
                    from: 0,
                    to: viewRef.current.state.doc.length,
                    insert: children as string,
                },
            })
        }
    }, [children])
    // Return a div element with the ref
    if (!codeButton || !copyable) {
        if (className == '') return <div className="codeblock" ref={ref}></div>
        else return <div className="codeblock result-codeblock" ref={ref}></div>
    } else {
        return (
            <>
                <div className="codeblockwrapper">
                    <button
                        className="copyButton"
                        onClick={() => {
                            if (viewRef.current) {
                                navigator.clipboard.writeText(
                                    viewRef.current.state.doc.toString()
                                )
                            }
                        }}
                    >
                        <FontAwesomeIcon icon={faCopy} />
                    </button>
                    <div
                        className="codeblock display_text_wrapping"
                        ref={ref}
                    ></div>
                </div>
            </>
        )
    }
}

export function CommandBarActionTips(props: {
    tips: Tip[]
    align?: 'left' | 'right'
}) {
    return (
        <div
            className={cx('flex space-x-2', {
                'justify-start': props.align ?? 'left' === 'left',
                'justify-end': props.align === 'right',
            })}
        >
            {props.tips.map(([name, tip, icon, callback]) => (
                <div
                    key={`${name}-${tip}`}
                    className="text-neutral-400 text-xs my-1 history-tip-icon-container"
                    onClick={(e) => {
                        e.preventDefault()
                        callback()
                    }}
                >
                    <FontAwesomeIcon className="history-tip-icon" icon={icon} />
                </div>
            ))}
        </div>
    )
}

export function ChatPopup() {
    const dispatch = useAppDispatch()
    const isGenerating = useAppSelector<boolean>(
        (state) => state.chatState.generating
    )
    const isChatOpen = useAppSelector<boolean>(csel.isChatOpen)
    const isChatHistoryOpen = useAppSelector<boolean>(csel.isChatHistoryOpen)

    const messages = useAppSelector(csel.getCurrentConversationMessages())
    const filePath = useAppSelector(getCurrentFilePath)

    const commandBoxRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isGenerating && commandBoxRef) {
            setTimeout(() => {
                commandBoxRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
        }
    }, [isGenerating])

    const onApply = () => {
        dispatch(ct.pressAICommand('k'))
        dispatch(cs.setCurrentDraftMessage('Make the change'))
        dispatch(ct.submitCommandBar(null))
    }
    // get index for last bot message
    let lastBotMessageIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].sender === 'bot') {
            lastBotMessageIndex = i
        }
    }
    const markdownPopups = Object.entries(messages).map(([index, message]) => (
        <MarkdownPopup
            key={index}
            message={message}
            dismissed={!isChatOpen}
            last={parseInt(index) == lastBotMessageIndex}
            onApply={onApply}
        />
    ))

    function close() {
        dispatch(cs.interruptGeneration(null))
        dispatch(cs.setChatOpen(false))
    }

    const handleSelectHistory = (id: string) => {
        dispatch(cs.setCurrentConversation(id))
        dispatch(cs.setChatOpen(true))
    }

    const handleCloseHistory = () => {
        dispatch(cs.toggleChatHistory())
    }

    const commandBarActionTips = isChatHistoryOpen
        ? [ActionTips.CLOSE]
        : [ActionTips.HISTORY, ActionTips.CLOSE]

    function handleMouseDown() {
        if (document.activeElement) {
            ;(document.activeElement as HTMLElement).blur()
        }
    }
    return (
        <>
            {isChatOpen && (
                <div
                    className="chatpopup flex"
                    onMouseDown={handleMouseDown}
                    onKeyDown={(e) => {
                        if (e.metaKey) {
                            if (e.key === 'k') {
                                dispatch(ct.pressAICommand('k'))
                            }
                        }
                    }}
                >
                    {/* Subtle padding to separate content from scroll bar*/}
                    <div>
                        <div className="markdownpopup__dismiss h-8 flex flex-col mt-3  items-center">
                            <CommandBarActionTips tips={commandBarActionTips} />
                        </div>
                        <div className="chatpopup__content  px-4 overflow-auto ">
                            <div className="flex flex-col space-y-2">
                                {markdownPopups}
                            </div>
                            <div
                                className={cx('my-4', {
                                    'opacity-100': !isGenerating,
                                    'opacity-0': isGenerating,
                                })}
                                ref={commandBoxRef}
                            >
                                {!isGenerating && (
                                    <CommandBar parentCaller={'chat'} />
                                )}
                            </div>
                        </div>
                    </div>
                    {isChatHistoryOpen && (
                        <ChatHistory onSelect={handleSelectHistory} />
                    )}
                </div>
            )}
        </>
    )
}

export function MarkdownPopup({
    message,
    dismissed,
    last,
    onApply,
}: {
    message: Message
    dismissed: boolean
    last: boolean
    onApply: () => void
}) {
    // const lastBotMessage = useAppSelector(csel.getLastMarkdownMessage);
    const reactMarkdownRef = useRef<HTMLDivElement>(null)

    // Replace all occurrences of "/path/to/file.extension\n" with "file.extension\n"
    const replacePathWithFilename = (text: string) => {
        return text.replace(/```\/[\w/]+\/\w+\.(\w+)\n/g, '```$1\n')
    }

    const formattedMessage = useMemo(() => {
        return replacePathWithFilename(message.message)
    }, [message.message])

    useEffect(() => {
        if (message?.sender == 'bot' && message.type === 'markdown') {
            // setDismissed(false)
            if (reactMarkdownRef.current) {
                const elem = reactMarkdownRef.current
                if (elem.children) {
                    const lastChild = elem.children[elem.children.length - 1]
                    if (lastChild) {
                        lastChild?.scrollIntoView(false)
                    }
                }
            }
        } else if (message?.sender == 'user') {
            // setDismissed(false);
            if (reactMarkdownRef.current) {
                const elem = reactMarkdownRef.current
                if (elem.children) {
                    const lastChild = elem.children[elem.children.length - 1]
                    if (lastChild) {
                        lastChild?.scrollIntoView(false)
                    }
                }
            }
        }
    }, [message])

    if (message.message.trim() == '') {
        return <></>
    }
    const className = message?.sender == 'user' ? 'userpopup' : 'markdownpopup'
    //
    return (
        <>
            {((message?.sender == 'bot' && message.type === 'markdown') ||
                message?.sender == 'user') &&
                !dismissed && (
                    <div className={cx(className, 'px-6 py-4 rounded-lg')}>
                        <div
                            className="markdownpopup__content"
                            ref={reactMarkdownRef}
                        >
                            {/*                             <Markdown
                                options={{
                                    overrides: {
                                        a: {
                                            component: CustomLink,
                                        },
                                        pre: {
                                            component: PreBlock,
                                        },
                                        code: {
                                            component: CodeBlock,
                                        } 
                                    }
                                }}
                            >
                                {formattedMessage}
                            </Markdown> */}
                            <ReactMarkdown
                                components={{
                                    pre: PreBlock,
                                    code: CodeBlock,
                                    a: CustomLink,
                                }}
                            >
                                {formattedMessage}
                            </ReactMarkdown>
                        </div>
                        <div className={'apply-button-holder'}>
                            {/*                             {last && (
                                <button
                                    className="apply-button"
                                    onClick={onApply}
                                >
                                    Attempt Change
                                </button>
                            )} */}
                        </div>
                    </div>
                )}
        </>
    )
}
const CustomLink = ({ children, href, ...props }: any) => {
    return (
        <a href={href} target="_blank">
            {children}
        </a>
    )
}

function CodeBlockLink({
    index,
    codeBlock,
}: {
    index: number
    codeBlock: CodeBlockType
}) {
    const dispatch = useAppDispatch()
    const currentFile = useAppSelector(getFile(codeBlock.fileId))
    const filePath = useAppSelector(getFilePath(codeBlock.fileId))
    const folderPath = useAppSelector(getFolderPath(currentFile.parentFolderId))
    const iconElement = getIconElement(currentFile.name)
    return (
        <div
            className="commandBar__codelink"
            onClick={() => {
                dispatch(
                    gs.openFile({
                        filePath: filePath,
                        selectionRegions: [
                            {
                                start: {
                                    line: codeBlock.startLine,
                                    character: 0,
                                },
                                end: { line: codeBlock.endLine, character: 0 },
                            },
                        ],
                    })
                )
            }}
        >
            <div className="file__line file__no_highlight">
                <div className="file__icon">{iconElement}</div>
                <div className="file__name">{currentFile.name}</div>
                <div className="file__path">{folderPath}</div>
                <div className="file__path">
                    Lines {codeBlock.startLine} - {codeBlock.endLine}
                </div>
                <div
                    className="file__close_button"
                    onClick={(e: any) => {
                        e.stopPropagation()
                        dispatch(cs.removeCodeBlock(index))
                    }}
                >
                    <FontAwesomeIcon icon={faClose} />
                </div>
            </div>
        </div>
    )
}

const Item = ({
    entity: { name, type, summary, path, startIndex, endIndex },
}: {
    entity: {
        name: string
        type: CodeSymbolType
        summary: string
        path: string
        startIndex: number
        endIndex: number
    }
}) => {
    const relativePath = path.slice(2)
    const fileIcon = getIconElement(relativePath)

    return (
        <>
            {/* Tailwind css for making the background white when selected */}
            <div className="file__line ">
                <div className="file__icon">{fileIcon}</div>
                <div className="file__name">
                    {name.slice(0, startIndex)}
                    <mark>{name.slice(startIndex, endIndex)}</mark>
                    {name.slice(endIndex)}
                </div>
                <div className="file__path">{relativePath}</div>
            </div>
            <div className="truncate">
                <CodeBlock className="language-python" copyable={false}>
                    {summary}
                </CodeBlock>
            </div>
        </>
    )
}

const Loading = ({ data }: { data: any }) => <div>Loading</div>

export function CommandBarInner({ autofocus }: { autofocus: boolean }) {
    const dispatch = useAppDispatch()
    const currentDraft = useAppSelector(csel.getCurrentDraftMessage)
    const repoId = useAppSelector((state) => state.global.repoId)
    const textareaRef = useRef<{ value: HTMLTextAreaElement | null }>({
        value: null,
    })
    const dummyRef = useRef<
        ReactTextareaAutocomplete<{
            name: string
            type: CodeSymbolType
            path: string
            summary: string
            startIndex: number
            endIndex: number
        }>
    >(null)

    const getMsgType = useAppSelector(csel.getMsgType)
    let placeholder = '...'
    if (getMsgType == 'edit') {
        placeholder = 'Instructions for editing selection...'
    } else if (getMsgType == 'freeform') {
        placeholder = 'Chat about the current file/selection...'
    } else if (getMsgType == 'generate') {
        placeholder = 'Instructions for code to generate...'
    } else if (getMsgType == 'chat_edit') {
        placeholder = 'Instructions for editing the current file...'
    } else {
        // TODO - this case should not exist
        placeholder = 'Chat about the current file/selection...'
    }

    const builder = useRef<ContextBuilder>()

    const getCompletions = useCallback<
        (text: string) => Promise<
            {
                name: string
                type: CodeSymbolType
                path: string
                summary: string
                startIndex: number
                endIndex: number
            }[]
        >
    >(async (text: string) => {
        return (await builder.current?.getCompletion(text, [])) || []
    }, [])

    useEffect(() => {
        if (repoId) {
            builder.current = new ContextBuilder(repoId)
        }
    }, [repoId])

    // const draftMessage = useAppSelector(
    //     (state) => state.chatState.draftMessages[converstationId]
    // )
    // const commandBarLinks =
    //     draftMessage?.otherCodeBlocks.map((codeBlock, i) => {
    //         return <CodeBlockLink key={i} index={i} codeBlock={codeBlock} />
    //     }) ?? []

    return (
        <ReactTextareaAutocomplete
            className="commandBar__input"
            placeholder={placeholder}
            loadingComponent={Loading}
            scrollToItem={(container, item) => {
                if (item) {
                    item.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                }
            }}
            ref={dummyRef}
            rows={1}
            trigger={{
                '`': {
                    dataProvider: async (token) => {
                        return getCompletions(token)
                        // return emoji(token)
                        //   .slice(0, 10)
                        //   .map(({ name, char }) => ({ name, char }));
                    },
                    component: Item,
                    output: (item, trigger) => {
                        return (
                            '<|START_SPECIAL|>' +
                            JSON.stringify(item) +
                            '<|END_SPECIAL|>'
                        )
                    },
                },
            }}
            containerStyle={{ width: '100%', maxHeight: '80' }}
            dropdownStyle={{
                width: '100%',
                maxHeight: '30vh',
                overflowY: 'auto',
            }}
            value={currentDraft.message}
            autoFocus={autofocus}
            onChange={(e) => {
                if (e.target.value.includes('<|START_SPECIAL|>')) {
                    const start =
                        e.target.value.indexOf('<|START_SPECIAL|>') +
                        '<|START_SPECIAL|>'.length
                    const end = e.target.value.indexOf('<|END_SPECIAL|>')

                    const special = e.target.value.slice(start, end)
                    const item = JSON.parse(special)
                    dispatch(
                        cs.addSymbolToMessage({
                            name: item.name,
                            fileName: item.path,
                            type: item.type,
                        })
                    )
                    // Change e.target.value to be the text before the special
                    // and then add the special to the message
                    e.target.value =
                        e.target.value.slice(
                            0,
                            start - '<|START_SPECIAL|>'.length
                        ) +
                        '`' +
                        item.name +
                        '`' +
                        e.target.value.slice(end + '<|END_SPECIAL|>'.length)
                    //return
                }
                textareaRef.current.value!.style.height = 'auto'
                textareaRef.current.value!.style.height =
                    textareaRef.current.value!.scrollHeight + 'px'
                //getCompletions(e.target.value);
                dispatch(cs.setCurrentDraftMessage(e.target.value))
            }}
            // ref = {textareaRef}
            innerRef={(ref) => void (textareaRef.current.value = ref)}
            onKeyDown={(e) => {
                /**
                 *  问题 兼容中文输入法时的冲突问题，中文输入法时enter键对应keycode是229，中文输入法关闭的时候keycode为13，所以增加一个keycode为13的条件即能解决此问题
                 *  修改人：方晓
                 *  公司：神策数据
                 *  修改时间：2023年4月5号
                 */
                if (!e.shiftKey && e.key === 'Enter' && e.keyCode == 13) {
                    // Don't submit an empty prompt
                    if (textareaRef.current.value!.value.trim().length > 0) {
                        dispatch(ct.submitCommandBar(null))
                        e.preventDefault()
                    }
                }
                // if up arrow and control key
                if (e.keyCode == 38 && e.ctrlKey) {
                    dispatch(cs.moveCommandBarHistory('up'))
                    e.preventDefault()
                }
                if (e.keyCode == 40 && e.ctrlKey) {
                    dispatch(cs.moveCommandBarHistory('down'))
                    e.preventDefault()
                }
                // if command j
                if (e.keyCode == 74 && e.metaKey) {
                    dispatch(cs.abortCommandBar())
                }
                // if command k
                if ((e.keyCode == 75 || e.keyCode == 76) && e.metaKey) {
                    dispatch(cs.abortCommandBar())
                }
                // if command z
                if (e.keyCode == 90 && e.metaKey) {
                    dispatch(cs.abortCommandBar())
                }
            }}
        />
    )
}

function formatPromptTime(sentAt: number): string {
    const date = new Date(sentAt)
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'pm' : 'am'
    const formattedHours = hours % 12 ? 12 : hours % 12
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes
    return `${formattedHours}:${formattedMinutes}${ampm}`
}

function formatPromptPreview(prompt: string): string {
    const maxLength = 38
    const noNewlines = prompt.replace(/(\r\n|\n|\r)/gm, '')
    // const truncated =
    //     noNewlines.length > maxLength
    //         ? noNewlines.slice(0, maxLength).trim() + '...'
    //         : noNewlines
    // return `"${truncated}"`
    // return `"${noNewlines}"`
    return noNewlines
}

function ChatHistory(props: {
    onSelect?: (id: string) => void
    onClose?: () => void
}) {
    const conversationIds = useAppSelector(csel.getConversationIds)
    const conversationPrompts = useAppSelector(
        csel.getConversationPrompts(conversationIds, 'reverse')
    )

    return (
        <div className="flex flex-col items-center w-80 select-none">
            <button className="w-full" onClick={props.onClose}>
                <CommandBarActionTips
                    align="right"
                    tips={[ActionTips.CLOSE_HISTORY]}
                />
            </button>
            <div className="flex flex-col w-full items-center space-y-1 mt-1 overflow-auto">
                {conversationPrompts.map((msg) => {
                    return (
                        <button
                            key={msg.conversationId}
                            className="w-full bg-neutral-600 rounded-sm px-4 py-2"
                            onClick={() => props.onSelect?.(msg.conversationId)}
                        >
                            <div
                                className={
                                    'flex justify-between whitespace-nowrap items-center'
                                }
                            >
                                <span className="text-neutral-300 text-base customEllipsis">
                                    {formatPromptPreview(msg.message)}
                                </span>
                                <span className="text-neutral-400 text-base">
                                    {formatPromptTime(msg.sentAt)}
                                </span>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export function CommandBar({
    parentCaller,
}: {
    parentCaller: 'chat' | 'commandBar'
}) {
    const dispatch = useAppDispatch()

    const customStyles = {
        overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            zIndex: 10000,
        },
        content: {
            padding: 'none',
            bottom: 'none',
            background: 'none',
            border: 'none',
            marginLeft: 'auto',
            marginRight: 'auto',
            top: '100px',
            width: '600px',
            maxWidth: '100vw',
            left: '50%',
            right: 'none',
            transform: 'translateX(-50%)',
        },
    }

    const commandBarOpen = useAppSelector(csel.getIsCommandBarOpen)
    const isChatHistoryAvailable = useAppSelector(
        csel.getIsChatHistoryAvailable
    )

    return (
        <>
            {parentCaller == 'commandBar' ? (
                <Modal
                    isOpen={commandBarOpen}
                    onRequestClose={() => {
                        dispatch(cs.abortCommandBar())
                    }}
                    style={customStyles}
                >
                    <div className="tipArea">
                        Previous
                        <div className="tipKeyCommand">
                            Ctrl+Shift+
                            <FontAwesomeIcon icon={faArrowUp} />
                        </div>
                    </div>
                    <div className="commandBar__container">
                        <div className="commandBar">
                            <div className="commandBar__input_container">
                                <CommandBarInner autofocus={true} />
                            </div>
                        </div>
                    </div>
                </Modal>
            ) : (
                <div className="commandBar__container">
                    <div className="commandBar">
                        <div className="commandBar__input_container">
                            <CommandBarInner autofocus={false} />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
