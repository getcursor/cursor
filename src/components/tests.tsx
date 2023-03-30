import React, { useEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { getAllPaths, getCurrentFilePath } from '../features/selectors'
import { isTestModalVisible } from '../features/tests/testSelectors'
import { closeTestFileName, newTestFile } from '../features/tests/testSlice'

export function TestModal() {
    const dispatch = useAppDispatch()
    const filePath = useAppSelector(getCurrentFilePath)
    const allPaths = useAppSelector(getAllPaths)
    const rootPath = useAppSelector((state) => state.global.rootPath)
    // const testFiles = useAppSelector(state => state.test.testFiles);
    // const requestingTestDir = useAppSelector(state => state.test.requestingTestDir);
    const isVisible = useAppSelector(isTestModalVisible(filePath!))

    //
    //   testFiles,
    //   requestingTestDir,
    //   filePath,
    //   isVisible,
    // })

    const combinedPaths = [
        ...allPaths.filePaths.map((path) => path.replace(rootPath, '.')),
        ...allPaths.folderPaths.map((path) => path.replace(rootPath, '.')),
    ]

    const [testFileName, setTestFileName] = useState<string>('')

    const handleCloseModal = () => {
        dispatch(closeTestFileName({ fileName: filePath! }))
    }

    // const debouncedSetTestFileName = debounce(setTestFileName, 50);

    return (
        <>
            {' '}
            {isVisible && (
                <div className="modal fixed top-0 left-0 w-full h-full bg-gray-900 bg-opacity-50 flex justify-center items-center">
                    <div className="modal-content bg-gray-200 p-6 rounded-lg flex">
                        <div className="flex-1">
                            <p className="text-xl font-semibold">
                                Enter Testing File
                            </p>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()

                                    // Convert testFileName from relative path to absolute path
                                    const absoluteTestFileName =
                                        testFileName.startsWith('./')
                                            ? `${rootPath}${testFileName.slice(
                                                  1
                                              )}`
                                            : testFileName

                                    filePath &&
                                        dispatch(
                                            newTestFile({
                                                fileName: filePath,
                                                testFileName:
                                                    absoluteTestFileName,
                                            })
                                        )
                                    handleCloseModal()
                                }}
                            >
                                <label className="block mt-4">
                                    <span className="text-gray-700">
                                        Testing Directory:
                                    </span>
                                    <CustomDropdown
                                        options={combinedPaths}
                                        value={testFileName || ''}
                                        // onChange={debouncedSetTestFileName}
                                        onChange={setTestFileName}
                                    />
                                </label>
                                <button type="submit">Submit</button>
                            </form>
                        </div>
                        <div className="flex-none">
                            <span
                                className="close cursor-pointer"
                                onClick={handleCloseModal}
                            >
                                <button className="bg-transparent border-0">
                                    <i className="fas fa-times"></i>
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

const CustomDropdown = ({
    options,
    value,
    onChange,
}: {
    options: string[]
    value: string
    onChange: (value: React.SetStateAction<string>) => void
}) => {
    const [showOptions, setShowOptions] = useState(false)
    const [activeOptionIndex, setActiveOptionIndex] = useState(0)

    const handleInputChange = (e: { target: { value: string } }) => {
        onChange(e.target.value)
        setShowOptions(true)
        setActiveOptionIndex(0)
    }

    const handleOptionClick = (option: string) => {
        onChange(option)
        setShowOptions(false)
    }

    const filteredOptions = useMemo(() => {
        let origOptions = options.filter(
            (opt) => value && opt?.toLowerCase().includes(value.toLowerCase())
        )
        // Order higher if it includes test in the name
        origOptions.sort((a, b) => {
            if (
                a.toLowerCase().includes('test') &&
                !b.toLowerCase().includes('test')
            ) {
                return -1
            } else if (
                !a.toLowerCase().includes('test') &&
                b.toLowerCase().includes('test')
            ) {
                return 1
            } else {
                return 0
            }
        })

        origOptions = origOptions.slice(0, 20)

        if (value && !origOptions.includes(value)) {
            origOptions.push(value)
        }
        return origOptions
    }, [options, value])

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            setActiveOptionIndex(
                Math.min(activeOptionIndex + 1, filteredOptions.length - 1)
            )
            const optionElement = document.querySelector(
                `#option-${activeOptionIndex + 1}`
            )
            optionElement?.scrollIntoView({ block: 'nearest' })
        } else if (e.key === 'ArrowUp') {
            setActiveOptionIndex(Math.max(activeOptionIndex - 1, 0))
            const optionElement = document.querySelector(
                `#option-${activeOptionIndex - 1}`
            )
            optionElement?.scrollIntoView({ block: 'nearest' })
        } else if (e.key === 'Enter') {
            handleOptionClick(filteredOptions[activeOptionIndex])
        }
    }

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [activeOptionIndex, filteredOptions])

    return (
        <div className="relative">
            <input
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                type="text"
                value={value}
                onChange={handleInputChange}
            />
            {showOptions && value && (
                <ul className="absolute bg-white border border-gray-300 rounded-md overflow-y-scroll max-h-48">
                    {filteredOptions.map((option, index) => (
                        <li
                            id={`option-${index}`}
                            key={option}
                            className={`px-4 py-2 cursor-pointer hover:bg-gray-200 ${
                                index === activeOptionIndex ? 'bg-gray-200' : ''
                            }`}
                            onClick={() => handleOptionClick(option)}
                        >
                            <span
                                dangerouslySetInnerHTML={{
                                    __html: option.replace(
                                        new RegExp(`(${value})`, 'gi'),
                                        '<span class="bg-yellow-300">$1</span>'
                                    ),
                                }}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default TestModal
