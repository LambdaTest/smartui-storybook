const { fetchDOM, upload } = require('./utils/dom')


async function capture(screenshots, options) {
    await fetchDOM(screenshots,options);
    console.log("done")
    console.log('[smartui] Build in progress...');
    await upload(screenshots, options);
}


module.exports = { capture };
