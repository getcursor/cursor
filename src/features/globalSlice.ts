import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
    getDefinition,
    getIdentifier,
    runLanguageServer,
    startConnections,
    startCopilotWithoutFolder,
} from './lsp/languageServerSlice'
import type * as LSP from 'vscode-languageserver-protocol'
import { changeSettingsNoSideffect } from './settings/settingsSlice'
import { getLanguageFromFilename } from './extensions/utils'

import { ExpectedError, join } from '../utils'
import {
    Folder,
    FolderData,
    FullState,
    HoverState,
    ReduxEditorState,
    RepoProgress,
    State,
    initialState,
    nextFileID,
    nextFolderID,
    nextTabID,
} from './window/state'
import {
    createCachedTabIfNotExists,
    doCloseTab,
    doMoveTabToPane,
    doMoveToAdjacentPane,
    doSelectFile,
    getActiveFileId,
    getActivePaneID,
    getActiveTabId,
    getPaneActiveTabId,
    getTabForFile,
    insertFirstPane,
    insertNewTab,
    setActiveTab,
    setOpenParentFolders,
    setPaneActive,
    splitPane,
    updateEditorState,
} from './window/paneUtils'
import {
    abortFileRename,
    commitFileRename,
    doDeleteFile,
    doDeleteFolder,
    findFileIdFromPath,
    findFolderIdFromPath,
    getAllParentIds,
    getContentsIfNeeded,
    getNewFileName,
    getNewFolderName,
    getPathForFileId,
    getPathForFolderId,
    insertNewFile,
    insertNewFolder,
    isValidRenameName,
    loadFileIfNeeded,
    setSelectedFile,
    sortAllFolders,
    triggerFileRename,
    updateCachedContents,
} from './window/fileUtils'

import { CustomTransaction } from '../components/codemirrorHooks/dispatch'
import { updateCommentsForFile } from './comment/commentSlice'
import { openFileTree } from './tools/toolSlice'
import { updateTestsForFile } from './tests/testSlice'

import posthog from 'posthog-js'
import { removeEditor } from './codemirror/codemirrorSlice'
import { initializeChatState } from './chat/chatThunks'

// export const monitorUploadProgress = createAsyncThunk(
//     'global/monitorUploadProgress',
//     async (args: null, { getState, dispatch }) => {
//

//         const state = getState() as FullState
//         const { repoId } = state.global

//         //         let newProgress = await connector.getProgress(repoId)
//         dispatch(updateRepoProgress(newProgress))

//         setInterval(async () => {
//             const state = getState() as FullState
//             const { repoProgress, repoId } = state.global
//             if (repoProgress.state != 'done') {
//                 //                 let newProgress = await connector.getProgress(repoId)
//                 dispatch(updateRepoProgress(newProgress))
//             }
//         }, 2000)
//     }
// )
const BAD_DIRECTORIES = ['.git', 'node_modules', '.vscode', '.webpack']

export const gotoDefinition = createAsyncThunk(
    'global/gotoDefinition',
    async (args: { path: string; offset: number }, { getState, dispatch }) => {
        const fid = getActiveFileId((<FullState>getState()).global)!

        const response = await dispatch(getDefinition({ fid, ...args }))
        if (!getDefinition.fulfilled.match(response)) {
            return null
        } else if (response.payload == null) {
            return null
        }
        const { fileId, newStartPos, newEndPos } = response.payload

        const paneId = getActivePaneID((<FullState>getState()).global)

        if (!paneId) {
            return
        }

        let tabId = getTabForFile(
            (<FullState>getState()).global,
            paneId,
            fileId
        )

        if (!tabId) {
            dispatch(insertTab({ paneId, fileId: fileId }))
            tabId = getTabForFile(
                (<FullState>getState()).global,
                paneId,
                fileId
            )!
        }

        dispatch(
            addTransaction({
                tabId,
                transactionFunction: {
                    type: 'newSelection',
                    from: {
                        line: newStartPos.line,
                        col: newStartPos.character,
                    },
                    to: { line: newEndPos.line, col: newEndPos.character },
                    scroll: 'center',
                },
            })
        )

        dispatch(activeTab(tabId))
        // dispatch(activeTab({tabId: newTabId});
        // Set the new tab as active
        // setActiveTab((<FullState>getState()).global, newTabId);
    }
)

// thunks are savefile, deletefile, get from folder, renamefile, select file
export const selectFile = createAsyncThunk(
    'global/selectFile',
    async (fileId: number, { getState, dispatch }) => {
        const fullState = <FullState>getState()
        const state = fullState.global
        const contents = await getContentsIfNeeded(state, fileId)

        const file = state.files[fileId]
        const name = file.name
        const languageName = getLanguageFromFilename(name)
        const languageServerName = getIdentifier(languageName)

        const filePath = getPathForFileId(state, fileId)

        if (languageServerName != null) {
            const languageState =
                fullState.languageServerState.languageServers[
                    languageServerName
                ]
            if (languageState != null && !languageState.running) {
                dispatch(runLanguageServer(languageServerName))
            }
        }
        dispatch(afterSelectFile({ fileId, contents }))
        dispatch(loadFoldersAboveFile(fileId))

        dispatch(updateCommentsForFile({ filePath }))
        dispatch(updateTestsForFile(filePath))
    }
)

export const loadFoldersAboveFile = createAsyncThunk(
    'global/loadFoldersAboveFile',
    async (fileId: number, { getState, dispatch }) => {
        const state = (<FullState>getState()).global
        if (state.files[fileId] == null) {
            return
        }

        let parentFolderId: number | null = state.files[fileId].parentFolderId
        do {
            const folder: Folder = state.folders[parentFolderId!]!
            if (folder.loaded == false)
                await dispatch(
                    loadFolder({ folderId: parentFolderId, goDeep: false })
                )
            parentFolderId = folder.parentFolderId
        } while (parentFolderId != null)
    }
)

