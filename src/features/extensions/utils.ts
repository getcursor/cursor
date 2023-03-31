import { SyntaxNode, TreeCursor } from '@lezer/common'
import { store } from '../../app/store'
import { getCurrentTab, getFilePath, getFocusedTab, getTab } from '../selectors'
import { getTests, selectHasTests } from '../tests/testSelectors'
import { TestData } from '../tests/testSlice'
import { CommentFunction } from '../window/state'
import { API_ROOT } from '../../utils'
import { StateEffect } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { paneIdField } from './storePane'

export const reduxTransaction = StateEffect.define<{
    type: string
    payload: any
}>({})

const languagesToExtension = {
    python: ['py', 'pyi'],
    javascript: ['js', 'jsx', 'ts', 'tsx'],
    java: ['java'],
    c: ['c'],
    cpp: ['cpp', 'cc', 'cxx', 'c++', 'h', 'hpp', 'hh', 'hxx', 'h++'],
    go: ['go'],
    rust: ['rs'],
    ruby: ['rb'],
    php: ['php'],
    scala: ['scala'],
    kotlin: ['kt', 'kts'],
    swift: ['swift'],
    dart: ['dart'],
    r: ['r'],
    julia: ['jl'],
    haskell: ['hs'],
    html: ['html', 'htm'],
    css: ['css'],
    csharp: ['cs'],
    coffeescript: ['coffee'],
    clojure: ['clj'],
    bibtex: ['bib'],
    abap: ['abap'],
    bat: ['bat'],
    fsharp: ['fs', 'fsx'],
    elixir: ['ex', 'exs'],
    erlang: ['erl', 'hrl'],
    dockerfile: ['dockerfile'],
    handlebars: ['hbs'],
    ini: ['ini'],
    latex: ['tex'],
    less: ['less'],
    lua: ['lua'],
    makefile: ['mak'],
    markdown: ['md'],
    'objective-c': ['m'],
    'objective-cpp': ['mm'],
    perl: ['pl', 'pm', 'p6'],
    powershell: ['ps1'],
    jade: ['pug'],
    razor: ['cshtml'],
    scss: ['scss'],
    sass: ['sass'],
    shaderlab: ['shader'],
    shellscript: ['sh', 'bash'],
    sql: ['sql'],
    vb: ['vb'],
    xml: ['xml'],
    xsl: ['xsl'],
    yaml: ['yaml', 'yml'],
}

const extensions: { [key: string]: string } = {
    abap: 'abap',
    bat: 'bat',
    bib: 'bibtex',
    clj: 'clojure',
    coffee: 'coffeescript',
    c: 'c',
    h: 'c', // header files are also c
    cpp: 'cpp',
    cc: 'cpp',
    hpp: 'cpp', // Same for hpp
    cs: 'csharp',
    csproj: 'csharp',
    css: 'css',
    diff: 'diff',
    patch: 'diff', // patch files are also diff
    dart: 'dart',
    dockerfile: 'dockerfile',
    ex: 'elixir',
    exs: 'elixir',
    erl: 'erlang',
    hrl: 'erlang', // header files are also erlang
    fs: 'fsharp',
    fsx: 'fsharp',
    gitignore: 'gitignore',
    gitattributes: 'gitattributes',
    gitmodules: 'gitmodules',
    go: 'go',
    groovy: 'groovy',
    gradle: 'groovy', // gradle files are also groovy
    hbs: 'handlebars',
    html: 'html',
    htm: 'html', // htm files are also html
    ini: 'ini',
    java: 'java',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    tex: 'latex',
    less: 'less',
    lua: 'lua',
    mak: 'makefile',
    md: 'markdown',
    m: 'objective-c',
    mm: 'objective-cpp',
    pl: 'perl',
    pm: 'perl', // module files are also perl
    p6: 'perl6',
    php: 'php',
    ps1: 'powershell',
    pug: 'jade',
    py: 'python',
    r: 'r',
    cshtml: 'razor',
    rb: 'ruby',
    rs: 'rust',
    scss: 'scss',
    sass: 'sass',
    scala: 'scala',
    shader: 'shaderlab',
    sh: 'shellscript',
    bash: 'shellscript', // bash files are also shellscript
    sql: 'sql',
    swift: 'swift',
    ts: 'typescript',
    tsx: 'typescriptreact',
    vb: 'vb',
    xml: 'xml',
    xsl: 'xsl',
    yaml: 'yaml',
    yml: 'yaml', // yml files are also yaml
    sve: 'javascript',
    svelte: 'javascript',
}

