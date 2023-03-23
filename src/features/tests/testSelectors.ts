import { createSelector } from 'reselect'
import { TestState } from './testSlice'

export const getTests = (filePath: string) =>
    createSelector(
        (state: { test: TestState }) => state.test,
        (testState) => {
            return [
                ...Object.values(testState.generatedTests.byIds).filter(
                    (test) =>
                        /* todo change the right */ test.fileName /* todo change the left */ ===
                        filePath
                ),
            ]
        }
    )

export const isTestModalVisible = (filePath?: string) =>
    createSelector(
        (state: { test: TestState }) => state.test,
        (testState) => {
            return (
                filePath != null &&
                testState.requestingTestDir.includes(filePath) &&
                !(filePath in testState.testFiles.map)
            )
        }
    )

export const selectHasTests = (filePath: string) =>
    createSelector(
        (state: { test: TestState }) => state.test,
        (testState) => {
            return filePath in testState.testFiles.map
        }
    )
