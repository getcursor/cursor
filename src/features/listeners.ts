import { store } from '../app/store'
import * as gs from './globalSlice'
import * as gt from './globalThunks'
import * as cs from './chat/chatSlice'
import * as ts from './tools/toolSlice'

////////
// GLOBAL LISTENERS
////////

connector.registerRenameClick(() => {
    store.dispatch(gs.triggerRename(null))
})

connector.registerUpdateAuthStatus(
    (data: {
        accessToken?: string | null
        profile?: any | null
        stripeProfile?: string | null
    }) => {
        store.dispatch(ts.login(data))
    }
)

connector.registerSaved(() => {
    store.dispatch(gs.saveFile(null))
})

connector.registerDeleteClick(() => {
    store.dispatch(gs.deleteFile(null))
})

connector.registerOpenContainingFolderClick(() => {
    store.dispatch(gs.openContainingFolder(null))
})

connector.registerDeleteFolderClick(() => {
    store.dispatch(gs.deleteFolder(null))
})

connector.registerNewFileClick(() => {
    store.dispatch(gs.newFile({ parentFolderId: null }))
})

connector.registerNewFolderClick(() => {
    store.dispatch(gs.newFolder({ parentFolderId: null }))
})

connector.registerCloseTab(() => {
    store.dispatch(gt.closeTab(null))
})

connector.registerCloseAllTabs(() => {
    store.dispatch(gt.closeAllTabs())
})

connector.registerOpenFolder(() => {
    store.dispatch(gs.openFolder(null))
})

connector.registerForceCloseTab(() => {
    store.dispatch(gs.forceCloseTab(null))
})

connector.registerForceSaveAndCloseTab(() => {
    store.dispatch(gs.forceSaveAndClose(null))
})

connector.registerZoom((zoom: number) => {
    store.dispatch(gs.setZoomFactor(zoom))
})

connector.registerSearch(() => store.dispatch(ts.openSearch()))

connector.registerFileSearch(() => store.dispatch(ts.triggerFileSearch()))

connector.registerCommandPalette(() => {
    store.dispatch(ts.triggerCommandPalette())
})

connector.registerGetDefinition((payload: { path: string; offset: number }) => {
    store.dispatch(gs.gotoDefinition(payload))
})

connector.registerLearnCodebase(() => {
    store.dispatch(gs.initializeIndex(null))
})

// @ts-ignore
connector.registerFolderWasAdded((evt: any, payload: any) => {
    store.dispatch(gs.folderWasAdded(payload))
})

// @ts-ignore
connector.registerFolderWasDeleted((evt: any, payload: any) => {
    store.dispatch(gs.folderWasDeleted(payload))
})

// @ts-ignore
connector.registerFileWasAdded((evt: any, payload: any) => {
    store.dispatch(gs.fileWasAdded(payload))
})

// @ts-ignore
connector.registerFileWasDeleted((evt: any, payload: any) => {
    store.dispatch(gs.fileWasDeleted(payload))
})

// @ts-ignore
connector.registerFileWasUpdated((evt: any, payload: any) => {
    store.dispatch(gs.fileWasUpdated(payload))
})

// @ts-ignore
connector.registerOpenRemotePopup((_evt: any, _payload: any) => {
    store.dispatch(gs.openRemotePopup())
})

/////////
// CHAT LISTENERS
/////////

connector.registerAddCodeToPrompt((payload: any) => {
    store.dispatch(cs.addOtherBlockToMessage(payload))
})
