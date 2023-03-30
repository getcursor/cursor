import {
    docPathFacet,
    languageServer,
    semanticTokenField,
} from '../lsp/lspPlugin'
import { getLanguageFromFilename } from './utils'
import { getConnections, getIdentifier } from '../lsp/languageServerSlice'

export const languageBundle = (filePath: string) => {
    const languageId = getLanguageFromFilename(filePath)
    const lspIdentifier = getIdentifier(languageId)
    if (lspIdentifier == null) {
        return []
    }
    const connections = getConnections()
    const parserClient = connections[lspIdentifier]
    if (parserClient == null) {
        return []
    }

    const parserServer = languageServer({
        client: parserClient.client,
        allowHTMLContent: true,
    })
    return [docPathFacet.of(filePath), parserServer, semanticTokenField]
}
