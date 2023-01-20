const axios = require('axios');
const fs = require('fs');
const formData = require('form-data');
var { constants } = require('.//constants');

async function sendDoM(stories, storybookConfig, options) {
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

        try {
            fs.writeFileSync('doms/' + storyId + '.html', html);
        } catch (err) {
            console.error(err);
        }

        await browserless.destroyContext()
    }
    await browser.close()

    // Send html files to the renderer API
    const form = new formData();
    for (const [storyId, storyInfo] of Object.entries(stories)) {
        const file = fs.readFileSync('doms/' + storyId + '.html');
        form.append('html', file, storyInfo.kind + ': ' + storyInfo.name + '.html');
    }
    form.append('resolution', storybookConfig.resolutions);
    form.append('browser', storybookConfig.browsers);
    form.append('projectToken', process.env.PROJECT_TOKEN);
    form.append('buildName', options.buildname);
    axios.post(constants[constants.env].RENDER_API_URL, form, {
        headers: {
            ...form.getHeaders()
        }
        })
        .then(function (response) {
            console.log('[smartui] Build successful')
        })
        .catch(function (error) {
            fs.rm('doms', {recursive: true}, (err) => {
                if (err) {
                    return console.error(err);
                }
            });
            console.log('[smartui] Build failed: Error: ', error.message);
            process.exit(0);
        });

    fs.rm('doms', {recursive: true}, (err) => {
        if (err) {
            return console.error(err);
        }
    });
};

module.exports = { sendDoM };
