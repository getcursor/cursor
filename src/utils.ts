export const API_ROOT = 'https://aicursor.com'
export const HOMEPAGE_ROOT = 'https://cursor.so'

export class ExpectedBackendError extends Error {
    public title: string | null = null
}

export class NoAuthRateLimitError extends ExpectedBackendError {
    constructor(
        message = "You've reached the rate limit for unauthenticated requests. Please log in to continue."
    ) {
        super(message)
        this.name = 'NoAuthRateLimitError'
        this.title = 'Please log in to continue...'
    }
}

export class AuthRateLimitError extends ExpectedBackendError {
    constructor(
        message = "It seems like you're making an unusual number of AI requests. Please try again later. If you think this is a mistake, please contact admin@cursor.so"
    ) {
        super(message)
        this.name = 'AuthRateLimitError'
        this.title = "You're going a bit fast..."
    }
}

export class NoAuthLocalRateLimitError extends ExpectedBackendError {
    constructor(
        message = 'To protect our backend, we ask that free users limit their usage to 30 prompts per hour. To raise this limit, feel free to upgrade to pro.'
    ) {
        super(message)
        this.name = 'NoAuthLocalRateLimitError'
        this.title = "You're going a bit fast..."
    }
}

export class NoAuthGlobalOldRateLimitError extends ExpectedBackendError {
    constructor(
        message = "If you've enjoyed using Cursor, please consider subscribing to one of our paid plans. Otherwise, you can enter your Open AI key (gear icon) to continue using the AI features at-cost."
    ) {
        super(message)
        this.name = 'NoAuthGlobalOldRateLimitError'
        this.title = 'Free tier limit exceeded'
    }
}

export class NoAuthGlobalNewRateLimitError extends ExpectedBackendError {
    constructor(
        message = "We're currently experiencing a high volume of requests. Please try again in a few minutes. For support, please contact admin@cursor.so."
    ) {
        super(message)
        this.name = 'NoAuthGlobalNewRateLimitError'
        this.title = 'Our servers are overloaded...'
    }
}

export class OpenAIError extends ExpectedBackendError {}
export class BadOpenAIAPIKeyError extends OpenAIError {
    constructor(
        message = 'The provided OpenAI API key is invalid. Please provide a valid API key.'
    ) {
        super(message)
        this.name = 'BadOpenAIAPIKeyError'
    }
}

export class BadModelError extends ExpectedBackendError {
    constructor(
        message = 'The provided model ID is invalid. Please provide a valid model ID.'
    ) {
        super(message)
        this.name = 'BadModelError'
    }
}

export class NotLoggedInError extends ExpectedBackendError {
    constructor(message = 'You are not logged in. Please log in to continue.') {
        super(message)
        this.name = 'NotLoggedInError'
    }
}
export type ExpectedError =
    | NoAuthRateLimitError
    | AuthRateLimitError
    | NoAuthLocalRateLimitError
    | NoAuthGlobalOldRateLimitError
    | NoAuthGlobalNewRateLimitError
    | BadOpenAIAPIKeyError
    | BadModelError
    | NotLoggedInError

export async function fetchWithCookies(url: string, options: RequestInit = {}) {
    const response = await fetch(url, options)
    // Get the cookies
    const cookies = response.headers.get('Set-Cookie')
    if (cookies) {
        console.log(cookies)
        const [name, value] = cookies.split('=')
        await connector.setCookies({
            url: url,
            name,
            value,
        })
    }
    return response
}

