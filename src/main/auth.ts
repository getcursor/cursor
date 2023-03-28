import jwtDecode from 'jwt-decode'
import {shell} from 'electron'
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

// const auth0Domain = 'cursor.us.auth0.com'
// const clientId = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB'

const auth0Domain = 'cursor.us.auth0.com'
const clientId = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB'

let accessToken: string | null = null
let profile: any | null = null
let openAISecretKey: string | null = null
let refreshToken: string | null = null
let stripeProfile: string | null = null
let verifier: string | null = null

const STRIPE_SUCCESS_URL = 'electron-fiddle://success/'
const STRIPE_FAILURE_URL = 'electron-fiddle://failure/'

const AUTH0_CALLBACK_URL = `${API_ROOT}/auth/auth0_callback`
const redirectUri = AUTH0_CALLBACK_URL
const DUMMY_URL = `${API_ROOT}/dummy/*`
const API_AUDIENCE = `https://${auth0Domain}/api/v2/`

const loginUrl = `${API_ROOT}/auth/login`
const signUpUrl = `${API_ROOT}/auth/signUp`
const logoutUrl = `${API_ROOT}/auth/logout`
const settingsUrl = `${API_ROOT}/auth/settings`
const supportUrl = `${API_ROOT}/auth/support`
const payUrl = `${API_ROOT}/auth/pay`

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

export function getAuthenticationURL() {
    verifier = base64URLEncode(crypto.randomBytes(32))
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
        url: `${loginUrl}?${new URLSearchParams(
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
        refreshToken = data.refresh_token!

        if (refreshToken) {
            await storeWrapper.set('refreshToken', refreshToken)
        }
    } catch (error) {
        await logout(window)
        // destroyAuthWin(window)

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

export async function login() {
    // const { url, state, } = getAuthenticationURL()
    await shell.openExternal(loginUrl);
}

export async function signup() {
    await shell.openExternal(signUpUrl);
}

export async function pay() {
    await shell.openExternal(payUrl);
}
export async function settings() {
    await shell.openExternal(settingsUrl);
}
export async function support() {
    await shell.openExternal(supportUrl);
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
    // Simple browser opening functions
    ipcMain.handle('loginCursor', login);
    ipcMain.handle('signupCursor', signup)
    ipcMain.handle('payCursor', pay)
    ipcMain.handle('settingsCursor', settings)
    ipcMain.handle('logoutCursor', createLogoutWindow)

    // Functions to handle electron-fiddle
    ipcMain.handle('loginData', async (event: IpcMainInvokeEvent, data: {
        accessToken: string
        profile: any
        stripeProfile: string
    }) => {
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
    })
        
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
