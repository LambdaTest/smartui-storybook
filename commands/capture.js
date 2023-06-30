const { fetchDOM, upload } = require('./utils/dom')


async function capture(screenshots, options) {
    await fetchDOM(screenshots,options);
    await upload(screenshots, options);
}


module.exports = { capture };
