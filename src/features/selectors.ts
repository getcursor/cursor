import { State, Pane, FullState, Folder } from './window/state'
import {
    getPathForFolderId,
    getPathForFileId,
    getRelativePathForFileId,
} from './window/fileUtils'
import { createSelector } from 'reselect'
import { store } from '../app/store'

export const getDraggingTabId = (state: {}) =>
    (<FullState>state).global.draggingTabId
export const getZoomFactor = (state: {}) => (<FullState>state).global.zoomFactor

export const getProgress = (state: {}) => (<FullState>state).global.repoProgress

// PANE SELECTORS
export const getPaneIsActive = (paneId: number) =>
    createSelector(
        (state: {}) => {
            return (<FullState>state).global.paneState.byIds
        },
        // Gets the actual pane
        (panes: State['paneState']['byIds']) => panes[paneId].isActive
    )
export const getPaneStateBySplits = (state: {}) =>
    (<FullState>state).global.paneState.bySplits
export const getPane = (paneId: number) =>
    createSelector(
        (state: {}) => {
            return (<FullState>state).global.paneState.byIds
        },
        // Gets the actual pane
        (panes: State['paneState']['byIds']) => panes[paneId]
    )

export const getEditorSelection = (tabId: number) =>
    createSelector(
        (state: {}) => (state as FullState).global.tabCache[tabId],
        (tab) => tab.initialEditorState?.selection
    )

export const getCurrentTab = (paneId: number) =>
    createSelector(
        getPane(paneId),
        (state: {}) => (<FullState>state).global.tabs,
        (pane: Pane, tabs: State['tabs']) => {
            connector
            if (pane) {
                for (let tabId of pane.tabIds) {
                    if (tabs[tabId].isActive) {
                        return tabId
                    }
                }
            }

            return null
            // We should probably throw an error instead and catch it elsewhere
            //throw new Error(`No active tab found for pane ${paneId}`);
        }
    )

export const selectFocusedTabId = createSelector(
    (state: {}) => (<FullState>state).global.paneState.byIds,
    (state: {}) => (<FullState>state).global.tabs,
    (panes: State['paneState']['byIds'], tabs: State['tabs']) => {
        for (let paneIdStr of Object.keys(panes)) {
            const paneId = parseInt(paneIdStr)
            if (panes[paneId].isActive) {
                const pane = panes[paneId]
                for (let tabId of pane.tabIds) {
                    if (tabs[tabId].isActive) {
                        return tabId
                    }
                }
                return null
            }
        }
        return null
        //throw new Error(`No active tab found for pane ${paneId}`);
    }
)

export const getFocusedTab = createSelector(
    (state: {}) => (<FullState>state).global.paneState.byIds,
    (state: {}) => (<FullState>state).global.tabs,
    (panes: State['paneState']['byIds'], tabs: State['tabs']) => {
        for (let paneIdStr of Object.keys(panes)) {
            const paneId = parseInt(paneIdStr)
            if (panes[paneId].isActive) {
                const pane = panes[paneId]
                for (let tabId of pane.tabIds) {
                    if (tabs[tabId].isActive) {
                        return tabs[tabId]
                    }
                }
                return null
            }
        }
        return null
        //throw new Error(`No active tab found for pane ${paneId}`);
    }
)

export const getCurrentPane = createSelector(
    (state: {}) => (<FullState>state).global.paneState.byIds,
    (panes: State['paneState']['byIds']) => {
        for (let paneIdStr of Object.keys(panes)) {
            const paneId = parseInt(paneIdStr)
            if (panes[paneId].isActive) {
                return paneId
            }
        }
        return null
        //throw new Error(`No active pane found`);
    }
)

// TAB SELECTORS
export const getTabs = createSelector(
    (state: {}) => (<FullState>state).global.tabs,
    // Gets the actual tab row
    (tabs: State['tabs']) => Object.values(tabs).filter((tab) => tab.isActive)
)

