const { fetchDOM, upload } = require('./utils/dom')
const { cleanup } = require('./utils/cleanup')


async function capture(screenshots, options) {
    await fetchDOM(screenshots,options);
    await upload(screenshots, options);
    cleanup();
}


module.exports = { capture };
