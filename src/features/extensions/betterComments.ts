import {Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType} from "@codemirror/view"
import { Tag, getStyleTags, tags } from "@lezer/highlight";

import { RangeSetBuilder } from "@codemirror/state";
import { Tree } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";

class CommentsHighlighter {
    decorations: DecorationSet
    tree: Tree
    markCache: { [cls: string]: Decoration } = Object.create(null)

    constructor(view: EditorView) {
        this.tree = syntaxTree(view.state)
        this.decorations = this.buildDeco(view)
    }

    update(update: ViewUpdate) {
        const tree = syntaxTree(update.state)
        if (tree != this.tree || update.viewportChanged) {
            this.tree = tree
            this.decorations = this.buildDeco(update.view)
        }
    }

    buildDeco(_view: EditorView) {
        if (!this.tree.length) return Decoration.none

        const builder = new RangeSetBuilder<Decoration>()
        const cursor = this.tree.cursor()
        do {
            const tagData = getStyleTags(cursor.node)
            const tags = tagData?.tags?.map(getTagName);


            if(tags?.includes('lineComment')) {

                const { state } = _view
                const textContent = state.doc.sliceString(cursor.from, cursor.to)
                const className = colorClasses[textContent.slice(0, 3)] || colorClasses[textContent.slice(0, 6)]

                builder.add(cursor.from, cursor.to, Decoration.widget({ widget: new CommentWidget(textContent, className) }))
            }

        } while (cursor.next())
        return builder.finish()
    }
}

const colorClasses: Record<string, string> = {
    '//!': 'cm-betterComments-alert',
    '//?': 'cm-betterComments-question',
    '//TODO': 'cm-betterComments-todo',
    '//*': 'cm-betterComments-highlighted',
}

export function betterComments (isEnabled = false) { 
    if (!isEnabled) return []

    return [
        EditorView.baseTheme({
            ".cm-betterComments-lineComment": { color: "#6a9955" },
            ".cm-betterComments-highlighted": { color: "#98C379" },
            ".cm-betterComments-todo": { color: "#FF8C00" },
            ".cm-betterComments-question": { color: "#3498DB" },
            ".cm-betterComments-alert": { color: "#FF2D00" },
        }), 
        ViewPlugin.fromClass(CommentsHighlighter, {
            decorations: (v) => v.decorations,
        })
    ]
}

//! probably should be exported to a common folder
const getTagName = (tag: Tag) => {
    for (const key of Object.keys(tags)) {
        // Turn key to string
        const keyString = key.toString() as keyof typeof tags
        const currentTag = tags[keyString]

        if ('id' in currentTag && 'id' in tag) {
            if (currentTag.id === tag.id) {
                return keyString
            }
        }
    }
}

class CommentWidget extends WidgetType {
    constructor(
        private readonly textContent: string,
        private readonly className?: string
    ) {
        super()
    }


    toDOM() {
        const wrap = document.createElement('span')
        wrap.className = this.className || 'cm-comment cm-betterComments-lineComment'
        wrap.textContent = this.textContent
        return wrap
    }

    ignoreEvent(): boolean {
        return true
    }
}