#! /usr/bin/env node

const { Command, Option } = require('commander');
const program = new Command();
const { storybook } = require('./commands/storybook');
const { validateProjectToken, validateLatestBuild, validateConfig, parse, validateScreenshotConfig } = require('./commands/utils/validate');
const { createConfig, createScreenshotConfig } = require('./commands/config');
const { version } = require('./package.json');
const { checkUpdate } = require('./commands/utils/package');
const { capture } = require('./commands/capture');
const setupLogger = require('./log/logger');

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
        const logger = await setupLogger();
        logger.info('SmartUI Storybook CLI v' + version);
        logger.info('\n');
        options.env = program.opts().env || 'prod';
        await checkUpdate(version, options, logger);

        createConfig(filepath,logger);
    });

configCommand.command('screenshot')
    .description('Create Screenshot config file')
    .argument('[filepath]', 'Optional config filepath')
    .action(async function(filepath, options) {
        const logger = await setupLogger();
        logger.info('SmartUI Storybook CLI v' + version);
        logger.info('\n');
        createScreenshotConfig(filepath, logger);
    });

program.command('storybook')
    .description('Snapshot Storybook stories')
    .argument('<url|directory>', 'Storybook url or static build directory')
    .option('-c --config <file>', 'Config file path')
    .option('--force-rebuild', 'Force a rebuild of an already existing build.', false)
    .action(async function(serve, options) {
        options.env = program.opts().env || 'prod';
        const logger = await setupLogger();
        console.log('SmartUI Storybook CLI v' + version);
        await checkUpdate(version, options, logger);
        console.log('\n');

        if (options.config) {
            options.config = validateConfig(options.config);
        }

        await validateProjectToken(options, logger);
        if (!options.forceRebuild) await validateLatestBuild(options);
        storybook(serve, options);
    });

program.command('capture <file>')
    .description('Process JSON file and Capture URLs')
    .option('-c --config <file>', 'Config file path')
    .action(async (file, options) => {
        const logger = await setupLogger();
        logger.info('SmartUI Storybook CLI v' + version);
        logger.info('\n');
        validateScreenshotConfig(file,logger);

        screenshots = parse(file);
        logger.debug(screenshots);
        options.env = program.opts().env || 'prod';
        //verify PROJECT_TOKEN
        await validateProjectToken(options,logger);
        await capture(screenshots, options, logger);
    });

program.parse();