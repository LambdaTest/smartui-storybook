const axios = require('axios');
var { constants } = require('./constants');
const fs = require('fs');
const { getLastCommit } = require('./git');

function validateProjectToken(options) {
    if (process.env.PROJECT_TOKEN) { 
        return axios.get(constants[options.env].AUTH_URL, {
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

async function validateStorybookDir(dir) {
    // verify the storybook static directory exists
    if (!fs.existsSync(dir)) {
        console.log(`[smartui] Error: No directory found: ${dir}`);
        process.exit(1);
    }
};

async function validateLatestBuild(options) {
    let commit = await getLastCommit();
    return axios.get(new URL(constants[options.env].SB_BUILD_VALIDATE_PATH, constants[options.env].BASE_URL).href, {
        headers: {
            projectToken: process.env.PROJECT_TOKEN
        },
        params: {
            branch: commit.branch,
            commitId: commit.shortHash
        }})
        .then(function (response) {
            if (response.data.status === 'Failure') {
                console.log(`[smartui] Build with commit '${commit.shortHash}' on branch '${commit.branch}' already exists.`);
                console.log('[smartui] Use option --force-rebuild to forcefully push a new build.');
                process.exit(0);
            }
        })
        .catch(function (error) {
            // TODO: Add retries
            console.log('[smartui] Error: ', error.message);
            process.exit(1);
        });
}

module.exports = { validateProjectToken, validateStorybookUrl, validateStorybookDir, validateLatestBuild };
