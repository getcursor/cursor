import type { JestConfigWithTsJest } from 'ts-jest'

const jestConfig: JestConfigWithTsJest = {
    preset: 'ts-jest/presets/js-with-ts-esm', // or other ESM presets
    testEnvironment: 'jsdom',
    moduleNameMapper: {
        // CSS mapped to style mock
        '\\.(css|less)$': '<rootDir>/__mocks__/fileMock.js',
        // All other files mapped to file mock
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
            '<rootDir>/__mocks__/fileMock.js',
    },
    //resolver: 'jest-resolve',
    //resolver: 'jest-node-exports-resolver',
    //extensionsToTreatAsEsm: ['.ts', '.tsx'],
    // transformIgnorePatterns: [
    // 'node_modules/(?!(vscode-uri)/)'
    // ],
    transform: {
        // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
        // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
}

export default jestConfig
