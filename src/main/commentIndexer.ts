import { ipcMain, IpcMainInvokeEvent } from 'electron'

import Store from 'electron-store'
const store = new Store()

export function setupCommentIndexer() {
    ipcMain.handle(
        'saveComments',
        async function (
            _event: IpcMainInvokeEvent,
            { path, blob }: { path: string; blob: any }
        ) {
            if (blob != null) store.set('comments' + path, blob)
        }
    )
    ipcMain.handle(
        'loadComments',
        async function (_event: IpcMainInvokeEvent, path: string) {
            return store.get('comments' + path)
        }
    )
}
