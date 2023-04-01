// const path = require('path');
module.exports = {
    /**
     * This is the main entry point for your application, it's the first file
     * that runs in the main process.
     */
    entry: './src/main/main.ts',
    // Put your normal webpack config below here
    module: {
        rules: require('./webpack.rules'),
    },
    externals: 'node-pty',
    cache: {
        type: 'filesystem',
    },
    resolve: {
        extensions: ['.js', '.ts', '.jsx', '.tsx'],
    },
}
