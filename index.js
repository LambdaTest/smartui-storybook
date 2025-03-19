#! /usr/bin/env node

const { Command, Option } = require('commander');
const program = new Command();
const { storybook } = require('./commands/storybook');
const { validateProjectToken, validateLatestBuild, validateConfig } = require('./commands/utils/validate');
const { createConfig } = require('./commands/config');
const { version } = require('./package.json');
const { checkUpdate } = require('./commands/utils/package');

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
    .option('--buildName <string>', 'Specify the build name for the pipeline')
    .action(async function(serve, options) {
        options.env = program.opts().env || 'prod';
        
        console.log('SmartUI Storybook CLI v' + version);
        await checkUpdate(version, options);
        console.log('\n');
        // Check if buildName is undefined or empty string
        if (options.buildName === '') {
            const error = {
                "error": "MISSING_BUILD_NAME",
                "message": "The --buildName flag requires a value."
            };
            console.log(JSON.stringify(error, null, 2));
            process.exit(1);
        }
        if (options.config) {
            options.config = validateConfig(options.config);
        }

        await validateProjectToken(options);
        if (!options.forceRebuild) await validateLatestBuild(options);
        storybook(serve, options);
    });

program.parse();