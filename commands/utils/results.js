const fs = require('fs');
var { constants } = require('./constants');

const FAIL_ON_POLICIES = ['none', 'unreviewed', 'changes', 'rejected'];

// --fail-on wins over SMARTUI_FAIL_ON, which wins over config failOn; a bare --fail-on means unreviewed
function resolveFailOn(flagValue, envValue, configValue) {
    let policy = flagValue === true ? 'unreviewed' : (flagValue || envValue || configValue || 'none');
    policy = String(policy).trim().toLowerCase();
    if (!FAIL_ON_POLICIES.includes(policy)) {
        throw new Error(`invalid --fail-on value "${policy}". Use one of: ${FAIL_ON_POLICIES.join(', ')}`);
    }
    return policy;
}

// a bare --fetch-results writes results.json, the same default as the SmartUI CLI
function resolveResultsFile(flagValue) {
    if (flagValue === undefined || flagValue === false) return '';
    const file = flagValue === true ? 'results.json' : String(flagValue);
    if (!file.endsWith('.json')) {
        throw new Error('the file extension for --fetch-results must be .json');
    }
    return file;
}

function normaliseStatus(status) {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'approved') return 'approved';
    if (s === 'changes found') return 'changesFound';
    if (s === 'under screening' || s === 'under review') return 'underScreening';
    if (s === 'rejected') return 'rejected';
    if (s === 'new-screenshot' || s === 'new screenshot' || s === 'newscreenshot') return 'new';
    return s || 'unknown';
}

// counts come from the per-screenshot list, not buildResults; captures with no compared row have no baseline yet and count as new
function summarise(statusData) {
    const screenshots = (statusData && statusData.screenshots) || [];
    const counts = { total: 0, approved: 0, changesFound: 0, underScreening: 0, rejected: 0, new: 0 };
    const rows = screenshots.map(function (s) {
        const status = normaliseStatus(s.status);
        if (Object.hasOwn(counts, status) && status !== 'total') counts[status]++;
        return {
            name: s.storyName || '',
            browser: s.browser || '',
            viewport: s.resolution || '',
            status: status,
            mismatch: s.mismatchPercentage
        };
    });
    const total = Number(statusData && statusData.totalScreenshots) || 0;
    counts.total = Math.max(total, rows.length);
    if (!(statusData && statusData.baseline)) {
        counts.new += Math.max(0, total - rows.length);
    }
    return { counts, rows };
}

function policyFails(policy, counts, baseline) {
    if (baseline) return false;
    switch (policy) {
        case 'unreviewed': return counts.changesFound + counts.underScreening + counts.new + counts.rejected > 0;
        case 'changes': return counts.changesFound + counts.rejected > 0;
        case 'rejected': return counts.rejected > 0;
        default: return false;
    }
}

// reason is what polling stopped on: 'completed', 'error', 'timeout' or 'unavailable'
function finishRun(reason, statusData, buildId, options) {
    const policy = options.failOn || 'none';
    const completed = reason === 'completed' && statusData;
    const summary = completed ? summarise(statusData) : { counts: null, rows: [] };
    let verdict = 'unknown';
    if (completed) {
        verdict = policyFails(policy, summary.counts, statusData.baseline) ? 'failed' : 'passed';
    }

    if (options.resultsFile) {
        const results = {
            buildId: buildId,
            buildName: (statusData && statusData.buildName) || '',
            buildUrl: (statusData && statusData.buildURL) || '',
            baseline: Boolean(statusData && statusData.baseline),
            policy: policy,
            verdict: verdict,
            counts: summary.counts,
            screenshots: summary.rows
        };
        try {
            fs.writeFileSync(options.resultsFile, JSON.stringify(results, null, 2));
            console.log(`[smartui] Results written to ${options.resultsFile}`);
        } catch (error) {
            console.log(`[smartui] Error: could not write results to ${options.resultsFile}: ${error.message}`);
        }
    }

    if (policy === 'none') return;
    if (!completed) {
        // a verdict that never arrived must not read as a pass; an exit code set earlier (URL mode) is kept
        if (!process.exitCode) {
            console.log(`[smartui] Visual check UNKNOWN (policy: ${policy}): no verdict before the CLI stopped waiting. Exit code ${constants.ERROR_VERDICT_TIMEOUT}.`);
            process.exitCode = constants.ERROR_VERDICT_TIMEOUT;
        }
        return;
    }
    const c = summary.counts;
    const detail = `${c.changesFound} changes found, ${c.underScreening} under screening, ${c.new} new, ${c.rejected} rejected, ${c.approved} approved`;
    if (verdict === 'failed') {
        console.log(`[smartui] Visual check FAILED (policy: ${policy}): ${detail}. Exit code ${constants.ERROR_CHANGES_FOUND_OR_REJECTED}. Review the build in SmartUI: ${statusData.buildURL || ''}`);
        process.exitCode = constants.ERROR_CHANGES_FOUND_OR_REJECTED;
    } else {
        console.log(`[smartui] Visual check PASSED (policy: ${policy}): ${detail}.`);
    }
}

module.exports = { FAIL_ON_POLICIES, resolveFailOn, resolveResultsFile, summarise, policyFails, finishRun };
