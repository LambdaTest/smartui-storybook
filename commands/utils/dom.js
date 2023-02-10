const axios = require('axios');
const fs = require('fs');
const path = require('path')
const formData = require('form-data');
const { JSDOM } = require("jsdom");
var { constants } = require('./constants');
const { getLastCommit } = require('./git')

async function sendDoM(storybookUrl, stories, storybookConfig, options) {
    const createBrowser = require('browserless')
    const browser = createBrowser()

    if (!fs.existsSync('doms')){
        fs.mkdir('doms', (err) => {
            if (err) {
                return console.error(err);
            }
        });
    }
    for (const [storyId, storyInfo] of Object.entries(stories)) {
        const browserless = await browser.createContext()
        const html = await browserless.html(storyInfo.url)

        dom = new JSDOM(html);
        for(element of dom.window.document.querySelectorAll('img')) {
            let image = new URL(element.getAttribute('src'), storybookUrl).href;
            let format = path.extname(image).replace(/^./, '');
            format = format === 'svg' ? 'svg+xml' : format
            let imageAsBase64 = await getBase64(image);
            element.setAttribute('src', 'data:image/'+format+';base64,'+imageAsBase64);
        }
        try {
            fs.writeFileSync('doms/' + storyId + '.html', dom.serialize());
        } catch (err) {
            console.error(err);
        }

        await browserless.destroyContext()
    }
    await browser.close()

    // Create form
    let commit = await getLastCommit();
    const form = new formData();
    for (const [storyId, storyInfo] of Object.entries(stories)) {
        const file = fs.readFileSync('doms/' + storyId + '.html');
        form.append('files', file, storyInfo.kind + ': ' + storyInfo.name + '.html');
    }
    form.append('resolution', storybookConfig.resolutions);
    form.append('browser', storybookConfig.browsers);
    form.append('projectToken', process.env.PROJECT_TOKEN);
    // form.append('buildName', options.buildname);
    form.append('branch', commit.branch);
    form.append('commitId', commit.shortHash);
    form.append('commitAuthor', commit.author.name);
    form.append('commitMessage', commit.subject);

    // Send DOM to render API
    await axios.post(constants[options.env].RENDER_API_URL, form, {
        headers: {
            ...form.getHeaders()
        }
        })
        .then(async function (response) {
            console.log('[smartui] Build in progress...');
            await shortPolling(response.data.buildId, 0, 2000, 512000);
        })
        .catch(function (error) {
            console.log('[smartui] Build failed: Error: ', error.message);
        });
    
    fs.rm('doms', {recursive: true}, (err) => {
        if (err) {
            return console.error(err);
        }
    });
};

async function shortPolling(buildId, retries = 0, interval, maxInterval) {
    try {
        const response = await axios.get('https://stage-api.lambdatestinternal.com/storybook/status?buildId=' + buildId, {
            headers: {
                projectToken: process.env.PROJECT_TOKEN
            }
        });

        if (response.data) {
            if (response.data.buildStatus === 'completed') {
                console.log('[smartui] Build successful\n');
                console.log('[smartui] Build details:\n',
                    // 'Build URL: ', response.data.buildId, '\n',
                    'Build Name: ', response.data.buildName, '\n',
                    'Total Screenshots: ', response.data.screenshots.length, '\n',
                    'Approved: ', response.data.buildResults.approved, '\n',
                    'Changes found: ', response.data.buildResults.changesFound, '\n'
                );

                response.data.screenshots.forEach(screenshot => {
                    console.log(screenshot.storyName, ' | Mis-match: ', screenshot.mismatchPercentage);
                });

                return;
            } else {
                if (response.data.screenshots.length > 0) {
                    // TODO: show Screenshots processed 8/10 
                    console.log('[smartui] Screenshots processed: ', response.data.screenshots.length)
                }
            }
        }
        
        // Double the interval, up to the maximum interval of 512 secs (so ~15 mins in total)
        interval = Math.min(interval * 2, maxInterval);
        if (interval == maxInterval) {
            console.log('[smartui] Please check the build status on LambdaTest SmartUI.');
            return;
        }

        setTimeout(function () {
            shortPolling(buildId, 0, interval, maxInterval)
        }, interval);
    } catch (error) {
        if (retries >= 3) {
            console.log('[smartui] Error: Failed getting build status.', error.message);
            console.log('[smartui] Please check the build status on LambdaTest SmartUI.');
            return;
        }

        setTimeout(function () {
            shortPolling(buildId, retries+1, interval, maxInterval);
        }, 2000);
    }
};

function getBase64(url) {
    return axios.get(url, {
            responseType: "text",
            responseEncoding: "base64",
        })
        .then(response => response.data)
        .catch(function (error) {
            console.log('[smartui] Error: ', error.message);
            process.exit(0);
        });
}

module.exports = { sendDoM };
