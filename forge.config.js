module.exports = {
    packagerConfig: {
        name: 'Cursor',
        icon: 'assets/icon/icon',
        extraResource: [
            './lsp',
            './resources',
            './tutor',
            './todesktop-runtime-config.json',
        ],
        osxSign: {},
        protocols: [
            {
                name: 'Electron Fiddle',
                schemes: ['electron-fiddle'],
            },
        ],
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
        {
            name: '@electron-forge/maker-deb',
            config: {
                mimeType: ['x-scheme-handler/electron-fiddle'],
            },
        },
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-webpack',
            config: {
                mainConfig: './webpack.main.config.js',
                devContentSecurityPolicy:
                    "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: file: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';",
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
