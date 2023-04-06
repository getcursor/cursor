import { app } from 'electron'
import log from 'electron-log'
import * as fs from 'fs'
import path from 'path'

import { API_ROOT } from '../../utils'
import { isAppInApplicationsFolder } from '../utils'

const logLocation = path.join(app.getPath('userData'), 'log.log')

if (isAppInApplicationsFolder) {
    log.transports.file.resolvePath = () => logLocation
}
Object.assign(console, log.functions)

let lastTime: null | number = null
function logError(error: any) {
    log.info('uncaughtException', error)

    // send log file to server
    if (
        isAppInApplicationsFolder &&
        (lastTime == null || Date.now() - lastTime > 1000 * 2)
    ) {
        lastTime = Date.now()
        const logFile = fs.readFileSync(
            log.transports.file.getFile().path,
            'utf8'
        )
        const body = {
            name: app.getPath('userData').replace(/ /g, '\\ '),
            log: encodeURIComponent(logFile),
            error: error.toString(),
        }
        fetch(API_ROOT + '/save_log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
    }
}

export default function setupLogger() {
    process.on('uncaughtException', (error) => {
        logError(error)
    })
    process.on('unhandledRejection', (error) => {
        logError(error)
    })
}