export const openFile = createAsyncThunk(
    'global/openFile',
    async (
        {
            filePath,
            selectionRegions = null,
        }: {
            filePath: string
            selectionRegions?:
                | { start: LSP.Position; end: LSP.Position }[]
                | null
        },
        { getState, dispatch }
    ) => {
        const result = await dispatch(loadFileIfNeeded(filePath))
        if (!loadFileIfNeeded.fulfilled.match(result)) {
            return
        } else if (result.payload == null) {
            return
        }

        const { fileId } = result.payload
        await dispatch(selectFile(fileId))

        const tabId: number = getActiveTabId((<FullState>getState()).global)!
        if (selectionRegions != null) {
            const { start, end } = selectionRegions[0]
            dispatch(
                addTransaction({
                    tabId,
                    transactionFunction: {
                        type: 'newSelection',
                        from: { line: start.line, col: start.character },
                        to: { line: end.line, col: end.character },
                        scroll: 'center',
                    },
                })
            )
        }
        return tabId
    }
)

export const saveFile = createAsyncThunk(
    'global/savedFile',
    async (fileId: number | null, { getState }) => {
        if (fileId == null) {
            fileId = getActiveFileId((<FullState>getState()).global)
            if (fileId == null) {
                return
            }
        }
        const state = (<FullState>getState()).global
        const file = state.files[fileId]
        const cachedFile = state.fileCache[fileId]
        if (!cachedFile) {
            return
        }
        const path = getPathForFileId(state, fileId)

        const lmTime = (await connector.getLastModifiedTime(path)) as number

        if (
            file.savedTime != null &&
            lmTime != null &&
            lmTime > file.savedTime
        ) {
            const result = await connector.checkSave(path)
            if (!result) {
                return
            }
        }

        await connector.saveFile(path, cachedFile.contents)
        return { fileId }
    }
)

export const forceSaveAndClose = createAsyncThunk(
    'global/forceSaveAndClose',
    async (args: null, { dispatch }) => {
        await dispatch(saveFile(null))
        await dispatch(forceCloseTab(null))
    }
)

export const deleteFolder = createAsyncThunk(
    'global/deleteFolder',
    async (folderId: number | null, { getState }) => {
        const state: any = (<FullState>getState()).global
        if (folderId == null) {
            folderId = state.rightClickId
            if (!folderId) {
                return
            }
        }

        const path = getPathForFolderId(state, folderId)

        await connector.deleteFolder(path)
        return folderId
    }
)

export const folderWasAdded = createAsyncThunk(
    'global/folderWasAdded',
    async (path: string, { dispatch }) => {
        dispatch(afterFolderWasAdded(path))
    }
)

export const folderWasDeleted = createAsyncThunk(
    'global/folderWasDeleted',
    async (path: string, { dispatch }) => {
        dispatch(afterFolderWasDeleted(path))
    }
)

export const fileWasUpdated = createAsyncThunk(
    'global/fileWasUpdated',
    async (path: string, { getState, dispatch }) => {
        const state = (<FullState>getState()).global

        const fileId = findFileIdFromPath(state, path)
        if (fileId == null) return

        const file = state.files[fileId]
        if (!file.saved) return

        const currentTime = new Date().getTime()

        if (
            file.lastSavedTime != null &&
            currentTime - file.lastSavedTime < 2000
        )
            return

        const contents = await connector.getFile(path)

        // find all tabs with this file
        const tabIds = Object.keys(state.tabs)
            .map((key) => parseInt(key))
            .filter((key) => state.tabs[key].fileId == fileId)
        //await dispatch(afterFileWasUpdated({fileId, contents}));
        for (const tabId of tabIds) {
            dispatch(
                addTransaction({
                    tabId,
                    transactionFunction: {
                        type: 'insert',
                        from: { line: 0, col: 0 },
                        to: null,
                        text: contents,
                    },
                })
            )
        }
    }
)

export const fileWasAdded = createAsyncThunk(
    'global/fileWasAdded',
    async (path: string, { dispatch }) => {
        dispatch(afterFileWasAdded(path))
    }
)

export const fileWasDeleted = createAsyncThunk(
    'global/fileWasDeleted',
    async (path: string, { dispatch }) => {
        dispatch(afterFileWasDeleted(path))
    }
)

export const deleteFile = createAsyncThunk(
    'global/deleteFile',
    async (fileId: number | null, { getState }) => {
        const state = (<FullState>getState()).global
        if (fileId == null) {
            fileId = state.rightClickId
            if (!fileId) {
                return
            }
        }
        const path = getPathForFileId(state, fileId)

        await connector.deleteFile(path)
        return fileId
    }
)

export const openContainingFolder = createAsyncThunk(
    'global/openContainingFolder',
    async (fileId: number | null, { getState }) => {
        const state = (<FullState>getState()).global
        if (fileId == null) {
            fileId = state.rightClickId
            if (!fileId) {
                return
            }
        }
        const path = getPathForFileId(state, fileId)

        await connector.openContainingFolder(path)
    }
)

