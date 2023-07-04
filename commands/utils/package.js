const axios = require('axios');
var { constants } = require('./constants');

// Check for package updates
function checkUpdate(version, options, logger) {
    return axios.get(new URL(constants[options.env].CHECK_UPDATE_PATH, constants[options.env].BASE_URL).href, {
        params: {
            packageName: 'smartui-storybook',
            packageVersion: version
        }})
        .then(function (response) {
            if (response.data.data.deprecated) {
                logger.warn('v' + version + ' is deprecated. Please update to v' + response.data.data.latestVersion);
            } else if (response.data.data.latestVersion != version) {
                logger.warn('A newer version v' + response.data.data.latestVersion + ' is available.');
            }
        })
        .catch(function (error) {
            if (error.response && error.response.data && error.response.data.error) {
                logger.error('Cannot check for updates. Error: ' + error.response.data.error.message);
            } else {
                logger.error('Cannot check for updates. Error: ' + error.message);   
            }
        });
};

module.exports = { checkUpdate };