const { default: axios } = require('axios')
const fs = require('fs');
const { sendDoM } = require('./utils/dom')
const { validateStorybookUrl } = require('./utils/validate')
const { defaultSmartUIConfig } = require('./utils/config')
const { skipStory } = require('./utils/story')

async function storybook(url, options) {
    // Check connection with storybook url
    await validateStorybookUrl(url);

    // TODO: modularize this and separate check for file exists
    let storybookConfig = defaultSmartUIConfig.storybook; 
    if (options.config) {
        try {
            storybookConfig = JSON.parse(fs.readFileSync(options.config)).storybook;
        } catch (error) {
            console.log('[smartui] Error: ', error.message);
            process.exit(1);
        }

        storybookConfig.browsers.forEach(element => {
            if (!(['chrome', 'safari', 'firefox'].includes(element))) {
                console.log('[smartui] Error: Invalid value for browser. Accepted browsers are chrome, safari and firefox');
                process.exit(0);
            }
        });
        // TODO: Sanity check resolutions
    }

    // Convert browsers and resolutions arrays to string
    let resolutions = [];
    storybookConfig.resolutions.forEach(element => {
        resolutions.push(element.join('x'));
    });
    storybookConfig.resolutions = (!resolutions.length) ? 'all' : resolutions.toString();
    storybookConfig.browsers = (!storybookConfig.browsers.length) ? 'all' : storybookConfig.browsers.toString();

    // Get stories object from stories.json and add url corresponding to every story ID 
    axios.get(new URL('stories.json', url).href)
        .then(function (response) {
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
            } else {
                for (const [storyId, storyInfo] of Object.entries(stories)) {
                    console.log('[smartui] Story found: ' + storyInfo.name);
                }
            }
            // Capture DoM of every story and send it to renderer API
            sendDoM(stories, storybookConfig, options);
        })
        .catch(function (error) {
            if (error.response) {
                console.log('[smartui] Error: Cannot fetch Storybook stories');
            } else if (error.request) {
                console.log('[smartui] Error: Cannot fetch Storybook stories');
            } else {
                console.log('[smartui] Error: Cannot fetch Storybook stories');
            }
            process.exit(0);
        });
};

module.exports = { storybook };