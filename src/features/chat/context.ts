import { API_ROOT } from '../../utils'
import { CodeSymbolType } from '../window/state'

export class ContextBuilder {
    // TODO - refactor this to actually use the LSP
    private previousSymbols: [string, CodeSymbolType, string, string][] | null =
        []
    private previousSymbolsFuture: Promise<{ query: string }> | null = null

    //constructor(private client: LanguageServerClient) {}
    constructor(private repoId: string) {
        setInterval(() => {
            this.previousSymbols = null
            this.previousSymbolsFuture = null
        }, 30000)
    }

    async getSymbols() {
        if (this.repoId == null) {
            return []
        }
        const resp = await fetch(
            API_ROOT + '/repos/private/all_symbols/' + this.repoId,
            {
                method: 'GET',
            }
        )

        const result = await resp.json()

        return result
    }

    async quickGetSymbols(timeout = 5) {
        if (this.previousSymbols) {
            return this.previousSymbols
        }

        if (this.previousSymbolsFuture) {
            await Promise.race([
                this.previousSymbolsFuture,
                new Promise((resolve, reject) =>
                    setTimeout(() => resolve(null), timeout)
                ),
            ])
        }

        if (this.previousSymbols) {
            return this.previousSymbols
        } else {
            return []
        }
    }

    async getCompletion(currentText: string, relevantDocs: string[]) {
        if (this.previousSymbolsFuture == null) {
            this.previousSymbolsFuture = this.getSymbols().then((result) => {
                this.previousSymbols = result
                return { query: currentText }
            })
        }

        const symbols = await this.quickGetSymbols(1000)
        const start = performance.now()
        const finalSymbols = [
            ...symbols
                .filter((symbol) =>
                    symbol[0].toLowerCase().includes(currentText.toLowerCase())
                )
                .map(([name, block_type, summary, fname]) => {
                    const startIndex = name
                        .toLowerCase()
                        .indexOf(currentText.toLowerCase())

                    const endIndex = startIndex + currentText.length
                    return {
                        type: block_type,
                        path: fname,
                        name,
                        summary,
                        startIndex,
                        endIndex,
                    }
                })
                .sort((a, b) => {
                    const startsA = a.name
                        .toLowerCase()
                        .startsWith(currentText.toLowerCase())
                    const startsB = b.name
                        .toLowerCase()
                        .startsWith(currentText.toLowerCase())

                    if (startsA && !startsB) {
                        return -1
                    } else if (!startsA && startsB) {
                        return 1
                    } else {
                        if (a.name.length < b.name.length) {
                            return -1
                        } else if (a.name.length > b.name.length) {
                            return 1
                        } else {
                            const type_orderings = [
                                'class',
                                'function',
                                'variable',
                                'import',
                            ]
                            const aOrder = type_orderings.indexOf(a.type)
                            const bOrder = type_orderings.indexOf(b.type)
                            return aOrder - bOrder
                        }
                    }
                }),
        ]

        // Return the finalSymbols array
        return finalSymbols.slice(0, 20)
    }
}
