import {
    CachedFile,
    File,
    Folder,
    FullState,
    State,
    initialState,
    nextFileID,
    nextFolderID,
} from './state'

import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'

// Returns a new CachedFile object with the given contents and a counter of 0.
export function newCachedFile(contents = ''): CachedFile {
    return {
        contents,
        counter: 0,
    }
}

export function createCachedFileIfNotExists(
    state: State,
    fileId: number,
    contents = ''
) {
    if (!(fileId in state.fileCache)) {
        state.fileCache[fileId] = newCachedFile(contents)
    }
}

export function isValidRenameName(state: State) {
    if (state.rightClickId == null) return false
    const files = state.isRightClickAFile ? state.files : state.folders
    const file = files[state.rightClickId]
    let isRenameNameTaken = false
    if (file.parentFolderId != null) {
        const parent = state.folders[file.parentFolderId]
        isRenameNameTaken = parent.fileIds.some((id) => {
            return state.files[id].name === file.renameName
        })
    }
    return (
        file.renameName != null &&
        !file.renameName.includes(connector.PLATFORM_DELIMITER) &&
        (file.renameName == file.name || !isRenameNameTaken)
    )
}

export function clearSelectedFiles(state: State) {
    Object.values(state.files).forEach((file) => {
        file.isSelected = false
    })
}

export function setSelectedFile(state: State, fileId: number) {
    clearSelectedFiles(state)
    state.files[fileId].isSelected = true
}

export function getAllParentIds(state: State, folderid: number): number[] {
    const folder = state.folders[folderid]
    if (folder.parentFolderId == null) {
        return []
    }
    return [
        folder.parentFolderId,
        ...getAllParentIds(state, folder.parentFolderId),
    ]
}

export function doDeleteFile(state: State, fileid: number) {
    const file = state.files[fileid]
    const folder = state.folders[file.parentFolderId]
    folder.fileIds.splice(folder.fileIds.indexOf(fileid), 1)
    delete state.files[fileid]
    delete state.fileCache[fileid]
}

export function doDeleteFolder(state: State, folderid: number) {
    const parentFolderId = state.folders[folderid].parentFolderId
    if (parentFolderId == null) return
    const parentFolder = state.folders[parentFolderId]

    // copy the file ids
    const fileIds = [...state.folders[folderid].fileIds]
    const folderIds = [...state.folders[folderid].folderIds]

    // recursive delete
    fileIds.forEach((fileid) => {
        doDeleteFile(state, fileid)
    })
    folderIds.forEach((folderid) => {
        doDeleteFolder(state, folderid)
    })

    parentFolder.folderIds.splice(parentFolder.folderIds.indexOf(folderid), 1)
    delete state.folders[folderid]
}

export function updateCachedContents(
    state: State,
    fileId: number,
    contents: string
) {
    createCachedFileIfNotExists(state, fileId, contents)
    state.fileCache[fileId].contents = contents
}

export function getRootFolder(state: State) {
    return state.folders[1]
}
export function getVeryRootFolder(state: State) {
    return state.folders[0]
}

export function getNameFromPath(path: string) {
    const splitPath = path.split(connector.PLATFORM_DELIMITER)!
    return splitPath.pop()!
}

export function getPathForFolderId(
    state: State,
    folderid: number,
    includeRoot = true
): string {
    const folder = state.folders[folderid]
    if (folder.parentFolderId == null) {
        if (folder.name == '') {
            // This is some tech debt taken to handle root paths
            return ''
        } else {
            return includeRoot ? state.rootPath! : folder.name
        }
    }
    const out =
        getPathForFolderId(state, folder.parentFolderId) +
        connector.PLATFORM_DELIMITER +
        folder.name
    return out
}

export function getPathForFileId(
    state: State,
    fileid: number,
    includeRoot = true
): string {
    const file = state.files[fileid]
    return (
        getPathForFolderId(state, file.parentFolderId, includeRoot) +
        connector.PLATFORM_DELIMITER +
        file.name
    )
}

export function getRelativePathForFolderId(
    state: State,
    folderid: number
): string {
    const folder = state.folders[folderid]
    if (folder.parentFolderId == null) {
        return ''
    }
    const parentPath = getRelativePathForFolderId(state, folder.parentFolderId)
    if (parentPath == '') {
        return folder.name
    } else {
        return parentPath + connector.PLATFORM_DELIMITER + folder.name
    }
}

export function getRelativePathForFileId(state: State, fileid: number): string {
    const file = state.files[fileid]
    const parentPath = getRelativePathForFolderId(state, file.parentFolderId)
    if (parentPath == '') {
        return file.name
    } else {
        return parentPath + connector.PLATFORM_DELIMITER + file.name
    }
}

