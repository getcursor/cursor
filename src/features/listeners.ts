import { store } from '../app/store'
import * as gs from './globalSlice'
import * as gt from './globalThunks'
import * as cs from './chat/chatSlice'
import * as ts from './tools/toolSlice'

////////
// GLOBAL LISTENERS
////////

// @ts-ignore
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

connector.registerCloseErrors(() => {
    store.dispatch(gs.closeError())
})

// @ts-ignore
connector.registerSaved(() => {
    store.dispatch(gs.saveFile(null))
})

// @ts-ignore
connector.registerDeleteClick(() => {
    store.dispatch(gs.deleteFile(null))
})

// @ts-ignore
connector.registerOpenContainingFolderClick(() => {
    store.dispatch(gs.openContainingFolder(null))
})

// @ts-ignore
connector.registerDeleteFolderClick(() => {
    store.dispatch(gs.deleteFolder(null))
})

// @ts-ignore
connector.registerNewFileClick(() => {
    store.dispatch(gs.newFile({ parentFolderId: null }))
})

// @ts-ignore
connector.registerNewFolderClick(() => {
    store.dispatch(gs.newFolder({ parentFolderId: null }))
})

// @ts-ignore
connector.registerCloseTab(() => {
    store.dispatch(gt.closeTab(null))
})

// @ts-ignore
connector.registerCloseAllTabs(() => {
    store.dispatch(gt.closeAllTabs())
})

// @ts-ignore
connector.registerOpenFolder(() => {
    store.dispatch(gs.openFolder(null))
})

// @ts-ignore
connector.registerForceCloseTab(() => {
    store.dispatch(gs.forceCloseTab(null))
})

// @ts-ignore
connector.registerForceSaveAndCloseTab(() => {
    store.dispatch(gs.forceSaveAndClose(null))
})

// @ts-ignore
connector.registerZoom((zoom: number) => {
    store.dispatch(gs.setZoomFactor(zoom))
})

// @ts-ignore
connector.registerSearch(() => store.dispatch(ts.openSearch()))

// @ts-ignore
connector.registerFileSearch(() => store.dispatch(ts.triggerFileSearch()))

// @ts-ignore
connector.registerCommandPalette(() => {
    store.dispatch(ts.triggerCommandPalette())
})

// @ts-ignore
connector.registerGetDefinition((payload: { path: string; offset: number }) => {
    store.dispatch(gs.gotoDefinition(payload))
})

// @ts-ignore
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
// @ts-ignore
connector.registerAddCodeToPrompt((payload: any) => {
    store.dispatch(cs.addOtherBlockToMessage(payload))
})
