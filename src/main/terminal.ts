import os from 'os'
import * as pty from 'node-pty'

import { ipcMain } from 'electron'

export function setupTerminal(
    mainWindow: any,
    newTerminalId: number,
    rootPath?: string
) {
    let shells =
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
            if (newTerminalId === 0) {
                ptyProcess.write('\n')
            }
            break
        } catch (e) {
            // ignore errors
        }
    }

    if (ptyProcess == null) {
        console.log(`Failed to create terminal with id: ${newTerminalId}`)
        return
    }

    ipcMain.handle(`terminal-into-${newTerminalId}`, (event, data) => {
        if (data != null && data !== '') {
            ptyProcess.write(data)
        }
    })

    ipcMain.handle(`terminal-resize-${newTerminalId}`, (event, size) => {
        ptyProcess.resize(size.cols, size.rows)
    })

    ipcMain.handle(`terminal-sigkill-${newTerminalId}`, (event) => {
        ptyProcess.kill('SIGKILL')
    })

    ptyProcess.on('data', (data: any) => {
        mainWindow.webContents.send(`terminal-incData-${newTerminalId}`, data)
    })
}
