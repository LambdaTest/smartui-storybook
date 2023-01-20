const path = require('path');
const fs = require('fs');
const { defaultSmartUIConfig } = require('./utils/config')

function createConfig(filepath) {
    // default filepath
    filepath = filepath || '.smartui.json';
    let filetype = path.extname(filepath);
    if (filetype != '.json') {
        console.log(`[smartui] Error: Config file must have .json extension`);
        process.exit(1);
    }

    // verify the file does not already exist
    if (fs.existsSync(filepath)) {
        console.log(`[smartui] Error: LambdaTest SmartUI config already exists: ${filepath}`);
        process.exit(1);
    }

    // write stringified default config options to the filepath
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(defaultSmartUIConfig, null, 2) + '\n');
    console.log(`[smartui] Created LambdaTest SmartUI config: ${filepath}`);
};

module.exports = { createConfig };