// Slow, we can change later
export function findFolderIdFromPath(state: State, path: string) {
    if (path === '') {
        // 0 corresponds to the very root path always
        return 0
    }

    if (path.toLowerCase().startsWith('\\c:')) {
        path = path.slice(1)
    }
    let folder
    if (path.toLowerCase().startsWith(state.rootPath!.toLowerCase())) {
        // First we remove state.rootPath from path
        path = path.slice(state.rootPath!.length)
        folder = getRootFolder(state)
    } else {
        folder = getVeryRootFolder(state)
    }
    // Then we remove trailing and leading slashes
    path = path.replace(/^\/|\/$/g, '')
    // remove trailing backslashes
    path = path.replace(/\\$/g, '')
    // remove leading backslashes
    path = path.replace(/^\\/g, '')

    if (path === '') {
        // 1 corresponds to the rootPath always
        return 1
    }

    const parts = path.split(connector.PLATFORM_DELIMITER)
    let folderid = undefined
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        folderid = folder.folderIds.find(
            (id) => state.folders[id].name === part
        )
        if (folderid == null) {
            return null
        }
        folder = state.folders[folderid]
    }

    return folderid
}

// Slow, we can change later
export function findFileIdFromPath(state: State, path: string) {
    const parentFolderPath = path
        .split(connector.PLATFORM_DELIMITER)
        .slice(0, -1)
        .join(connector.PLATFORM_DELIMITER)
    const folderid = findFolderIdFromPath(state, parentFolderPath)
    if (!folderid) {
        return null
    }
    const folder = state.folders[folderid]
    const name = getNameFromPath(path)
    const fileid = folder.fileIds.find((id) => state.files[id].name === name)
    if (!fileid) {
        return null
    }
    return fileid
}

export function getNewFileName(state: State, folderid: number) {
    const folder = state.folders[folderid]
    let i = 0
    while (true) {
        const name = `new_file_${i}`
        if (!folder.fileIds.find((id) => state.files[id].name === name)) {
            return name
        }
        i++
    }
}

export function getNewFolderName(state: State, folderid: number) {
    const folder = state.folders[folderid]
    let i = 0
    while (true) {
        const name = `new_folder_${i}`
        if (!folder.folderIds.find((id) => state.folders[id].name === name)) {
            return name
        }
        i++
    }
}

export function sortFolder(state: State, folderid: number) {
    const folder = state.folders[folderid]
    folder.folderIds.sort((a, b) => {
        return state.folders[a].name.localeCompare(state.folders[b].name)
    })
    folder.fileIds.sort((a, b) => {
        return state.files[a].name.localeCompare(state.files[b].name)
    })
}

export function sortAllFolders(state: State) {
    for (const folderid in state.folders) {
        sortFolder(state, parseInt(folderid))
    }
}

export function insertNewFolder(
    state: State,
    parentFolderId: number,
    name: string
) {
    const folderId = nextFolderID(state)
    const folder: Folder = {
        parentFolderId,
        name,
        renameName: null,
        fileIds: [],
        folderIds: [],
        loaded: false,
        isOpen: false,
    }
    state.folders[folderId] = folder
    state.folders[parentFolderId].folderIds.push(folderId)

    // sort the files
    sortFolder(state, parentFolderId)

    return folderId
}

export function insertNewFile(
    state: State,
    parentFolderId: number,
    name: string
) {
    const fileid = nextFileID(state)
    const file: File = {
        parentFolderId,
        name,
        renameName: null,
        isSelected: false,
        saved: true,
    }
    state.files[fileid] = file
    state.folders[parentFolderId].fileIds.push(fileid)

    // set the file cache
    createCachedFileIfNotExists(state, fileid)
    state.fileCache[fileid].contents = ''

    // sort the files
    sortFolder(state, parentFolderId)

    return fileid
}

export function triggerFileRename(state: State) {
    if (state.rightClickId == null) return false
    const file = state.isRightClickAFile
        ? state.files[state.rightClickId]
        : state.folders[state.rightClickId]
    file.renameName = file.name
}

export function triggerFolderRename(state: State, folderId: number) {
    const folder = state.folders[folderId]
    folder.renameName = folder.name
    state.rightClickId = folderId
}

export function commitFileRename(state: State) {
    if (state.rightClickId == null) return false
    const file = state.isRightClickAFile
        ? state.files[state.rightClickId]
        : state.folders[state.rightClickId]
    if (file.renameName == null) {
        return
    }
    file.name = file.renameName
    file.renameName = null

    if (file.parentFolderId != null) sortFolder(state, file.parentFolderId)
}

export function abortFileRename(state: State) {
    if (state.rightClickId == null) return false
    const file = state.isRightClickAFile
        ? state.files[state.rightClickId]
        : state.folders[state.rightClickId]
    file.renameName = null
}

