var constants = {}

constants.env = 'prod';
constants.stage = {
    AUTH_URL: "https://stage-api.lambdatestinternal.com/storybook/auth",
    RENDER_API_URL: "https://stage-api.lambdatestinternal.com/storybook/render"
};
constants.prod = {
    AUTH_URL: "https://api.lambdatest.com/storybook/auth",
    RENDER_API_URL: "https://api.lambdatest.com/storybook/render"
};

module.exports = { constants };