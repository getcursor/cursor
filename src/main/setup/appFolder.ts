import { dialog } from 'electron'
import { isAppInApplicationsFolder } from '../utils'
import mainWindow from '../window'

export default function setupApplicationsFolder() {
    if (!isAppInApplicationsFolder) {
        // show the user a dialog telling them to move the app to the Applications folder
        dialog.showMessageBoxSync(mainWindow.win!, {
            type: 'warning',
            title: 'Warning',
            message: 'Please move Cursor to the Applications folder',
            detail: 'The app will not work properly if it is not in the Applications folder',
        })
    }
}
