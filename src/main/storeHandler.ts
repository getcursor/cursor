import { IpcMainInvokeEvent, ipcMain } from 'electron'

import Store from 'electron-store'
export const store = new Store()

// check if store has uploadPreferences, if not, then ask the user for them
if (store.get('uploadPreferences') == undefined) {
    store.set('uploadPreferences', false)
}

export function setupStoreHandlers() {
    ipcMain.handle(
        'setStore',
        async function (
            event: IpcMainInvokeEvent,
            { key, blob }: { key: string; blob: any }
        ) {
            store.set(key, blob)
        }
    )
    ipcMain.handle(
        'getStore',
        async function (event: IpcMainInvokeEvent, key: string) {
            const comments = store.get(key)
            return comments
        }
    )

    // Handler for getting all values from an array
    ipcMain.handle(
        'getAllArrayValues',
        async function (event: IpcMainInvokeEvent, arrayKey: string) {
            const arrayLength = store.get(`${arrayKey}.length`) || 0
            const arrayValues = []
            for (let i = 0; i < arrayLength; i++) {
                arrayValues.push(store.get(`${arrayKey}.${i}`))
            }
            return arrayValues
        }
    )

    // Handler for appending to an array
    ipcMain.handle(
        'appendToArray',
        async function (
            event: IpcMainInvokeEvent,
            { arrayKey, value }: { arrayKey: string; value: any }
        ) {
            const arrayLength = (store.get(`${arrayKey}.length`) as number) || 0
            store.set(`${arrayKey}.${arrayLength}`, value)
            store.set(`${arrayKey}.length`, arrayLength + 1)
        }
    )
}
