import * as path from 'path'
import { app } from 'electron'
import { getPlatformInfo } from '../utils'

export const resourcesDir = app.isPackaged
    ? path.join(process.resourcesPath)
    : path.join(__dirname, '..', '..')

export const platDir = path.join(resourcesDir, 'resources', process.platform)
export const platformResourcesDir =
    process.platform === 'win32' ? platDir : path.join(platDir, process.arch)

export const rgLoc = path.join(
    platformResourcesDir,
    process.platform === 'win32' ? 'rg.exe' : 'rg'
)

export const PLATFORM_INFO = getPlatformInfo()

export const isAppInApplicationsFolder =
    app.getPath('exe').includes('Applications') ||
    !app.isPackaged ||
    process.platform !== 'darwin'

export const META_KEY = process.platform === 'darwin' ? 'Cmd' : 'Ctrl'
