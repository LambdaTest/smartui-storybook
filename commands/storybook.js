const { httpClient } = require('./utils/httpClient')
const fs = require('fs')
const { validateStorybookUrl, validateStorybookDir, normalizeStorybookUrl, resolveTunnelCredentials, isStorybookUrl } = require('./utils/validate')
const { defaultSmartUIConfig } = require('./utils/config')
const { getLastCommit } = require('./utils/git')
const staticBuild = require('./utils/static')
const { startTunnel, stopTunnel } = require('./utils/tunnel')
var { constants } = require('./utils/constants');
const { shortPolling } = require('./utils/polling');

const TUNNEL_RENDER_ATTEMPTS = 3;
const TUNNEL_RENDER_RETRY_DELAY_MS = 5000;

async function storybook(serve, options) {
    let type = isStorybookUrl(serve) ? 'url' : 'dir';
    let storybookConfig = options.config ? options.config : defaultSmartUIConfig.storybook;
    const buildName = options.buildName? options.buildName : "";

    if (type === 'url') {
        await renderUrl(serve, storybookConfig, options, buildName);
    } else {
        let dirPath = serve;
        await validateStorybookDir(dirPath);
        await renderStatic(dirPath, storybookConfig, options, buildName);
    }
};

// Hosted / local Storybook URL: the stories are rendered straight from the URL through a
// LambdaTest tunnel that this process starts, so nothing is zipped or uploaded.
async function renderUrl(serve, storybookConfig, options, buildName) {
    let baseURL;
    try {
        baseURL = normalizeStorybookUrl(serve);
    } catch (error) {
        console.log('[smartui] Error: ', error.message);
        process.exitCode = constants.ERROR_CATCHALL;
        return;
    }
    await validateStorybookUrl(baseURL);

    if (options.tunnel && Object.keys(options.tunnel).length > 0) {
        console.log('[smartui] Warning: the tunnel block in the config file is ignored for a Storybook URL; the CLI starts its own tunnel.');
    }
    const credentials = options.ltCredentials || resolveTunnelCredentials(options);

    const { storyIds, screenshotNames } = await staticBuild.fetchStoriesFromUrl(baseURL, storybookConfig);
    const git = await resolveGitInfo();

    let tunnel;
    try {
        tunnel = await startTunnel({ user: credentials.user, key: credentials.key, env: options.env });
    } catch (error) {
        console.log('[smartui] Error: ', error.message);
        process.exitCode = constants.ERROR_CATCHALL;
        return;
    }

    try {
        const payload = buildRenderPayload({
            storybookConfig,
            storyIds,
            screenshotNames,
            source: { downloadURL: '', uploadId: '' },
            git,
            buildName,
            tunnel: {
                type: 'auto',
                tunnelName: tunnel.tunnelName,
                // The LambdaTest account that owns the tunnel is not necessarily the account
                // that owns the project token, so the renderer needs these to look the tunnel
                // up at the tunnel service. They travel only in this request body.
                user: credentials.user,
                key: credentials.key,
                baseURL: toRenderBaseURL(baseURL)
            },
            maxStories: storybookConfig.chunkSize || 100
        });
        // The tunnel is the data path of the build, so keep it open until the build is over:
        // wait far longer than for a static build and report loudly if we still give up.
        await requestRender(payload, options, { stopOnError: true, maxWaitMs: constants.URL_MODE_MAX_WAIT_MS });
    } finally {
        await stopTunnel(tunnel);
    }
}

// Static build directory: zip and upload the build, then ask for a render.
async function renderStatic(dirPath, storybookConfig, options, buildName) {
    // Get storyIds to be rendered 
    let storyIds = staticBuild.filterStories(dirPath, storybookConfig)
    let maxStories = storybookConfig.chunkSize || 100;

    // Upload Storybook static
    await staticBuild.getSignedUrl(options)
        .then(async function (response) {
            let { url, uploadId } = response.data.data;

            // Compress static build
            await staticBuild.compress(dirPath, uploadId)
                .then(function () {
                    console.log(`[smartui] ${dirPath} compressed.`)
                })
                .catch(function (err) {
                    console.log(`[smartui] Cannot compress ${dirPath}. Error: ${err.message}`);
                    process.exit(constants.ERROR_CATCHALL);
                });

            // Upload to S3
            const zipData = fs.readFileSync('storybook-static.zip');
            console.log('[smartui] Upload in progress...')
            await httpClient.put(url, zipData, {
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Length': zipData.length
                }})
                .then(function (response) {
                    console.log(`[smartui] ${dirPath} uploaded.`);
                    fs.rmSync('storybook-static.zip');
                })
                .catch(function (error) {
                    console.log(`[smartui] Cannot upload ${dirPath}. Error: ${error.message}`);
                    fs.rmSync('storybook-static.zip');
                    process.exit(constants.ERROR_CATCHALL);
                });

            const git = await resolveGitInfo();
            const payload = buildRenderPayload({
                storybookConfig,
                storyIds,
                source: { downloadURL: toDownloadKey(url), uploadId: uploadId },
                git,
                buildName,
                tunnel: options.tunnel || {},
                maxStories
            });

            await requestRender(payload, options);
        })
        .catch(function (error) {
            if (error.response) {
                console.log('[smartui] Error: ', error.response.data.error?.message);
            } else {
                console.log('[smartui] Error: ', error.message);
            }
            process.exitCode = constants.ERROR_CATCHALL;
        });
};

// Storybook origin as the renderer expects it: a directory URL with a trailing slash, so
// that the renderer's `new URL('iframe.html', baseURL)` keeps a sub-path like `/storybook/`.
function toRenderBaseURL(baseURL) {
    return baseURL.endsWith('/') ? baseURL : baseURL + '/';
}

