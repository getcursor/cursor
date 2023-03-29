import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import * as ssel from '../features/settings/settingsSelectors'
import {
    changeSettings,
    toggleSettings,
} from '../features/settings/settingsSlice'
import {
    copilotChangeEnable,
    copilotChangeSignin,
    installLanguageServer,
    runLanguageServer,
    stopLanguageServer,
 getConnections } from '../features/lsp/languageServerSlice'
// REMOVED CODEBASE-WIDE FEATURES!
// import { initializeIndex } from '../features/globalSlice'

import Dropdown from 'react-dropdown'
import 'react-dropdown/style.css'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    copilotStatus,
    getLanguages,
    languageServerStatus,
} from '../features/lsp/languageServerSelector'

import {
    signInCursor,
    signOutCursor,
    upgradeCursor,
} from '../features/tools/toolSlice'
import { loginStatus } from '../features/tools/toolSelectors'

import { localeOptions, Languages } from '../i18n'

import Modal from 'react-modal'

export function SettingsPopup() {
    const { t, i18n } = useTranslation()
    const dispatch = useAppDispatch()
    const settings = useAppSelector(ssel.getSettings)
    const isSettingsOpen = useAppSelector(ssel.getSettingsIsOpen)
    const languageServerNames = useAppSelector(getLanguages)
    const synced: boolean = useAppSelector(
        (state) => state.global.repoProgress.state == 'done'
    )
    const embeddingOptions = useMemo(() => {
        if (synced) {
            return ['embeddings', 'copilot', 'none']
        } else {
            return ['copilot', 'none']
        }
    }, [synced])
    const [uploadPreference, setUploadPreference] = useState(false)
    useEffect(() => {
        // @ts-ignore
        connector.getUploadPreference().then((preference) => {
            setUploadPreference(preference)
        })
    }, [isSettingsOpen])

    const customStyles = {
        overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            zIndex: 10000,
        },
        content: {
            padding: 'none',
            bottom: 'none',
            background: 'none',
            border: 'none',
            marginLeft: 'auto',
            marginRight: 'auto',
            top: '130px',
            right: '40px',
            left: 'none',
            width: '500px',
        },
    }

    return (
        <>
            <Modal
                isOpen={isSettingsOpen}
                onRequestClose={() => {
                    dispatch(toggleSettings())
                }}
                style={customStyles}
            >
                <div className="settingsContainer">
                    <div className="settings">
                        <div
                            className="settings__dismiss"
                            onClick={() => {
                                dispatch(toggleSettings())
                            }}
                        >
                            <i className="fas fa-times"></i>
                        </div>
                        <div className="settings__title">{t('SETTINGS')}</div>
                        <div className="settings__content">
                            <div className="settings__item">
                                <div className="settings__item_title">
                                    {t('Key Bindings')}
                                </div>
                                <div className="settings__item_description">
                                    {t('Controls whether to use vim, emacs, or none')}
                                </div>
                                <Dropdown
                                    options={['none', 'vim', 'emacs']}
                                    onChange={(e) => {
                                        dispatch(
                                            changeSettings({
                                                keyBindings: e.value,
                                            })
                                        )
                                    }}
                                    value={settings.keyBindings}
                                />
                            </div>

                            <div className="settings__item">
                                <div className="settings__item_title">
                                    {t('Text Wrapping')}
                                </div>
                                <div className="settings__item_description">
                                    {t('Controls whether text wrapping is enabled')}
                                </div>
                                <Dropdown
                                    options={['2', '4', '8']}
                                    onChange={(e) => {
                                        dispatch(
                                            changeSettings({
                                                tabSize: e.value,
                                            })
                                        )
                                    }}
                                    value={settings.tabSize}
                                />
                            </div>

                            <div className="settings__item">
                                <div className="settings__item_title">
                                    {t('Tab Size')}
                                </div>
                                <div className="settings__item_description">
                                    {t('Controls the tab size')}
                                </div>
                                <Dropdown
                                    options={['enabled', 'disabled']}
                                    onChange={(e) => {
                                        dispatch(
                                            changeSettings({
                                                textWrapping: e.value,
                                            })
                                        )
                                    }}
                                    value={settings.textWrapping}
                                />
                            </div>                            

                            <div className="settings__item">
                                <div className="settings__item_title">                                    
                                    {t('Languages')}
                                </div>
                                <div className="settings__item_description">                                    
                                    {t('Switch language')}
                                </div>
                                <Dropdown
                                    options={Object.keys(localeOptions)}
                                    onChange={(e) => {
                                        const lang = e.value as Languages
                                        connector.changeLanguage(localeOptions[lang])
                                        i18n.changeLanguage(localeOptions[lang])
                                        dispatch(                                            
                                            changeSettings({
                                                language: lang,
                                            })
                                        )
                                    }}
                                    value={settings.language}
                                />
                            </div>

                            <CopilotPanel />
                            {/* REMOVED CODEBASE-WIDE FEATURES!
                            <RemoteCodebaseSettingsPanel />*/}
                            {languageServerNames.map((name) => (
                                <LanguageServerPanel
                                    key={name}
                                    languageName={name}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="cover-bar"></div>
                </div>
            </Modal>
        </>
    )
}

function CursorLogin() {
    const dispatch = useAppDispatch()

    const { signedIn, proVersion } = useAppSelector(loginStatus)

    const signIn = useCallback(() => {
        dispatch(signInCursor(null))
    }, [])
    const signOut = useCallback(() => {
        dispatch(signOutCursor(null))
    }, [])

    const upgrade = useCallback(() => {
        dispatch(upgradeCursor(null))
    }, [])

    let currentPanel
    if (!signedIn) {
        currentPanel = (
            <div className="copilot__signin">
                <button onClick={signIn}>Sign in</button>
                <button onClick={signIn}>Sign up</button>
            </div>
        )
    } else {
        if (proVersion) {
            currentPanel = (
                <div className="copilot__signin">
                    <button onClick={signOut}>Log out</button>
                </div>
            )
        } else {
            currentPanel = (
                <div className="copilot__signin">
                    <button onClick={upgrade}>Upgrade to Pro</button>
                    <button onClick={signOut}>Log out</button>
                </div>
            )
        }
    }

    return (
        <div className="settings__item">
            <div className="settings__item_title">Cursor Pro</div>
            <div className="settings__item_description">
                Optionally reserve capacity to avoid "maximum capacity" limits.
            </div>
            {currentPanel}
        </div>
    )
}

function CopilotPanel() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { signedIn, enabled } = useAppSelector(copilotStatus)
    const [localState, setLocalState] = useState<
        'signedIn' | 'signingIn' | 'signInFailed' | 'signedOut'
    >(signedIn ? 'signedIn' : 'signedOut')
    const [localData, setLocalData] = useState<{ url: string; code: string }>()
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        setLocalState(signedIn ? 'signedIn' : 'signedOut')
    }, [signedIn])

    const trySignIn = useCallback(async () => {
        const copilotClient = getConnections().copilot.client
        setLoading(true)
        const { verificationUri, status, userCode } =
            await copilotClient.signInInitiate({})

        if (status == 'OK' || status == 'AlreadySignedIn') {
            dispatch(copilotChangeSignin(true))
        } else {
            setLocalState('signingIn')
            setLocalData({ url: verificationUri, code: userCode })
        }
        setLoading(false)
    }, [setLocalState, setLocalData, dispatch])

    const tryFinishSignIn = useCallback(async () => {
        const copilotClient = getConnections().copilot.client
        const { status } = await copilotClient.signInConfirm({
            userCode: localData!.code,
        })

        if (status == 'OK' || status == 'AlreadySignedIn') {
            dispatch(copilotChangeSignin(true))
        } else {
            setLocalState
        }
    }, [localData, setLocalState, dispatch])

    const signOut = useCallback(async () => {
        const copilotClient = getConnections().copilot.client
        await copilotClient.signOut()
        dispatch(copilotChangeSignin(false))
    }, [])

    const enableCopilot = useCallback(() => {
        dispatch(copilotChangeEnable(true))
    }, [dispatch])

    const disableCopilot = useCallback(() => {
        dispatch(copilotChangeEnable(false))
    }, [dispatch])

    let currentPanel
    if (localState == 'signedOut') {
        currentPanel = (
            <div className="copilot__signin">
                <button onClick={trySignIn}>Sign in</button>
            </div>
        )
    } else if (localState == 'signingIn') {
        currentPanel = (
            <div className="copilot__signin">
                {t('Please click this link:')}&nbsp;&nbsp;
                <a href={localData?.url} target="_blank">
                    {localData?.url}
                </a>
                <br />
                {t('Enter this code:')} {localData?.code}
                <br />
                {t('Click here when done:')}
                <button onClick={tryFinishSignIn}>{t('Done')}</button>
            </div>
        )
    } else if (localState == 'signInFailed') {
        currentPanel = (
            <div className="copilot__signin">
                {t('Sign in failed. Please try again.')}
                {loading ? (
                    <p>{t('Loading...')}</p>
                ) : (
                    <button onClick={trySignIn}>{t('Sign in')}</button>
                )}
            </div>
        )
    } else {
        currentPanel = (
            <div className="copilot__signin">
                {t('Currently signed in')} <br />
                {enabled ? (
                    <button onClick={disableCopilot}>{t('Disable')}</button>
                ) : (
                    <button onClick={enableCopilot}>{t('Enable')}</button>
                )}
                <br />
                <button onClick={signOut}>{t('Sign out')}</button>
            </div>
        )
    }

    return (
        <div className="settings__item">
            <div className="settings__item_title">{t('Copilot')}</div>
            {currentPanel}
        </div>
    )
}
// REMOVED CODEBASE-WIDE FEATURES!
// function RemoteCodebaseSettingsPanel() {
//     const dispatch = useAppDispatch()
//     const repoId = useAppSelector((state) => state.global.repoId)
//     const rootDir = useAppSelector(getRootPath)
//     const progress = useAppSelector(getProgress)
//     const finished = useMemo(() => progress.state == 'done', [progress])