export const getTab = (tid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.tabs,
        // Gets the actual tab row
        (tabs: State['tabs']) => tabs[tid]
    )

export const getPageType = (tabId: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.tabs,
        (tabs: State['tabs']): 'multi' | 'editor' => {
            if (tabs[tabId].isMulti) {
                return 'multi'
            } else {
                return 'editor'
            }
        }
    )

const searchUnseenFiles = async (query: string, state: FullState) => {
    if (query == '') {
        return []
    }
    const rootPath = state.global.rootPath!
    // Now we need to search the files that haven't been seen yet

    let nameResultsFuture = await connector.searchFilesNameGit({
        query,
        rootPath,
    })
    let pathResultsFuture = await connector.searchFilesPathGit({
        query,
        rootPath,
    })

    const [initialNameResults, initialPathResults] = await Promise.all([
        nameResultsFuture,
        pathResultsFuture,
    ])
    let nameResults = sortPaths(query, initialNameResults)
    nameResults = nameResults.map(
        (path) => `${rootPath}${connector.PLATFORM_DELIMITER}${path}`
    )
    let pathResults = sortPaths(query, initialPathResults)
    pathResults = pathResults.map(
        (path) => `${rootPath}${connector.PLATFORM_DELIMITER}${path}`
    )
    pathResults = pathResults.filter((path) => !nameResults.includes(path))
    return [...nameResults, ...pathResults]
}

const preferredExtensions = (paths: string[]) => {
    // Common language extensions
    const extensions = new Set([
        'py',
        'js',
        'ts',
        'tsx',
        'jsx',
        'java',
        'go',
        'rb',
        'rs',
        'cpp',
        'c',
        'h',
        'hpp',
    ])

    paths.sort((a, b) => {
        const aExt = a.split('.').pop()!
        const bExt = b.split('.').pop()!

        if (extensions.has(aExt) && !extensions.has(bExt)) {
            return -1
        } else if (extensions.has(bExt) && !extensions.has(aExt)) {
            return 1
        } else {
            return 0
        }
    })
    return paths
}

const sortPaths = (origQuery: string, paths: string[]) => {
    let query = origQuery.toLowerCase()
    paths.sort((origA, origB) => {
        let a = origA.toLowerCase()
        let b = origB.toLowerCase()
        // First get the filenames
        const aFileName = a.split(connector.PLATFORM_DELIMITER).at(-1)
        const bFileName = b.split(connector.PLATFORM_DELIMITER).at(-1)
        if (aFileName && bFileName) {
            // If the query is in the filename, put it first
            if (aFileName.includes(query) && !bFileName.includes(query)) {
                return -1
            } else if (
                !aFileName.includes(query) &&
                bFileName.includes(query)
            ) {
                return 1
            } else if (aFileName.includes(query) && bFileName.includes(query)) {
                // If both have the query, show the one that starts with it first
                return aFileName.indexOf(query) - bFileName.indexOf(query)
            }
        }

        return a.indexOf(query) - b.indexOf(query)
    })

    return paths
}

export const searchAllFiles = async (query: string) => {
    const state = store.getState()
    const storeFiles = preferredExtensions(searchFile(query)(state))
    const unseenFiles = preferredExtensions(
        await searchUnseenFiles(query, state)
    ).filter((path) => !storeFiles.includes(path))

    // We only want the first 30 results
    return [...storeFiles, ...unseenFiles].slice(0, 30)
}

/// AMAN ADDITION FOR SEARCHING FOR FILES

// // FOLDER/FILE SELECTORS
// const searchAllFile = (query: string) => (state: {}) => {
//     const appFiles = searchFile

