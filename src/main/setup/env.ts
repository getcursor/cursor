import { app, systemPreferences } from 'electron'

export function setupEnv() {
    // Handle creating/removing shortcuts on Windows when installing/uninstalling.
    if (require('electron-squirrel-startup')) {
        app.quit()
    }
    // Remove holded defaults
    if (process.platform === 'darwin')
        systemPreferences.setUserDefault(
            'ApplePressAndHoldEnabled',
            'boolean',
            false
        )
}
