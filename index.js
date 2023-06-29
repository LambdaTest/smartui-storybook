#! /usr/bin/env node

const { Command, Option } = require('commander');
const program = new Command();
const { storybook } = require('./commands/storybook');
const { validateProjectToken, validateLatestBuild, validateConfig, isJSONFile, parse, validateScreenshotConfig } = require('./commands/utils/validate');
const { createConfig } = require('./commands/config');
const { version } = require('./package.json');
const { checkUpdate } = require('./commands/utils/package');
const fs = require('fs');
const { capture } = require('./commands/capture');
var { constants } = require('./commands/utils/constants');


program
    .name('smartui')
    .description('CLI to help you run your SmartUI tests on LambdaTest platform')
    .version('v' + version)
    .addOption(new Option('--env <prod|stage>', 'Runtime environment option').choices(['prod', 'stage']));

const configCommand = program.command('config')
    .description('Manage LambdaTest SmartUI config')

configCommand.command('create')
    .description('Create LambdaTest SmartUI config file')
    .argument('[filepath]', 'Optional config filepath')
    .action(async function(filepath, options) {
        options.env = program.opts().env || 'prod';
        console.log('SmartUI Storybook CLI v' + version);
        await checkUpdate(version, options);
        console.log('\n');

        createConfig(filepath);
    });

program.command('storybook')
    .description('Snapshot Storybook stories')
    .argument('<url|directory>', 'Storybook url or static build directory')
    .option('-c --config <file>', 'Config file path')
    .option('--force-rebuild', 'Force a rebuild of an already existing build.', false)
    .action(async function(serve, options) {
        options.env = program.opts().env || 'prod';
        
        console.log('SmartUI Storybook CLI v' + version);
        await checkUpdate(version, options);
        console.log('\n');

        if (options.config) {
            options.config = validateConfig(options.config);
        }

        await validateProjectToken(options);
        if (!options.forceRebuild) await validateLatestBuild(options);
        storybook(serve, options);
    });

program.command('capture <file>')
    .description('Process JSON file and Capture URLs')
    .option('-c --config <file>', 'Config file path')
    .action(async (file, options) => {
        console.log('SmartUI Capture CLI v' + version);
        console.log('\n');
        if(!isJSONFile(file)){
            console.log('capture command only supports json file');   
            process.exit(constants.ERROR_CATCHALL);
        }
        screenshots = parse(file);
        console.log(screenshots);
        options.env = program.opts().env || 'prod';
        await validateScreenshotConfig(screenshots);
        //verify PROJECT_TOKEN
        await validateProjectToken(options);
        await capture(screenshots, options);
    });

program.parse();