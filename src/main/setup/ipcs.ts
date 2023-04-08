import {
    app,
    BrowserWindow,
    clipboard,
    dialog,
    ipcMain,
    IpcMainInvokeEvent,
    Menu,
    MenuItemConstructorOptions,
    shell,
} from 'electron'
import log from 'electron-log'
import * as fs from 'fs'
import { machineIdSync } from 'node-machine-id'
import path from 'path'

import { File, Folder, Settings } from '../../features/window/state'
import { FileSystem, fileSystem, setFileSystem } from '../fileSystem'
import mainWindow from '../window'
import { store } from '../storeHandler'
import { resourcesDir } from '../utils'

// TODO: These IPCs should be separated into different modules.
export default function setupIpcs() {
    ipcMain.handle('return_home_dir', () => {
        return machineIdSync()
    })

    ipcMain.handle(
        'changeSettings',
        (_event: IpcMainInvokeEvent, settings: Settings) => {
            log.info('STORING SETTINGS')
            log.info(settings)
            log.info('that was the settings')
            store.set('settings', settings)
        }
    )

    ipcMain.handle('initSettings', (_event: IpcMainInvokeEvent) => {
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
            _event: any,
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

    ipcMain.handle('saveUploadPreference', function (_event: any, arg: string) {
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

    ipcMain.handle(
        'checkSave',
        function (_event: IpcMainInvokeEvent, filePath: string) {
            const iconPath = path.join(
                __dirname,
                'assets',
                'icon',
                'icon128.png'
            )
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
            const choice = dialog.showMessageBoxSync(win, options)
            return choice === 1
        }
    )

    ipcMain.handle(
        'check_close_tab',
        function (_event: IpcMainInvokeEvent, filePath: string) {
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
            const result = dialog.showMessageBoxSync(win, options)
            return result === 0 ? 'save' : result === 1 ? 'dont_save' : 'cancel'
        }
    )

    ipcMain.handle(
        'logToFile',
        async function (_event: IpcMainInvokeEvent, args: any) {
            log.info('from renderer', args)
        }
    )

    log.info('setting up handle get_file')
    ipcMain.handle(
        'get_file',
        async function (_event: IpcMainInvokeEvent, filePath: string) {
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
        }
    )

    ipcMain.handle(
        'copy_file',
        function (_event: IpcMainInvokeEvent, arg: string) {
            clipboard.writeText(arg)
        }
    )

    ipcMain.handle('getProject', function (_event: IpcMainInvokeEvent) {
        if (store.has('projectPath')) {
            const res = store.get('projectPath') as any
            return res
        } else {
            return null
        }
    })

    ipcMain.handle('getRemote', function (_event: IpcMainInvokeEvent) {
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
        async function (_event: IpcMainInvokeEvent, arg: string) {
            try {
                return (await fileSystem.statSync(arg)).mtimeMs
            } catch {
                return null
            }
        }
    )

    ipcMain.handle(
        'saveFile',
        async function (
            _event: IpcMainInvokeEvent,
            arg: { path: string; data: string }
        ) {
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
        async function (_event: IpcMainInvokeEvent, path: string) {
            // check if the file exists on disk
            const fileExists = await fileSystem.existsSync(path)
            return fileExists
        }
    )

    ipcMain.handle('get_version', function (_event: IpcMainInvokeEvent) {
        return app.getVersion()
    })

    ipcMain.handle(
        'save_folder',
        async function (_event: IpcMainInvokeEvent, arg: string) {
            // save the file
            log.info('Trying to save the file', arg)
            // create a new folder if it doesn't exist
            if (!(await fileSystem.existsSync(arg))) {
                await fileSystem.mkdirSync(arg, { recursive: true })
            }
            log.info('Successfully saved the file')
            return true
        }
    )

    ipcMain.handle(
        'saveProject',
        function (_event: IpcMainInvokeEvent, data: any) {
            if (store.has('projectPath')) {
                store.delete('projectPath')
            }
            store.set('projectPath', data)
            return true
        }
    )

    ipcMain.handle(
        'rename_file',
        async function (
            _event: IpcMainInvokeEvent,
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
            _event: IpcMainInvokeEvent,
            arg: { old_path: string; new_path: string }
        ) {
            // rename the folder
            await fileSystem.renameSync(arg.old_path, arg.new_path)
            return true
        }
    )

    ipcMain.handle(
        'check_learn_codebase',
        function (event: IpcMainInvokeEvent) {
            // ask the user if we can learn their codebase, if yes, send back true
            const iconPath = path.join(
                __dirname,
                'assets',
                'icon',
                'icon128.png'
            )
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
            dialog
                .showMessageBox(win, options)
                .then((choice: any) => {
                    if (choice.response == 0) {
                        event.sender.send('register_learn_codebase')
                    } else if (choice.response == 1) {
                        // do nothing
                    }
                })
                .catch((_err: any) => {})
        }
    )

    ipcMain.handle('right_click_file', function (event: IpcMainInvokeEvent) {
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

    ipcMain.handle('right_click_tab', function (event: IpcMainInvokeEvent) {
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
        function (
            event: IpcMainInvokeEvent,
            arg: { isRoot: boolean; path: string }
        ) {
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

                        dialog
                            .showMessageBox(win, options)
                            .then((choice: any) => {
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
            event: IpcMainInvokeEvent,
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

    ipcMain.handle(
        'delete_file',
        async function (_event: IpcMainInvokeEvent, path: string) {
            // delete the file
            await fileSystem.unlinkSync(path)
            return true
        }
    )

    ipcMain.handle(
        'open_containing_folder',
        async function (_event: IpcMainInvokeEvent, path: string) {
            // open the folder in the file explorer
            shell.showItemInFolder(path)
            return true
        }
    )

    ipcMain.handle(
        'delete_folder',
        async function (_event: IpcMainInvokeEvent, path: string) {
            await fileSystem.rmSync(path)
        }
    )

    ipcMain.handle(
        'set_remote_file_system',
        async function (
            _event: any,
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
        const result = dialog.showOpenDialogSync(mainWindow.win!, {
            properties: ['openDirectory'],
        })
        log.info('Opening folder: ' + result)
        if (result && result.length > 0) {
            setFileSystem(new FileSystem())
            return result[0]
        }
        return null
    })

    // click on the terminal link
    ipcMain.handle('terminal-click-link', (_event, data) => {
        shell.openExternal(data)
    })
}
