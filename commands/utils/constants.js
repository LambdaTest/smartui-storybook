var constants = {}

constants.stage = {
    AUTH_URL: "https://stage-api.lambdatestinternal.com/storybook/auth",
    BUILD_STATUS_URL: "https://stage-api.lambdatestinternal.com/storybook/status",
    BASE_URL: "https://stage-api.lambdatestinternal.com",
    SB_BUILD_VALIDATE_PATH: "/storybook/validate",
    CHECK_UPDATE_PATH: "storybook/packageinfo",
    GET_SIGNED_URL_PATH: "/storybook/url",
    STATIC_RENDER_PATH: "/storybook/staticrender"
};
constants.prod = {
    AUTH_URL: "https://api.lambdatest.com/storybook/auth",
    BUILD_STATUS_URL: "https://api.lambdatest.com/storybook/status",
    BASE_URL: "https://api.lambdatest.com",
    SB_BUILD_VALIDATE_PATH: "/storybook/validate",
    CHECK_UPDATE_PATH: "storybook/packageinfo",
    GET_SIGNED_URL_PATH: "/storybook/url",
    STATIC_RENDER_PATH: "/storybook/staticrender"
};
constants.VALID_BROWSERS = ['chrome', 'safari', 'firefox', 'edge'];

// Error codes
constants.ERROR_CATCHALL = 1
// wrong command, unknown or missing flag, or an invalid flag value
constants.ERROR_USAGE = 2
constants.ERROR_BUILD_ALREADY_EXISTS = 3
constants.ERROR_CHANGES_FOUND_OR_REJECTED = 4
// only with --fail-on: the CLI stopped waiting before the build had a verdict
constants.ERROR_VERDICT_TIMEOUT = 5

// A Storybook URL build renders through the tunnel this process keeps open, so the CLI
// waits for it much longer than for a static build before giving up.
constants.URL_MODE_MAX_WAIT_MS = 2 * 60 * 60 * 1000

// Default chunk size for a Storybook URL build: every chunk renders all browsers and
// viewports through the tunnel one after another, so it is kept smaller than the static default.
constants.URL_MODE_DEFAULT_CHUNK_SIZE = 50

module.exports = { constants };