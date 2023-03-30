import fetch from 'node-fetch'
import { File, Folder, Settings } from '../features/window/state'

import { setupCommentIndexer } from './commentIndexer'
import { setupTestIndexer } from './testIndexer'
import { lspStore, setupLSPs } from './lsp'
import { setupSearch } from './search'

import {
    BrowserWindow,
    IpcMainInvokeEvent,
    Menu,
    MenuItemConstructorOptions,
    app,
    clipboard,
    dialog,
    globalShortcut,
    ipcMain,
    session,
    shell,
    systemPreferences,
} from 'electron'

import { API_ROOT } from '../utils'
import * as path from 'path'
import * as fs from 'fs'
import Store from 'electron-store'
import log from 'electron-log'
import { machineIdSync } from 'node-machine-id'

import { FileSystem, fileSystem, setFileSystem } from './fileSystem'
import { setupStoreHandlers } from './storeHandler'
import { resourcesDir } from './utils'
import { setupIndex } from './indexer'

import { authPackage, setupTokens } from './auth'

import { setupTerminal } from './terminal'
import todesktop from '@todesktop/runtime'
todesktop.init()

const store = new Store()
store.clear()

let main_window: Electron.BrowserWindow

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('electron-fiddle', process.execPath, [
            path.resolve(process.argv[1]),
        ])
    }
} else {
    app.setAsDefaultProtocolClient('electron-fiddle')
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (main_window) {
            if (main_window.isMinimized()) main_window.restore()
            main_window.focus()
        }
        console.log('second instance')
        const url = commandLine.pop()?.slice(0, -1)
        // dialog.showErrorBox('Welcome Back (in app already)', `You arrived from: ${url}`)
        if (url) {
            setupTokens(url)
        }
    })
}

type Event = IpcMainInvokeEvent
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit()
}

app.on('open-url', (event, url) => {
    // dialog.showErrorBox('Welcome (first time i think)', `You arrived from: ${url}`)
    if (url) {
        setupTokens(url)
    }
})

// Remove holded defaults
if (process.platform === 'darwin')
    systemPreferences.setUserDefault(
        'ApplePressAndHoldEnabled',
        'boolean',
        false
    )

const isAppInApplicationsFolder =
    app.getPath('exe').includes('Applications') ||
    !app.isPackaged ||
    process.platform !== 'darwin'

let showingDialog = false

const logLocation = path.join(app.getPath('userData'), 'log.log')
if (isAppInApplicationsFolder) {
    log.transports.file.resolvePath = () => logLocation
}
Object.assign(console, log.functions)

const META_KEY = process.platform === 'darwin' ? 'Cmd' : 'Ctrl'

