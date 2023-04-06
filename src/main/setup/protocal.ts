import { app } from 'electron'
import path from 'path'

export default function setupProtocal() {
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(
                'electron-fiddle',
                process.execPath,
                [path.resolve(process.argv[1])]
            )
        }
    } else {
        app.setAsDefaultProtocolClient('electron-fiddle')
    }
}
