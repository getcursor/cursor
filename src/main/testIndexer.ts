import { IpcMainInvokeEvent, ipcMain } from 'electron'

import Store from 'electron-store'
const store = new Store()

export function setupTestIndexer() {
    ipcMain.handle(
        'saveTests',
        async function (
            event: IpcMainInvokeEvent,
            { path, blob }: { path: string; blob: any }
        ) {
            if (blob != null) store.set('tests' + path, blob)
        }
    )
    ipcMain.handle(
        'loadTests',
        async function (event: IpcMainInvokeEvent, path: string) {
            const tests = store.get('tests' + path)
            return tests
        }
    )
}
