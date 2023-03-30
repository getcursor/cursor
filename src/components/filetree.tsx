import React, { useEffect } from 'react'

import { useAppDispatch, useAppSelector } from '../app/hooks'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faChevronDown,
    faChevronRight,
    faCode,
    faCodeMerge,
    faEyeSlash,
    faFile,
    faGear,
    faImage,
    faInfoCircle,
} from '@fortawesome/sharp-solid-svg-icons'
import * as gs from '../features/globalSlice'

import {
    getDepth,
    getFile,
    getFolder,
    getFolderOpen,
    getNotDeletedFiles,
} from '../features/selectors'
import {
    faFileCirclePlus,
    faFolderPlus,
} from '@fortawesome/pro-regular-svg-icons'
import posthog from 'posthog-js'

function offset(depth: number) {
    return `${depth * 1 + 1}rem`
}

// Thank you GPT-3
const CODE_EXTENSIONS = [
    'py',
    'js',
    'css',
    'rb',
    'java',
    'php',
    'c',
    'cpp',
    'go',
    'swift',
    'sql',
    'scss',
    'ts',
    'sh',
    'bat',
    'pl',
    'vb',
    'clj',
    'kt',
    'rs',
    'fs',
    'coffee',
    'lua',
    'typescript',
    'jsx',
    'tsx',
]

const MARKUP_EXTENSIONS = ['html', 'htm', 'xml', 'xhtml']

const INFO_EXTENSIONS = ['md', 'markdown', 'rst']

const CONFIG_EXTENSIONS = [
    'json',
    'yml',
    'conf',
    'cfg',
    'ini',
    'xml',
    'properties',
    'hocon',
    'env',
    'toml',
    'inf',
    'plist',
    'yaml',
    'ini',
    'reg',
    'vbs',
    'config.js',
    'config.ts',
    'rules.js',
    'rules.ts',
]

const IMAGE_EXTENSIONS = [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'bmp',
    'svg',
    'webp',
    'tiff',
    'psd',
    'eps',
    'ai',
    'raw',
    'cr2',
    'nef',
    'orf',
]

const BINARY_EXTENSIONS = [
    'zip',
    'exe',
    'bin',
    'img',
    'iso',
    'dmg',
    'deb',
    'rar',
    '7z',
    'tar',
    'gz',
    'bz2',
    'xz',
    'lz',
    'lzma',
    'arj',
    'cab',
    'z',
    'lzh',
    'ace',
]

export function getIconElement(fname: string) {
    const isMatch = (exts: string[]) => {
        return exts.some((ext) => fname.endsWith('.' + ext))
    }
    let iconTextValue = null

    let iconClassValue = null
    let iconElement = null
    if (isMatch(['js'])) {
        iconTextValue = 'js'
        iconClassValue = 'js'
    } else if (isMatch(['py'])) {
        iconTextValue = 'py'
        iconClassValue = 'py'
    } else if (isMatch(['ts'])) {
        iconTextValue = 'ts'
        iconClassValue = 'ts'
    } else if (isMatch(['tsx'])) {
        iconTextValue = 'tx'
        iconClassValue = 'tsx'
    } else if (isMatch(['jsx'])) {
        iconTextValue = 'jx'
        iconClassValue = 'jsx'
    } else if (isMatch(['css'])) {
        iconTextValue = ' #'
        iconClassValue = 'css'
    } else if (isMatch(['html'])) {
        iconTextValue = '<>'
        iconClassValue = 'html'
    } else if (isMatch(['json'])) {
        iconTextValue = '{}'
        iconClassValue = 'json'
    } else if (isMatch(['sh'])) {
        iconTextValue = ' $'
        iconClassValue = 'sh'
    }

    if (iconTextValue != null) {
        iconElement = (
            <div className={`file__icon_text file__icon_${iconClassValue}`}>
                {iconTextValue.toUpperCase()}
            </div>
        )
    }

    if (iconElement == null) {
        let icon = faFile

        if (isMatch(CONFIG_EXTENSIONS)) {
            icon = faGear
        } else if (isMatch(CODE_EXTENSIONS)) {
            icon = faCodeMerge
        } else if (isMatch(IMAGE_EXTENSIONS)) {
            icon = faImage
        } else if (isMatch(BINARY_EXTENSIONS)) {
            icon = faEyeSlash
        } else if (isMatch(MARKUP_EXTENSIONS)) {
            icon = faCode
        } else if (isMatch(INFO_EXTENSIONS)) {
            icon = faInfoCircle
        }
        iconElement = <FontAwesomeIcon icon={icon} />
    }

    return iconElement
}

