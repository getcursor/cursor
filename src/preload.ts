import {
    IpcRendererEvent,
    contextBridge,
    ipcRenderer,
    webFrame,
} from 'electron'
import {
    LSPNotifyMap,
    LSPRequestMap,
    Language,
} from './features/lsp/stdioClient'
import { Settings } from './features/window/state'
import { getPlatformInfo } from './utils'

// import { clientPreloads } from './features/stdioClient';

type NotificationCallback = (data: any) => void
type RequestCallback = (data: any) => any
type Callback = () => void

const addRemoveCallbacks = () => {
    const notificationCallbacks: { [language: string]: NotificationCallback } =
        {}
    const requestCallbacks: { [language: string]: RequestCallback } = {}

    return {
        addNotificationCallback: (
            callback: NotificationCallback,
            language: Language
        ) => {
            if (language in notificationCallbacks) {
                ipcRenderer.removeListener(
                    'notificationCallbackLS',
                    notificationCallbacks[language]
                )
            }

            notificationCallbacks[language] = callback
            ipcRenderer.addListener(
                'notificationCallbackLS',
                (
                    event: IpcRendererEvent,
                    data: { language: string; data: any }
                ) => {
                    callback(data.data)
                }
            )
        },
        removeNotificationCallback(language: Language) {
            if (language in notificationCallbacks) {
                ipcRenderer.removeListener(
                    'notificationCallbackLS',
                    notificationCallbacks[language]
                )
                delete notificationCallbacks[language]
            }
        },
        addRequestCallback: (callback: RequestCallback, language: Language) => {
            if (language in requestCallbacks) {
                ipcRenderer.removeListener(
                    'requestCallbackLS',
                    requestCallbacks[language]
                )
            }

            requestCallbacks[language] = callback
            ipcRenderer.addListener(
                'requestCallbackLS',
                (
                    event: IpcRendererEvent,
                    data: { language: string; data: any; identifier: string }
                ) => {
                    // This was a bug that I fixed where we used to just use callback
                    // here rather than first check the language
                    const result = requestCallbacks[data.language](data.data)
                    ipcRenderer.invoke(
                        'responseCallbackLS' + data.identifier,
                        result
                    )
                }
            )
        },
        removeRequestCallback(language: Language) {
            if (language in requestCallbacks) {
                ipcRenderer.removeListener(
                    'requestCallbackLS',
                    requestCallbacks[language]
                )
                delete requestCallbacks[language]
            }
        },
    }
}