//     const startUpload = useCallback(async () => {
//         dispatch(initializeIndex(rootDir!))
//     }, [dispatch])

//     let container
//     if (repoId == null) {
//         container = (
//             <div className="remote_codebase__container">
//                 <button onClick={startUpload}>Start Index</button>
//             </div>
//         )
//     } else if (!finished) {
//         container = (
//             <div className="remote_codebase__container">
//                 <div className="remote_codebase__text">
//                     {(() => {
//                         switch (progress.state) {
//                             case 'notStarted':
//                                 return 'Not started'
//                             case 'uploading':
//                                 return 'Uploading...'
//                             case 'indexing':
//                                 return 'Indexing...'
//                             case 'done':
//                                 return 'Done!'
//                             case 'error':
//                                 return 'Failed!'
//                             case null:
//                                 return <br />
//                         }
//                     })()}
//                 </div>
//                 {progress.state != 'notStarted' && progress.state != null && (
//                     <>
//                         <div className="remote_codebase__progress">
//                             <div
//                                 className="remote_codebase__progress_bar"
//                                 style={{
//                                     width: `${progress.progress * 100}%`,
//                                     color: 'green',
//                                 }}
//                             />
//                         </div>
//                         <div className="remote_codebase__progress_text">
//                             {Math.floor(progress.progress * 100.0)}%
//                         </div>
//                     </>
//                 )}
//             </div>
//         )
//     } else {
//         container = (
//             <div className="remote_codebase__container">
//                 <div className="remote_codebase__progress_text">Done!</div>
//             </div>
//         )
//     }

