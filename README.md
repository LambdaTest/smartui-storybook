# LambdaTest SmartUI CLI
The @lambdatest/smartui package is LambdaTest's command-line interface (CLI) aimed to help you run your SmartUI tests on LambdaTest platform.


# Installation

### Prerequisites
1. Node version >=14.15.0 required
  ```
  node --version
  ```

2. Storybook version >=6.4 required. Also, add the following to your `.storybook/main.js`. You can read more about this here [Storybook Feature flags](https://storybook.js.org/docs/react/configure/overview#feature-flags)
  ```js
  module.exports = {
    features: {
      buildStoriesJson: true
    }
  }
  ```

### Install package using npm
```bash
npm install -g @lambdatest/smartui-storybook
```

# Usage

## Step 1: Set SmartUI Project Token in environment variables

  <b>For Linux/macOS:</b>
 
  ```
  export PROJECT_TOKEN="your-project-token"
  ```

   <b>For Windows:</b>

  ```
  set PROJECT_TOKEN="your-project-token"
  ```

## Step 2: Create config file
```bash
smartui config create .smartui.json
```

## Step 3: Execute tests
Run the following command to run tests on your Storybook stories. Provide your storybook url, build name and config file (Default config used if no config file provided)

```bash
smartui storybook http://localhost:6006 --buildname Build1 --config .smartui.json
```

# About LambdaTest

[LambdaTest](https://www.lambdatest.com/) is a cloud based selenium grid infrastructure that can help you run automated cross browser compatibility tests on 2000+ different browser and operating system environments. LambdaTest supports all programming languages and frameworks that are supported with Selenium, and have easy integrations with all popular CI/CD platforms. It's a perfect solution to bring your [selenium automation testing](https://www.lambdatest.com/selenium-automation) to cloud based infrastructure that not only helps you increase your test coverage over multiple desktop and mobile browsers, but also allows you to cut down your test execution time by running tests on parallel.

# License

Licensed under the [MIT license](./LICENSE).
