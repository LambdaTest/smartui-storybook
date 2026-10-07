var { constants } = require('./constants');

// one line per exit code, printed as the process exits so every path that sets a code gets it
const EXIT_HINTS = {
    [constants.ERROR_CATCHALL]: 'error: SmartUI could not run or finish this build. Check the [smartui] Error lines above (config file, PROJECT_TOKEN, upload, render or tunnel).',
    [constants.ERROR_USAGE]: 'usage error: unknown command or option, or an invalid flag value. Run `smartui storybook --help` for the supported flags.',
    [constants.ERROR_BUILD_ALREADY_EXISTS]: 'a build already exists for this commit and branch. Pass --force-rebuild to build again, or set CURRENT_BRANCH.',
    [constants.ERROR_CHANGES_FOUND_OR_REJECTED]: 'visual check failed under --fail-on. Review the changes in SmartUI (build link above), approve or reject them, then re-run.',
    [constants.ERROR_VERDICT_TIMEOUT]: 'no verdict: the CLI stopped waiting while the build was still running. Check the build in SmartUI, or re-run once it has finished.'
};

function exitHint(code) {
    const hint = EXIT_HINTS[code];
    return hint ? `[smartui] Exit code ${code}: ${hint}` : '';
}

function registerExitHint() {
    process.on('exit', function (code) {
        const line = exitHint(code);
        if (line) console.log(line);
    });
}

module.exports = { EXIT_HINTS, exitHint, registerExitHint };
