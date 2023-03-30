import * as child from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

import Watcher from 'watcher'

import { ChildProcessWithoutNullStreams, spawn } from 'child_process'

import { promisify } from 'util'
import { PLATFORM_INFO } from './utils'

const escapeShell = function (cmd: string) {
    let to_ret = '' + cmd.replace(/(["'$`\\])/g, '\\$1') + ''
    to_ret = to_ret.replace(/%/g, '%%')
    return to_ret
}

const isWindows = process.platform === 'win32'

// A class that implements a lightweight ssh client in nodejs Typescript using spawn
class SSHClient {
    // A private property that holds the spawned ssh process
    private sshProcess: ChildProcessWithoutNullStreams
    public callback: any = null

    // A constructor that uses spawn to connect over ssh given an ssh bash command string
    constructor(sshCommand: string) {
        // Spawn the ssh process with the given command and pipe the stdio streams
        this.sshProcess = spawn(sshCommand, { shell: true, stdio: 'pipe' })

        // Handle any errors from the ssh process
        this.sshProcess.on('error', (err) => {
            console.error(`SSH process error: ${err.message}`)
            this.callback(err)
            if (this.callback != null) this.callback = null
            out = ''
        })

        // Handle the exit event from the ssh process
        this.sshProcess.on('exit', (code, signal) => {
            if (this.callback != null) this.callback('exit')
            this.callback = null
            out = ''
        })

        let seen = false
        let out = ''
        this.sshProcess.stdout.on('data', (data) => {
            if (!seen) {
                seen = true
            } else if (this.callback != null) {
                // remove 'cursordone' from the end of the string
                const ret = data.toString()
                if (ret.trim().endsWith('cursordone')) {
                    out += ret.slice(0, -' cursordone'.length)
                    this.callback(null, out)
                    this.callback = null
                    out = ''
                } else {
                    out += ret
                }
            }
        })
    }

    async setNextLine(callback: any, callbackForHere: any) {
        // wait until callback is null before setting it
        if (this.callback != null) {
            let count = 0
            const interval = setInterval(() => {
                count += 1
                if (count > 100) {
                    clearInterval(interval)
                    callbackForHere(false)
                }

                if (this.callback == null) {
                    clearInterval(interval)
                    this.callback = callback
                    callbackForHere(true)
                }
            }, 100)
        } else {
            this.callback = callback
            callbackForHere(true)
        }
    }

    // A method for running a bash command on the server
    runCommand(command: string, callback: any) {
        try {
            this.setNextLine(callback, (noError: boolean) => {
                if (!noError) {
                    this.callback = null
                    callback('error')
                }

                this.sshProcess.stdin.cork()

                this.sshProcess.stdin.write(`${command}\n`)
                this.sshProcess.stdin.write(`echo 'cursordone'\n`)

                this.sshProcess.stdin.uncork()
            })
        } catch (e) {
            this.callback = null
            callback('error')
        }
    }

    runCommandPromise(command: string) {
        return promisify(this.runCommand).bind(this)(command)
    }
}

// get current working directory
export class FileSystem {
    private client?: SSHClient
    constructor(
        public isRemote: boolean = false,
        private sshCommand: string = ''
    ) {
        if (this.isRemote) {
            this.client = new SSHClient(this.sshCommand)
        }
    }

    async testConnection() {
        if (this.isRemote) {
            return await this.client?.runCommandPromise('echo "hello"')
        }
    }

    async writeFileSync(path: string, data: string) {
        if (this.isRemote) {
            // child.execSync(`echo '${data}' | ${this.sshCommand} -T "cat > ${path}"`)
            const command = `printf "${escapeShell(data)}" > ${path}`
            await this.client!.runCommandPromise(command)
        } else {
            fs.writeFileSync(path, data)
        }
    }

    async unlinkSync(path: string) {
        if (this.isRemote) {
            await this.client?.runCommandPromise(`rm ${path}`)
        } else {
            fs.unlinkSync(path)
        }
    }

    async rmSync(path: string) {
        if (this.isRemote) {
            await this.client?.runCommandPromise(`rm -rf ${path}`)
        } else {
            fs.rmSync(path, { recursive: true })
        }
    }

    async mkdirSync(path: string, options?: fs.MakeDirectoryOptions) {
        if (this.isRemote) {
            // dont look at the options, just always do -p
            await this.client?.runCommandPromise(`mkdir -p ${path}`)
        } else {
            fs.mkdirSync(path, options)
        }
    }

    async renameSync(oldPath: string, newPath: string) {
        if (this.isRemote) {
            await this.client?.runCommandPromise(`mv ${oldPath} ${newPath}`)
        } else {
            fs.renameSync(oldPath, newPath)
        }
    }

    async existsSync(path: string) {
        // await this.client.runCommandPromise('ls').then((data) => {
        //
        //     });
        if (this.isRemote) {
            const remotePath = path
            const command = `test -e ${remotePath} && echo 'yes'`

            try {
                const response = (await this.client?.runCommandPromise(
                    command
                )) as string
                return response.trim() === 'yes'
            } catch (e) {
                return false
            }
        } else {
            return fs.existsSync(path)
        }
    }

    async readdirSyncWithIsDir(path: string) {
        //
        let result = ''
        if (this.isRemote) {
            result = (await this.client?.runCommandPromise(
                `ls -la ${path}`
            )) as string
            //filter out . and ..
            const lines = result.split('\n')
            return lines
                .slice(1, lines.length)
                .filter((x) => x !== '')
                .filter((x) => {
                    const fileName = x.split(' ').filter((x) => x !== '')[8]
                    return fileName !== '.' && fileName !== '..'
                })
                .map((x) => {
                    const isDir = x.split(' ')[0][0] === 'd'
                    const fileName = x.split(' ').slice(-1)[0]
                    const size = parseInt(
                        x.split(' ').filter((x) => x !== '')[4]
                    )
                    return { fileName, isDir, size }
                })
        } else {
            // do the same as above but just use the fs module
            const files = fs.readdirSync(path)
            return files.map((fileName) => {
                const isDir = fs
                    .lstatSync(
                        path + PLATFORM_INFO.PLATFORM_DELIMITER + fileName
                    )
                    .isDirectory()
                const size = fs.lstatSync(
                    path + PLATFORM_INFO.PLATFORM_DELIMITER + fileName
                ).size
                return { fileName, isDir, size }
            })
        }
    }

    async readdirSync(path: string) {
        if (this.isRemote) {
            const remotePath = path
            const result = (await this.client?.runCommandPromise(
                `ls ${remotePath}`
            )) as string
            return result.split('\n').filter((x) => x !== '')
        } else {
            return fs.readdirSync(path)
        }
    }

    async readFileSync(path: string, encoding: 'utf8' | 'binary') {
        if (this.isRemote) {
            // check the size of the file
            const size = (await this.client?.runCommandPromise(
                `du -b ${path}`
            )) as string
            const sizeInt = parseInt(size.split('\t')[0])
            if (sizeInt > 1000000) {
                return 'File too large'
            }
            // check if the file is binary
            const isBinary = (await this.client?.runCommandPromise(
                `file ${path}`
            )) as string
            const boolBinary = isBinary.includes('binary')
            if (boolBinary) {
                return 'File is binary'
            }

            const result = (await this.client?.runCommandPromise(
                `cat ${path}`
            )) as string
            return result
        } else {
            return fs.readFileSync(path, encoding)
        }
    }

    async readFile(
        path: string,
        callback: (err: NodeJS.ErrnoException | null, data: Buffer) => void
    ) {
        if (this.isRemote) {
            const remotePath = path
            const result = (await this.client?.runCommandPromise(
                `cat ${remotePath}`
            )) as string
            callback(null, Buffer.from(result))
        } else {
            fs.readFile(path, callback)
        }
    }

    async statSync(path: string) {
        if (this.isRemote) {
            const remotePath = path
            const result = (await this.client?.runCommandPromise(
                `stat ${remotePath}`
            )) as string
            const res = fs.statSync('./')
            res.mtimeMs =
                parseInt(result.split('Modify: ')[1].split(' ')[0]) * 1000
            res.size = parseInt(result.split('Size: ')[1].split(' ')[0])
            // parse whether is file and is directory
            const isFile = result.split('File: ')[1].split(' ')[0] === 'regular'
            const isDirectory =
                result.split('File: ')[1].split(' ')[0] === 'directory'
            res.isFile = () => isFile
            res.isDirectory = () => isDirectory
            return res
        } else {
            return fs.statSync(path)
        }
    }

    async exec(command: string, cwd: string) {
        if (this.isRemote) {
            return (await this.client?.runCommandPromise(
                `cd ${cwd} && ${command}`
            )) as string
        } else {
            return child.exec(command, {
                cwd,
                encoding: 'utf-8',
                maxBuffer: 10000 * 500,
            })
        }
    }

    async execSync(command: string, cwd: string) {
        if (this.isRemote) {
            return (await this.client?.runCommandPromise(
                `cd ${cwd} && ${command}`
            )) as string
        } else {
            return child.execSync(command, {
                cwd,
                encoding: 'utf-8',
                maxBuffer: 10000 * 500,
            })
        }
    }

    async execPromise(command: string, cwd: string) {
        if (this.isRemote) {
            return this.client!.runCommandPromise(`cd ${cwd} && ${command}`)
        } else {
            return promisify(child.exec)(command, {
                encoding: 'utf-8',
                maxBuffer: 10000 * 500,
                cwd: cwd,
            })
        }
    }

    startWatcher(rootDir: string, ignore: any, callbacks: any) {
        if (this.isRemote) {
            const sshCommand = `${this.sshCommand} -T "inotifywait -m -r ${rootDir}"`
            const childProcess = child.spawn(sshCommand, [], { shell: true })
            childProcess.stdout.on('data', (data) => {
                const lines = data.toString().trim().split('\n')

                // deduplicate lines
                const deduplicatedLines = lines.filter(
                    (line: any, index: any) => {
                        return lines.indexOf(line) === index
                    }
                )
                for (const line of lines) {
                    try {
                        const inotifyOutput = line.trim()
                        const comps = inotifyOutput.split(' ')

                        const fileName = comps[comps.length - 1]
                        const folderPath = comps[0]
                        const filePath = path.join(folderPath, fileName)

                        const eventString = comps[comps.length - 2]
                        const eventAttrs = eventString.split(',')
                        const isDir = eventAttrs.includes('ISDIR')
                        const eventType = eventAttrs[0]

                        if (eventType === 'MODIFY') {
                            callbacks.change(filePath)
                        }
                        if (eventType === 'CREATE') {
                            if (isDir) callbacks.addDir(filePath)
                            else callbacks.add(filePath)
                        }
                        if (eventType === 'DELETE') {
                            if (isDir) callbacks.unlinkDir(filePath)
                            else callbacks.unlink(filePath)
                        }
                    } catch (err) {}
                }
            })
            childProcess.stderr.on('data', function (data) {})

            childProcess.on('exit', function (code) {})
        } else {
            const watcher = new Watcher(rootDir, {
                ignore,
                ignoreInitial: true,
                persistent: true,
                recursive: true,
            })
            watcher
                .on('add', callbacks.add)
                .on('addDir', callbacks.addDir)
                .on('change', callbacks.change)
                .on('unlink', callbacks.unlink)
                .on('unlinkDir', callbacks.unlinkDir)
        }
    }
}

// export let fileSystem = new FileSystem(true, 'ssh -i ~/keys/WestCompute.pem ubuntu@ec2-3-90-39-139.compute-1.amazonaws.com');
export let fileSystem = new FileSystem()

export function setFileSystem(newFileSystem: FileSystem) {
    fileSystem = newFileSystem
}
