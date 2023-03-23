module.exports = {
    packagerConfig: {
        name: 'Cursor',
        icon: 'assets/icon/icon',
        extraResource: ['./lsp', './resources', './tutor'],
        osxSign: {},
        osxNotarize: {
            tool: 'notarytool',
            appleId: 'truell20@gmail.com',
            appleIdPassword: 'uoud-ynaw-ccco-skvn',
            teamId: 'VDXQ22DGB9',
        },
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {},
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin'],
        },
        {
            name: '@electron-forge/maker-deb',
            config: {
                options: {
                    icon: 'assets/icon/icon.png',
                },
            },
        },
    ],
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: {
                    owner: 'Cursor-AI',
                    name: 'portal',
                },
                prerelease: true,
            },
        },
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-webpack',
            config: {
                mainConfig: './webpack.main.config.js',
                devContentSecurityPolicy:
                    "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';",
                renderer: {
                    config: './webpack.renderer.config.js',
                    entryPoints: [
                        {
                            html: './src/index.html',
                            js: './src/index.ts',
                            name: 'main_window',
                            preload: {
                                js: './src/preload.ts',
                            },
                        },
                    ],
                },
            },
        },
    ],
}
