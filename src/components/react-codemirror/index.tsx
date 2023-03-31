import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import {
    EditorState,
    EditorStateConfig,
    Extension,
    StateField,
    Transaction,
} from '@codemirror/state'
import { EditorView, ViewUpdate } from '@codemirror/view'
import { BasicSetupOptions } from './setup'
import { useCodeMirror } from './useCodeMirror'
import { Statistics } from './utils'

export * from './setup'
export * from './useCodeMirror'
export * from './utils'

export interface ReactCodeMirrorProps
    extends Omit<EditorStateConfig, 'doc' | 'extensions'>,
        Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'placeholder'> {
    viewKey: number
    /** value of the auto created model in the editor. */
    value?: string
    fileName?: string
    filePath?: string
    height?: string
    minHeight?: string
    maxHeight?: string
    width?: string
    minWidth?: string
    maxWidth?: string
    /** focus on the editor. */
    autoFocus?: boolean
    /** Enables a placeholder—a piece of example content to show when the editor is empty. */
    placeholder?: string | HTMLElement
    /**
     * `light` / `dark` / `Extension` Defaults to `light`.
     * @default light
     */
    theme?: 'light' | 'dark' | 'none' | Extension
    /**
     * Whether to optional basicSetup by default
     * @default true
     */
    basicSetup?: boolean | BasicSetupOptions
    /**
     * This disables editing of the editor content by the user.
     * @default true
     */
    editable?: boolean
    /**
     * This disables editing of the editor content by the user.
     * @default false
     */
    readOnly?: boolean
    /**
     * Whether to optional basicSetup by default
     * @default true
     */
    indentWithTab?: boolean
    /** Fired whenever a change occurs to the document. */
    onChange?(value: string, viewUpdate: ViewUpdate): void
    /** Some data on the statistics editor. */
    onStatistics?(data: Statistics): void
    /** Fired whenever any state change occurs within the editor, including non-document changes like lint results. */
    onUpdate?(viewUpdate: ViewUpdate): void
    onPostCreate?(view: EditorView, state: EditorState): void
    customDispatch?(view: EditorView, tr: Transaction): void
    /** The first time the editor executes the event. */
    onCreateEditor?(view: EditorView, state: EditorState): void
    /**
     * Extension values can be [provided](https://codemirror.net/6/docs/ref/#state.EditorStateConfig.extensions) when creating a state to attach various kinds of configuration and behavior information.
     * They can either be built-in extension-providing objects,
     * such as [state fields](https://codemirror.net/6/docs/ref/#state.StateField) or [facet providers](https://codemirror.net/6/docs/ref/#state.Facet.of),
     * or objects with an extension in its `extension` property. Extensions can be nested in arrays arbitrarily deep—they will be flattened when processed.
     */
    extensions?: Extension[]
    /**
     * If the view is going to be mounted in a shadow root or document other than the one held by the global variable document (the default), you should pass it here.
     * Originally from the [config of EditorView](https://codemirror.net/6/docs/ref/#view.EditorView.constructor%5Econfig.root)
     */
    root?: ShadowRoot | Document
    /**
     * Create a state from its JSON representation serialized with [toJSON](https://codemirror.net/docs/ref/#state.EditorState.toJSON) function
     */
    initialState?: {
        json: any
        fields?: Record<string, StateField<any>>
    }
    tabId: number
}

export interface ReactCodeMirrorRef {
    editor?: HTMLDivElement | null
    state?: EditorState
    view?: EditorView
}

export const ReactCodeMirror = forwardRef<
    ReactCodeMirrorRef,
    ReactCodeMirrorProps
>((props, ref) => {
    const {
        viewKey,
        className,
        value = '',
        selection,
        extensions = [],
        onChange,
        onStatistics,
        onCreateEditor,
        onUpdate,
        onPostCreate,
        customDispatch,
        autoFocus,
        theme = 'light',
        height,
        minHeight,
        maxHeight,
        width,
        minWidth,
        maxWidth,
        basicSetup,
        placeholder,
        indentWithTab,
        editable,
        readOnly,
        root,
        initialState,
        tabId,
        fileName,
        filePath,
        ...other
    } = props
    const editor = useRef<HTMLDivElement>(null)
    const { state, view, container, setContainer } = useCodeMirror({
        viewKey,
        container: editor.current,
        tabId,
        root,
        value,
        autoFocus,
        theme,
        height,
        minHeight,
        maxHeight,
        width,
        minWidth,
        maxWidth,
        basicSetup,
        placeholder,
        indentWithTab,
        editable,
        readOnly,
        selection,
        onChange,
        onStatistics,
        onCreateEditor,
        onUpdate,
        onPostCreate,
        customDispatch,
        extensions,
        initialState,
    })

    useImperativeHandle(
        ref,
        () => ({ editor: editor.current, state: state, view: view }),
        [editor, container, state, view]
    )

    // check type of value
    if (typeof value !== 'string') {
        throw new Error(`value must be typeof string but got ${typeof value}`)
    }

    const defaultClassNames =
        typeof theme === 'string' ? `cm-theme-${theme}` : 'cm-theme'

    function isImageFile(fileName: string): boolean {
        const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg']
        const extension = fileName.split('.').pop()?.toLowerCase()
        return extension !== undefined && imageExtensions.includes(extension)
    }

    const isImage = fileName && isImageFile(fileName)

    return (
        <>
            {isImage ? (
                <img
                    src={`file://${filePath}`}
                    alt={fileName}
                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
            ) : (
                <div
                    ref={editor}
                    className={`${defaultClassNames}${
                        className ? ` ${className}` : ''
                    }`}
                    {...other}
                ></div>
            )}
        </>
    )
})

ReactCodeMirror.displayName = 'CodeMirror'

export default ReactCodeMirror
