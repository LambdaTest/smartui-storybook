#! /usr/bin/env node

const { Command } = require('commander');
const program = new Command();
const { storybook } = require('./commands/storybook');
const { validateProjectToken } = require('./commands/utils/validate');
const { createConfig } = require('./commands/config');

program
    .name('smartui')
    .description('CLI to help you run your SmartUI tests on LambdaTest platform')
    .version('1.0.0');

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
    .argument('<url>', 'Storybook url')
    .requiredOption('--buildname <string>', 'Build name')
    .option('-c --config <file>', 'Config file path')
    .action(async function(url, options) {
        await validateProjectToken();
        storybook(url, options);
    });

program.parse();