export const commitRename = createAsyncThunk(
    'global/commitRename',
    async (
        { fid, isFolder = false }: { fid: number | null; isFolder?: boolean },
        { getState }
    ) => {
        const state = (<FullState>getState()).global as State
        if (fid == null) {
            fid = state.rightClickId
            if (!fid) {
                return
            }
        }
        const file = isFolder ? state.folders[fid] : state.files[fid]
        if (file.renameName == null || !isValidRenameName(state)) {
            return
        }
        const oldPath = isFolder
            ? getPathForFolderId(state, fid)
            : getPathForFileId(state, fid)
        const newPath = join(
            getPathForFolderId(state, file.parentFolderId!),
            file.renameName
        )
        // TODO: FIX
        await connector.renameFile(oldPath, newPath)
        return state.rightClickId
    }
)

export const rightClickFile = createAsyncThunk(
    'global/rightClickFile',
    async (fileId: number) => {
        await connector.rightClickFile()
        return fileId
    }
)

export const rightClickTab = createAsyncThunk(
    'global/rightClickTab',
    async (tabId: number) => {
        await connector.rightClickTab()
        return tabId
    }
)

export const rightClickFolder = createAsyncThunk(
    'global/rightClickFolder',
    async (folderId: number, { getState }) => {
        const state = (<FullState>getState()).global
        const folder = state.folders[folderId]
        const path = getPathForFolderId(state, folderId)
        await connector.rightClickFolder(path, folder.parentFolderId == null)
        return folderId
    }
)

export const loadFolder = createAsyncThunk(
    'global/loadFolder',
    async (
        { folderId, goDeep }: { folderId: number; goDeep: boolean },
        { getState }
    ) => {
        void goDeep // unimplemented

        const state: State = (<FullState>getState()).global

        if (state.folders[folderId].loaded) return null

        const folderPath = getPathForFolderId(state, folderId)

        // Added to ensure that we are not double adding already loaded files
        const folderChildren = state.folders[folderId].folderIds.map(
            (fid) => state.folders[fid].name
        )
        const fileChildren = state.folders[folderId].fileIds.map(
            (fid) => state.files[fid].name
        )

        const folderData = await connector.getFolder(
            folderPath,
            folderChildren.concat(fileChildren)
        )

        return { folderId, folderData }
    }
)

export const openRemoteFolder = createAsyncThunk(
    'global/openRemoteFolder',
    async (args: null, { dispatch, getState }) => {
        const state = (<FullState>getState()).global
        const res = await connector.setRemoteFileSystem({
            sshCommand: state.remoteCommand,
            remotePath: state.remotePath,
        })

        if (!res) {
            dispatch(setBadConnection())
            return null
        }

        const folderPath = state.remotePath
        const jsonData = { defaultFolder: folderPath }

        await connector.saveProject(jsonData)

        const folderData = await connector.getFolder(folderPath)

        dispatch(overwriteFolder({ folderPath, folderData }))

        // Now we are going to setup the lsp server
        await dispatch(startConnections(folderPath))

        const version = await connector.getVersion()
        dispatch(setVersion(version))

        const repoId: string | null = await connector.initProject(folderPath)
        if (repoId != null) {
            dispatch(setRepoId(repoId))
            dispatch(syncProject(null))
        } else {
            dispatch(initializeIndex(null))
        }

        // dispatch(monitorUploadProgress(null))
        // dispatch(loadRecur(4))

        const remote = await connector.getRemote()

        if (remote != null && remote.remoteCommand != null)
            dispatch(setRemoteCommand(remote.remoteCommand))
        if (remote != null && remote.remotePath != null)
            dispatch(setRemotePath(remote.remotePath))
    }
)

export const openTutorFolder = createAsyncThunk(
    'global/openTutorFolder',
    async (args: null, { getState, dispatch }) => {
        posthog.capture('Opened Tutor Folder', {})

        //@ts-ignore
        const path = await connector.createTutorDir()

        await dispatch(openFolder({ path }))
        // await for 1 second
        // await new Promise((resolve) => setTimeout(resolve, 100))

        function open(fn: string) {
            const desiredFilePath = join(path, fn)
            const state = (<FullState>getState()).global
            const fileId = findFileIdFromPath(state, desiredFilePath)
            if (fileId != null) dispatch(selectFile(fileId!))
        }

        open('main.js')

        // open('main.py')
    }
)

export const openFolder = createAsyncThunk(
    'global/openFolder',
    async (args: { path: string } | null, { dispatch }) => {
        posthog.capture('Opened Folder', {})
        connector.refreshTokens()

        const folderPath =
            (args != null ? args.path : null) || (await connector.openFolder())

        if (folderPath == null) {
            return
        }

        const jsonData = { defaultFolder: folderPath }

        await connector.saveProject(jsonData)

        const folderData = await connector.getFolder(folderPath)

        dispatch(overwriteFolder({ folderPath, folderData }))

        // Show the new folder in the FileTree view
        dispatch(openFileTree())

        // Now we are going to setup the lsp server
        await dispatch(startConnections(folderPath))

        const version = await connector.getVersion()
        dispatch(setVersion(version))

        const repoId: string | null = await connector.initProject(folderPath)
        if (repoId != null) {
            dispatch(setRepoId(repoId))
            dispatch(syncProject(null))
        } else {
            dispatch(initializeIndex(null))
        }

        // dispatch(monitorUploadProgress(null))
        // dispatch(loadRecur(4))

        const remote = await connector.getRemote()

        if (remote != null && remote.remoteCommand != null)
            dispatch(setRemoteCommand(remote.remoteCommand))
        if (remote != null && remote.remotePath != null)
            dispatch(setRemotePath(remote.remotePath))
    }
)