export async function* streamSource(response: Response): AsyncGenerator<any> {
    if (response.status == 429) {
        // Check the error text
        if (response.statusText == 'NO_AUTH') {
            throw new NoAuthRateLimitError()
        } else {
            throw new AuthRateLimitError()
        }
    }

    // Check if the response is an event-stream
    if (
        response.headers.get('content-type') ==
        'text/event-stream; charset=utf-8'
    ) {
        // Create a reader to read the response body as a stream
        // const reader = response.body.getReader();
        // Fix the above error: `response.body is possibly null`
        const reader = response.body!.getReader()
        // Create a decoder to decode the stream as UTF-8 text
        const decoder = new TextDecoder('utf-8')

        // Loop until the stream is done
        while (true) {
            const { value, done } = await reader.read()
            if (done) {
                break
            }

            const rawValue = decoder.decode(value)
            const lines = rawValue.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonString = line.slice(6)
                    if (jsonString == '[DONE]') {
                        return
                    }
                    yield JSON.parse(jsonString)
                }
            }
        }
    } else {
        // Raise exception
        throw new Error('Response is not an event-stream')
    }
}
// Another streaming function similar to streamSource, but slightly different
export async function* anotherStreamSource(
    response: Response
): AsyncGenerator<any> {
    // Check if the response is an event-stream
    if (
        response.headers.get('content-type') ==
        'text/event-stream; charset=utf-8'
    ) {
        // Create a reader to read the response body as a stream
        const reader = response.body!.getReader()
        // Create a decoder to decode the stream as UTF-8 text
        const decoder = new TextDecoder('utf-8')

        // Loop until the stream is done
        while (true) {
            const { value, done } = await reader.read()
            if (done) {
                break
            }

            const rawValue = decoder.decode(value)
            const lines = rawValue.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonString = line.slice(6)
                    if (jsonString == '[DONE]') {
                        return
                    }
                    // Slightly different: wrap the parsed JSON object in an additional object
                    yield { data: JSON.parse(jsonString) }
                }
            }
        }
    } else {
        // Raise exception
        throw new Error('Response is not an event-stream')
    }
}

export function getPlatformInfo(): {
    PLATFORM_DELIMITER: string
    PLATFORM_META_KEY: string
    PLATFORM_CM_KEY: string
    IS_WINDOWS: boolean
} {
    let PLATFORM_DELIMITER: string
    let PLATFORM_META_KEY: string
    let PLATFORM_CM_KEY: string
    let IS_WINDOWS: boolean

    if (process.platform === 'win32') {
        PLATFORM_DELIMITER = '\\'
        PLATFORM_META_KEY = 'Ctrl+'
        PLATFORM_CM_KEY = 'Ctrl'
        IS_WINDOWS = true
    } else if (process.platform === 'darwin') {
        PLATFORM_DELIMITER = '/'
        PLATFORM_META_KEY = '⌘'
        PLATFORM_CM_KEY = 'Cmd'
        IS_WINDOWS = false
    } else {
        PLATFORM_DELIMITER = '/'
        PLATFORM_META_KEY = 'Ctrl+'
        PLATFORM_CM_KEY = 'Ctrl'
        IS_WINDOWS = false
    }

    return {
        PLATFORM_DELIMITER,
        PLATFORM_META_KEY,
        PLATFORM_CM_KEY,
        IS_WINDOWS,
    }
}

export function join(a: string, b: string): string {
    if (a[a.length - 1] === connector.PLATFORM_DELIMITER) {
        return a + b
    }
    return a + connector.PLATFORM_DELIMITER + b
}

// make a join method that can handle ./ and ../
export function joinAdvanced(a: string, b: string): string {
    if (b.startsWith('./')) {
        return joinAdvanced(a, b.slice(2))
    }
    if (b.startsWith('../')) {
        // if a ends with slash
        if (a[a.length - 1] === connector.PLATFORM_DELIMITER) {
            a = a.slice(0, -1)
        }
        const aOneHigher = a.slice(
            0,
            a.lastIndexOf(connector.PLATFORM_DELIMITER)
        )
        return joinAdvanced(aOneHigher, b.slice(3))
    }
    return join(a, b)
}

export function removeBeginningAndEndingLineBreaks(str: string): string {
    str = str.trimEnd()
    while (str[0] === '\n') {
        str = str.slice(1)
    }
    while (str[str.length - 1] === '\n') {
        str = str.slice(0, -1)
    }
    return str
}
