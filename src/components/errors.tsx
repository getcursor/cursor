import { useAppDispatch, useAppSelector } from '../app/hooks';
import {closeError} from '../features/globalSlice'
import {getShowErrors, getError} from '../features/selectors';
import { faClose } from '@fortawesome/pro-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Modal from 'react-modal'
import { NoAuthRateLimitError, NotLoggedInError, OpenAIError } from '../utils';
import { CursorLogin, OpenAIPanel } from './settingsPane';

const customStyles = {
    overlay: {
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        zIndex: 10000,
    },
    content: {
        padding: 'none',
        top: '150px',
        bottom: 'none',
        background: 'none',
        border: 'none',
        width: 'auto',
        height: 'auto',
        marginLeft: 'auto',
        marginRight: 'auto',
        maxWidth: '700px',
    },
}

export function ErrorPopup() {
    const showError = useAppSelector(getShowErrors)
    const error = useAppSelector(getError)
    const dispatch = useAppDispatch()

    if (error == null) {
        return (
            <Modal
                isOpen={showError}
                onRequestClose={() => {
                    dispatch(closeError())
                }}
                style={customStyles}
            >
                <div className="errorPopup">
                    <div className="errorPopup__title">
                        <div className="errorPopup__title_text">
                            We ran into a problem
                        </div>
                        <div
                            className="errorPopup__title_close"
                            onClick={() => dispatch(closeError())}
                        >
                            <FontAwesomeIcon icon={faClose} />
                        </div>
                    </div>
                    <div className="errorPopup__body">
                        Something unexpected happened. Please try again later. If
                        this continues, please contact michael@cursor.so.
                        <br />
                    </div>
                </div>
            </Modal>
        )
    } else if (error instanceof NotLoggedInError) {
        return (
            <Modal
                isOpen={showError}
                onRequestClose={() => {
                    dispatch(closeError())
                }}
                style={customStyles}
            >
                <div className="errorPopup">
                    <div className="errorPopup__title">
                        <div className="errorPopup__title_text">
                            {error.title}
                        </div>
                        <div
                            className="errorPopup__title_close"
                            onClick={() => dispatch(closeError())}
                        >
                            <FontAwesomeIcon icon={faClose} />
                        </div>
                    </div>
                    <div className="errorPopup__body">
                        {error.message}
                        <br />
                        Try logging in here:
                        <CursorLogin showSettings={false}/>
                        <br/>
                        Or try using an OpenAI key:
                        <OpenAIPanel />
                    </div>
                </div>
            </Modal>
        )
    } else {
        return (
            <Modal
                isOpen={showError}
                onRequestClose={() => {
                    dispatch(closeError())
                }}
                style={customStyles}
            >
                <div className="errorPopup">
                    <div className="errorPopup__title">
                        <div className="errorPopup__title_text">
                            {error.title}
                        </div>
                        <div
                            className="errorPopup__title_close"
                            onClick={() => dispatch(closeError())}
                        >
                            <FontAwesomeIcon icon={faClose} />
                        </div>
                    </div>
                    <div className="errorPopup__body">
                        {error.message}
                        <br />
                    </div>
                </div>
            </Modal>
        )
    }
        
        
}