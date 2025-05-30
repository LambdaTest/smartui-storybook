const axios = require('axios');
var { constants } = require('./constants');
const fs = require('fs');
const { getLastCommit } = require('./git');

const MAX_RESOLUTIONS = 5
const MIN_RESOLUTION_WIDTH = 320
const MIN_RESOLUTION_HEIGHT = 320
const MAX_RESOLUTION_WIDTH = 7680
const MAX_RESOLUTION_HEIGHT = 7680

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

function validateProjectToken(options) {
    if (process.env.PROJECT_TOKEN) {
        return axios.get(constants[options.env].AUTH_URL, {
            headers: {
                projectToken: process.env.PROJECT_TOKEN
            }
        })
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
                process.exit(constants.ERROR_CATCHALL);
            });
    }
    else {
        console.log('[smartui] Error: No PROJECT_TOKEN set');
        process.exit(constants.ERROR_CATCHALL);
    }
};

function validateStorybookUrl(url) {
    let aboutUrl;
    try {
        aboutUrl = new URL('?path=/settings/about', url).href;
    } catch (error) {
        console.log('[smartui] Error: ', error.message)
        process.exit(constants.ERROR_CATCHALL);
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
            process.exit(constants.ERROR_CATCHALL);
        });
};

async function validateStorybookDir(dir) {
    // verify the directory exists
    if (!fs.existsSync(dir)) {
        console.log(`[smartui] Error: No directory found: ${dir}`);
        process.exit(constants.ERROR_CATCHALL);
    }
    // Verify project.json and stories.json exist to confirm it's a storybook-static dir
    if (!fs.existsSync(dir + '/index.html')) {
        console.log(`[smartui] Given directory is not a storybook static directory. Error: No index.html found`);
        process.exit(constants.ERROR_CATCHALL);
    }
    if (!fs.existsSync(dir + '/stories.json') && !fs.existsSync(dir + '/index.json')) {
        console.log(`[smartui] Given directory is not a storybook static directory. Error: stories.json or index.json not found`);
        process.exit(constants.ERROR_CATCHALL);
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
        }
    })
        .then(function (response) {
            if (response.data.status === 'Failure') {
                console.log(`[smartui] Build with commit '${commit.shortHash}' on branch '${commit.branch}' already exists.`);
                console.log('[smartui] Use option --force-rebuild to forcefully push a new build.');
                process.exit(constants.ERROR_BUILD_ALREADY_EXISTS);
            }
        })
        .catch(function (error) {
            // TODO: Add retries
            console.log('[smartui] Cannot fetch latest build of the project. Error: ', error.message);
            process.exit(constants.ERROR_CATCHALL);
        });
}

function validateConfig(configFile) {
    // Verify config file exists
    if (!fs.existsSync(configFile)) {
        console.log(`[smartui] Error: Config file ${configFile} not found.`);
        process.exit(constants.ERROR_CATCHALL);
    }

    // Parse JSON
    let storybookConfig;
    try {
        storybookConfig = JSON.parse(fs.readFileSync(configFile)).storybook;
    } catch (error) {
        console.log('[smartui] Error: ', error.message);
        process.exit(constants.ERROR_CATCHALL);
    }

    try {
        validateConfigBrowsers(storybookConfig.browsers);
        resolutions = storybookConfig.resolutions || storybookConfig.viewports
        storybookConfig.resolutions = validateConfigResolutions(resolutions);
        storybookConfig.viewports = storybookConfig.resolutions;
        validateCustomViewPorts(storybookConfig.customViewports)
    } catch (error) {
        console.log(`[smartui] Error: Invalid config, ${error.message}`);
        process.exit(constants.ERROR_CATCHALL);
    }

    // Sanity check waitForTimeout
    if (!Object.hasOwn(storybookConfig, 'waitForTimeout')) {
        storybookConfig.waitForTimeout = 0;
    } else if (storybookConfig.waitForTimeout <= 0 || storybookConfig.waitForTimeout > 300000) {
        console.log('[smartui] Warning: Invalid config, value of waitForTimeout must be > 0 and <= 300000');
        console.log('[smartui] If you do not wish to include waitForTimeout parameter, remove it from the config file.');
        storybookConfig.waitForTimeout = 0;
    }

    return storybookConfig
}

