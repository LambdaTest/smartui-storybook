#! /usr/bin/env node

const { Command, Option } = require('commander');
const program = new Command();
const { storybook } = require('./commands/storybook');
const { validateProjectToken, validateLatestBuild, validateConfig, validateTunnel, resolveTunnelCredentials, isStorybookUrl } = require('./commands/utils/validate');
const { createConfig } = require('./commands/config');
const { version } = require('./package.json');
const { checkUpdate } = require('./commands/utils/package');
const { resolveFailOn, resolveResultsFile, FAIL_ON_POLICIES } = require('./commands/utils/results');

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
    .option('--userName <string>', 'LambdaTest username, used to start the tunnel for a Storybook URL. Defaults to LT_USERNAME')
    .option('--accessKey <string>', 'LambdaTest access key, used to start the tunnel for a Storybook URL. Defaults to LT_ACCESS_KEY')
    .option('--fetch-results [filename]', 'Write the build results to a JSON file once the build completes (default results.json)')
    .option('--fail-on [policy]', `Exit 4 when the visual check fails: ${FAIL_ON_POLICIES.join('|')}. No value means unreviewed. Also SMARTUI_FAIL_ON or config failOn`)
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
        // A Storybook URL is rendered through a LambdaTest tunnel, which needs credentials.
        if (isStorybookUrl(serve)) {
            options.ltCredentials = resolveTunnelCredentials(options);
        }
        if (options.config) {
            options.tunnel = validateTunnel(options.config);
        }
        if (options.config) {
            options.config = validateConfig(options.config);
        }
        try {
            options.failOn = resolveFailOn(options.failOn, process.env.SMARTUI_FAIL_ON, options.config && options.config.failOn);
            options.resultsFile = resolveResultsFile(options.fetchResults);
        } catch (error) {
            console.log(`[smartui] Error: ${error.message}`);
            process.exit(1);
        }

        await validateProjectToken(options);
        if (!options.forceRebuild) await validateLatestBuild(options);
        await storybook(serve, options);
    });

program.parse();