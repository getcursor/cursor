import { useAppDispatch, useAppSelector } from '../app/hooks'
import { closeError } from '../features/globalSlice'
import { getError, getShowErrors } from '../features/selectors'
import { faClose } from '@fortawesome/pro-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Modal from 'react-modal'
import {
    NoAuthGlobalOldRateLimitError,
    NotLoggedInError,
    OpenAIError,
} from '../utils'
import { CursorLogin, OpenAILoginPanel } from './settingsPane'
import { signInCursor, upgradeCursor } from '../features/tools/toolSlice'

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
        maxWidth: '600px',
    },
}

const loginStyles = {
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
        maxWidth: '450px',
        overflow: 'none',
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
                        Something unexpected happened. Please try again later.
                        If this continues, please contact michael@cursor.so.
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
                style={loginStyles}
            >
                <div className="errorPopup">
                    <div className="errorPopup__title">
                        <div className="errorPopup__title_text"></div>
                        <div
                            className="errorPopup__title_close"
                            onClick={() => dispatch(closeError())}
                        >
                            <FontAwesomeIcon icon={faClose} />
                        </div>
                    </div>
                    <div className="signup__body">
                        <div className="signup__title">Cursor</div>
                        <div className="signup__module">
                            <div className="signup__subtitle">
                                To avoid abuse on our backend, we ask that you
                                login in to use the AI features
                            </div>
                            <div
                                className="signup__signup_button"
                                onClick={() => dispatch(signInCursor(null))}
                            >
                                Log in
                            </div>

                            <div
                                className="signup__signup_button"
                                onClick={() => dispatch(signInCursor(null))}
                            >
                                Sign up
                            </div>
                        </div>
                    </div>
                    <div className="signup__module signup__last_module">
                        <div className="signup__subtitle">
                            Or enter your OpenAI API key
                        </div>
                        <OpenAILoginPanel
                            onSubmit={() => {
                                dispatch(closeError())
                            }}
                        />
                    </div>
                </div>
            </Modal>
        )
    } else if (error instanceof NoAuthGlobalOldRateLimitError) {
        return (
            <Modal
                isOpen={true || showError}
                onRequestClose={() => {
                    dispatch(closeError())
                }}
                style={loginStyles}
            >
                <div className="errorPopup">
                    <div className="errorPopup__title">
                        <div className="errorPopup__title_text"></div>
                        <div
                            className="errorPopup__title_close"
                            onClick={() => dispatch(closeError())}
                        >
                            <FontAwesomeIcon icon={faClose} />
                        </div>
                    </div>
                    <div className="signup__body">
                        <div className="signup__title">
                            Free tier limit exceeded
                        </div>
                        <div className="signup__module">
                            <div className="signup__subtitle">
                                If you've enjoyed using Cursor, please consider
                                subscribing to one of our paid plans
                            </div>
                            <div
                                className="signup__signup_button"
                                onClick={() => dispatch(upgradeCursor(null))}
                            >
                                Upgrade
                            </div>
                        </div>
                    </div>
                    <div className="signup__module signup__last_module">
                        <div className="signup__subtitle">
                            Or enter your OpenAI API key to continue using the
                            AI features at-cost
                        </div>
                        <OpenAILoginPanel
                            onSubmit={() => {
                                dispatch(closeError())
                            }}
                        />
                    </div>
                </div>
            </Modal>
        )
    } else {
        return (
            <Modal
                isOpen={true || showError}
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
