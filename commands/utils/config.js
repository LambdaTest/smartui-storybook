const defaultSmartUIConfig = {
    storybook: {
        browsers: [
            'chrome',
            'firefox',
            'safari',
            'edge'
        ],
        resolutions: [
            [1920, 1080]
        ],
        waitForTimeout: 0,
        include: [],
        exclude: []
    }
};

module.exports = { defaultSmartUIConfig }