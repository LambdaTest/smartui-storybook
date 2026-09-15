const { httpClient } = require('./utils/httpClient')
const fs = require('fs')
const { captureStaticFromUrl, StoryCaptureError, CrawlUnsupportedError } = require('./utils/crawl')
const { validateStorybookUrl, validateStorybookDir } = require('./utils/validate')
const { defaultSmartUIConfig } = require('./utils/config')
const { getLastCommit } = require('./utils/git')
const static = require('./utils/static')
var { constants } = require('./utils/constants');
const { shortPolling } = require('./utils/polling');

async function storybook(serve, options) {
    let type = /^https?:\/\//.test(serve) ? 'url' : 'dir';
    let storybookConfig = options.config ? options.config : defaultSmartUIConfig.storybook;
    const buildName = options.buildName? options.buildName : "";

    if (type === 'url') {
        await validateStorybookUrl(serve);

        // Capture the running Storybook into a static copy, then upload it exactly like a
        // storybook-static directory. The copy is removed once the upload has been handed off.
        let dirPath;
        try {
            dirPath = await captureStaticFromUrl(serve, storybookConfig);
        } catch (error) {
            process.exitCode = constants.ERROR_CATCHALL;
            if (error instanceof StoryCaptureError) {
                console.log('[smartui] ' + error.message);
                console.log('[smartui] Open the URL above in a browser to check that the story renders. If the Storybook dev server is still compiling, wait for it to finish and retry.');
            } else if (error instanceof CrawlUnsupportedError) {
                console.log('[smartui] Error: ' + error.message);
            } else {
                console.log('[smartui] Cannot capture storybook. Error: ', error.message);
            }
            return;
        }
        try {
            await uploadStatic(dirPath, storybookConfig, options, buildName);
        } finally {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    } else {
        let dirPath = serve;
        await validateStorybookDir(dirPath);
        await uploadStatic(dirPath, storybookConfig, options, buildName);
    }
};

async function uploadStatic(dirPath, storybookConfig, options, buildName) {
    // Get storyIds to be rendered 
    let storyIds = static.filterStories(dirPath, storybookConfig)
    let maxStories = storybookConfig.chunkSize || 100;
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

    // Upload Storybook static
    await static.getSignedUrl(options)
        .then(async function (response) {
            let { url, uploadId } = response.data.data;

            // Compress static build
            await static.compress(dirPath, uploadId)
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

            // Prepare payload data
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
            let payload = {
                downloadURL: url.substring(url.search(/.com/)+5, url.search(/.zip/)+4),
                uploadId: uploadId,
                projectToken: process.env.PROJECT_TOKEN,
                storybookConfig: {
                    browsers: browsers,
                    resolutions: resolutions,
                    storyIds: storyIds,
                    waitForTimeout: storybookConfig.waitForTimeout,
                    customViewports: storybookConfig.customViewports,
                    useOnlyCustomViewports: storybookConfig.useOnlyCustomViewports,
                    lazyLoadedStories: lazyLoadedStories,
                    useGlobals: useGlobals,
                    backgroundTheme: backgroundTheme
                },
                git: {
                    branch: currentBranch || commit.branch|| '',  
                    baselineBranch: baseLine || '',
                    commitId: commit.shortHash, 
                    commitAuthor: commit.author.name, 
                    commitMessage: commit.subject, 
                    githubURL: process.env.GITHUB_URL || '',
                },
                buildName: buildName,
                tunnel: options.tunnel || {},
                maxStories: maxStories
            }

            // Call static render API
            await httpClient.post(new URL(constants[options.env].STATIC_RENDER_PATH, constants[options.env].BASE_URL).href, payload)
                .then(async function (response) {
                    if (response.data && response.data.error) {
                        console.log('[smartui] Error: ', response.data.error.message);
                        process.exitCode = constants.ERROR_CATCHALL;
                        return
                    }
                    console.log('[smartui] Build URL: ', response.data.data.buildURL);
                    console.log('[smartui] Build in progress...');
                    await shortPolling(response.data.data.buildId, 0, options);
                })
                .catch(function (error) {
                    if (error.response) {
                        console.log('[smartui] Build failed: Error: ', error.response.data.error?.message);
                    } else {
                        console.log('[smartui] Build failed: Error: ', error.message);
                    }
                    process.exitCode = constants.ERROR_CATCHALL;
                });
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

module.exports = { storybook };