function File({ fid }: { fid: number }) {
    const dispatch = useAppDispatch()
    const file = useAppSelector(getFile(fid))
    const depth = useAppSelector(getDepth(fid, true))

    const iconElement = getIconElement(file.name)

    //const ext = file.name.split('.').pop()!;
    return (
        <div
            className={`file__line ${
                file.isSelected ? 'file__line_selected' : ''
            }`}
            style={{ paddingLeft: offset(depth) }}
            onClick={() => {
                posthog.capture('Selected File From File Tree', {})
                dispatch(gs.selectFile(fid))
            }}
            onContextMenu={() => dispatch(gs.rightClickFile(fid))}
        >
            <div className="file__icon">{iconElement}</div>
            {file.renameName != null ? (
                <input
                    autoFocus
                    className="file__nameinput"
                    value={file.renameName}
                    onChange={(e) =>
                        dispatch(
                            gs.updateRenameName({
                                fid,
                                new_name: e.target.value,
                            })
                        )
                    }
                    onKeyDown={(e) => {
                        if (e.key == 'Enter') dispatch(gs.commitRename({ fid }))
                    }}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <div className="file__name truncate">{file.name}</div>
            )}
        </div>
    )
}

function Folder({ fid }: { fid: number }) {
    const isOpen = useAppSelector(getFolderOpen(fid))
    const dispatch = useAppDispatch()
    const toggleOpen = () => {
        dispatch(gs.loadFolder({ folderId: fid, goDeep: false }))
        dispatch(gs.setFolderOpen({ folderId: fid, isOpen: !isOpen }))
    }
    const folder = useAppSelector(getFolder(fid))
    const fileChildren = useAppSelector(getNotDeletedFiles(fid))

    const folderDepth = useAppSelector(getDepth(fid))

    useEffect(() => {
        if (folderDepth == 0) {
            dispatch(gs.setFolderOpen({ folderId: fid, isOpen: true }))
        }
    }, [])

    const isTopLevel = true //fid == 1;
    const hoverButtonsField = !isTopLevel ? (
        <></>
    ) : (
        <div className="folder__hoverbuttons">
            <div
                className="folder__hoverbutton"
                onClick={(e) => {
                    e.stopPropagation()
                    dispatch(gs.newFile({ parentFolderId: fid }))
                }}
            >
                <FontAwesomeIcon icon={faFileCirclePlus} />
            </div>
            <div
                className="folder__hoverbutton"
                onClick={(e) => {
                    e.stopPropagation()
                    dispatch(gs.newFolder({ parentFolderId: fid }))
                }}
            >
                <FontAwesomeIcon icon={faFolderPlus} />
            </div>
        </div>
    )

    return (
        <div className="folder">
            <div
                className="folder__line"
                style={{ paddingLeft: offset(folderDepth) }}
                onClick={toggleOpen}
                onContextMenu={() => {
                    dispatch(gs.setFolderOpen({ folderId: fid, isOpen: true }))
                    dispatch(gs.rightClickFolder(fid))
                }}
            >
                <div className="folder__icon">
                    {isOpen ? (
                        <FontAwesomeIcon icon={faChevronDown} />
                    ) : (
                        <FontAwesomeIcon icon={faChevronRight} />
                    )}
                </div>

                {folder.renameName != null ? (
                    <input
                        autoFocus
                        className="folder__nameinput"
                        value={folder.renameName}
                        onChange={(e) =>
                            dispatch(
                                gs.updateRenameName({
                                    fid,
                                    new_name: e.target.value,
                                    isFolder: true,
                                })
                            )
                        }
                        onKeyDown={(e) => {
                            if (e.key == 'Enter')
                                dispatch(
                                    gs.commitRename({ fid, isFolder: true })
                                )
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <>
                        <div className="folder__name truncate">
                            {folder.name}
                        </div>
                        {hoverButtonsField}
                    </>
                )}
            </div>
            {isOpen && (
                <div className="folder__below">
                    {folder.folderIds?.map((fid: number) => {
                        return <Folder key={`folder-${fid}`} fid={fid} />
                    })}
                    {fileChildren.map((fid: number) => {
                        return <File key={`file-${fid}`} fid={fid} />
                    })}
                </div>
            )}
        </div>
    )
}

export function FileTree() {
    const rootFolderId = 1
    return (
        // Check size of folders
        <div className="window__leftpane colortheme">
            <Folder fid={rootFolderId} />
        </div>
    )
}
