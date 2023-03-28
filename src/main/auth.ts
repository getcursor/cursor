import jwtDecode from 'jwt-decode'
import * as url from 'url'
// import envVariables from '../env-variables';
import {
    BrowserView,
    BrowserWindow,
    ipcMain,
    IpcMainInvokeEvent,
} from 'electron'
import { API_ROOT } from '../utils'
import crypto from 'crypto'
import fetch from 'node-fetch'

import Store from 'electron-store'
const store = new Store()

let win: BrowserWindow | null = null

// const auth0Domain = process.env.AUTH0_DOMAIN!
// const clientId = process.env.AUTH0_CLIENT_ID!
const auth0Domain = 'cursor.us.auth0.com'
const clientId = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB'

let accessToken: string | null = null
let profile: any | null = null
let refreshToken = null
let stripeProfile: string | null = null

const STRIPE_SUCCESS_URL = 'http://localhost:8000/success/'
const STRIPE_FAILURE_URL = 'http://localhost:8000/failure/'

const AUTH0_CALLBACK_URL = `${API_ROOT}/auth/auth0_callback`
const redirectUri = AUTH0_CALLBACK_URL
const DUMMY_URL = `${API_ROOT}/dummy/*`
const API_AUDIENCE = `https://${auth0Domain}/api/v2/`

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

export function getAccessToken() {
    return accessToken
}

export function getProfile() {
    return profile
}

export function getStripeProfile() {
    return stripeProfile
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

export function getAuthenticationURL() {
    const verifier = base64URLEncode(crypto.randomBytes(32))
    const challenge = base64URLEncode(sha256(Buffer.from(verifier)))

    const state = Math.random().toString(36).substring(2, 18)
    const scope = 'openid profile offline_access'
    const responseType = 'code'

    const queryParams = {
        audience: API_AUDIENCE,
        client_id: clientId,
        redirect_uri: AUTH0_CALLBACK_URL,
        state,
        scope,
        response_type: responseType,
        code_challenge: challenge,
        code_challenge_method: 'S256', // SHA-256
    }

    return {
        url: `https://${auth0Domain}/authorize?${new URLSearchParams(
            queryParams
        )}`,
        state,
        verifier,
    }
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
    console.log('GOT NEW URL', { newUrl })
    window.loadURL(newUrl)
}

export async function refreshTokens(event: IpcMainInvokeEvent) {
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
                state: 'thisisatest',
            }),
        }
        try {
            const response = await fetch(
                `https://${auth0Domain}/oauth/token`,
                refreshOptions
            )
            const data = (await response.json()) as {
                access_token: string
                id_token: string
            }

            accessToken = data.access_token
            profile = jwtDecode(data.id_token)
        } catch (error) {
            // await logout(parentWindow)
            throw error
        }
    } else {
        // No refresh token
        //throw new Error('No available refresh token.')
    }

    console.log('UPDATING AUTH STATUS IN refresh tokens')
    event.sender.send('updateAuthStatus', { accessToken, profile })
}

export async function loadTokens(
    callbackURL: string,
    verifier: string,
    window: BrowserWindow
) {
    const urlParts = url.parse(callbackURL, true)
    const query = urlParts.query

    const exchangeOptions = {
        grant_type: 'authorization_code',
        client_id: clientId,
        code: query.code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        // audience: API_AUDIENCE,
    }

    const options = {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(exchangeOptions),
    }

    try {
        const response = await fetch(
            `https://${auth0Domain}/oauth/token`,
            options
        )

        const data = (await response.json()) as {
            access_token: string
            id_token: string
            refresh_token?: string
        }
        accessToken = data.access_token
        profile = jwtDecode(data.id_token)
        refreshToken = data.refresh_token

        if (refreshToken) {
            await storeWrapper.set('refreshToken', refreshToken)
        }
    } catch (error) {
        await logout(window)
        destroyAuthWin(window)

        throw error
    }
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
    let resp = await response.json()
    console.log('GOT STRIPE PROFILE', resp)
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
    console.log('UPDATING AUTH STATUS IN LOGOUT')
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
    console.log('UPDATING AUTH STATUS IN LOGOUT')
    event.sender.send('updateAuthStatus', {
        accessToken,
        profile,
        stripeProfile,
    })
}

export function getLogOutUrl() {
    return `https://${auth0Domain}/v2/logout`
}

