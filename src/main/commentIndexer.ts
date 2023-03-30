import { IpcMainInvokeEvent, ipcMain } from 'electron'

import Store from 'electron-store'
const store = new Store()

export function setupCommentIndexer() {
    ipcMain.handle(
        'saveComments',
        async function (
            event: IpcMainInvokeEvent,
            { path, blob }: { path: string; blob: any }
        ) {
            //
            if (blob != null) store.set('comments' + path, blob)
        }
    )
    ipcMain.handle(
        'loadComments',
        async function (event: IpcMainInvokeEvent, path: string) {
            const comments = store.get('comments' + path)
            //
            return comments
        }
    )
}