//     return <div className="settings__item"></div>
// }

function LanguageServerPanel({ languageName }: { languageName: string }) {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const languageState = useAppSelector(languageServerStatus(languageName))

    const languageInstalled = useMemo(
        () => languageState && languageState.installed,
        [languageState]
    )
    const languageRunning = useMemo(
        () => languageState && languageState.running,
        [languageState]
    )

    const installServer = useCallback(async () => {
        await dispatch(installLanguageServer(languageName))
    }, [languageName])

    const runServer = useCallback(async () => {
        await dispatch(runLanguageServer(languageName))
    }, [languageName])
    const stopServer = useCallback(async () => {
        await dispatch(stopLanguageServer(languageName))
    }, [languageName])

    let container
    if (languageInstalled) {
        container = (
            <div className="language_server__container">
                <div className="language_server__status">
                    {languageRunning ? 'Running' : 'Stopped'}
                </div>
                <div className="copilot__signin">
                    {languageRunning ? (
                        <button onClick={stopServer}>{t('Stop')}</button>
                    ) : (
                        <button onClick={runServer}>{t('Run')}</button>
                    )}
                </div>
            </div>
        )
    } else {
        container = (
            <div className="copilot__signin">
                <button onClick={installServer}>{t('Install')}</button>
            </div>
        )
    }

    return (
        <div className="settings__item">
            <div className="settings__item_title">
                {languageName} {t('Language Server')}
            </div>
            {container}
        </div>
    )
}