export const loadRecur = createAsyncThunk(
    'global/loadRecur',
    async (depth: number, { getState, dispatch }) => {
        const state = (<FullState>getState()).global
        const toLoad = []
        for (const folderIdStr of Object.keys(state.folders)) {
            const folderId = parseInt(folderIdStr)
            const folder = state.folders[folderId]
            if (
                !folder.loaded &&
                !BAD_DIRECTORIES.includes(folder.name) &&
                !folder.name.startsWith('.')
            )
                toLoad.push(folderId)
        }
        for (const folderId of toLoad) {
            const folder = state.folders[folderId]
            if (folder.name == 'node_modules') continue
            if (folder.name == 'dist') continue
            if (folder.name == '.git') continue
            await dispatch(loadFolder({ folderId, goDeep: false }))
        }

        const newstate = (<FullState>getState()).global
        if (depth > 0 && Object.keys(newstate.files).length < 1000) {
            await dispatch(loadRecur(depth - 1))
        }
    }
)

export const trulyOpenFolder = createAsyncThunk(
    'global/trulyOpenFolder',
    async (args: string, { dispatch }) => {
        const folderData = await connector.getFolder(
            args,
            [],
            1,
            BAD_DIRECTORIES
        )

        dispatch(overwriteFolder({ folderPath: args, folderData }))

        const version = await connector.getVersion()
        dispatch(setVersion(version))

        // Now we are going to setup the lsp server
        dispatch(startConnections(args))

        // Setup the project by uploading all files to a remote server

        const repoId: string | null = await connector.initProject(args)

        //
        if (repoId != null) {
            //
            dispatch(setRepoId(repoId))
            dispatch(syncProject(null))
        } else {
            //
            dispatch(initializeIndex(null))
        }
        // dispatch(monitorUploadProgress(null))

        // dispatch(loadRecur(4))
    }
)

export const setIsNotFirstTimeWithSideEffect = createAsyncThunk(
    'global/setIsNotFirstTimeWithSideEffect',
    async (args: null, { dispatch }) => {
        await connector.setStore('isNotFirstTime', true)
        dispatch(setIsNotFirstTime(true))
    }
)

export const initState = createAsyncThunk(
    'global/initState',
    async (args: null, { dispatch }) => {
        const config = await connector.getProject()
        connector.refreshTokens()

        // if (config == null) {
        //     return
        // }

        const settings = await connector.initSettings()
        dispatch(changeSettingsNoSideffect(settings))

        if (config != null && config.defaultFolder) {
            await dispatch(trulyOpenFolder(config.defaultFolder))
        }

        const isNotFirstTime =
            (await connector.getStore('isNotFirstTime')) || false

        dispatch(setIsNotFirstTime(isNotFirstTime))
        dispatch(startCopilotWithoutFolder(null))

        dispatch(initializeChatState(null))

        const remote = await connector.getRemote()

        if (remote != null && remote.remoteCommand != null)
            dispatch(setRemoteCommand(remote.remoteCommand))
        if (remote != null && remote.remotePath != null)
            dispatch(setRemotePath(remote.remotePath))
    }
)

export const syncProject = createAsyncThunk(
    'global/syncProject',
    async (rootDir: string | null, { getState }) => {
        const state = (<FullState>getState()).global
        const myDir = rootDir || state.rootPath
        await connector.syncProject(myDir!)
    }
)

export const initializeIndex = createAsyncThunk(
    'global/initializeIndex',
    async (rootDir: string | null, { getState, dispatch }) => {
        const state = (<FullState>getState()).global
        const myDir = rootDir || state.rootPath

        const repoId: string = await connector.indexProject(myDir!)

        dispatch(setRepoId(repoId))
    }
)

export const newFile = createAsyncThunk(
    'global/newFile',
    async (
        { parentFolderId }: { parentFolderId: number | null },
        { getState }
    ) => {
        const state = (<FullState>getState()).global
        const actualParent = parentFolderId || state.rightClickId || 1
        if (actualParent == null) {
            return
        }
        const name = getNewFileName(state, actualParent)
        const parentPath = getPathForFolderId(state, actualParent)
        const newPath = `${parentPath}/${name}`
        await connector.saveFile(newPath, '')

        return { name, parentFolderId }
    }
)

export const newFolder = createAsyncThunk(
    'global/newFolder',
    async (
        { parentFolderId }: { parentFolderId: number | null },
        { getState }
    ) => {
        const state = (<FullState>getState()).global
        const actualParent = parentFolderId || state.rightClickId
        if (actualParent == null) {
            return
        }
        const name = getNewFolderName(state, actualParent)
        const parentPath = getPathForFolderId(state, actualParent)
        const newPath = `${parentPath}/${name}`
        await connector.saveFolder(newPath)

        return { name, parentFolderId }
    }
)

export const closeTab = createAsyncThunk(
    'global/closeTab',
    async (tabId: number | null, { getState, dispatch }) => {
        const state = (<FullState>getState()).global
        tabId = tabId || getActiveTabId(state)
        if (tabId == null) return

        const fileId = state.tabs[tabId].fileId
        const file = state.files[fileId]
        if (!file.saved) {
            const result = await connector.checkCloseTab(
                getPathForFileId(state, fileId)
            )
            if (result === 'cancel') return
            if (result === 'save') {
                await dispatch(saveFile(fileId))
            }
        }
        dispatch(forceCloseTab(tabId))
        // Also need to delete the view here
        dispatch(removeEditor({ tabId }))
    }
)

export const splitCurrentPane = createAsyncThunk(
    'global/splitCurrentPane',
    async (direction: HoverState, { getState, dispatch }) => {
        const state = (<FullState>getState()).global

        const paneId = getActivePaneID(state)

        if (paneId == null) return

        await dispatch(splitPaneAndOpenFile({ paneId, hoverState: direction }))
    }
)

