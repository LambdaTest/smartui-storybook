const lambdaTunnel = require('@lambdatest/node-tunnel');

const START_TIMEOUT_MS = 120000;

let activeHandle = null;
let cleanupHandlersRegistered = false;

function generateTunnelName() {
    const randomNumber = Math.floor(1000000 + Math.random() * 9000000);
    return `smartui-storybook-tunnel-${randomNumber}`;
}

// Arguments handed to @lambdatest/node-tunnel. `environment` maps to the binary's `--env`.
function buildTunnelArguments({ user, key, env, tunnelName }) {
    const args = { user, key, tunnelName };
    if (env === 'stage') {
        args.environment = 'stage';
    }
    return args;
}

function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise(function (resolve, reject) {
        timer = setTimeout(function () { reject(new Error(message)); }, ms);
    });
    return Promise.race([promise, timeout]).finally(function () { clearTimeout(timer); });
}

function errorMessage(error) {
    if (!error) return 'unknown error';
    if (typeof error === 'string') return error;
    return error.message || JSON.stringify(error);
}

function killTunnelProcessSync(handle) {
    try {
        if (handle && handle.instance && handle.instance.proc) {
            handle.instance.proc.kill();
        }
    } catch (error) {
        // best effort only; nothing else to do while the process is exiting
    }
}

function registerCleanupHandlers() {
    if (cleanupHandlersRegistered) return;
    cleanupHandlersRegistered = true;

    const onSignal = function (signal, exitCode) {
        return async function () {
            const handle = activeHandle;
            if (handle) {
                console.log(`\n[smartui] Received ${signal}, stopping tunnel...`);
                await stopTunnel(handle);
            }
            process.exit(exitCode);
        };
    };
    process.once('SIGINT', onSignal('SIGINT', 130));
    process.once('SIGTERM', onSignal('SIGTERM', 143));
    // `exit` only allows synchronous work: make sure the binary never outlives the CLI.
    process.on('exit', function () {
        if (activeHandle) killTunnelProcessSync(activeHandle);
    });
}

async function startTunnel({ user, key, env }) {
    const tunnelName = generateTunnelName();
    const instance = new lambdaTunnel();
    console.log(`[smartui] Starting LambdaTest tunnel ${tunnelName}...`);
    try {
        await withTimeout(
            instance.start(buildTunnelArguments({ user, key, env, tunnelName })),
            START_TIMEOUT_MS,
            `timed out after ${START_TIMEOUT_MS / 1000}s`
        );
    } catch (error) {
        killTunnelProcessSync({ instance });
        throw new Error(`LambdaTest tunnel did not start (${errorMessage(error)}). Check --userName/--accessKey (or LT_USERNAME/LT_ACCESS_KEY) and network access to *.lambdatest.com.`);
    }
    if (!instance.isRunning()) {
        throw new Error('LambdaTest tunnel did not start. Check --userName/--accessKey (or LT_USERNAME/LT_ACCESS_KEY) and network access to *.lambdatest.com.');
    }

    const handle = { tunnelName, instance };
    activeHandle = handle;
    registerCleanupHandlers();
    console.log('[smartui] Tunnel started');
    return handle;
}

async function stopTunnel(handle) {
    if (!handle || !handle.instance) return;
    if (activeHandle === handle) activeHandle = null;
    try {
        await handle.instance.stop();
        console.log('[smartui] Tunnel stopped');
    } catch (error) {
        console.log(`[smartui] Warning: could not stop tunnel ${handle.tunnelName} cleanly. Error: ${errorMessage(error)}`);
        killTunnelProcessSync(handle);
    }
}

module.exports = { generateTunnelName, buildTunnelArguments, startTunnel, stopTunnel };
