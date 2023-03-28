import os from 'os'
import * as pty from 'node-pty'

import { ipcMain } from 'electron'

export function setupTerminal(mainWindow: any, rootPath?: string) {
    const shells =
        os.platform() === 'win32' ? ['powershell.exe'] : ['zsh', 'bash']
    const filteredEnv: { [key: string]: string } = Object.entries(
        process.env
    ).reduce((acc, [key, value]) => {
        if (typeof value === 'string') {
            acc[key] = value
        }
        return acc
    }, {} as { [key: string]: string })

    let ptyProcess: any = null
    for (let i = 0; i < shells.length; i++) {
        const shell = shells[i]
        try {
            if (process.platform !== 'win32')
                require('child_process').execSync(`command -v ${shells[i]}`)
            const res = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 24,
                cwd: rootPath || process.env.HOME, // Use the rootPath or default to the home directory
                env: filteredEnv,
            })
            ptyProcess = res
            break
        } catch (e) {
            // ignore errors
        }
    }

    if (ptyProcess == null) return
    ipcMain.handle('terminal-into', (event, data) => {
        ptyProcess.write(data)
    })

    ptyProcess.on('data', (data: any) => {
        mainWindow.webContents.send('terminal-incData', data)
    })

    ipcMain.handle('terminal-resize', (event, size) => {
        ptyProcess.resize(size.cols, size.rows)
    })
}
