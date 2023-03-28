import os from 'os'
import * as pty from 'node-pty'

import { ipcMain } from 'electron'
import log from 'electron-log'
import Store from 'electron-store'

const store = new Store()

export function setupTerminal(mainWindow: any) {
    const opened_folder_path = store.get("projectRoot") as string;

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
    for (var i = 0; i < shells.length; i++) {
        const shell = shells[i]
        try {
            if (process.platform !== 'win32')
                require('child_process').execSync(`command -v ${shells[i]}`)
            const res = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 24,
                cwd: opened_folder_path,
                env: filteredEnv,
            })
            ptyProcess = res
            
            break
        } catch (e) {}
    }

    if (ptyProcess == null) return
    ipcMain.handle('terminal-into', (event, data) => {
        ptyProcess.write(data)
    })

    ptyProcess.on('data', (data: any) => {
        mainWindow.webContents.send('terminal-incData', data)
    })

    ipcMain.handle("terminal-resize", (event, size) => {
      ptyProcess.resize(size.cols, size.rows);
    });

    ipcMain.handle('terminal-path', (event, data) => {
        const opened_folder_path = store.get("projectRoot") as string;
        ptyProcess.write(`cd "${opened_folder_path}"\n`);
        ptyProcess.write(`clear\n`);
    })
}