/// AMAN ADDITION FOR SEARCHING FOR FILES
export const searchFile = (query: string) =>
    createSelector(
        (state: {}) => (<FullState>state).global,
        (state: {}) => (<FullState>state).global.files,
        (state: State, files: State['files']) => {
            let resultsSet: {
                [path: string]: {
                    path: string
                    filename: string
                    score: number
                }
            } = {}

            const queryKeywords = query.toLowerCase().split(' ')

            const matchesQuery = (str: string) =>
                queryKeywords.every((keyword) =>
                    str.toLowerCase().replace(/\s+/g, '').includes(keyword)
                )

            for (let fid in files) {
                let fileId = parseInt(fid)
                const file = files[fid]
                let filename = file.name
                const path = getPathForFileId(state, fileId)

                if (query === '' || matchesQuery(path)) {
                    resultsSet[path] = { path, filename, score: 0 }

                    if (Object.keys(resultsSet).length > 50) {
                        break
                    }
                }
            }

            // Second pass
            for (let fid in files) {
                let fileId = parseInt(fid)
                const file = files[fid]
                let filename = file.name
                const path = getPathForFileId(state, fileId)
                const relativePath = getRelativePathForFileId(state, fileId)

                if (query === '' || matchesQuery(relativePath)) {
                    if (!(path in resultsSet)) {
                        resultsSet[path] = { path, filename, score: 1 }
                    }
                    if (Object.keys(resultsSet).length > 50) {
                        break
                    }
                }
            }

            let results = [
                ...Object.values(resultsSet).map((r) => ({
                    path: r.path,
                    filename: r.filename,
                })),
            ]
            // First sort by how early the match shows up in the string (lower index is better)
            results.sort((a, b) => {
                return (
                    a.filename.toLowerCase().indexOf(query.toLowerCase()) -
                    b.filename.toLowerCase().indexOf(query.toLowerCase())
                )
            })

            // Then sort by the scores we set - which means it takes priority
            results.sort((a, b) => {
                return resultsSet[a.path].score - resultsSet[b.path].score
            })

            return [...Object.keys(resultsSet)]
        }
    )
/// END OF AMAN ADDITION FOR SEARCHING FOR FILES

export const getFolder = (fid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.folders,
        // Gets the actual folder
        (folders: State['folders']) => folders[fid]
    )

export const getNotDeletedFiles = (parendFolderId: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.folders,
        (state: {}) => (<FullState>state).global.files,
        (folders: State['folders'], files: State['files']) => {
            const folder = folders[parendFolderId]
            return folder.fileIds.filter((fid) => !files[fid].deleted)
        }
    )

export const getFileName = (fid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.files,
        // Gets the actual file
        (files: State['files']) => files[fid].name
    )

export const getCurrentFileId = createSelector(
    (state: FullState) => getCurrentPane(state),
    (state: FullState) => state,
    (paneId, state) => {
        if (!paneId) return
        const tabId = getCurrentTab(paneId)(state)

        if (!tabId) return
        const tab = getTab(tabId)(state)
        return tab.fileId
    }
)

export const getCurrentFileName = createSelector(
    (state: FullState) => getCurrentPane(state),
    (state: FullState) => state,
    (paneId, state) => {
        if (!paneId) return
        const tabId = getCurrentTab(paneId)(state)

        if (!tabId) return
        const tab = getTab(tabId)(state)
        const fileId = tab.fileId
        const fileName = getFileName(fileId)(state)
        return fileName
    }
)

export const getCurrentFilePath = createSelector(
    (state: FullState) => getCurrentPane(state),
    (state: FullState) => state,
    (paneId, state) => {
        if (!paneId) return
        const tabId = getCurrentTab(paneId)(state)
        if (!tabId) return
        const tab = getTab(tabId)(state)
        const fileId = tab.fileId
        const filePath = getPathForFileId(state.global, fileId)
        return filePath
    }
)

export const getAllPaths = createSelector(
    (state: {}) => (<FullState>state).global.files,
    (state: {}) => (<FullState>state).global.folders,
    (state: {}) => (<FullState>state).global,
    (files: State['files'], folders: State['folders'], state) => {
        let filePaths: Set<string> = new Set()
        let folderPaths: Set<string> = new Set()
        for (let fid in files) {
            const fileId = parseInt(fid)
            const path = getPathForFileId(state, fileId)
            filePaths.add(path)
        }
        for (let fid in folders) {
            const folderId = parseInt(fid)
            const path = getPathForFolderId(state, folderId)
            folderPaths.add(path)
        }
        return {
            filePaths: Array.from(filePaths),
            folderPaths: Array.from(folderPaths),
        }
    }
)

