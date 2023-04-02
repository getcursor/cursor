import jwtDecode from 'jwt-decode'
import { shell } from 'electron'
import * as url from 'url'
// import envVariables from '../env-variables';
import {
    BrowserWindow,
    IpcMainInvokeEvent,
    ipcMain,
    webContents,
} from 'electron'
import { API_ROOT, HOMEPAGE_ROOT } from '../utils'
import crypto from 'crypto'
import fetch from 'node-fetch'

import Store from 'electron-store'
const store = new Store()

const win: BrowserWindow | null = null

const auth0Domain = 'cursor.us.auth0.com'
const clientId = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB'

// Test domain/client
// const auth0Domain = 'dev-27d5cph2nbetfllb.us.auth0.com'
// const clientId = 'OzaBXLClY5CAGxNzUhQ2vlknpi07tGuE'

let accessToken: string | null = null
let profile: any | null = null
const openAISecretKey: string | null = null
let refreshToken: string | null = null
let stripeProfile: string | null = null
const verifier: string | null = null

const STRIPE_SUCCESS_URL = 'electron-fiddle://success/'
const STRIPE_FAILURE_URL = 'electron-fiddle://failure/'

const AUTH0_CALLBACK_URL = `${API_ROOT}/auth/auth0_callback`
const redirectUri = AUTH0_CALLBACK_URL
const DUMMY_URL = `${API_ROOT}/dummy/*`
const API_AUDIENCE = `https://${auth0Domain}/api/v2/`

// These are routes that exist on our homepage
const loginUrl = `${HOMEPAGE_ROOT}/loginDeep`
const signUpUrl = `${HOMEPAGE_ROOT}/loginDeep`
const settingsUrl = `${HOMEPAGE_ROOT}/settings`
const payUrl = `${HOMEPAGE_ROOT}/pricing?fromCursor=true`

const supportUrl = `${API_ROOT}/auth/support`

// These are api routes
const logoutUrl = `${API_ROOT}/api/auth/logout`

const storeWrapper = {
    get: async (key: string) => {
        return store.get('AUTH_STORE_' + key)
    },
    set: async (key: string, value: any) => {
        return store.set('AUTH_STORE_' + key, value)
    },
    has: async (key: string) => {
        return store.has('AUTH_STORE_' + key)
    },
    delete: async (key: string) => {
        return store.delete('AUTH_STORE_' + key)
    },
    clear: async () => {
        // Iterate through the keys of store that should be deleted and remove
        Object.keys(store.store).forEach((key) => {
            if (key.startsWith('AUTH_STORE_')) {
                store.delete(key)
            }
        })
    },
}

function base64URLEncode(str: Buffer) {
    return str
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
}
function sha256(buffer: Buffer) {
    return crypto.createHash('sha256').update(buffer).digest()
}

export async function stripeUrlRequest(window: BrowserWindow) {
    const response = await fetch(`${API_ROOT}/auth/create-checkout-session`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            profile,
        }),
    })

    const newUrl = (await response.json()) as string
    window.loadURL(newUrl)
}

export async function refreshTokens(event?: IpcMainInvokeEvent) {
    const refreshToken = await storeWrapper.get('refreshToken')

    if (refreshToken) {
        const refreshOptions = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                client_id: clientId,
                refresh_token: refreshToken,
                // audience: API_AUDIENCE,
                // state: 'thisisatest',
            }),
        }

        const response = await fetch(
            `https://${auth0Domain}/oauth/token`,
            refreshOptions
        )
        const data = (await response.json()) as {
            access_token: string
            id_token: string
        }

        accessToken = data.access_token
        const idToken = data.id_token
        profile = jwtDecode(idToken)
    } else {
        // No refresh token
        //throw new Error('No available refresh token.')
    }

    if (event) {
        event.sender.send('updateAuthStatus', { accessToken, profile })
    }
}

