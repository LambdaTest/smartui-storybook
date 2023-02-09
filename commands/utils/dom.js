const axios = require('axios');
const fs = require('fs');
const path = require('path')
const formData = require('form-data');
const { JSDOM } = require("jsdom");
var { constants } = require('./constants');

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
    axios.post(constants[options.env].RENDER_API_URL, form, {
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
