import { EditorView } from '@codemirror/view'

export const defaultLightThemeOption = EditorView.theme(
    {
        '&': {
            backgroundColor: '#fff',
        },
    },
    {
        dark: false,
    }
)