function validateTunnel(configFile) {
    // Verify config file exists
    if (!fs.existsSync(configFile)) {
        console.log(`[smartui] Error: Config file ${configFile} not found.`);
        process.exit(constants.ERROR_CATCHALL);
    }

    let tunnelConfig;
    try {
        let config = JSON.parse(fs.readFileSync(configFile));
        tunnelConfig = config.tunnel || {};
        if (tunnelConfig && tunnelConfig.type && tunnelConfig.type != "manual")  {
            throw new ValidationError('Invalid tunnel type. Accepted type is `manual` only');
        }
    } catch (error) {
        console.log('[smartui] Error: ', error.message);
        process.exit(constants.ERROR_CATCHALL);
    }

    return tunnelConfig
}

function validateConfigBrowsers(browsers) {
    if (browsers.length == 0) {
        throw new ValidationError('empty browsers list.');
    }
    const set = new Set();
    for (let element of browsers) {
        if (!constants.VALID_BROWSERS.includes(element.toLowerCase()) || set.has(element)) {
            throw new ValidationError(`invalid or duplicate value for browser. Accepted browsers are ${constants.VALID_BROWSERS.join(',')}`);
        }
        set.add(element);
    };
}

function validateConfigResolutions(resolutions) {
    if (!Array.isArray(resolutions)) {
        throw new ValidationError('Invalid viewports config. Please add atleast one viewport.');
    }
    if (resolutions.length == 0) {
        throw new ValidationError('Empty viewports list in config.');
    }
    if (resolutions.length > 5) {
        throw new ValidationError(`max resolutions: ${MAX_RESOLUTIONS}`);
    }
    let res = [];
    resolutions.forEach(element => {
        if (!Array.isArray(element) || element.length == 0 || element.length > 2) {
            throw new ValidationError('Invalid elements in viewports config.');
        }
        let width = element[0];
        let height = element[1];
        if (typeof width != 'number') {
            width = Number(width);
        }
        if (typeof height != 'number') {
            height = Number(height);
        }
        if (width && width < MIN_RESOLUTION_WIDTH || width > MAX_RESOLUTION_WIDTH) {
            throw new ValidationError(`width must be > ${MIN_RESOLUTION_WIDTH}, < ${MAX_RESOLUTION_WIDTH}`);
        }
        if (height & (height < MIN_RESOLUTION_WIDTH || height > MAX_RESOLUTION_WIDTH)) {
            throw new ValidationError(`height must be > ${MIN_RESOLUTION_HEIGHT}, < ${MAX_RESOLUTION_HEIGHT}`);
        }
        res.push([width, height || 0]);
    });

    return res
}


function validateCustomViewPorts(customViewports) {
    if (!Array.isArray(customViewports)) {
        return
    }
    if (customViewports && customViewports.length == 0) {
        return
    }
    customViewports.forEach(element => {
        if (!Array.isArray(element.stories) || element.stories == 0) {
            throw new ValidationError('Missing `stories` in customViewports config. please check the config file');
        }
        if (element.styles) {
            if (!element.styles?.width) {
                throw new ValidationError('Missing width in styles. please check the config file');
            }
            let width = element.styles.width;
            let height = element.styles.height;
            if (width && typeof width != 'number') {
                width = Number(width);
            }
            if (height && typeof height != 'number') {
                height = Number(height);
            }
            if (width && width < MIN_RESOLUTION_WIDTH || width > MAX_RESOLUTION_WIDTH) {
                throw new ValidationError(`customViewports.styles width must be > ${MIN_RESOLUTION_WIDTH}, < ${MAX_RESOLUTION_WIDTH}`);
            }
            if (height & (height < MIN_RESOLUTION_WIDTH || height > MAX_RESOLUTION_WIDTH)) {
                throw new ValidationError(`customViewports.styles height must be > ${MIN_RESOLUTION_HEIGHT}, < ${MAX_RESOLUTION_HEIGHT}`);
            }
            element.styles.width = width;
            element.styles.height = height;
        } else {
            if (!element.waitForTimeout) {
                throw new ValidationError('Missing styles and waitForTimeout. Specify either of them. please check the config file');
            }
        }

    });
    return
}

module.exports = {
    ValidationError,
    validateProjectToken,
    validateStorybookUrl,
    validateStorybookDir,
    validateLatestBuild,
    validateConfig,
    validateConfigBrowsers,
    validateConfigResolutions,
    validateCustomViewPorts,
    validateTunnel,
};