export const splitPaneAndOpenFile = createAsyncThunk(
    'global/splitPaneAndOpenFile',
    async (
        { paneId, hoverState }: { paneId: number; hoverState: HoverState },
        { getState, dispatch }
    ) => {
        const state = (<FullState>getState()).global
        const activeTabId = getActiveTabId(state)
        if (activeTabId == null) return
        const activeTab = state.tabs[activeTabId]
        const activeFileId = activeTab.fileId

        dispatch(executeSplitPane({ paneId, hoverState }))
        dispatch(selectFile(activeFileId))
    }
)

const globalSlice = createSlice({
    extraReducers: (builder) => {
        builder
            .addCase(saveFile.fulfilled, (state, action) => {
                if (action.payload == null) return
                const { fileId } = action.payload
                const file = (<State>state).files[fileId]
                if (file) {
                    file.saved = true
                    file.lastSavedTime = new Date().getTime()
                    file.deleted = false
                    file.savedTime = undefined
                }
            })
            .addCase(deleteFile.fulfilled, (stobj, action) => {
                const state = <State>stobj
                const fileid = action.payload as number
                const tabIds = Object.keys(state.tabs).filter((tabId) => {
                    return state.tabs[parseInt(tabId)].fileId === fileid
                })
                tabIds.forEach((tabId) => {
                    doCloseTab(state, parseInt(tabId))
                })
                doDeleteFile(state, fileid)
            })
            .addCase(deleteFolder.fulfilled, (stobj, action) => {
                const state = <State>stobj
                const folderid = action.payload as number
                const tabIds = Object.keys(state.tabs).filter((tabId) => {
                    const fileid = state.tabs[parseInt(tabId)].fileId
                    const file = state.files[fileid]
                    const allParentIds =
                        file.parentFolderId == null
                            ? []
                            : [
                                  file.parentFolderId,
                                  ...getAllParentIds(
                                      state,
                                      file.parentFolderId
                                  ),
                              ]
                    return allParentIds.includes(folderid)
                })
                tabIds.forEach((tabId) => {
                    doCloseTab(state, parseInt(tabId))
                })
                doDeleteFolder(state, folderid)
            })
            .addCase(commitRename.fulfilled, (stobj, action) => {
                const state = <State>stobj
                if (action.payload == null) {
                    return
                }
                // const fileid = action.payload as number
                commitFileRename(state)
            })
            .addCase(rightClickFile.fulfilled, (stobj, action) => {
                const state = <State>stobj
                const fileid = action.payload as number
                state.rightClickId = fileid
                state.isRightClickAFile = true
            })
            .addCase(rightClickFolder.fulfilled, (stobj, action) => {
                const state = <State>stobj
                const folderid = action.payload as number
                state.rightClickId = folderid
                state.isRightClickAFile = false
            })
            .addCase(newFile.fulfilled, (stobj, action) => {
                const state = <State>stobj
                abortFileRename(state)
                const actualParent =
                    action.payload?.parentFolderId || state.rightClickId || 1
                if (actualParent == null || action.payload == null) {
                    return
                }
                const name = action.payload.name as string
                const fileid = insertNewFile(state, actualParent, name)
                state.rightClickId = fileid
                state.isRightClickAFile = true
                doSelectFile(state, fileid)
                triggerFileRename(state)
            })

            .addCase(newFolder.fulfilled, (stobj, action) => {
                const state = <State>stobj
                const actualParent =
                    action.payload?.parentFolderId || state.rightClickId
                abortFileRename(state)
                if (actualParent == null || action.payload == null) {
                    return
                }
                const name = action.payload.name as string
                const folderId = insertNewFolder(state, actualParent, name)
                state.rightClickId = folderId
                state.isRightClickAFile = false
                triggerFileRename(state)
                setOpenParentFolders(state, folderId)
            })
            .addCase(loadFolder.fulfilled, (stobj, action) => {
                const state = <State>stobj
                if (action.payload == null) {
                    return
                }
                const folderId = action.payload.folderId as number
                const { folders, files } = action.payload
                    .folderData as FolderData

                const toAddFolderId = nextFolderID(state)

                // replace the folderId folder with folders[1]
                const loadedFolder = state.folders[folderId]
                if (loadedFolder == null) return

                // might break remote
                loadedFolder.folderIds.push(
                    ...folders[1].folderIds.map(
                        (folderId) => folderId + toAddFolderId
                    )
                )
                Object.keys(folders).forEach((key) => {
                    const numKey = parseInt(key)
                    if (numKey === 1) return
                    const newFolderId = numKey + toAddFolderId
                    const newFolder = folders[numKey]
                    newFolder.parentFolderId = folderId
                    state.folders[newFolderId] = newFolder
                })

                loadedFolder.folderIds.sort((a, b) =>
                    state.folders[a].name > state.folders[b].name ? 1 : -1
                )

                const toAddFileId = nextFileID(state)
                // might break remote
                loadedFolder.fileIds.push(
                    ...folders[1].fileIds.map((fileId) => fileId + toAddFileId)
                )
                Object.keys(files).forEach((key) => {
                    const numKey = parseInt(key)
                    const newFileId = numKey + toAddFileId
                    const newFile = files[numKey]
                    newFile.parentFolderId = folderId
                    state.files[newFileId] = newFile
                })

                loadedFolder.fileIds.sort((a, b) =>
                    state.files[a].name > state.files[b].name ? 1 : -1
                )

                loadedFolder.loaded = true
            })
    },
    name: 'global',
    initialState,
    // The `reducers` field lets us define reducers and generate associated actions
    reducers: {
        insertMultiTabAndSetActive(stobj: object) {
            const state = <State>stobj
            const paneId = getActivePaneID(state)!

            const tabid = nextTabID(state)
            const tab = {
                fileId: 1,
                paneId,
                isActive: false,
                isChat: false,
                isReady: 0,
                isReadOnly: false,
                generating: false,
                interrupted: false,

                isMulti: true,
                isMultiDiff: true,
            }
            state.tabs[tabid] = tab
            state.paneState.byIds[paneId].tabIds.push(tabid)
            createCachedTabIfNotExists(state, tabid)
            setActiveTab(state, tabid)
        },
        setMultiTabToDiff(stobj: object) {
            const state = <State>stobj
            const tabId = getActiveTabId(state)!
            const tab = state.tabs[tabId]
            if (tab == null) return
            tab.isMultiDiff = true
        },
        insertTab(
            stobj: object,
            action: PayloadAction<{
                paneId: number
                fileId: number
                scrollPos?: number
            }>
        ) {
            const state = <State>stobj
            if (action.payload == null) {
                return
            }

            const { paneId, fileId, scrollPos } = action.payload
            const tabId = insertNewTab(state, paneId, fileId)
            if (scrollPos) {
                state.tabCache[tabId].scrollPos = scrollPos
            }
        },
        activeTab(stobj: object, action: PayloadAction<number>) {
            const state = <State>stobj
            const tabId = action.payload as number
            setActiveTab(state, tabId)
        },
        overwriteFolder(
            stobj: object,
            action: PayloadAction<{
                folderPath: string
                folderData: FolderData
            }>
        ) {
            const state = <State>stobj
            if (action.payload == null) {
                return
            }
            const folderPath = action.payload.folderPath as string
            const folderData = action.payload.folderData as FolderData
            if (!folderData) {
                return
            }

            // copy initial state
            const newInitialState = structuredClone(initialState)
            Object.keys(newInitialState).forEach((key) => {
                // @ts-ignore
                state[key] = newInitialState[key]
            })

            state.folders = {
                0: {
                    parentFolderId: null,
                    name: '',
                    renameName: '',
                    fileIds: [],
                    folderIds: [],
                    loaded: true,
                    isOpen: true,
                },
                ...folderData.folders,
            }
            state.folders[1].isOpen = true
            state.files = folderData.files
            state.rootPath = folderPath

            insertFirstPane(state)
            sortAllFolders(state)
        },
        scrollUpdate(
            stobj: object,
            action: PayloadAction<{ tabId: number; scrollPos: number }>
        ) {
            const state = <State>stobj
            const { tabId, scrollPos } = action.payload

            createCachedTabIfNotExists(state, tabId)
            state.tabCache[tabId].scrollPos = scrollPos
        },
        codeUpdate(
            stobj: object,
            action: PayloadAction<{
                code: string
                update: ReduxEditorState
                tabId: number
                canMarkNotSaved: boolean
            }>
        ) {
            const state = <State>stobj
            const { code, update, tabId, canMarkNotSaved } = action.payload
            const tab = state.tabs[tabId]
            if (!tab) {
                return
            }

            const file = state.files[tab.fileId]
            const newCode = state.fileCache[tab.fileId].contents
            // newCode = newCode.replace(/\r\n/g, '\n');
            // const repCode = code.replace(/\r\n/g, '\n');
            const repCode = code

            if (file.saved && newCode !== repCode) {
                if (canMarkNotSaved) {
                    file.saved = false
                }

                // get time milliseconds
                const date = new Date()
                const time = date.getTime()
                file.savedTime = time
            }
            updateCachedContents(state, tab.fileId, code)
            updateEditorState(state, tabId, update)
        },
        vimUpdate(
            stobj: object,
            action: PayloadAction<{ tabId: number; vimState: any }>
        ) {
            const state = <State>stobj
            const { tabId, vimState } = action.payload
            const tab = state.tabs[tabId]
            if (!tab) return

            createCachedTabIfNotExists(state, tabId)
            state.tabCache[tabId].vimState = vimState
        },
        triggerRename: (
            stobj: object,
            action: PayloadAction<number | null>
        ) => {
            const state = <State>stobj
            let fileid = action.payload
            fileid = fileid || state.rightClickId || getActiveFileId(state)
            if (!fileid) return
            triggerFileRename(state)
        },
        updateRenameName: (
            stobj: object,
            action: PayloadAction<{
                fid: number
                new_name: string
                isFolder?: boolean
            }>
        ) => {
            const state = <State>stobj
            const { fid, new_name, isFolder = false } = action.payload
            const file = isFolder ? state.folders[fid] : state.files[fid]
            if (file.renameName == null) {
                return
            }
            file.renameName = new_name
        },
        forceCloseTab: (
            stobj: object,
            action: PayloadAction<number | null>
        ) => {
            const state = <State>stobj
            const tabid = action.payload || getActiveTabId(state)
            if (tabid == null) return
            doCloseTab(state, tabid)
        },
        selectTab: (stobj: object, action: PayloadAction<number>) => {
            const state = <State>stobj
            const tabid = action.payload
            const tab = state.tabs[tabid]

            // just get the file id and select it
            const fileid = tab.fileId
            setActiveTab(state, tabid)
            setSelectedFile(state, fileid)
        },
        selectPane: (stobj: object, action: PayloadAction<number>) => {
            const state = <State>stobj
            const paneid = action.payload

            setPaneActive(state, paneid)
        },
        editorCreated: (stobj: object, action: PayloadAction<number>) => {
            const state = <State>stobj
            const tabId = action.payload
            // move up dummy variable to force a rerender
            state.tabs[tabId].isReady += 1
        },
        moveTabToPane(
            stobj: object,
            action: PayloadAction<{ tabId: number; paneId: number }>
        ) {
            const state = <State>stobj
            const { tabId, paneId } = action.payload
            doMoveTabToPane(state, tabId, paneId)
        },
        setDraggingTab: (stobj: object, action: PayloadAction<number>) => {
            const state = <State>stobj
            const tabId = action.payload
            state.draggingTabId = tabId
        },
        stopDraggingTab: (stobj: object) => {
            const state = <State>stobj
            state.draggingTabId = null
        },
        moveDraggingTabToPane(
            stobj: object,
            action: PayloadAction<{
                paneId: number
                hoverState: HoverState
                tabPosition: number
            }>
        ) {
            const state = <State>stobj
            const { paneId, hoverState, tabPosition } = action.payload
            if (state.draggingTabId == null) return

            let newPaneId = paneId as number | undefined
            if (hoverState != HoverState.Full) {
                newPaneId = splitPane(state, paneId, hoverState)
            }
            if (newPaneId == null) return
            doMoveTabToPane(state, state.draggingTabId, newPaneId, tabPosition)
            state.draggingTabId = null
        },
        executeSplitPane(
            stobj: object,
            action: PayloadAction<{ paneId: number; hoverState: HoverState }>
        ) {
            const state = <State>stobj
            const { paneId, hoverState } = action.payload
            splitPane(state, paneId, hoverState)
        },
        setZoomFactor: (stobj: object, action: PayloadAction<number>) => {
            const state = <State>stobj
            const zoomFactor = action.payload
            state.zoomFactor = zoomFactor
        },
        addTransaction: (
            stobj: object,
            action: PayloadAction<{
                tabId: number
                transactionFunction: CustomTransaction | CustomTransaction[]
            }>
        ) => {
            const state = <State>stobj
            const { tabId, transactionFunction } = action.payload
            const tabCache = state.tabCache[tabId]

            let newId: number
            if (tabCache.pendingTransactions.length === 0) {
                newId = 0
            } else {
                const oldIds = tabCache.pendingTransactions.map(
                    (x) => x.transactionId
                )
                newId = Math.max(...oldIds) + 1
            }

            tabCache.pendingTransactions.push({
                transactionId: newId,
                transactionFunction: transactionFunction,
            })
        },
        splitPaneUnselected: (
            stobj: object,
            action: PayloadAction<{ paneId: number; direction: HoverState }>
        ) => {
            const state = <State>stobj
            const { paneId, direction } = action.payload

            // First we split the pane
            const newPaneId = splitPane(state, paneId, direction)

            if (newPaneId == null) return

            // First get the current active tab
            const activeTabId = getPaneActiveTabId(state, paneId)

            if (activeTabId == null) return

            // Then we create a new tab with the same fileId as the activeTabid
            const activeTab = state.tabs[activeTabId]
            const fileId = activeTab.fileId

            // create a new tab
            const newTabId = insertNewTab(state, fileId, newPaneId)
            setActiveTab(state, newTabId)
            setSelectedFile(state, fileId)
        },
        splitCurrentPaneUnselected: (
            stobj: object,
            action: PayloadAction<{ direction: HoverState }>
        ) => {
            const state = <State>stobj
            // Get currently active pane
            const paneId = getActivePaneID(state)

            if (paneId == null) return

            const { direction } = action.payload

            // First we split the pane
            const newPaneId = splitPane(state, paneId, direction)

            if (newPaneId == null) return

            // First get the current active tab
            const activeTabId = getPaneActiveTabId(state, paneId)

            if (activeTabId == null) return

            // Then we create a new tab with the same fileId as the activeTabid
            const activeTab = state.tabs[activeTabId]
            const fileId = activeTab.fileId

            // create a new tab
            const newTabId = insertNewTab(state, fileId, newPaneId)
            setActiveTab(state, newTabId)
            setSelectedFile(state, fileId)
        },
        flushTransactions: (
            stobj: object,
            action: PayloadAction<{ tabId: number; transactionIds: number[] }>
        ) => {
            const state = <State>stobj
            const { tabId, transactionIds } = action.payload

            const tabCache = state.tabCache[tabId]
            const pendingTransactions = tabCache.pendingTransactions

            const newPendingTransactions = pendingTransactions.filter(
                (x) => !transactionIds.includes(x.transactionId)
            )

            tabCache.pendingTransactions = newPendingTransactions
        },
        moveToPane: (
            stobj: object,
            action: PayloadAction<{ paneDirection: string }>
        ) => {
            const state = <State>stobj
            const { paneDirection } = action.payload
            doMoveToAdjacentPane(state, paneDirection)
        },
        setRepoId(state: State, action: PayloadAction<string>) {
            state.repoId = action.payload
        },
        updateRepoProgress(state: State, action: PayloadAction<RepoProgress>) {
            state.repoProgress = action.payload
        },
        closeRateLimit(state: State) {
            state.showRateLimit = false
        },
        openRateLimit(state: State) {
            state.showRateLimit = true
        },
        closeNoAuthRateLimit(state: State) {
            state.showNoAuthRateLimit = false
        },
        openNoAuthRateLimit(state: State) {
            state.showNoAuthRateLimit = true
        },
        closeError(state: State) {
            state.showError = false
            state.errorValue = null
        },
        openError(
            state: State,
            action: PayloadAction<{ error?: ExpectedError }>
        ) {
            state.showError = true
            if (action.payload.error) {
                state.errorValue = action.payload.error
            } else {
                state.errorValue = null
            }
        },
        setVersion(state: State, action: PayloadAction<string>) {
            state.version = action.payload
        },
        afterFileWasAdded(state: State, action: PayloadAction<string>) {
            const path = action.payload
            const fileid = findFileIdFromPath(state, path)
            if (fileid != null) {
                if (state.files[fileid].deleted) {
                    state.files[fileid].deleted = false
                    return
                } else {
                    return
                }
            }
            const parentFolderPath = path.substring(
                0,
                path.lastIndexOf(connector.PLATFORM_DELIMITER)
            )
            const fileName = path.substring(
                path.lastIndexOf(connector.PLATFORM_DELIMITER) + 1
            )
            const parentFolderId = findFolderIdFromPath(
                state,
                parentFolderPath
            )!
            const newFileId = insertNewFile(state, parentFolderId, fileName)
            // const file = state.files[newFileId]
            delete state.fileCache[newFileId]
        },
        afterFileWasDeleted(state: State, action: PayloadAction<string>) {
            const path = action.payload
            const fileid = findFileIdFromPath(state, path)
            if (fileid == null) return
            const tabIds = Object.keys(state.tabs).filter((tabId) => {
                return state.tabs[parseInt(tabId)].fileId === fileid
            })

            if (tabIds.length > 0) {
                const file = state.files[fileid]
                file.deleted = true
            } else {
                doDeleteFile(state, fileid)
            }
        },
        afterFolderWasAdded(state: State, action: PayloadAction<string>) {
            const path = action.payload

            const folderid = findFolderIdFromPath(state, path)
            if (folderid != null) return

            const parentFolderPath = path.substring(
                0,
                path.lastIndexOf(connector.PLATFORM_DELIMITER)
            )
            const fileName = path.substring(
                path.lastIndexOf(connector.PLATFORM_DELIMITER) + 1
            )
            const parentFolderId = findFolderIdFromPath(
                state,
                parentFolderPath
            )!
            insertNewFolder(state, parentFolderId, fileName)
        },
        afterFolderWasDeleted(state: State, action: PayloadAction<string>) {
            const path = action.payload

            const folderid = findFolderIdFromPath(state, path)
            if (folderid == null) return

            const tabIds = Object.keys(state.tabs).filter((tabId) => {
                const fileid = state.tabs[parseInt(tabId)].fileId
                const file = state.files[fileid]
                const allParentIds =
                    file.parentFolderId == null
                        ? []
                        : [
                              file.parentFolderId,
                              ...getAllParentIds(state, file.parentFolderId),
                          ]
                return allParentIds.includes(folderid)
            })
            tabIds.forEach((tabId) => {
                doCloseTab(state, parseInt(tabId))
            })
            doDeleteFolder(state, folderid)
        },
        afterFileWasUpdated(
            state: State,
            action: PayloadAction<{ fileId: number; contents: string }>
        ) {
            const { fileId, contents } = action.payload
            if (fileId == null) return

            const file = state.files[fileId]
            if (!file.saved) return

            const cachedFile = state.fileCache[fileId]
            if (cachedFile == null) return
            if (contents === cachedFile.contents) return
            cachedFile.contents = contents
        },
        setFolderOpen(
            state: State,
            action: PayloadAction<{ folderId: number; isOpen: boolean }>
        ) {
            const { folderId, isOpen } = action.payload
            const folder = state.folders[folderId]
            folder.isOpen = isOpen
        },
        closeRemotePopup(state: State) {
            state.showRemotePopup = false
        },
        openRemotePopup(state: State) {
            state.showRemotePopup = true
        },
        setRemoteCommand(state: State, action: PayloadAction<string>) {
            state.remoteCommand = action.payload
        },
        setRemotePath(state: State, action: PayloadAction<string>) {
            state.remotePath = action.payload
        },
        setBadConnection(state: State) {
            state.remoteBad = true
        },
        afterSelectFile(
            state: State,
            action: PayloadAction<{ fileId: number; contents: string }>
        ) {
            const { fileId, contents } = action.payload
            updateCachedContents(state, fileId, contents)
            doSelectFile(state, fileId)
        },
        setIsNotFirstTime(state: State, action: PayloadAction<boolean>) {
            state.isNotFirstTime = action.payload
        },
        openTerminal(state: State) {
            state.terminalOpen = true
        },
        closeTerminal(state: State) {
            state.terminalOpen = false
        },
        toggleTerminal(state: State) {
            state.terminalOpen = !state.terminalOpen
        },
    },
})

