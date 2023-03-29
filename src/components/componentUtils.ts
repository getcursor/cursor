export function throttleCallback(fn: Function, limit = 300) {
    let inThrottle: boolean,
        lastFn: ReturnType<typeof setTimeout>,
        lastTime: number
    return function (this: any) {
        const context = this,
            args = arguments
        if (!inThrottle) {
            fn.apply(context, args)
            lastTime = Date.now()
            inThrottle = true
        } else {
            clearTimeout(lastFn)
            lastFn = setTimeout(() => {
                if (Date.now() - lastTime >= limit) {
                    fn.apply(context, args)
                    lastTime = Date.now()
                    inThrottle = false
                }
            }, Math.max(limit - (Date.now() - lastTime), 0))
        }
    }
}

export function normalThrottleCallback(fn: Function, limit = 300) {
    let inThrottle: boolean,
        lastFn: ReturnType<typeof setTimeout>,
        lastTime: number
    return function (...args: any[]) {
        if (!inThrottle) {
            fn(args)
            lastTime = Date.now()
            inThrottle = true
        } else {
            clearTimeout(lastFn)
            lastFn = setTimeout(() => {
                fn(args)
                lastTime = Date.now()
                inThrottle = false
            }, limit)
        }
    }
}
