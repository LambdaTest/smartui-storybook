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
                    console.log('[smartui] Error: Invalid Project Token');
                } else if (error.request) {
                    console.log('[smartui] Project Token not validated. Error: ', error.message);
                } else {
                    console.log('[smartui] Project Token not validated. Error: ', error.message);
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
                console.log('[smartui] Connection to storybook not established. Error: ', error.message);
            } else if (error.request) {
                console.log('[smartui] Connection to storybook not established. Error: ', error.message);
            } else {
                console.log('[smartui] Connection to storybook not established. Error: ', error.message);
            }
            process.exit(0);
        });
};

async function validateStorybookDir(dir) {
    // verify the directory exists
    if (!fs.existsSync(dir)) {
        console.log(`[smartui] Error: No directory found: ${dir}`);
        process.exit(1);
    }
    // Verify project.json and stories.json exist to confirm it's a storybook-static dir
    if (!fs.existsSync(dir + '/index.html')) {
        console.log(`[smartui] Given directory is not a storybook static directory. Error: No index.html found`);
        process.exit(1);
    }
    if (!fs.existsSync(dir + '/stories.json')) {
        console.log(`[smartui] Given directory is not a storybook static directory. Error: No stories.json found`);
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
            console.log('[smartui] Cannot fetch latest build of the project. Error: ', error.message);
            process.exit(1);
        });
}

function validateConfig(configFile) {
    // Verify config file exists
    if (!fs.existsSync(configFile)) {
        console.log(`[smartui] Error: Config file ${configFile} not found.`);
        process.exit(1);
    }

    // Parse JSON
    let storybookConfig;
    try {
        storybookConfig = JSON.parse(fs.readFileSync(configFile)).storybook;
    } catch (error) {
        console.log('[smartui] Error: ', error.message);
        process.exit(1);
    }

    // Sanity check browsers
    if (storybookConfig.browsers.length == 0) {
        console.log('[smartui] Error: Empty browsers list in config.')
    }
    storybookConfig.browsers.forEach(element => {
        if (!(['chrome', 'safari', 'firefox'].includes(element.toLowerCase()))) {
            console.log('[smartui] Error: Invalid value for browser. Accepted browsers are chrome, safari and firefox');
            process.exit(0);
        }
    });

    // Sanity check resolutions
    if (storybookConfig.resolutions.length == 0) {
        console.log('[smartui] Error: Invalid number of resolutions. Min. required - 1')
    }
    if (storybookConfig.resolutions.length > 5) {
        console.log('[smartui] Error: Invalid number of resolutions. Max allowed - 5')
    }
    storybookConfig.resolutions.forEach(element => {
        if (element.length != 2 || element[0] <= 0 || element[1] <= 0) {
            console.log('[smartui] Error: Invalid resolutions.')
        }
    });

    return storybookConfig
}

module.exports = { validateProjectToken, validateStorybookUrl, validateStorybookDir, validateLatestBuild, validateConfig };
