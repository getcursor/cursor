import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { getLanguageFromFilename } from '../extensions/utils'
import { LSLanguages, LanguageServerClient } from './stdioClient'
import { Text } from '@codemirror/state'

import { offsetToPos } from './lspPlugin'
import { getContentsIfNeeded, loadFileIfNeeded } from '../window/fileUtils'
import { FullState, LanguageServerState } from '../window/state'
import { URI } from 'vscode-uri'

const clientConnections: {
    [key: string]: { lspName: string; client: LanguageServerClient }
} = {}

export const initialLanguageServerState = {
    languageServers: Object.fromEntries(
        LSLanguages.map((l) => [
            l,
            {
                languageServer: l,
                installed: false,
                running: false,
            },
        ])
    ),
    copilotSignedIn: false,
    copilotEnabled: true,
}

export const installLanguageServer = createAsyncThunk(
    'settings/installLanguageServer',
    async (languageServerName: string, { rejectWithValue, getState }) => {
        const rootDir = (<FullState>getState()).global.rootPath
        // @ts-ignore
        await connector.installLS(languageServerName, rootDir)
        return languageServerName
    }
)

export const runLanguageServer = createAsyncThunk(
    'settings/runLanguageServer',
    async (languageServerName: string, { getState, rejectWithValue }) => {
        if (clientConnections[languageServerName]) {
            // Already running
            return languageServerName
        } else {
            const rootPath = (getState() as FullState).global.rootPath!

            // @ts-ignore
            await connector.installLS(languageServerName, rootPath)

            // @ts-ignore
            await connector.startLS(languageServerName, rootPath)

            const newClient = new LanguageServerClient({
                language: languageServerName,
                rootUri: URI.file(rootPath).toString(),
                workspaceFolders: null,
            })
            clientConnections[languageServerName] = {
                lspName: languageServerName,
                client: newClient,
            }
            await newClient.initializePromise

            return languageServerName
        }
    }
)
export const stopLanguageServer = createAsyncThunk(
    'settings/stopLanguageServer',
    async (languageServerName: string, { rejectWithValue, dispatch }) => {
        if (!clientConnections[languageServerName]) {
            return rejectWithValue(languageServerName)
        }
        // @ts-ignore
        await connector.stopLS(languageServerName)
        await dispatch(killConnection(languageServerName))
        return languageServerName
    }
)

export const startConnections = createAsyncThunk(
    'lsp/startConnections',
    async (rootUri: string, { getState, dispatch }) => {
        await dispatch(killAllConnections(null))
        // For now we just start copilot
        const copilotClient = new LanguageServerClient({
            language: 'copilot',
            rootUri: URI.file(rootUri).toString(),
            // TODO - make this work
            workspaceFolders: null,
        })

        clientConnections['copilot'] = {
            lspName: 'copilot',
            client: copilotClient,
        }

        await copilotClient.initializePromise
        const signedIn = await copilotClient.signedIn()
        dispatch(copilotChangeSignin(signedIn))

        const maybeRun = async (languageServerName: string) => {
            // @ts-ignore
            const savedState = await connector.getLSState(languageServerName)
            if (savedState == null) return

            if (savedState.installed && savedState.running) {
                await dispatch(runLanguageServer(languageServerName))
            }
        }

        await Promise.all(LSLanguages.map(maybeRun))
    }
)

export const startCopilotWithoutFolder = createAsyncThunk(
    'lsp/startCopilotWithoutFolder',
    async (args: null, { getState, dispatch }) => {
        await dispatch(killAllConnections(null))
        // Start copilot without a folder
        const copilotClient = new LanguageServerClient({
            language: 'copilot',
            rootUri: '/Users/mntruell/portal/electron/src',
            workspaceFolders: null,
        })

        clientConnections['copilot'] = {
            lspName: 'copilot',
            client: copilotClient,
        }

        await copilotClient.initializePromise
        const signedIn = await copilotClient.signedIn()
        dispatch(copilotChangeSignin(signedIn))
    }
)

export const killConnection = createAsyncThunk(
    'lsp/killConnection',
    async (languageServerName: string, { getState, rejectWithValue }) => {
        if (clientConnections[languageServerName]) {
            // Already running
            clientConnections[languageServerName].client.close()
            delete clientConnections[languageServerName]
        }
        // @ts-ignore
        await connector.killLanguageServer(languageServerName)

        return languageServerName
    }
)

