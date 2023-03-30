import * as cp from 'child_process'
import { IpcMainInvokeEvent, ipcMain } from 'electron'
import { promisify } from 'util'

import { PLATFORM_INFO, rgLoc } from './utils'

const searchRipGrep = async (
    event: IpcMainInvokeEvent,
    arg: {
        query: string
        rootPath: string
        badPaths: string[]
        caseSensitive: boolean
    }
) => {
    // Instead run ripgrep fromt the cli
    // let cmd = ['rg', '--json', '--line-number', '--with-filename']
    const cmd = ['--json', '--line-number', '--with-filename', '--sort-files']
    if (arg.caseSensitive) {
        cmd.push('--case-sensitive')
    } else {
        cmd.push('-i')
    }

    for (const badPath of arg.badPaths) {
        cmd.push('--ignore-file', badPath)
    }

    // cmd.push(`"${arg.query}"`, arg.rootPath);
    cmd.push(arg.query, arg.rootPath)
    // const start = performance.now()
    const childProcess = cp.spawn(rgLoc, cmd)

    const rawData: string[] = []
    let _errored = false
    let overflowBuffer = ''

    const trimLines = (lines: string) => {
        lines = overflowBuffer + lines
        overflowBuffer = ''

        return lines
            .trim()
            .split('\n')
            .filter((match) => {
                try {
                    const data = JSON.parse(match)
                    if (data.type === 'match') {
                        return match
                    }
                } catch (e: any) {
                    overflowBuffer += match
                }
            })
    }

    childProcess.on('error', (_err) => {
        _errored = true
    })

    childProcess.stdout.on('data', (chunk) => {
        rawData.push(...trimLines(chunk.toString()))
        if (rawData.length > 500) {
            // Exit the process
            childProcess.kill()
        }
    })

    // Wait for the process to finish
    await new Promise((resolve) => {
        childProcess.on('close', (code) => {
            resolve(code)
        })
    })

    return rawData
}

const customDebounce = (func: any, wait = 0) => {
    let timeout: any
    let lastCall = 0

    return (...args: any[]) => {
        const now = Date.now()
        if (now - lastCall < wait) {
            clearTimeout(timeout)
            return new Promise((resolve) => {
                timeout = setTimeout(() => {
                    lastCall = now
                    const out = func(...args)
                    return resolve(out)
                }, wait)
            })
        } else {
            lastCall = now
            return func(...args)
        }
    }
}

const searchFilesName = async (
    event: IpcMainInvokeEvent,
    {
        query,
        rootPath,
        topResults = 50,
    }: {
        query: string
        rootPath: string
        topResults?: number
    }
) => {
    const cmd =
        process.platform === 'win32'
            ? `${rgLoc} --iglob "*${query}*" --files '' ./ | head -n ${topResults}`
            : `find . -type f -iname "*${query}*" | head -n ${topResults}`
    const { stdout } = await promisify(cp.exec)(cmd, { cwd: rootPath })
    return stdout
        .split('\n')
        .map((s: string) => {
            if (s.startsWith('./')) {
                return s.slice(2)
            }
            return s
        })
        .filter(Boolean)
}

const searchFilesPath = async (
    event: IpcMainInvokeEvent,
    {
        query,
        rootPath,
        topResults = 50,
    }: {
        query: string
        rootPath: string
        topResults?: number
    }
) => {
    const cmd =
        process.platform === 'win32'
            ? `${rgLoc} --iglob "*${query}*" --files '' ./ | head -n ${topResults}`
            : `find . -typef -ipath "*${query}*" | head -n ${topResults}`
    const { stdout } = await promisify(cp.exec)(cmd, { cwd: rootPath })
    return stdout
        .split('\n')
        .map((s: string) => {
            if (s.startsWith('./')) {
                return s.slice(2)
            }
            return s
        })
        .filter(Boolean)
}

const searchFilesPathGit = async (
    event: IpcMainInvokeEvent,
    {
        query,
        rootPath,
        topResults = 50,
    }: {
        query: string
        rootPath: string
        topResults?: number
    }
) => {
    if (await doesCommandSucceed('git ls-files ffff', rootPath)) {
        const cmd = `git ls-files | grep "${query}" | head -n ${topResults}`
        try {
            const { stdout } = await promisify(cp.exec)(cmd, { cwd: rootPath })
            return stdout
                .split('\n')
                .map((l) => {
                    // map / to connector.PLATFORM_DELIMITER
                    return l.replace(/\//g, PLATFORM_INFO.PLATFORM_DELIMITER)
                })
                .filter(Boolean)
        } catch (e) {
            // ignore errors
        }
    }
    return await searchFilesPath(event, { query, rootPath, topResults })
}

const doesCommandSucceed = async (cmd: string, rootPath: string) => {
    try {
        await promisify(cp.exec)(cmd, { cwd: rootPath })
        return true
    } catch (e) {
        return false
    }
}

const searchFilesNameGit = async (
    event: IpcMainInvokeEvent,
    {
        query,
        rootPath,
        topResults = 50,
    }: {
        query: string
        rootPath: string
        topResults?: number
    }
) => {
    if (await doesCommandSucceed('git ls-files ffff', rootPath)) {
        const cmd = `git ls-files | grep -i "${query}[^\\/]*" | grep -v "^node_modules/" | head -n ${topResults}`
        try {
            const { stdout } = await promisify(cp.exec)(cmd, { cwd: rootPath })
            return stdout
                .split('\n')
                .map((l) => {
                    // map / to connector.PLATFORM_DELIMITER
                    return l.replace(/\//g, PLATFORM_INFO.PLATFORM_DELIMITER)
                })
                .filter(Boolean)
        } catch (e) {
            // ignore errors
        }
    }
    // we'll have to run it with find
    return await searchFilesName(event, { query, rootPath, topResults })
}
export const setupSearch = () => {
    ipcMain.handle('searchRipGrep', customDebounce(searchRipGrep))
    ipcMain.handle('searchFilesName', customDebounce(searchFilesName))
    ipcMain.handle('searchFilesPath', customDebounce(searchFilesPath))
    ipcMain.handle('searchFilesPathGit', customDebounce(searchFilesPathGit))
    ipcMain.handle('searchFilesNameGit', customDebounce(searchFilesNameGit))
}
