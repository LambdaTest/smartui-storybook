var constants = {}

constants.stage = {
    AUTH_URL: "https://stage-api.lambdatestinternal.com/storybook/auth",
    RENDER_API_URL: "https://stage-api.lambdatestinternal.com/storybook/render",
    BUILD_STATUS_URL: "https://stage-api.lambdatestinternal.com/storybook/status",
    BASE_URL: "https://stage-api.lambdatestinternal.com"
};
constants.prod = {
    AUTH_URL: "https://api.lambdatest.com/storybook/auth",
    RENDER_API_URL: "https://api.lambdatest.com/storybook/render"
};

module.exports = { constants };