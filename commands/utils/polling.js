const axios = require('axios');
const Table = require('cli-table3');
var { constants } = require('./constants');

var INTERVAL = 2000
const MAX_INTERVAL = 512000

async function shortPolling(buildId, retries = 0, options) {
    await axios.get(new URL('?buildId=' + buildId, constants[options.env].BUILD_STATUS_URL).href, {
        headers: {
            projectToken: process.env.PROJECT_TOKEN
        }})
        .then(function (response) {
            if (response.data) {
                if (response.data.buildStatus === 'completed') {
                    console.log('[smartui] Build successful\n');
                    console.log('[smartui] Build details:\n',
                        'Build URL: ', response.data.buildURL, '\n',
                        'Build ID: ', buildId, '\n',
                        'Build Name: ', response.data.buildName, '\n',
                        'Total Screenshots: ', response.data.totalScreenshots, '\n',
                        'Approved: ', response.data.buildResults.approved, '\n',
                        'Changes found: ', response.data.buildResults.changesFound, '\n',
                        'Rejected:' , response.data.buildResults.rejected, '\n'
                    );
                    
                    if (response.data.screenshots && response.data.screenshots.length > 0) {
                        import('chalk').then((chalk) => {
                            const table = new Table({
                                head: [
                                    {content: chalk.default.white('Story'), hAlign: 'center'},
                                    {content: chalk.default.white('Mis-match %'), hAlign: 'center'},
                                ]
                            });
                            response.data.screenshots.forEach(screenshot => {
                                let mismatch = screenshot.mismatchPercentage
                                table.push([
                                    chalk.default.yellow(screenshot.storyName),
                                    mismatch > 0 ? chalk.default.red(mismatch) : chalk.default.green(mismatch)
                                ])
                            });
                            console.log(table.toString());

                            if (response.data.buildResults.changesFound != 0 || response.data.buildResults.rejected != 0) {
                                process.exitCode = constants.ERROR_CHANGES_FOUND_OR_REJECTED;
                            }
                        })
                    } else {
                        if (response.data.baseline) {
                            console.log('No comparisons run. This is a baseline build.');
                        } else {
                            console.log('No comparisons run. No screenshot in the current build has the corresponding screenshot in baseline build.');
                        }
                    }
                    return;
                } else {
                    if (response.data.screenshots && response.data.screenshots.length > 0) {
                        // TODO: show Screenshots processed current/total 
                        console.log('[smartui] Screenshots compared: ', response.data.screenshots.length)
                    }
                }
            }
            
            // Double the INTERVAL, up to the maximum INTERVAL of 512 secs (so ~15 mins in total)
            INTERVAL = Math.min(INTERVAL * 2, MAX_INTERVAL);
            if (INTERVAL == MAX_INTERVAL) {
                console.log('[smartui] Please check the build status on LambdaTest SmartUI.');
                return;
            }

            setTimeout(function () {
                shortPolling(buildId, 0, options)
            }, INTERVAL);
        })
        .catch(function (error) {
            if (retries >= 3) {
                console.log('[smartui] Error: Failed getting build status.', error.message);
                console.log('[smartui] Please check the build status on LambdaTest SmartUI.');
                return;
            }

            setTimeout(function () {
                shortPolling(buildId, retries+1, options);
            }, 2000);
        });
};

module.exports = { shortPolling }