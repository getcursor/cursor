import { Menu, MenuItemConstructorOptions, app } from 'electron'
import { META_KEY } from './utils'
import mainWindow from './window'

export default function setupMainMenu() {
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
                        mainWindow.win?.webContents.send('new_file_click')
                    },
                    accelerator: META_KEY + '+N',
                },
                {
                    label: 'Open Folder',
                    click: () => {
                        mainWindow.win?.webContents.send(
                            'open_folder_triggered'
                        )
                    },
                    accelerator: META_KEY + '+O',
                },
                {
                    label: 'Open Remote Folder',
                    click: () => {
                        mainWindow.win?.webContents.send('openRemotePopup')
                    },
                },
                {
                    label: 'Save File',
                    click: () => {
                        mainWindow.win?.webContents.send('saved')
                    },
                    accelerator: META_KEY + '+S',
                },
                {
                    label: 'Close Tab',
                    click: () => {
                        mainWindow.win?.webContents.send('close_tab')
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
                        mainWindow.win?.webContents.send('zoom_in')
                    },
                    accelerator: META_KEY + '+=',
                },
                {
                    label: 'Zoom Out',
                    click: () => {
                        mainWindow.win?.webContents.send('zoom_out')
                    },
                    accelerator: META_KEY + '+-',
                },
                {
                    label: 'Reset Zoom',
                    click: () => {
                        mainWindow.win?.webContents.send('zoom_reset')
                    },
                    accelerator: META_KEY + '+0',
                },
                {
                    label: 'Search',
                    click: () => {
                        mainWindow.win?.webContents.send('search')
                    },
                    accelerator: META_KEY + '+Shift+F',
                },
                {
                    label: 'File Search',
                    click: () => {
                        mainWindow.win?.webContents.send('fileSearch')
                    },
                    accelerator: META_KEY + '+P',
                },
                {
                    label: 'Command Palette',
                    click: () => {
                        mainWindow.win?.webContents.send('commandPalette')
                    },
                    accelerator: META_KEY + '+Shift+P',
                },
            ],
        },
    ])
    const menu = Menu.buildFromTemplate(menuList)
    Menu.setApplicationMenu(menu)
}