let lastTime: null | number = null
function logError(error: any) {
    log.info('uncaughtException', error)

    // send log file to server
    if (
        isAppInApplicationsFolder &&
        (lastTime == null || Date.now() - lastTime > 1000 * 2)
    ) {
        lastTime = Date.now()
        const logFile = fs.readFileSync(
            log.transports.file.getFile().path,
            'utf8'
        )
        const body = {
            name: app.getPath('userData').replace(/ /g, '\\ '),
            log: encodeURIComponent(logFile),
            error: error.toString(),
        }
        fetch(API_ROOT + '/save_log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
    }
}
process.on('uncaughtException', (error) => {
    logError(error)
})
process.on('unhandledRejection', (error) => {
    logError(error)
})

const createWindow = () => {
    const width = 1500,
        height = 800
    // Create the browser window.
    main_window = new BrowserWindow({
        ...(process.platform === 'darwin'
            ? {
                  titleBarStyle: 'hidden',
                  titleBarOverlay: true,
                  trafficLightPosition: { x: 10, y: 10 },
              }
            : { frame: false }),
        width: width,
        height: height,
        minWidth: width / 2,
        minHeight: height / 2,
        title: 'Cursor',
        webPreferences: {
            // @ts-ignore
            preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
            // TODO - remove this
            allowRunningInsecureContent: true,
            webSecurity: false,
        },
    })
    main_window.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })

    if (!app.isPackaged) {
        main_window.webContents.openDevTools()
    }

    ipcMain.handle('maximize', () => {
        // First check if this is maximized
        if (main_window.isMaximized()) {
            // If it is, unmaximize it
            main_window.unmaximize()
        } else {
            // If it isn't, maximize it
            main_window.maximize()
        }
    })
    // add minimize and close functionality to the window buttons
    ipcMain.handle('close', () => {
        app.quit()
    })

    ipcMain.handle(
        'setCookies',
        async (
            event: IpcMainInvokeEvent,
            cookieObject: { url: string; name: string; value: string }
        ) => {
            await main_window.webContents.session.cookies.set(cookieObject)
        }
    )

    ipcMain.handle('minimize', () => {
        main_window.minimize()
    })

    ipcMain.handle('return_home_dir', () => {
        return machineIdSync()
    })

    // Sets up auth stuff here
    authPackage()

    // check if store has uploadPreferences, if not, then ask the user for them
    if (store.get('uploadPreferences') == undefined) {
        store.set('uploadPreferences', false)
    }

    log.info('Made main window')

    // and load the index.html of the app.
    // @ts-ignore
    main_window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)

    if (!isAppInApplicationsFolder) {
        // show the user a dialog telling them to move the app to the Applications folder
        dialog.showMessageBoxSync(main_window, {
            type: 'warning',
            title: 'Warning',
            message: 'Please move Cursor to the Applications folder',
            detail: 'The app will not work properly if it is not in the Applications folder',
        })
    }
    let menuList: any[] = []
    const quitApp = {
        label: 'Quit App',
        click: () => {
            app.quit()
        },
        accelerator: META_KEY + '+Q',
    }
    if (process.platform === 'darwin') {
        menuList.push({
            label: process.platform === 'darwin' ? 'Custom Menu' : 'Cursor',
            submenu: [quitApp],
        })
    }
    menuList = menuList.concat([
        {
            label: 'File',
            submenu: [
                {
                    label: 'New File',
                    click: () => {
                        main_window.webContents.send('new_file_click')
                    },
                    accelerator: META_KEY + '+N',
                },
                {
                    label: 'Open Folder',
                    click: () => {
                        main_window.webContents.send('open_folder_triggered')
                    },
                    accelerator: META_KEY + '+O',
                },
                {
                    label: 'Open Remote Folder',
                    click: () => {
                        main_window.webContents.send('openRemotePopup')
                    },
                },
                {
                    label: 'Save File',
                    click: () => {
                        main_window.webContents.send('saved')
                    },
                    accelerator: META_KEY + '+S',
                },
                {
                    label: 'Close Tab',
                    click: () => {
                        main_window.webContents.send('close_tab')
                    },
                    accelerator: META_KEY + '+W',
                },
                ...(process.platform === 'darwin'
                    ? []
                    : [{ type: 'separator' }, quitApp]),
            ],
        },
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: META_KEY + '+Z',
                    selector: 'undo:',
                },
                {
                    label: 'Redo',
                    accelerator: META_KEY + '+Shift+Z',
                    selector: 'redo:',
                },
                { type: 'separator' },
                {
                    label: 'Cut',
                    accelerator: META_KEY + '+X',
                    selector: 'cut:',
                },
                {
                    label: 'Copy',
                    accelerator: META_KEY + '+C',
                    selector: 'copy:',
                },
                {
                    label: 'Paste',
                    accelerator: META_KEY + '+V',
                    selector: 'paste:',
                },
                {
                    label: 'Select All',
                    accelerator: META_KEY + '+A',
                    selector: 'selectAll:',
                },
            ],
        } as MenuItemConstructorOptions,
        {
            label: 'View',
            submenu: [
                {
                    label: 'Zoom In',
                    click: () => {
                        main_window.webContents.send('zoom_in')
                    },
                    accelerator: META_KEY + '+Plus',
                },
                {
                    label: 'Zoom In',
                    click: () => {
                        main_window.webContents.send('zoom_in')
                    },
                    accelerator: META_KEY + '+=',
                },
                {
                    label: 'Zoom Out',
                    click: () => {
                        main_window.webContents.send('zoom_out')
                    },
                    accelerator: META_KEY + '+-',
                },
                {
                    label: 'Reset Zoom',
                    click: () => {
                        main_window.webContents.send('zoom_reset')
                    },
                    accelerator: META_KEY + '+0',
                },
                {
                    label: 'Search',
                    click: () => {
                        main_window.webContents.send('search')
                    },
                    accelerator: META_KEY + '+Shift+F',
                },
                {
                    label: 'File Search',
                    click: () => {
                        main_window.webContents.send('fileSearch')
                    },
                    accelerator: META_KEY + '+P',
                },
                {
                    label: 'Command Palette',
                    click: () => {
                        main_window.webContents.send('commandPalette')
                    },
                    accelerator: META_KEY + '+Shift+P',
                },
            ],
        },
    ])
    const menu = Menu.buildFromTemplate(menuList)
    Menu.setApplicationMenu(menu)

    globalShortcut.register(META_KEY + '+M', () => {
        main_window.minimize()
    })

    globalShortcut.register(META_KEY + '+Shift+M', () => {
        if (main_window.isMaximized()) {
            main_window.restore()
        } else {
            main_window.maximize()
        }
    })

    ipcMain.handle('changeSettings', (event: Event, settings: Settings) => {
        log.info('STORING SETTINGS')
        log.info(settings)
        log.info('that was the settings')
        store.set('settings', settings)
    })

    ipcMain.handle('initSettings', (_event: Event) => {
        if (store.has('settings')) {
            log.info('found settings')
            return store.get('settings')
        } else {
            return {}
        }
    })

    ipcMain.handle('get_platform', function (_event: any) {
        return process.platform
    })

    log.info('setting up handle get_folder')
    ipcMain.handle(
        'get_folder',
        async function (
            event: any,
            folderName: string,
            children: string[],
            origDepth: number,
            badDirectories: string[]
        ) {
            // recursively go through all files in the directory
            // and return the file names
            const files: { [key: number]: File } = {}
            const folders: { [key: number]: Folder } = {}

            const addToFilesFolders = async function (
                dirName: string,
                depth: number
            ) {
                const name = path.basename(dirName)
                const newFolder: Folder = {
                    name,
                    fileIds: [],
                    folderIds: [],
                    loaded: false,
                    parentFolderId: null,
                    renameName: null,
                    isOpen: false,
                }
                const newFolderId = Object.keys(folders).length + 1
                folders[newFolderId] = newFolder

                if (depth < origDepth && !badDirectories.includes(name)) {
                    const fileNameList = await fileSystem.readdirSyncWithIsDir(
                        dirName
                    )
                    for (let i = 0; i < fileNameList.length; i++) {
                        const { fileName, isDir } = fileNameList[i]
                        if (fileName == '.DS_Store') continue
                        if (children.includes(fileName)) {
                            continue
                        }

                        const newName = path.join(dirName, fileName)

                        if (isDir) {
                            const res = await addToFilesFolders(
                                newName,
                                depth + 1
                            )
                            newFolder.folderIds.push(res.newFolderId)
                            res.newFolder.parentFolderId = newFolderId
                        } else {
                            const newSubFile: File = {
                                parentFolderId: newFolderId,
                                saved: true,
                                name: path.basename(newName),
                                renameName: null as any,
                                isSelected: false,
                            }
                            const newSubFileId = Object.keys(files).length + 1
                            files[newSubFileId] = newSubFile

                            newFolder.fileIds.push(newSubFileId)
                        }
                    }
                    newFolder.loaded = true
                }
                return { newFolder, newFolderId }
            }

            await addToFilesFolders(folderName, 0)
            return { files, folders }
        }
    )

    log.info('setting up handle getClipboard')
    ipcMain.handle('getClipboard', function (_event: any) {
        const clip = clipboard.readText()
        return clip
    })

    ipcMain.handle('saveUploadPreference', function (event: any, arg: string) {
        store.set('uploadPreferences', arg)
    })

    ipcMain.handle('getUploadPreference', function (_event: any) {
        if (store.has('uploadPreferences')) {
            return store.get('uploadPreferences')
        } else {
            return false
        }
    })

    ipcMain.handle('createTutorDir', function (_event: any) {
        const toCopyFrom = path.join(resourcesDir, 'tutor')
        const toCopyTo = path.join(app.getPath('home'), 'cursor-tutor')

        if (fs.existsSync(toCopyTo)) {
            // delete the directory
            fs.rmdirSync(toCopyTo, { recursive: true })
        }
        // create the directory
        fs.mkdirSync(toCopyTo)
        // copy the contents of the source directory to the destination directory
        fs.cpSync(toCopyFrom, toCopyTo, { recursive: true })

        return toCopyTo
    })

    ipcMain.handle('checkSave', function (event: Event, filePath: string) {
        const iconPath = path.join(__dirname, 'assets', 'icon', 'icon128.png')
        const basename = path.basename(filePath)
        const options = {
            type: 'question',
            buttons: ['&Go Back', '&Overwrite'],
            message: `Overwrite ${basename}?`,
            icon: iconPath,
            normalizeAccessKeys: true,
            detail: 'The contents of the file on disk changed during editing.',
            defaultId: 0,
        }

        const win = BrowserWindow.getFocusedWindow()!
        showingDialog = true
        const choice = dialog.showMessageBoxSync(win, options)
        showingDialog = false
        return choice === 1
    })

    ipcMain.handle(
        'check_close_tab',
        function (event: Event, filePath: string) {
            const iconPath = path.join(
                __dirname,
                'assets',
                'icon',
                'icon128.png'
            )
            const basename = path.basename(filePath)
            const options = {
                type: 'question',
                buttons: ['&Save', "&Don't Save", '&Cancel'],
                message: `Do you want to save the changes you made to ${basename}`,
                icon: iconPath,
                normalizeAccessKeys: true,
                detail: "Your changes will be lost if you don't save them.",
            }

            const win = BrowserWindow.getFocusedWindow()!
            showingDialog = true
            const result = dialog.showMessageBoxSync(win, options)
            showingDialog = false
            return result === 0 ? 'save' : result === 1 ? 'dont_save' : 'cancel'
        }
    )

    ipcMain.handle('logToFile', async function (event: Event, args: any) {
        log.info('from renderer', args)
    })

    log.info('setting up handle get_file')
    ipcMain.handle('get_file', async function (event: Event, filePath: string) {
        // Check if the file is an image
        const extension = filePath.split('.').pop()?.toLowerCase()
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(
            extension || ''
        )

        // Read the file using the binary encoding if it's an image
        const encoding = isImage ? 'binary' : 'utf8'
        let data = ''
        try {
            data = await fileSystem.readFileSync(filePath, encoding)
        } catch {
            data = ''
        }
        return data
    })

    ipcMain.handle('copy_file', function (event: Event, arg: string) {
        clipboard.writeText(arg)
    })

    ipcMain.handle('getProject', function (_event: Event) {
        if (store.has('projectPath')) {
            const res = store.get('projectPath') as any
            return res
        } else {
            return null
        }
    })

    ipcMain.handle('getRemote', function (_event: Event) {
        const ret = {
            remoteCommand: store.has('remoteCommand')
                ? store.get('remoteCommand')
                : null,
            remotePath: store.has('remotePath')
                ? store.get('remotePath')
                : null,
        }
        return ret
    })

    ipcMain.handle(
        'getLastModifiedTime',
        async function (event: Event, arg: string) {
            try {
                return (await fileSystem.statSync(arg)).mtimeMs
            } catch {
                return null
            }
        }
    )

    ipcMain.handle(
        'saveFile',
        async function (event: Event, arg: { path: string; data: string }) {
            // Get the parent directory of the file
            const parentDir = path.dirname(arg.path)

            // If the parent directory does not exist, create it
            if (!(await fileSystem.existsSync(parentDir))) {
                await fileSystem.mkdirSync(parentDir, { recursive: true })
            }

            // next, Save the file
            log.info('Trying to save the folder', arg.path)
            await fileSystem.writeFileSync(arg.path, arg.data)
            log.info('Successfully saved the file')
            return (await fileSystem.statSync(arg.path)).mtimeMs
        }
    )
    ipcMain.handle(
        'checkFileExists',
        async function (event: Event, path: string) {
            // check if the file exists on disk
            const fileExists = await fileSystem.existsSync(path)
            return fileExists
        }
    )

    ipcMain.handle('get_version', function (_event: Event) {
        return app.getVersion()
    })

    ipcMain.handle('save_folder', async function (event: Event, arg: string) {
        // save the file
        log.info('Trying to save the file', arg)
        // create a new folder if it doesn't exist
        if (!(await fileSystem.existsSync(arg))) {
            await fileSystem.mkdirSync(arg, { recursive: true })
        }
        log.info('Successfully saved the file')
        return true
    })

    ipcMain.handle('saveProject', function (event: Event, data: any) {
        if (store.has('projectPath')) {
            store.delete('projectPath')
        }
        store.set('projectPath', data)
        return true
    })

    ipcMain.handle(
        'rename_file',
        async function (
            event: Event,
            arg: { old_path: string; new_path: string }
        ) {
            // rename the file
            await fileSystem.renameSync(arg.old_path, arg.new_path)
            return true
        }
    )

    ipcMain.handle(
        'rename_folder',
        async function (
            event: Event,
            arg: { old_path: string; new_path: string }
        ) {
            // rename the folder
            await fileSystem.renameSync(arg.old_path, arg.new_path)
            return true
        }
    )

    ipcMain.handle('check_learn_codebase', function (event: Event) {
        // ask the user if we can learn their codebase, if yes, send back true
        const iconPath = path.join(__dirname, 'assets', 'icon', 'icon128.png')
        const options = {
            type: 'question',
            buttons: ['&Yes', '&No'],
            title: 'Index this folder?',
            icon: iconPath,
            normalizeAccessKeys: true,
            message:
                'In order for our AI features to work, we need to index your codebase. Is it OK if we do that on this folder?.',
        }

        const win = BrowserWindow.getFocusedWindow()!
        showingDialog = true
        dialog
            .showMessageBox(win, options)
            .then((choice: any) => {
                showingDialog = false
                if (choice.response == 0) {
                    event.sender.send('register_learn_codebase')
                } else if (choice.response == 1) {
                    // do nothing
                }
            })
            .catch((_err: any) => {})
    })

    ipcMain.handle('right_click_file', function (event: Event) {
        const template: MenuItemConstructorOptions[] = [
            {
                label: 'Rename',
                click: () => {
                    event.sender.send('rename_file_click')
                },
            },
            {
                label: 'Delete',
                click: () => {
                    event.sender.send('delete_file_click')
                },
            },
            { type: 'separator' },
            {
                label: 'Open Containing Folder',
                click: () => {
                    event.sender.send('open_containing_folder_click')
                },
            },
        ]
        const menu = Menu.buildFromTemplate(template)
        menu.popup({ window: BrowserWindow.fromWebContents(event.sender)! })
    })

    ipcMain.handle('right_click_tab', function (event: Event) {
        const template: MenuItemConstructorOptions[] = [
            {
                label: 'Close All',
                click: () => {
                    event.sender.send('close_all_tabs_click')
                },
            },
        ]
        const menu = Menu.buildFromTemplate(template)
        menu.popup({ window: BrowserWindow.fromWebContents(event.sender)! })
    })

    ipcMain.handle(
        'right_click_folder',
        function (event: Event, arg: { isRoot: boolean; path: string }) {
            const template: MenuItemConstructorOptions[] = [
                {
                    label: 'New File',
                    click: () => {
                        event.sender.send('new_file_click')
                    },
                },
                {
                    label: 'New Folder',
                    click: () => {
                        event.sender.send('new_folder_click')
                    },
                },
            ]
            const additional: MenuItemConstructorOptions[] = [
                { type: 'separator' },
                {
                    label: 'Rename',
                    click: () => {
                        event.sender.send('rename_file_click')
                    },
                },
                { type: 'separator' },
                {
                    label: 'Delete',
                    click: () => {
                        const iconPath = path.join(
                            __dirname,
                            'assets',
                            'icon',
                            'icon128.png'
                        )
                        const options = {
                            type: 'question',
                            buttons: ['&!Delete!', '&Cancel'],
                            title: `DANGER: Do you want to delete`,
                            icon: iconPath,
                            normalizeAccessKeys: true,
                            message: `DANGER: Do you want to delete`,
                        }

                        const win = BrowserWindow.getFocusedWindow()!
                        showingDialog = true
                        dialog
                            .showMessageBox(win, options)
                            .then((choice: any) => {
                                showingDialog = false
                                if (choice.response == 0) {
                                    event.sender.send('delete_folder_click')
                                }
                            })
                            .catch((_err: any) => {})
                    },
                },
            ]
            if (!arg.isRoot) {
                template.push(...additional)
            }
            const menu = Menu.buildFromTemplate(template)
            menu.popup({ window: BrowserWindow.fromWebContents(event.sender)! })
        }
    )

    ipcMain.handle(
        'rightMenuAtToken',
        function (
            event: Event,
            arg: {
                includeAddToPrompt: boolean
                codeBlock: {
                    fileId: number
                    text: string
                    startLine: number
                    endLine: number
                }
                path: string
                offset: number
            }
        ) {
            const template = [
                {
                    label: 'Definition',
                    click: () => {
                        event.sender.send('getDefinition', {
                            path: arg.path,
                            offset: arg.offset,
                        })
                    },
                },
            ]

            if (arg.includeAddToPrompt) {
                template.push({
                    label: 'Add To Prompt',
                    click: () => {
                        event.sender.send('addCodeToPrompt', arg.codeBlock)
                    },
                })
            }

            const menu = Menu.buildFromTemplate(template)
            menu.popup({ window: BrowserWindow.fromWebContents(event.sender)! })
        }
    )

    ipcMain.handle('delete_file', async function (event: Event, path: string) {
        // delete the file
        await fileSystem.unlinkSync(path)
        return true
    })

    ipcMain.handle(
        'open_containing_folder',
        async function (event: Event, path: string) {
            // open the folder in the file explorer
            shell.showItemInFolder(path)
            return true
        }
    )

    ipcMain.handle(
        'delete_folder',
        async function (event: Event, path: string) {
            await fileSystem.rmSync(path)
        }
    )

    ipcMain.handle(
        'set_remote_file_system',
        async function (
            event: any,
            arg: { sshCommand: string; remotePath: string }
        ) {
            // set the remote file system
            try {
                setFileSystem(new FileSystem(true, arg.sshCommand))
                await fileSystem.testConnection()

                store.set('remoteCommand', arg.sshCommand)
                store.set('remotePath', arg.remotePath)
                return true
            } catch (e) {
                setFileSystem(new FileSystem())
                return false
            }
        }
    )

    // show the open folder dialog
    ipcMain.handle('open_folder', function (_event: any, _arg: null) {
        showingDialog = true
        const result = dialog.showOpenDialogSync(main_window, {
            properties: ['openDirectory'],
        })
        showingDialog = false
        log.info('Opening folder: ' + result)
        if (result && result.length > 0) {
            setFileSystem(new FileSystem())
            return result[0]
        }
        return null
    })

    // click on the terminal link
    ipcMain.handle('terminal-click-link', (event, data) => {
        shell.openExternal(data)
    })

    setupLSPs(store)
    const projectPathObj = store.get('projectPath')
    if (
        typeof projectPathObj === 'object' &&
        projectPathObj !== null &&
        'defaultFolder' in projectPathObj
    ) {
        const projectPath = projectPathObj.defaultFolder
        if (typeof projectPath === 'string') {
            setupTerminal(main_window, projectPath)
        } else {
            setupTerminal(main_window)
        }
    } else {
        setupTerminal(main_window)
    }

    setupSearch()
    log.info('setting up index')
    setupCommentIndexer()
    setupTestIndexer()
    setupStoreHandlers()
    setupIndex(API_ROOT, main_window)
    log.info('setup index')
}