export const getFileRenameName = (fid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.files,
        // Gets the actual file
        (files: State['files']) => files[fid].renameName
    )

export const getFileIndentUnit = (fid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.files,
        // Gets the actual file
        (files: State['files']) => files[fid].indentUnit
    )

export const getFile = (fid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.files,
        // Gets the actual file
        (files: State['files']) => files[fid]
    )

export const getFolders = (state: {}) => (<FullState>state).global.folders

function getDepthWrapper(
    files: State['files'],
    folders: State['folders']
): (currentFid: number, isFile: boolean) => number {
    function getDepthHelper(
        currentFid: number,
        isFile: boolean = false
    ): number {
        if (isFile) {
            if (files[currentFid].parentFolderId == null) {
                return 0
            } else {
                return getDepthHelper(files[currentFid].parentFolderId) + 1
            }
        } else {
            const folder = folders[currentFid]
            if (folder.parentFolderId == null) {
                return 0
            } else {
                return getDepthHelper(folder.parentFolderId) + 1
            }
        }
    }
    return getDepthHelper
}

export const getDepth = (folderId: number, isFile: boolean = false) =>
    createSelector(
        (state: {}) => {
            return (<FullState>state).global.files
        },
        (state: {}) => (<FullState>state).global.folders,
        (files: State['files'], folders: State['folders']) =>
            getDepthWrapper(files, folders)(folderId, isFile)
    )

export const getFolderPath =
    (fid: number, includeRoot: boolean = true) =>
    (state: FullState) =>
        getPathForFolderId(state.global, fid, includeRoot)

export const getFilePath =
    (fid: number, includeRoot: boolean = true) =>
    (state: FullState) =>
        getPathForFileId(state.global, fid, includeRoot)

export const getRelativeFilePath = (fid: number) => (state: FullState) =>
    getRelativePathForFileId(state.global, fid)

// EDITOR SELECTORS
export const getFileContents = (fid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.fileCache,
        (fileCache: State['fileCache']) => fileCache[fid].contents
    )

// EDITOR SELECTORS
export const getFileResetContents = (fid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.fileCache,
        (fileCache: State['fileCache']) => fileCache[fid].counter
    )

export const getCachedTab = (tid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.tabCache,
        (tabCache: State['tabCache']) => tabCache[tid]
    )

// CodeMirror Transaction Selectors
export const getPendingTransactions = (tid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.tabCache,
        (tabCache: State['tabCache']) => tabCache[tid].pendingTransactions
    )

// TODO modify to be selectors
export const getKeyListeners = (state: FullState) =>
    state.global.keyboardBindings
export const getRootPath = (state: FullState) => state.global.rootPath

export const getShowErrors = (state: FullState) => state.global.showError
export const getShowRateLimit = (state: FullState) => state.global.showRateLimit
export const getErrorType = (state: FullState) => state.global.errorType
export const getErrorInfo = (state: FullState) => state.global.errorInfo

export const getVersion = (state: FullState) => state.global.version

export const getShowRemotePopup = (state: FullState) =>
    state.global.showRemotePopup
export const getRemoteCommand = (state: FullState) => state.global.remoteCommand
export const getRemotePath = (state: FullState) => state.global.remotePath
export const getRemoteBad = (state: FullState) => state.global.remoteBad

export const getFolderOpen = (fid: number) =>
    createSelector(
        (state: {}) => (<FullState>state).global.folders[fid],
        (folder: Folder) => {
            return folder.isOpen
        }
    )
export const getIsNotFirstTime = (state: FullState) =>
    state.global.isNotFirstTime