export async function getContentsIfNeeded(state: State, fileid: number) {
    const cachedFile = state.fileCache[fileid]
    if (cachedFile) {
        return cachedFile.contents
    } else {
        const path = getPathForFileId(state, fileid)
        // @ts-ignore
        const contents = await connector.getFile(path)
        return contents
    }
}

/**********************************************************************
 * ****************** Logic for adding existing files *****************
 **********************************************************************/

export const addExistingFile = createAsyncThunk(
    'files/addExistingFile',
    async (path: string, { getState, dispatch }) => {
        const fileid = nextFileID((<FullState>getState()).global)
        const name = getNameFromPath(path)!

        const parentFolderPath = path
            .split(connector.PLATFORM_DELIMITER)
            .slice(0, -1)
            .join(connector.PLATFORM_DELIMITER)
        let parentFolderId = findFolderIdFromPath(
            (<FullState>getState()).global,
            parentFolderPath
        )

        if (parentFolderId == null) {
            dispatch(fileSlice.actions.addExistingFolder(parentFolderPath))
            parentFolderId = findFolderIdFromPath(
                (<FullState>getState()).global,
                parentFolderPath
            )!
        }

        const file: File = {
            parentFolderId,
            name,
            renameName: null,
            isSelected: false,
            saved: true,
        }
        dispatch(
            fileSlice.actions.addFileToState({ fileid, file, parentFolderId })
        )
        return fileid
    }
)

export const loadFileIfNeeded = createAsyncThunk(
    'files/loadFileIfNeeded',
    async (path: string, { getState, dispatch }) => {
        let fileId: number | null
        fileId = findFileIdFromPath((<FullState>getState()).global, path)
        if (!fileId) {
            const response = await dispatch(addExistingFile(path))
            // Check that the dispatch worked
            if (addExistingFile.fulfilled.match(response)) {
                fileId = response.payload
            } else {
                return null
            }
        }
        const contents = await getContentsIfNeeded(
            (<FullState>getState()).global,
            fileId
        )
        const finalContents = contents.replace(/\r\n/g, '\n')
        return { fileId, contents: finalContents }
    }
)
async function createFile(fileName: string, data: string) {
    // @ts-ignore
    await connector.saveFile(fileName, data)
}
async function checkIfFileExists(fileName: string) {
    // @ts-ignore
    return await connector.checkFileExists(fileName)
}

export const createFileIfNeeded = createAsyncThunk(
    'files/createFileIfNeeded',
    async (fileName: string, { dispatch }) => {
        // First, check if the file exists
        const fileExists = await checkIfFileExists(fileName)
        if (!fileExists) {
            // If the file does not exist, create it
            await createFile(fileName, '')
        }

        // Then, load the file
        const fileResult = await dispatch(loadFileIfNeeded(fileName))
        if (
            !loadFileIfNeeded.fulfilled.match(fileResult) ||
            fileResult.payload == null
        ) {
            return
        }
        const { contents } = fileResult.payload

        return contents
    }
)

export const fileSlice = createSlice({
    name: 'file',
    initialState,
    extraReducers: (builder) => {
        builder.addCase(loadFileIfNeeded.fulfilled, (state, action) => {
            if (action.payload == null) {
                return
            }

            const { fileId, contents } = action.payload
            createCachedFileIfNotExists(state, fileId, contents)
        })
    },
    reducers: {
        addExistingFolder: (stobj: object, action: PayloadAction<string>) => {
            const _addExistingFolder = (state: State, path: string) => {
                const folderid = nextFolderID(state)
                const name = getNameFromPath(path)!

                const folder: Folder = {
                    parentFolderId: null,
                    name,
                    folderIds: [],
                    fileIds: [],
                    renameName: null,
                    loaded: false,
                    isOpen: false,
                }
                state.folders[folderid] = folder

                const parentPath = path
                    .split(connector.PLATFORM_DELIMITER)
                    .slice(0, -1)
                    .join(connector.PLATFORM_DELIMITER)

                let parentFolderId = findFolderIdFromPath(state, parentPath)
                if (parentFolderId == null) {
                    parentFolderId = _addExistingFolder(state, parentPath)
                }
                // Add appropriate parent folder id pointers
                state.folders[parentFolderId].folderIds.push(folderid)
                state.folders[folderid].parentFolderId = parentFolderId

                return folderid
            }
            _addExistingFolder(<State>stobj, action.payload)
        },
        addFileToState: (
            stobj: object,
            action: PayloadAction<{
                fileid: number
                file: File
                parentFolderId: number
            }>
        ) => {
            const { fileid, file, parentFolderId } = action.payload
            const state = <State>stobj
            state.folders[parentFolderId].fileIds.push(fileid)
            state.files[fileid] = file
        },
    },
})
