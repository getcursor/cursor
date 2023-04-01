import { app, session } from 'electron'

export default function setupSessionHeaders() {
    app.on('ready', () => {
        session.defaultSession.webRequest.onHeadersReceived(
            (details: any, callback: any) => {
                callback({
                    responseHeaders: Object.assign(
                        {
                            ...details.responseHeaders,
                            'Content-Security-Policy': [
                                "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: file: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';",
                            ],
                        },
                        details.responseHeaders
                    ),
                })
            }
        )
    })
}
