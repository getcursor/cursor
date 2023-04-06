import { app } from 'electron'
import { setupTokens } from '../auth'

export default function setupAuth() {
    app.on('open-url', (_event, url) => {
        if (url) {
            setupTokens(url)
        }
    })
}
