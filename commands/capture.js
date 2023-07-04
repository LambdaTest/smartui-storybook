const { fetchDOM, upload } = require('./utils/dom')
const { cleanup } = require('./utils/cleanup')


async function capture(screenshots, options, logger) {
    await fetchDOM(screenshots,options, logger);
    await upload(screenshots, options, logger);
    cleanup(logger);
}


module.exports = { capture };