// The S3 object key of the uploaded zip, sliced out of the presigned upload URL.
function toDownloadKey(url) {
    return url.substring(url.search(/.com/)+5, url.search(/.zip/)+4);
}

async function resolveGitInfo() {
    let commit = await getLastCommit();
    let baseLine = process.env.BASELINE_BRANCH;
    let currentBranch = process.env.CURRENT_BRANCH;
    if (baseLine !== null && baseLine !== undefined){
        if(baseLine === ''){
            const error = {
                "error": "MISSING_BRANCH_NAME",
                "message": "Error : The baseline branch name environment variable cannot be empty."
            };
            console.log(JSON.stringify(error, null, 2));
            process.exit(1);
        }
    }
        
    if(currentBranch !== null && currentBranch !==undefined){
        if(currentBranch === ''){
            const error = {
                "error": "MISSING_BRANCH_NAME",
                "message": "Error : The current branch name environment variable cannot be empty."
            };
            console.log(JSON.stringify(error, null, 2));
            process.exit(1);
        }
    }
    return {
        branch: currentBranch || commit.branch|| '',  
        baselineBranch: baseLine || '',
        commitId: commit.shortHash, 
        commitAuthor: commit.author.name, 
        commitMessage: commit.subject, 
        githubURL: process.env.GITHUB_URL || '',
    };
}

// Body of the /storybook/staticrender request. `screenshotNames` is only included when
// given (URL mode), so a static build produces exactly the payload it always has.
function buildRenderPayload({ storybookConfig, storyIds, screenshotNames, source, git, buildName, tunnel, maxStories }) {
    let lazyLoadedStories = [];
    if (Array.isArray(storybookConfig.lazyLoadedStories) && storybookConfig.lazyLoadedStories.length > 0) {
        lazyLoadedStories = storybookConfig.lazyLoadedStories;
    }
    let useGlobals = false;
    let backgroundTheme = storybookConfig.backgroundTheme || 'light';
    if (storybookConfig.backgroundTheme && ['light', 'dark'].includes(storybookConfig.backgroundTheme.toLowerCase())) {
        useGlobals = true;
        backgroundTheme = storybookConfig.backgroundTheme.toLowerCase();
    }

    if (storybookConfig.useGlobals === true || storybookConfig.backgroundTheme == undefined) {
        useGlobals = true;
        backgroundTheme = 'light';
    }

    let browsers = []
    let resolutions = []

    storybookConfig.browsers.forEach(element => {
        browsers.push(element.toLowerCase());
    });
    let rs = storybookConfig.resolutions || storybookConfig.viewports
    if (rs && rs.length){
        rs.forEach(element => {
            resolutions.push({ width: element[0], height: element[1] });
        });
    }

    let renderConfig = {
        browsers: browsers,
        resolutions: resolutions,
        storyIds: storyIds,
        waitForTimeout: storybookConfig.waitForTimeout,
        customViewports: storybookConfig.customViewports,
        useOnlyCustomViewports: storybookConfig.useOnlyCustomViewports,
        lazyLoadedStories: lazyLoadedStories,
        useGlobals: useGlobals,
        backgroundTheme: backgroundTheme
    };
    if (screenshotNames) {
        renderConfig.screenshotNames = screenshotNames;
    }

    return {
        downloadURL: source.downloadURL,
        uploadId: source.uploadId,
        projectToken: process.env.PROJECT_TOKEN,
        storybookConfig: renderConfig,
        git: git,
        buildName: buildName,
        tunnel: tunnel,
        maxStories: maxStories
    };
}

function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// POST the render request and follow the build until it finishes. When the CLI started the
// tunnel itself, a "tunnel not found" answer is retried a few times: the tunnel can take a
// moment to register with LambdaTest after the local binary reports it is connected.
async function requestRender(payload, options, pollingOptions = {}) {
    const endpoint = new URL(constants[options.env].STATIC_RENDER_PATH, constants[options.env].BASE_URL).href;
    const maxAttempts = payload.tunnel && payload.tunnel.type === 'auto' ? TUNNEL_RENDER_ATTEMPTS : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let response;
        try {
            response = await httpClient.post(endpoint, payload);
        } catch (error) {
            if (error.response) {
                console.log('[smartui] Build failed: Error: ', error.response.data.error?.message);
            } else {
                console.log('[smartui] Build failed: Error: ', error.message);
            }
            process.exitCode = constants.ERROR_CATCHALL;
            return;
        }

        if (response.data && response.data.error) {
            const message = response.data.error.message || '';
            if (attempt < maxAttempts && /tunnel/i.test(message)) {
                console.log(`[smartui] Tunnel not ready yet (${message}). Retrying in ${TUNNEL_RENDER_RETRY_DELAY_MS / 1000}s...`);
                await delay(TUNNEL_RENDER_RETRY_DELAY_MS);
                continue;
            }
            console.log('[smartui] Error: ', message);
            process.exitCode = constants.ERROR_CATCHALL;
            return;
        }

        console.log('[smartui] Build URL: ', response.data.data.buildURL);
        console.log('[smartui] Build in progress...');
        const reason = await shortPolling(response.data.data.buildId, 0, options, pollingOptions);
        if (pollingOptions.stopOnError && (reason === 'timeout' || reason === 'unavailable')) {
            const waited = Math.round((pollingOptions.maxWaitMs || 0) / 60000);
            console.log(`[smartui] Error: gave up waiting for the build${reason === 'timeout' ? ` after ${waited} minutes` : ' (build status unavailable)'}. The tunnel is closing now, so any chunk still rendering will fail. Check the build on LambdaTest SmartUI.`);
            process.exitCode = constants.ERROR_CATCHALL;
        }
        return;
    }
}

module.exports = { storybook, buildRenderPayload, toDownloadKey, toRenderBaseURL };
