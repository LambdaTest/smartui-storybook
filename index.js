#! /usr/bin/env node

const { Command, Option } = require('commander');
const program = new Command();
const { storybook } = require('./commands/storybook');
const { validateProjectToken, validateLatestBuild } = require('./commands/utils/validate');
const { createConfig } = require('./commands/config');

program
    .name('smartui')
    .description('CLI to help you run your SmartUI tests on LambdaTest platform')
    .version('1.1.0')
    .addOption(new Option('--env <prod|stage>', 'Runtime environment option').choices(['prod', 'stage']));

const configCommand = program.command('config')
    .description('Manage LambdaTest SmartUI config')

configCommand.command('create')
    .description('Create LambdaTest SmartUI config file')
    .argument('[filepath]', 'Optional config filepath')
    .action(function(filepath) {
        createConfig(filepath);
    });

program.command('storybook')
    .description('Snapshot Storybook stories')
    .argument('<url|directory>', 'Storybook url or static build directory')
    .option('-c --config <file>', 'Config file path')
    // .option('--force-rebuild', 'Force a rebuild of an already existing build.', false)
    .action(async function(serve, options) {
        options.env = program.opts().env || 'prod';
        await validateProjectToken(options);
        // if (!options.forceRebuild) await validateLatestBuild(options);
        storybook(serve, options);
    });

program.parse();