export function getLanguageFromFilename(filename: string): string {
    const extension = filename.split('.').pop()
    if (extension) {
        return extensions[extension] || 'plaintext'
    }
    return 'plaintext'
}

export function getNamesAndBodies(cursor: TreeCursor, contents: string) {
    const results = [] as any
    let lastFrom = -1
    do {
        if (cursor.from < lastFrom) {
            break
        }
        lastFrom = cursor.from

        if (
            cursor != null &&
            cursor.from != null &&
            cursor.to != null &&
            [
                'MethodDeclaration',
                'FunctionDeclaration',
                'VariableDeclaration',
                'Property',
                'FunctionDefinition',
            ].includes(cursor.name)
        ) {
            const from = cursor.from
            const to = cursor.to
            const functionBody = contents.slice(from, to)

            // get the actual body of the function using Lezer
            let functionName = null
            do {
                // @ts-ignore
                if (
                    [
                        'VariableDefinition',
                        'PropertyDefinition',
                        'VariableName',
                    ].includes(cursor.name)
                ) {
                    functionName = contents.slice(cursor.from, cursor.to)
                    break
                }
            } while (cursor.next(true))

            if (functionName == null) continue

            const lines = functionBody.split('\n').length
            if (lines > 10) {
                results.push({
                    name: functionName,
                    body: functionBody,
                    from: from,
                })
            }
        }
    } while (cursor.next())
    return results
}

export function backTrack(node: SyntaxNode) {
    const iterator = {
        next() {
            // start with prev sybling and the when done go to parent
            if (node.prevSibling) {
                node = node.prevSibling
                return node
            }
            if (node.parent) {
                node = node.parent
                return node
            }
            return null
        },
    }
    return iterator
}

// backtrack until
// 'MethodDeclaration',
// 'FunctionDeclaration',
// 'VariableDeclaration',
// 'Property',
// 'FunctionDefinition',
export function findDeclarationGivenDefinition(node: SyntaxNode) {
    const iterator = backTrack(node)
    let currentNode = iterator.next()
    while (currentNode) {
        if (
            [
                'MethodDeclaration',
                'FunctionDeclaration',
                'VariableDeclaration',
                'Property',
                'FunctionDefinition',
            ].includes(currentNode.name)
        ) {
            return currentNode
        }
        currentNode = iterator.next()
    }
    return null
}

export async function getCommentSingle(data: {
    filename: string
    functionBody: string
    functionName: string
}) {
    const response = await fetch(`${API_ROOT}/commentSingle`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        //credentials: 'include',
        body: JSON.stringify(data),
    })

    return (await response.json()) as { comment: string | null }
}

export function getCachedFileName() {
    const state = store.getState()
    const focusedTab = getFocusedTab(state)
    if (focusedTab) {
        return getFilePath(focusedTab.fileId)(state)
    }
}

export function getCachedComments() {
    let comments: { [key: string]: CommentFunction } = {}
    const state = store.getState()
    const tab = getFocusedTab(state)
    if (tab != null) {
        const filePath = getFilePath(tab.fileId)(state)
        comments = state.commentState.fileThenNames[filePath] || {}
    }
    return comments
}

export function getCachedTests() {
    const tests: { [key: string]: TestData } = {}
    const state = store.getState()
    const tab = getFocusedTab(state)
    if (tab != null) {
        const filePath = getFilePath(tab.fileId)(state)
        const rawTests = getTests(filePath)(state)
        for (const test of rawTests) {
            tests[test.functionName] = test
        }
    }
    return tests
}

export function getHasTestFile() {
    const state = store.getState()
    const tab = getFocusedTab(state)
    if (tab != null) {
        const filePath = getFilePath(tab.fileId)(state)
        return selectHasTests(filePath)(state)
    }

    return false
}

export function getCurrentFileId() {
    const state = store.getState()
    return getFocusedTab(state)!.fileId
}

export function getViewFileId(view: EditorView) {
    // use the paneId statefield
    const viewPaneId = view.state.field(paneIdField)

    const state = store.getState()
    return getTab(getCurrentTab(viewPaneId)(state)!)(state).fileId
}

export function getViewTabId(view: EditorView) {
    // use the paneId statefield
    const viewPaneId = view.state.field(paneIdField)
    const state = store.getState()
    return getCurrentTab(viewPaneId)(state)!
}
