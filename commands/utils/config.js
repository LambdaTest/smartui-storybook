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

const defaultScreenshotConfig = [
    {
        "name": "lambdatest-home-page",
        "url": "https://www.lambdatest.com"
    },
    {
        "name": "example-page",
        "url": "https://example.com/"
    }
]

module.exports = { defaultSmartUIConfig, defaultScreenshotConfig }