const modifyHeaders = () => {
    session.defaultSession.webRequest.onHeadersReceived(
        (details: any, callback: any) => {
            //details.requestHeaders['Origin'] = API_ROOT;
            // details.requestHeaders['referer'] = API_ROOT;
            callback({
                responseHeaders: Object.assign(
                    {
                        ...details.responseHeaders,
                        'Content-Security-Policy': [
                            "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: file: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';",
                        ],
                    },
                    details.responseHeaders
                ),
            })
        }
    )
}

todesktop.autoUpdater.on('update-downloaded', (_ev, _info) => {
    function check() {
        if (showingDialog) {
            setTimeout(check, 1000)
        } else {
            showingDialog = true
            // ask the user if they want to update
            const iconPath = path.join(
                __dirname,
                'assets',
                'icon',
                'icon128.png'
            )
            const options = {
                type: 'question',
                buttons: ['&Accept', '&Cancel'],
                message: `Accept update?`,
                icon: iconPath,
                normalizeAccessKeys: true,
                detail: `New update available for Cursor! New features and bug fixes (only takes 10-20 seconds)`,
            }

            const win = BrowserWindow.getFocusedWindow()!
            dialog
                .showMessageBox(win, options)
                .then((choice: any) => {
                    showingDialog = false
                    if (choice.response == 0) {
                        setTimeout(() => {
                            // First we clear the lsp store
                            lspStore(store).clear()

                            // Then we quit and install
                            todesktop.autoUpdater.restartAndInstall()
                        }, 100)
                    }
                })
                .catch((_err: any) => {})
        }
    }

    check()
})
app.on('ready', function () {
    if (isAppInApplicationsFolder) {
        if (app.isPackaged) {
            todesktop.autoUpdater.checkForUpdates()
            setInterval(() => {
                todesktop.autoUpdater.checkForUpdates()
            }, 1000 * 60 * 15)
        }
    }
})

app.on('ready', modifyHeaders)
app.on('ready', createWindow)
app.on('window-all-closed', () => {
    app.quit()
})

export {}
