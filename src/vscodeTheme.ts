/**
 * https://github.com/uiwjs/react-codemirror/issues/409
 */
import { tags as t } from '@lezer/highlight'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { StyleSpec } from 'style-mod'

export const createTheme = ({ settings, styles }: CreateThemeOptions): any => {
    const themeOptions: Record<string, StyleSpec> = {
        '&': {
            backgroundColor: settings.background,
            color: settings.foreground,
        },
        '.cm-gutters': {},
    }

    if (settings.fontFamily) {
        themeOptions['&.cm-editor .cm-scroller'] = {
            fontFamily: settings.fontFamily,
        }
    }
    if (settings.gutterBackground) {
        themeOptions['.cm-gutters'].backgroundColor = settings.gutterBackground
    }
    if (settings.gutterForeground) {
        themeOptions['.cm-gutters'].color = settings.gutterForeground
    }
    if (settings.gutterBorder) {
        themeOptions['.cm-gutters'].borderRightColor = settings.gutterBorder
    }

    if (settings.caret) {
        themeOptions['.cm-content'] = {
            caretColor: settings.caret,
        }
        themeOptions['.cm-cursor, .cm-dropCursor'] = {
            borderLeftColor: settings.caret,
        }
    }
    const activeLineGutterStyle: StyleSpec = {}
    if (settings.gutterActiveForeground) {
        activeLineGutterStyle.color = settings.gutterActiveForeground
    }
    if (settings.lineHighlight) {
        themeOptions['.cm-activeLine'] = {
            backgroundColor: settings.lineHighlight,
        }
        activeLineGutterStyle.backgroundColor = settings.lineHighlight
    }
    themeOptions['.cm-activeLineGutter'] = activeLineGutterStyle

    if (settings.selection) {
        themeOptions[
            '&.cm-focused .cm-selectionBackground, & .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection'
        ] = {
            backgroundColor: settings.selection,
        }
    }
    if (settings.selectionMatch) {
        themeOptions['& .cm-selectionMatch'] = {
            backgroundColor: settings.selectionMatch,
        }
    }

    const highlightStyle = HighlightStyle.define(styles)
    const extension = [syntaxHighlighting(highlightStyle)]

    return { themeOptions, extension }

    return extension
}

interface CreateThemeOptions {
    theme?: any
    settings?: any
    styles?: any
}

export function vscodeDarkInit(options?: CreateThemeOptions) {
    const { theme = 'dark', settings = {}, styles = [] } = options || {}
    const { themeOptions, extension } = createTheme({
        theme: theme,
        settings: {
            background: '#1e1e1e',
            foreground: 'white',
            caret: '#c6c6c6',
            selection: '#264f78f9',
            selectionMatch: '#b0c6f345',
            lineHighlight: '#ffffff0f',
            gutterBackground: '#1e1e1e',
            gutterForeground: '#838383',
            gutterActiveForeground: '#fff',
            fontFamily:
                'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace',
            ...settings,
        },
        // TODO - determine the tagnames for all nodes and use that to style the editor
        styles: [
            {
                tag: [
                    t.keyword,
                    t.operatorKeyword,
                    t.modifier,
                    t.color,
                    t.constant(t.name),
                    t.standard(t.name),
                    t.standard(t.tagName),
                    t.special(t.brace),
                    t.atom,
                    t.bool,
                    t.special(t.variableName),
                ],
                color: '#569cd6',
            },
            {
                tag: [
                    t.controlKeyword,
                    t.moduleKeyword,
                    t.processingInstruction,
                ],
                color: '#c586c0',
            },
            {
                tag: [
                    t.name,
                    t.deleted,
                    t.character,
                    t.macroName,
                    t.propertyName,
                    t.variableName,
                    t.labelName,
                    t.definition(t.name),
                ],
                color: '#9cdcfe',
            },
            { tag: t.heading, fontWeight: 'bold', color: '#9cdcfe' },
            {
                tag: [
                    t.typeName,
                    t.className,
                    t.tagName,
                    t.number,
                    t.changed,
                    t.annotation,
                    t.self,
                    t.namespace,
                ],
                color: '#4ec9b0',
            },
            {
                tag: [t.function(t.variableName), t.function(t.propertyName)],
                color: '#dcdcaa',
            },
            { tag: [t.number], color: '#b5cea8' },
            {
                tag: [
                    t.operator,
                    t.punctuation,
                    t.separator,
                    t.url,
                    t.escape,
                    t.regexp,
                ],
                color: '#d4d4d4',
            },
            {
                tag: [t.regexp],
                color: '#d16969',
            },
            {
                tag: [
                    t.special(t.string),
                    // t.processingInstruction,
                    t.string,
                    t.inserted,
                ],
                color: '#ce9178',
            },
            { tag: [t.angleBracket], color: '#808080' },
            { tag: t.strong, fontWeight: 'bold' },
            { tag: t.emphasis, fontStyle: 'italic' },
            { tag: t.strikethrough, textDecoration: 'line-through' },
            { tag: [t.meta, t.comment], color: '#6a9955' },
            { tag: t.link, color: '#6a9955', textDecoration: 'underline' },
            { tag: t.invalid, color: '#ff0000' },
            ...styles,
        ],
    })

    // themeOptions['&']['lineHeight'] = '5';

    const themeExtension = EditorView.theme(themeOptions, {
        dark: theme === 'dark',
    })
    extension.push(themeExtension)

    return extension
}

export const vscodeDark = vscodeDarkInit()
