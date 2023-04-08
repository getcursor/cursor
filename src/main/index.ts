import { app } from 'electron'
import log from 'electron-log'

import { API_ROOT } from '../utils'
import { authPackage } from './auth'
import { setupCommentIndexer } from './commentIndexer'
import { setupIndex } from './indexer'
import { setupLSPs } from './lsp'
import setupMainMenu from './menu'
import mainWindow from './window'
import { setupSearch } from './search'
import setupApplicationsFolder from './setup/appFolder'
import setupAuth from './setup/auth'
import setupAutoUpdater from './setup/autoUpdater'
import { setupEnv } from './setup/env'
import setupIpcs from './setup/ipcs'
import setupLogger from './setup/logger'
import setupProtocal from './setup/protocal'
import setupSingleInstance from './setup/singleInstance'
import setupTerminal from './setup/terminal'
import { setupStoreHandlers, store } from './storeHandler'
import { setupTestIndexer } from './testIndexer'

// TODO: Remove this
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

setupEnv()
setupProtocal()
setupSingleInstance()
setupAutoUpdater()
setupLogger()
setupAuth()

app.on('ready', () => {
    mainWindow.create()
    mainWindow.setup()
    mainWindow.load()
    setupMainMenu()

    // Sets up auth stuff here
    authPackage()
    setupApplicationsFolder()
    setupIpcs()
    setupLSPs(store)
    setupTerminal()
    setupSearch()
    log.info('setting up index')
    setupCommentIndexer()
    setupTestIndexer()
    setupStoreHandlers()
    setupIndex(API_ROOT, mainWindow.win!)
    log.info('setup index')
})
app.on('window-all-closed', () => {
    app.quit()
})
