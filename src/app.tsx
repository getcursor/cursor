import * as ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './app/store'
import { App } from './appComponent'
import Modal from 'react-modal'

// Write a function to
Modal.setAppElement('#root')
const container = document.getElementById('root')!
// const container = document.getElementById("root");
const root = ReactDOM.createRoot(container)
root.render(
    <Provider store={store}>
        <App />
    </Provider>
)