export const clientPreloads = () => {
    return {
        stopLS: async (language: Language) => {
            return await ipcRenderer.invoke('stopLS', language)
        },
        getLSState: async (language: Language) => {
            return await ipcRenderer.invoke('getLSState', language)
        },
        installLS: async (language: Language, rootDir: string) => {
            return await ipcRenderer.invoke('installLS', { language, rootDir })
        },
        startLS: async (language: Language, rootDir: string) => {
            return await ipcRenderer.invoke('startLS', { language, rootDir })
        },
        sendRequestLS: async <K extends keyof LSPRequestMap>(payload: {
            language: Language
            method: K
            params: LSPRequestMap[K][0]
        }) => {
            return await ipcRenderer.invoke('sendRequestLS', payload)
        },
        sendNotificationLS: async <K extends keyof LSPNotifyMap>(payload: {
            language: Language
            method: K
            params: LSPNotifyMap[K]
        }) => {
            return await ipcRenderer.invoke('sendNotificationLS', payload)
        },
        killLS: async (language: Language) => {
            await ipcRenderer.invoke('killLS', language)
        },
        killAllLS: async () => {
            await ipcRenderer.invoke('killAllLS')
        },
        ...addRemoveCallbacks(),
    }
}
const info = getPlatformInfo()
const electronConnector = {
    PLATFORM_DELIMITER: info.PLATFORM_DELIMITER,
    PLATFORM_META_KEY: info.PLATFORM_META_KEY,
    PLATFORM_CM_KEY: info.PLATFORM_CM_KEY,
    IS_WINDOWS: info.IS_WINDOWS,
    getFolder: (
        dir: string,
        children: string[] = [],
        depth = 1,
        badDirectories: string[] = []
    ) => ipcRenderer.invoke('get_folder', dir, children, depth, badDirectories),
    getFile: (dir: string) => ipcRenderer.invoke('get_file', dir),

    initProject: (dir: string) => {
        return ipcRenderer.invoke('initProject', dir)
    },
    indexProject: (dir: string) => {
        return ipcRenderer.invoke('indexProject', dir)
    },
    syncProject: (dir: string) => {
        return ipcRenderer.invoke('syncProject', dir)
    },
    /// Settings
    changeSettings: (settings: Settings) =>
        void ipcRenderer.invoke('changeSettings', settings),
    initSettings: () => ipcRenderer.invoke('initSettings'),

    setRemoteFileSystem: (blob: any) =>
        ipcRenderer.invoke('set_remote_file_system', blob),

    getRemote: () => ipcRenderer.invoke('getRemote'),

    logToFile: (obj: any) => ipcRenderer.invoke('logToFile', obj),

    maximize: () => ipcRenderer.invoke('maximize'),
    minimize: () => ipcRenderer.invoke('minimize'),
    close: () => ipcRenderer.invoke('close'),

    returnHomeDir: () => ipcRenderer.invoke('return_home_dir'),

    // getProgress: (repoId: string) => ipcRenderer.invoke('getProgress', repoId),
    saveFile: (path: string, data: string) =>
        ipcRenderer.invoke('saveFile', { path: path, data: data }),
    checkFileExists: (path: string) =>
        ipcRenderer.invoke('checkFileExists', path),
    saveFolder: (path: string) => ipcRenderer.invoke('save_folder', path),
    registerSaved: (callback: Callback) => ipcRenderer.on('saved', callback),

    registerOpenRemotePopup: (callback: Callback) =>
        ipcRenderer.on('openRemotePopup', callback),

    registerIncData(callback: (event: any, data: any) => void) {
        ipcRenderer.on('terminal-incData', callback)
    },
    deregisterIncData(callback: (event: any, data: any) => void) {
        ipcRenderer.removeListener('terminal-incData', callback)
    },
    terminalInto: (data: any) => ipcRenderer.invoke('terminal-into', data),
    terminalClickLink: (data: any) =>
        ipcRenderer.invoke('terminal-click-link', data),
    terminalResize: (data: any) => ipcRenderer.invoke('terminal-resize', data),

    registerFileWasAdded: (callback: Callback) =>
        ipcRenderer.on('fileWasAdded', callback),
    registerFileWasDeleted: (callback: Callback) =>
        ipcRenderer.on('fileWasDeleted', callback),
    registerFolderWasAdded: (callback: Callback) =>
        ipcRenderer.on('folderWasAdded', callback),
    registerFolderWasDeleted: (callback: Callback) =>
        ipcRenderer.on('folderWasDeleted', callback),
    registerFileWasUpdated: (callback: Callback) =>
        ipcRenderer.on('fileWasUpdated', callback),

    checkSave: (path: string) => ipcRenderer.invoke('checkSave', path),

    createTutorDir: (path: string) =>
        ipcRenderer.invoke('createTutorDir', path),

    getLastModifiedTime: (path: string) =>
        ipcRenderer.invoke('getLastModifiedTime', path),

    copyToClipboard: (path: string) => ipcRenderer.invoke('copy_file', path),

    getUploadPreference: () => ipcRenderer.invoke('getUploadPreference', null),
    saveUploadPreference: (data: any) =>
        ipcRenderer.invoke('saveUploadPreference', data),

    setStore: (key: string, blob: any) => {
        ipcRenderer.invoke('setStore', { key, blob })
    },
    getStore: (key: string) => ipcRenderer.invoke('getStore', key),
    appendToArray: (arrayKey: string, value: any) => {
        ipcRenderer.invoke('appendToArray', { arrayKey, value })
    },
    getAllArrayValues: (key: string) =>
        ipcRenderer.invoke('getAllArrayValues', key),

    saveComments: (blob: any) => {
        ipcRenderer.invoke('saveComments', blob)
    },
    loadComments: (path: string) => {
        ipcRenderer.invoke('loadComments', path)
    },
    saveTests: (blob: any) => {
        return ipcRenderer.invoke('saveTests', blob)
    },
    loadTests: (blob: any) => {
        return ipcRenderer.invoke('loadTests', blob)
    },
    getProject: () => ipcRenderer.invoke('getProject'),
    saveProject: (data: unknown) => ipcRenderer.invoke('saveProject', data),

    getClipboard: () => ipcRenderer.invoke('getClipboard', null),

    renameFile: (old_path: string, new_path: string) =>
        ipcRenderer.invoke('rename_file', {
            old_path: old_path,
            new_path: new_path,
        }),
    rightClickFile: () => ipcRenderer.invoke('right_click_file', null),
    rightClickTab: () => ipcRenderer.invoke('right_click_tab', null),
    deleteFile: (path: string) => ipcRenderer.invoke('delete_file', path),
    openContainingFolder: (path: string) =>
        ipcRenderer.invoke('open_containing_folder', path),
    deleteFolder: (path: string) => ipcRenderer.invoke('delete_folder', path),
    rightClickFolder: (path: string, isRoot: boolean) =>
        ipcRenderer.invoke('right_click_folder', {
            path: path,
            isRoot: isRoot,
        }),

    rightMenuAtToken: (payload: {
        includeAddToPrompt: boolean
        codeBlock: {
            fileId: number
            text: string
            startLine: number
            endLine: number
        }
        path: string
        offset: number
        // word: { from: number; to: number }
    }) => ipcRenderer.invoke('rightMenuAtToken', payload),

    getVersion: () => ipcRenderer.invoke('get_version', null),
    checkLearnCodebase: () => ipcRenderer.invoke('check_learn_codebase', null),
    registerLearnCodebase: (callback: Callback) =>
        ipcRenderer.on('register_learn_codebase', callback),

    remove_all: () => {
        ipcRenderer.removeAllListeners('rename_file_click')
        ipcRenderer.removeAllListeners('delete_file_click')
        ipcRenderer.removeAllListeners('open_containing_folder_click')
        ipcRenderer.removeAllListeners('new_file_click')
        ipcRenderer.removeAllListeners('new_folder_click')
        ipcRenderer.removeAllListeners('new_chat_click')
        ipcRenderer.removeAllListeners('close_tab')
        ipcRenderer.removeAllListeners('close_all_tabs_click')
    },
    registerRenameClick: (callback: Callback) =>
        ipcRenderer.on('rename_file_click', callback),
    registerDeleteClick: (callback: Callback) =>
        ipcRenderer.on('delete_file_click', callback),
    registerOpenContainingFolderClick: (callback: Callback) =>
        ipcRenderer.on('open_containing_folder_click', callback),
    registerDeleteFolderClick: (callback: Callback) =>
        ipcRenderer.on('delete_folder_click', callback),
    registerNewFileClick: (callback: Callback) =>
        ipcRenderer.on('new_file_click', callback),
    registerNewFolderClick: (callback: Callback) =>
        ipcRenderer.on('new_folder_click', callback),

    // Added for the chatbot
    registerNewChatClick: (callback: Callback) =>
        ipcRenderer.on('new_chat_click', callback),

    registerCloseTab: (callback: Callback) =>
        ipcRenderer.on('close_tab', callback),

    registerCloseAllTabs: (callback: Callback) =>
        ipcRenderer.on('close_all_tabs_click', callback),
    openFolder: () => ipcRenderer.invoke('open_folder', null),
    registerOpenFolder: (callback: Callback) =>
        ipcRenderer.on('open_folder_triggered', callback),
    // cancelRequest: () => ipcRenderer.invoke('cancelRequest', null),

    searchRipGrep: (payload: {
        query: string
        rootPath: string
        badPaths: string[]
        caseSensitive: boolean
    }) => ipcRenderer.invoke('searchRipGrep', payload),
    searchFilesName: (payload: { query: string; rootPath: string }) =>
        ipcRenderer.invoke('searchFilesName', payload),
    searchFilesPath: (payload: { query: string; rootPath: string }) =>
        ipcRenderer.invoke('searchFilesPath', payload),
    searchFilesPathGit: (payload: { query: string; rootPath: string }) =>
        ipcRenderer.invoke('searchFilesPathGit', payload),
    searchFilesNameGit: (payload: { query: string; rootPath: string }) =>
        ipcRenderer.invoke('searchFilesNameGit', payload),

    checkCloseTab: (path: string) =>
        ipcRenderer.invoke('check_close_tab', path),
    registerForceSaveAndCloseTab: (callback: Callback) =>
        ipcRenderer.on('force_save_and_close_tab', callback),
    registerForceCloseTab: (callback: Callback) =>
        ipcRenderer.on('force_close_tab', callback),

    registerZoom: (callback: (arg: number) => void) => {
        function def() {
            webFrame.setZoomLevel(-1)
            callback(webFrame.getZoomFactor())
        }
        def()
        ipcRenderer.on('zoom_in', () => {
            webFrame.setZoomLevel(webFrame.getZoomLevel() + 1)
            callback(webFrame.getZoomFactor())
        })
        ipcRenderer.on('zoom_out', () => {
            webFrame.setZoomLevel(webFrame.getZoomLevel() - 1)
            callback(webFrame.getZoomFactor())
        })
        ipcRenderer.on('zoom_reset', () => {
            def()
        })
    },
    zoomIn: () => webFrame.setZoomLevel(webFrame.getZoomLevel() + 1),
    zoomOut: () => webFrame.setZoomLevel(webFrame.getZoomLevel() - 1),
    zoomReset: () => webFrame.setZoomLevel(-1),

    getPlatform: () => {
        return ipcRenderer.invoke('get_platform')
    },

    registerSearch: (callback: Callback) => ipcRenderer.on('search', callback),
    registerFileSearch: (callback: Callback) =>
        ipcRenderer.on('fileSearch', callback),
    registerCommandPalette: (callback: Callback) =>
        ipcRenderer.on('commandPalette', callback),
    ...clientPreloads(),
    registerGetDefinition(callback: (arg: any) => void) {
        ipcRenderer.on('getDefinition', (event, data) => {
            callback(data)
        })
    },
    registerAddCodeToPrompt(callback: (arg: any) => void) {
        ipcRenderer.on('addCodeToPrompt', (event, data) => {
            callback(data)
        })
    },
    setCookies: async (cookieObject: {
        url: string
        name: string
        value: string
    }) => {
        await ipcRenderer.invoke('setCookies', cookieObject)
    },
    loginCursor: async () => {
        await ipcRenderer.invoke('loginCursor')
    },
    logoutCursor: async () => {
        await ipcRenderer.invoke('logoutCursor')
    },
    getUserCreds: async () => {
        return await ipcRenderer.invoke('getUserCreds')
    },
    payCursor: async () => {
        return await ipcRenderer.invoke('payCursor')
    },
    registerUpdateAuthStatus(
        callback: (payload: {
            accessToken?: string | null
            profile?: any | null
            stripeProfile?: string | null
        }) => void
    ) {
        ipcRenderer.on('updateAuthStatus', (event, data) => {
            console.log('UPDATING AUTH STATUS', data)
            callback(data)
        })
    },
    refreshTokens() {
        ipcRenderer.invoke('refreshTokens')
    },
    registerCloseErrors(callback: Callback) {
        ipcRenderer.on('closeErrors', callback)
    },
}

contextBridge.exposeInMainWorld('connector', electronConnector)
type ElectronConnector = typeof electronConnector
export default ElectronConnector