export function createAuthWindow(parentWindow: BrowserWindow) {
    destroyAuthWin(parentWindow)

    win = new BrowserWindow({
        width: 1000,
        height: 800,
        modal: true,
        show: true,
        frame: true,
        // parent: parentWindow,
        webPreferences: {
            nodeIntegration: false,
            webSecurity: false,
            // enableRemoteModule: false
        },
    })

    const { url, state, verifier } = getAuthenticationURL()
    console.log('SENDING TO URL', url)

    const {
        session: { webRequest },
    } = win.webContents

    const filter = {
        urls: [DUMMY_URL],
    }
    const requestListener = async ({ url }: { url: string }) => {
        console.log('INTERRUPTED', url)
        await loadTokens(url, verifier, parentWindow)
        await loadStripeProfile()
        console.log('GOT STRIPE PROFILE', stripeProfile)
        // Not sure what to do here:
        // createAppWindow();
        if (!stripeProfile && win) {
            console.log('Creating stripe window')
            createStripeWindow(parentWindow, win)
        } else {
            console.log('Destroying auth window')
            return destroyAuthWin(parentWindow)
        }
    }

    webRequest.onBeforeRequest(filter, requestListener)

    win?.webContents.loadURL(url)
    win.on('closed', () => {
        win = null
    })
}

function destroyAuthWin(parentWindow: BrowserWindow) {
    if (!win) return
    win.close()
    win = null
    console.log('UPDATING AUTH STATUS IN DESTROY AUTH WIN')
    parentWindow.webContents.send('updateAuthStatus', {
        accessToken,
        profile,
        stripeProfile,
    })
}

let stripeWin: BrowserWindow | null = null

export function createStripeWindow(
    parentWindow: BrowserWindow,
    oldStripeWindow?: BrowserWindow
) {
    destroyStripeWin(parentWindow)

    if (!oldStripeWindow) {
        stripeWin = new BrowserWindow({
            width: 800,
            height: 600,
            modal: true,
            show: true,
            frame: true,
            // parent: parentWindow,
            webPreferences: {
                nodeIntegration: false,
                webSecurity: false,
            },
        })
    } else {
        stripeWin = oldStripeWindow
    }

    stripeUrlRequest(stripeWin)

    const filter = {
        urls: [STRIPE_SUCCESS_URL, STRIPE_FAILURE_URL],
    }

    stripeWin.webContents.session.webRequest.onBeforeRequest(
        filter,
        async ({ url }) => {
            if (url == STRIPE_SUCCESS_URL) {
                console.log('SUCCESS')
                // First wait 2 seconds
                await new Promise((resolve) => setTimeout(resolve, 2000))
                await loadStripeProfile()
            } else {
                // First wait 2 seconds
                await new Promise((resolve) => setTimeout(resolve, 2000))
                await loadStripeProfile()
                console.log('FAILURE')
            }
            // Not sure what to do here:
            // createAppWindow();
            console.log('Destroying stripe window')
            return destroyStripeWin(parentWindow)
        }
    )

    stripeWin.on('closed', () => {
        stripeWin = null
    })
}

function destroyStripeWin(parentWindow: BrowserWindow) {
    console.log('Destroying stripe window', stripeWin)
    if (!stripeWin) return
    stripeWin.close()
    stripeWin = null
    win = null
    console.log('UPDATING AUTH STATUS IN DESTROY STRIPE WIN')
    parentWindow.webContents.send('updateAuthStatus', {
        accessToken,
        profile,
        stripeProfile,
    })
}

export function createLogoutWindow(event: IpcMainInvokeEvent) {
    console.log('LOGGING OUT')
    const logoutWindow = new BrowserWindow({
        show: false,
    })

    logoutWindow.loadURL(getLogOutUrl())

    logoutWindow.on('ready-to-show', async () => {
        console.log('CLOSING LOGOUT WINDOW')
        await logoutEvent(event)
        logoutWindow.close()
    })
}

export function authPackage() {
    ipcMain.handle('loginCursor', async (event: IpcMainInvokeEvent) => {
        console.log('LOGGING IN CURSOR')
        let mainWindow = BrowserWindow.fromWebContents(event.sender)
        if (mainWindow) {
            createAuthWindow(mainWindow)
        } else {
            console.log('main window not found')
        }
    })
    ipcMain.handle('payCursor', async (event: IpcMainInvokeEvent) => {
        console.log('PAYING CURSOR')
        let mainWindow = BrowserWindow.fromWebContents(event.sender)
        if (mainWindow) {
            createStripeWindow(mainWindow)
        } else {
            console.log('main window not found')
        }
    })

    ipcMain.handle('refreshTokens', async (event: IpcMainInvokeEvent) => {
        console.log('REFRESHING TOKENS')
        await refreshTokens(event)
        await loadStripeProfile()

        event.sender.send('updateAuthStatus', {
            accessToken,
            profile,
            stripeProfile,
        })
    })

    ipcMain.handle('logoutCursor', async (event: IpcMainInvokeEvent) => {
        console.log('LOGGING OUT')
        createLogoutWindow(event)
    })

    ipcMain.handle('getUserCreds', async (event: IpcMainInvokeEvent) => {
        console.log('GETTING USER CREDS')
        await refreshTokens(event)
        await loadStripeProfile()
        return {
            accessToken,
            profile,
            stripeProfile,
        }
    })
}