export const killAllConnections = createAsyncThunk(
    'lsp/killAllConnections',
    async (args: null, { dispatch }) => {
        const futures = []
        for (const lspName in clientConnections) {
            futures.push(dispatch(killConnection(lspName)))
        }

        await Promise.all(futures)

        // @ts-ignore
        await connector.killAllLS()
    }
)

export const getDefinition = createAsyncThunk(
    'lsp/getDefinition',
    async (
        payload: { fid: number; path: string; offset: number },
        { getState, dispatch }
    ) => {
        const languageId = getLanguageFromFilename(payload.path)
        if (languageId === null) {
            return null
        }
        const lspName = getIdentifier(languageId)
        if (lspName === null) {
            return null
        }
        const origContents = await getContentsIfNeeded(
            (<FullState>getState()).global,
            payload.fid
        )
        const origDoc = Text.of(origContents.split('\n'))

        const client = clientConnections[lspName].client

        const gotoResult = await client.getDefinition({
            path: payload.path,
            pos: offsetToPos(origDoc, payload.offset),
        })
        if (!gotoResult) {
            return null
        }

        let { newPath, range } = gotoResult

        newPath = newPath.replace(/\//g, connector.PLATFORM_DELIMITER)

        // // TODO - tmp addition to fix goto definition errors
        // // Check if new path is inside the rootDir
        // if (!newPath.startsWith((<FullState>getState()).global.rootPath!)) {
        //     return null;
        // }
        //

        const response = await dispatch(loadFileIfNeeded(newPath))
        if (!loadFileIfNeeded.fulfilled.match(response)) {
            return null
        } else if (response.payload == null) {
            return null
        }
        const { fileId, contents } = response.payload

        // TODO - figure out why we don't accurately get the start and end offsets
        // originally
        return { fileId, newStartPos: range.start, newEndPos: range.end }
    }
)

export const getConnections = () => {
    return clientConnections
}
export const getIdentifier = (languageId: string) => {
    switch (languageId) {
        // Typescript/javascript
        case 'typescript':
        case 'typescriptreact':
        case 'javascript':
        case 'javascriptreact':
            return 'typescript'
        // Python
        case 'python':
            return 'python'
        // HTML/CSS
        case 'html':
            return 'html'
        case 'css':
            return 'css'
        // Go
        case 'go':
            return 'go'
        // C based servers
        case 'cpp':
        case 'c':
            return 'c'
        // C-Sharp
        case 'csharp':
            return 'csharp'
        // Java
        case 'java':
            return 'java'
        // Rust
        case 'rust':
            return 'rust'
        // PHP
        case 'php':
            return 'php'
        default:
            return null
    }
}
export function subConnection(
    name: string,
    newConnection: LanguageServerClient
) {
    clientConnections[name] = { lspName: name, client: newConnection }
}

export const languageServerSlice = createSlice({
    name: 'languageServer',
    initialState: initialLanguageServerState as LanguageServerState,
    extraReducers: (builder) => {
        // Case for installing a language server
        builder.addCase(
            installLanguageServer.fulfilled,
            (state: LanguageServerState, action) => {
                const languageName = action.payload
                if (state.languageServers[languageName]) {
                    state.languageServers[languageName].installed = true
                } else {
                    state.languageServers[languageName] = {
                        languageServer: languageName,
                        running: false,
                        installed: true,
                    }
                }
            }
        )
        // Case for running a language server
        builder.addCase(
            runLanguageServer.fulfilled,
            (state: LanguageServerState, action) => {
                const languageName = action.payload
                if (state.languageServers[languageName]) {
                    state.languageServers[languageName].running = true
                    state.languageServers[languageName].installed = true
                } else {
                    state.languageServers[languageName] = {
                        languageServer: languageName,
                        running: true,
                        installed: true,
                    }
                }
            }
        )
        // Case for killing a language server
        builder.addCase(
            stopLanguageServer.fulfilled,
            (state: LanguageServerState, action) => {
                const languageName = action.payload
                if (state.languageServers[languageName]) {
                    state.languageServers[languageName].running = false
                } else {
                    state.languageServers[languageName] = {
                        languageServer: languageName,
                        running: false,
                        installed: false,
                    }
                }
            }
        )
    },
    reducers: {
        copilotChangeSignin(
            state: LanguageServerState,
            action: PayloadAction<boolean>
        ) {
            state.copilotSignedIn = action.payload
        },
        copilotChangeEnable(
            state: LanguageServerState,
            action: PayloadAction<boolean>
        ) {
            state.copilotEnabled = action.payload
        },
    },
})

export const { copilotChangeSignin, copilotChangeEnable } =
    languageServerSlice.actions
