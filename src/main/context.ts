import fetch from 'node-fetch'

export async function startServer(repoId: string) {
    await fetch('http://localhost:4000/jsonrpc', {
        method: 'POST',
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 0,
            method: 'initialize',
            params: [repoId],
        }),
    })

    // childProcess = cp.spawn('python', [ '-m', 'context.manager'], {
    //     cwd: '/Users/amansanger/portal'
    // });
    // if (childProcess.stdin) {
    //
    //     childProcess.stdin.write('hello\n');
    //
    // }
    // const connection = rpc.createServerPipeTransport
    // const connection = rpc.createMessageConnection(
    //     new rpc.StreamMessageReader(childProcess.stdout!),
    //     new rpc.StreamMessageWriter(childProcess.stdin!)
    // );
    // const sendRequest = async(
    //     method: string, params: any,
    //     ): Promise<any>  => {
    //     return await connection.sendRequest(method, params);
    //   }

    // const sendNotification = async(
    //     method: string, params: any,
    //   ): Promise<void> => {
    //     return await connection.sendNotification(method, params);
    //   }

    // childProcess.on('error', (err) => {
    //
    // });

    // if (childProcess.stderr) {
    //     childProcess.stderr.on('data', (data) => {
    //
    //     });
    // }

    // if (childProcess.stdout) {
    //     childProcess.stdout.on('data', (data) => {
    //
    //     });
    // }

    // connection.listen();

    // let response = await sendRequest('initialize', {repoId});
    //
}
