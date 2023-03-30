import * as ss from '../features/settings/settingsSlice'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import React, { useCallback, useEffect, useState } from 'react'
import { copilotStatus } from '../features/lsp/languageServerSelector'
import {
    copilotChangeEnable,
    copilotChangeSignin,
    getConnections,
} from '../features/lsp/languageServerSlice'
import { RadioGroup } from '@headlessui/react'
import {
    openTutorFolder,
    setIsNotFirstTimeWithSideEffect,
} from '../features/globalSlice'
import posthog from 'posthog-js'

function CopilotPanel() {
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
            <>
                <div className="copilot__signin welcome-button welcome-copilot-sign-in">
                    <button
                        onClick={() => {
                            trySignIn()
                            posthog.capture(
                                'Welcome Screen Copilot Connect Click'
                            )
                        }}
                    >
                        Connect
                    </button>
                </div>
            </>
        )
    } else if (localState == 'signingIn') {
        currentPanel = (
            <div className="copilot__signin copilot-steps-panel">
                <div className="copilot-steps-title">Instructions</div>
                <div className="copilot-step">
                    1. Please click this link:&nbsp;
                    <a href={localData?.url} target="_blank">
                        {localData?.url}
                    </a>
                </div>
                <div className="copilot-step">
                    2. Enter this code: {localData?.code}
                </div>
                <div className="copilot-step">
                    3. Click here when done: &nbsp;
                    <button onClick={tryFinishSignIn}>Done</button>
                </div>
            </div>
        )
    } else if (localState == 'signInFailed') {
        currentPanel = (
            <div className="copilot__signin">
                <div className="copilot-welcome-line">
                    Sign in failed. Please try again.
                </div>
                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <div className="welcome-button welcome-copilot-sign-in">
                        <button onClick={trySignIn}>Sign in</button>
                    </div>
                )}
            </div>
        )
    } else {
        posthog.capture('Welcome Screen Copilot Done')
        currentPanel = (
            <div className="copilot__signin copilot-welcome-done">
                Connected!
            </div>
        )
    }

    return <>{currentPanel}</>
}

export default function ButtonGroup({
    plans,
    onClick,
}: {
    plans: { name: string }[]
    onClick: any
}) {
    const [selected, setSelected] = useState(plans[0])
    const dispatch = useAppDispatch()

    useEffect(() => {
        onClick(selected)
    }, [selected])

    return (
        <div className="w-full">
            <div className="">
                <RadioGroup
                    value={selected}
                    onChange={(plan: { name: string; keybinding: string }) => {
                        setSelected(plan)
                    }}
                >
                    <RadioGroup.Label className="sr-only">
                        Server size
                    </RadioGroup.Label>
                    <div className="">
                        {plans.map((plan) => (
                            <div className="inline-block" key={plan.name}>
                                <RadioGroup.Option
                                    key={plan.name}
                                    value={plan}
                                    className={({ active, checked }) =>
                                        `
                                  ${checked ? 'checked-welcome-radio' : ''}
                                    relative flex welcome-radio cursor-pointer rounded-md px-3 py-3 welcome-radio-butotn mr-2 shadow-md outline-none`
                                    }
                                >
                                    {({ active, checked }) => (
                                        <>
                                            <div className="flex items-center justify-between w-32">
                                                <div className="flex items-center mr-2">
                                                    <div className="text-sm">
                                                        <RadioGroup.Label
                                                            as="p"
                                                            className={`font-medium`}
                                                        >
                                                            {plan.name}
                                                        </RadioGroup.Label>
                                                    </div>
                                                </div>
                                                {checked && (
                                                    <div className="shrink-0 text-white">
                                                        <CheckIcon className="h-6 w-6" />
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </RadioGroup.Option>
                            </div>
                        ))}
                    </div>
                </RadioGroup>
            </div>
        </div>
    )
}

function CheckIcon(
    props: JSX.IntrinsicAttributes & React.SVGProps<SVGSVGElement>
) {
    return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
            <circle cx={12} cy={12} r={12} fill="#fff" opacity="0.2" />
            <path
                d="M7 13l3 3 7-7"
                stroke="#fff"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

const keyOptions = [
    {
        name: 'Default',
        keybinding: 'none',
    },
    {
        name: 'Vim',
        keybinding: 'vim',
    },
    {
        name: 'Emacs',
        keybinding: 'emacs',
    },
]

export function WelcomeScreen() {
    const dispatch = useAppDispatch()
    const [selectedKeyBinding, setSelectedKeyBinding] = useState('default')
    const keyBindings = [
        { label: 'Default', value: 'default' },
        { label: 'Emacs', value: 'emacs' },
        { label: 'Vim', value: 'vim' },
    ]
    useEffect(() => {
        posthog.capture('Welcome Screen')
    }, [])
    return (
        <div className="welcome-screen-container">
            <div className="welcome-screen-inner">
                <h1 className="welcome-screen-title">Welcome</h1>
                <div className="key-bindings-section section">
                    <h2 className="key-bindings-title title">Key Bindings</h2>
                    <p className="key-bindings-subheading subheading">
                        Choose your preferred key binding style for the editor.
                    </p>
                    <ButtonGroup
                        plans={keyOptions}
                        onClick={(plan: any) => {
                            dispatch(
                                ss.changeSettings({
                                    keyBindings: plan.keybinding,
                                })
                            )
                        }}
                    />
                </div>
                <div className="copilot-setup-section section">
                    <h2 className="copilot-setup-title title">
                        Optional: Copilot
                    </h2>
                    <p className="key-bindings-subheading subheading">
                        Cursor comes with a built-in Github Copilot integration.
                    </p>
                    <CopilotPanel />
                </div>
                <div className="done-button-section">
                    <button
                        className="done-button welcome-button"
                        onClick={() => {
                            posthog.capture('Welcome Screen Continue')
                            dispatch(setIsNotFirstTimeWithSideEffect(null))
                            dispatch(openTutorFolder(null))
                        }}
                    >
                        Continue
                    </button>
                </div>
            </div>
        </div>
    )
}
