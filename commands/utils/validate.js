const axios = require('axios');
var { constants } = require('./constants');

function validateProjectToken() {
    if (process.env.PROJECT_TOKEN) { 
        return axios.get(constants[constants.env].AUTH_URL, {
            headers: {
                projectToken: process.env.PROJECT_TOKEN
            }})
            .then(function (response) {
                console.log('[smartui] Project Token Validated');
            })
            .catch(function (error) {
                if (error.response) {
                    console.log('[smartui] ] Error: Invalid Project Token');
                } else if (error.request) {
                    console.log('[smartui] ] Error: Project Token could not be validated');
                } else {
                    console.log('[smartui] ] Error: Project Token could not be validated');
                }
                process.exit(0);
            }); 
    }
    else { 
        console.log('[smartui] Error: No PROJECT_TOKEN set');
        process.exit(0);
    }
};

function validateStorybookUrl(url) {
    let aboutUrl;
    try {
        aboutUrl = new URL('?path=/settings/about', url).href;
    } catch (error) {
        console.log('[smartui] Error: ', error.message)
        process.exit(0);
    }
    return axios.get(aboutUrl)
        .then(function (response) {
            console.log('[smartui] Connection to storybook established');
        })
        .catch(function (error) {
            if (error.response) {
                console.log('[smartui] Error: Connection to storybook could not be established');
            } else if (error.request) {
                console.log('[smartui] Error: Connection to storybook could not be established');
            } else {
                console.log('[smartui] Error: Connection to storybook could not be established');
            }
            process.exit(0);
        });
};

module.exports = { validateProjectToken, validateStorybookUrl };