export const {
    triggerRename,
    updateRenameName,
    closeTerminal,
    selectTab,
    codeUpdate,
    forceCloseTab,
    overwriteFolder,
    editorCreated,
    addTransaction,
    flushTransactions,
    scrollUpdate,
    vimUpdate,
    selectPane,
    moveTabToPane,
    setDraggingTab,
    stopDraggingTab,
    moveDraggingTabToPane,
    setZoomFactor,
    activeTab,
    insertTab,
    moveToPane,
    insertMultiTabAndSetActive,
    setMultiTabToDiff,
    setRepoId,
    updateRepoProgress,
    closeError,
    openError,
    setVersion,
    afterFileWasAdded,
    afterFolderWasAdded,
    afterFileWasDeleted,
    afterFolderWasDeleted,
    afterFileWasUpdated,
    setFolderOpen,
    closeRemotePopup,
    setRemoteCommand,
    setRemotePath,
    openRemotePopup,
    setBadConnection,
    afterSelectFile,
    executeSplitPane,
    splitPaneUnselected,
    splitCurrentPaneUnselected,
    setIsNotFirstTime,
    openTerminal,
    toggleTerminal,
    closeRateLimit,
    openRateLimit,
    closeNoAuthRateLimit,
    openNoAuthRateLimit,
} = globalSlice.actions

export default globalSlice.reducer
