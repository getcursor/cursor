import { app, BrowserWindow, dialog } from 'electron'
import path from 'path'

import todesktop from '@todesktop/runtime'

import { lspStore } from '../lsp'
import { store } from '../storeHandler'
import { isAppInApplicationsFolder } from '../utils'

todesktop.init()

let showingDialog = false

function check() {
    if (showingDialog) {
        setTimeout(check, 1000)
        return
    }

    showingDialog = true
    // ask the user if they want to update
    const iconPath = path.join(__dirname, 'assets', 'icon', 'icon128.png')
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

export default function setupAutoUpdater() {
    todesktop.autoUpdater.on('update-downloaded', check)

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
}
