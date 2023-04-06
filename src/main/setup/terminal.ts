import mainWindow from '../window'
import { store } from '../storeHandler'
import { setupTerminal as setup } from '../terminal'

export default function setupTerminal() {
    const projectPathObj = store.get('projectPath')
    if (
        typeof projectPathObj === 'object' &&
        projectPathObj !== null &&
        'defaultFolder' in projectPathObj
    ) {
        const projectPath = projectPathObj.defaultFolder
        if (typeof projectPath === 'string') {
            setup(mainWindow.win, projectPath)
        } else {
            setup(mainWindow.win)
        }
    } else {
        setup(mainWindow.win)
    }
}
