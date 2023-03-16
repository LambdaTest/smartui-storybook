const { default: axios } = require('axios')
const fs = require('fs')
const { sendDoM } = require('./utils/dom')
const { validateStorybookUrl, validateStorybookDir } = require('./utils/validate')
const { defaultSmartUIConfig } = require('./utils/config')
const { skipStory } = require('./utils/story')
const { getLastCommit } = require('./utils/git')
const static = require('./utils/static')
var { constants } = require('./utils/constants');
const { shortPolling } = require('./utils/polling');

async function storybook(serve, options) {
    let type = /^https?:\/\//.test(serve) ? 'url' : 'dir';
    let storybookConfig = options.config ? options.config : defaultSmartUIConfig.storybook;

    if (type === 'url') {
        await validateStorybookUrl(serve);
        let url = serve;

        // Convert browsers and resolutions arrays to string
        let resolutions = [];
        storybookConfig.resolutions.forEach(element => {
            resolutions.push(element.join('x'));
        });
        storybookConfig.resolutions = (!resolutions.length) ? 'all' : resolutions.toString();
        storybookConfig.browsers = (!storybookConfig.browsers.length) ? 'all' : storybookConfig.browsers.toString();

        // Get stories object from stories.json and add url corresponding to every story ID 
        await axios.get(new URL('stories.json', url).href)
            .then(async function (response) {
                let stories = {}
                for (const [storyId, storyInfo] of Object.entries(response.data.stories)) {
                    if (!skipStory(storyInfo.name, storybookConfig)) {
                        stories[storyId] = {
                            name: storyInfo.name,
                            kind: storyInfo.kind,
                            url: new URL('/iframe.html?id=' + storyId + '&viewMode=story', url).href
                        }
                    }
                }
                
                if (Object.keys(stories).length === 0) {
                    console.log('[smartui] Error: No stories found');
                    process.exit(0);
                }
                console.log('[smartui] Stories found: ', Object.keys(stories).length);

                // Capture DoM of every story and send it to renderer API
                await sendDoM(url, stories, storybookConfig, options);
            })
            .catch(function (error) {
                if (error.response) {
                    console.log('[smartui] Cannot fetch stories. Error: ', error.message);
                } else if (error.request) {
                    console.log('[smartui] Cannot fetch stories. Error: ', error.message);
                } else {
                    console.log('[smartui] Cannot fetch stories. Error: ', error.message);
                }
            });
    } else {
        let dirPath = serve;
        await validateStorybookDir(dirPath);
        
        // Get storyIds to be rendered 
        let storyIds = static.filterStories(dirPath, storybookConfig)

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
                        process.exit(0);
                    });
                
                // Upload to S3
                const zipData = fs.readFileSync('storybook-static.zip');
                console.log('[smartui] Upload in progress...')
                await axios.put(url, zipData, {
                    headers: {
                        'Content-Type': 'application/zip',
                        'Content-Length': zipData.length
                    }})
                    .then(function (response) {
                        console.log(`[smartui] ${dirPath} uploaded.`);
                        fs.rmSync('storybook-static.zip');
                    })
                    .catch(function (error) {
                        console.log(`[smartui] Cannot upload ${dirPath}. Error: ${err.message}`);
                        fs.rmSync('storybook-static.zip');
                        process.exit(0);
                    });

                // Prepare payload data        
                let resolutions = []
                storybookConfig.resolutions.forEach(element => {
                    resolutions.push({width: element[0], height: element[1]});
                });
                let commit = await getLastCommit();
                let payload = {
                    downloadURL: url.substring(url.search(/.com/)+5, url.search(/.zip/)+4),
                    uploadId: uploadId,
                    projectToken: process.env.PROJECT_TOKEN,
                    storybookConfig: {
                        browsers: storybookConfig.browsers,
                        resolutions: resolutions,
                        storyIds: storyIds
                    },
                    git: {
                        branch: commit.branch,
                        commitId: commit.shortHash,
                        commitAuthor: commit.author.name,
                        commitMessage: commit.subject,
                        githubURL: process.env.GITHUB_URL || '',
                    }
                }

                // Call static render API
                await axios.post(new URL(constants[options.env].STATIC_RENDER_PATH, constants[options.env].BASE_URL).href, payload)
                    .then(async function (response) {
                        console.log('[smartui] Build in progress...');
                        await shortPolling(response.data.data.buildId, 0, options);
                    })
                    .catch(function (error) {
                        if (error.response) {
                            console.log('[smartui] Build failed: Error: ', error.response.data.error?.message);
                        } else {
                            console.log('[smartui] Build failed: Error: ', error.message);
                        }       
                    });
            })
            .catch(function (error) {
                if (error.response) {
                    console.log('[smartui] Error: ', error.response.data.error?.message);
                } else {
                    console.log('[smartui] Error: ', error.message);
                }
                process.exit(0);
            });

    }
};

module.exports = { storybook };