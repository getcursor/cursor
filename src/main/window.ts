import {
    BrowserWindow,
    IpcMainInvokeEvent,
    app,
    globalShortcut,
    ipcMain,
    shell,
} from 'electron'
import log from 'electron-log'
import { META_KEY } from './utils'

export const MAIN_WINDOW_WIDTH = 1500
export const MAIN_WINDOW_HEIGHT = 800

class MainWindow {
    public win: BrowserWindow | null = null

    create() {
        this.win = new BrowserWindow({
            ...(process.platform === 'darwin'
                ? {
                      titleBarStyle: 'hidden',
                      titleBarOverlay: true,
                      trafficLightPosition: { x: 10, y: 10 },
                  }
                : { frame: false }),
            width: MAIN_WINDOW_WIDTH,
            height: MAIN_WINDOW_HEIGHT,
            minWidth: MAIN_WINDOW_WIDTH / 2,
            minHeight: MAIN_WINDOW_HEIGHT / 2,
            title: 'Cursor',
            webPreferences: {
                // @ts-ignore
                preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
                // TODO - remove this
                allowRunningInsecureContent: true,
                webSecurity: false,
            },
        })
    }

    setup() {
        this.win?.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url)
            return { action: 'deny' }
        })
        if (!app.isPackaged) {
            this.win?.webContents.openDevTools()
        }

        this.setupIpc()
        this.setupGlobalcuts()
    }

    load() {
        log.info('Made main window')
        // and load the index.html of the app.
        // @ts-ignore
        this.win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
    }

    hasCrated() {
        return !!this.win
    }

    private setupIpc() {
        ipcMain.handle('maximize', () => {
            // First check if this is maximized
            if (this.win?.isMaximized()) {
                // If it is, unmaximize it
                this.win.unmaximize()
            } else {
                // If it isn't, maximize it
                this.win?.maximize()
            }
        })
        // add minimize and close functionality to the window buttons
        ipcMain.handle('close', () => {
            app.quit()
        })

        ipcMain.handle(
            'setCookies',
            async (
                _event: IpcMainInvokeEvent,
                cookieObject: { url: string; name: string; value: string }
            ) => {
                await this.win?.webContents.session.cookies.set(cookieObject)
            }
        )

        ipcMain.handle('minimize', () => {
            this.win?.minimize()
        })
    }

    private setupGlobalcuts() {
        globalShortcut.register(META_KEY + '+M', () => {
            this.win?.minimize()
        })

        globalShortcut.register(META_KEY + '+Shift+M', () => {
            if (this.win?.isMaximized()) {
                this.win.restore()
            } else {
                this.win?.maximize()
            }
        })
    }
}

export default new MainWindow()
