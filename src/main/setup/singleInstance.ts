import { app } from 'electron'
import mainWindow from '../window'
import { setupTokens } from '../auth'

export default function setupSingleInstance() {
    const gotTheLock = app.requestSingleInstanceLock()

    if (!gotTheLock) {
        app.quit()
    } else {
        app.on('second-instance', (_event, commandLine) => {
            // Someone tried to run a second instance, we should focus our window.
            if (mainWindow.hasCrated()) {
                const { win } = mainWindow
                if (win!.isMinimized()) win!.restore()
                win!.focus()
            }
            const url = commandLine.pop()
            if (url) {
                setupTokens(url)
            }
        })
    }
}