export async function setupTokens(
    callbackURL: string
    // window: BrowserWindow
) {
    const urlParts = url.parse(callbackURL, true)
    const query = urlParts.query
    const host = urlParts.host
    //
    if (host?.toLowerCase() === 'changetokens') {
        accessToken = query.accessToken as string
        refreshToken = query.refreshToken as string

        await storeWrapper.set('refreshToken', refreshToken)
    }
    // Get the profile id from this
    await refreshTokens()
    await loadStripeProfile()

    webContents.getAllWebContents().forEach((wc) => {
        wc.send('updateAuthStatus', { accessToken, profile, stripeProfile })
        wc.send('closeErrors')
    })
}

export async function loadStripeProfile() {
    if (!accessToken) {
        return
    }

    const response = await fetch(`${API_ROOT}/auth/stripe_profile`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    })
    const resp = await response.json()
    if (resp) {
        stripeProfile = resp as string
    }
}

export async function logout(window: BrowserWindow) {
    await storeWrapper.clear()
    accessToken = null
    profile = null
    refreshToken = null
    stripeProfile = null
    window.webContents.send('updateAuthStatus', {
        accessToken,
        profile,
        stripeProfile,
    })
}

export async function logoutEvent(event: IpcMainInvokeEvent) {
    await storeWrapper.clear()
    accessToken = null
    profile = null
    refreshToken = null
    stripeProfile = null
    event.sender.send('updateAuthStatus', {
        accessToken,
        profile,
        stripeProfile,
    })
}

export function getLogOutUrl() {
    return `https://${auth0Domain}/v2/logout`
}

export function addRandomQueryParam(url: string): string {
    const randomParam = `random=${Math.random().toString(36).substring(7)}`
    const parsedUrl = new URL(url)
    parsedUrl.searchParams.append(randomParam, '')
    return parsedUrl.toString()
}

export async function login() {
    // const { url, state, } = getAuthenticationURL()
    await shell.openExternal(addRandomQueryParam(loginUrl))
}

export async function signup() {
    await shell.openExternal(addRandomQueryParam(signUpUrl))
}

export async function pay() {
    await shell.openExternal(payUrl)
}
export async function settings() {
    await shell.openExternal(settingsUrl)
}
export async function support() {
    await shell.openExternal(supportUrl)
}

export function createLogoutWindow(event: IpcMainInvokeEvent) {
    const logoutWindow = new BrowserWindow({
        show: false,
    })

    logoutWindow.loadURL(getLogOutUrl())

    logoutWindow.on('ready-to-show', async () => {
        await logoutEvent(event)
        logoutWindow.close()
    })
}

export function authPackage() {
    // Simple browser opening functions
    ipcMain.handle('loginCursor', login)
    ipcMain.handle('signupCursor', signup)
    ipcMain.handle('payCursor', pay)
    ipcMain.handle('settingsCursor', settings)
    ipcMain.handle('logoutCursor', createLogoutWindow)

    // Functions to handle electron-fiddle
    ipcMain.handle(
        'loginData',
        async (
            event: IpcMainInvokeEvent,
            data: {
                accessToken: string
                profile: any
                stripeProfile: string
            }
        ) => {
            // Set the global values
            accessToken = data.accessToken
            profile = data.profile
            stripeProfile = data.stripeProfile
            await refreshTokens(event)
            await loadStripeProfile()

            event.sender.send('updateAuthStatus', {
                accessToken,
                profile,
                stripeProfile,
            })
        }
    )

    ipcMain.handle('refreshTokens', async (event: IpcMainInvokeEvent) => {
        await refreshTokens(event)
        await loadStripeProfile()

        event.sender.send('updateAuthStatus', {
            accessToken,
            profile,
            stripeProfile,
        })
    })

    ipcMain.handle('getUserCreds', async (event: IpcMainInvokeEvent) => {
        await refreshTokens(event)
        await loadStripeProfile()
        return {
            accessToken,
            profile,
            stripeProfile,
        }
    })
}
