const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveFailOn, resolveResultsFile, summarise, policyFails, finishRun } = require('./../commands/utils/results');

const shot = (status, name = 'Button--primary') => ({ storyName: name, browser: 'chrome', resolution: '1920x1080', status, mismatchPercentage: status === 'Approved' ? 0 : 1.5 });

describe('resolveFailOn', () => {
	test('defaults to none', () => expect(resolveFailOn(undefined, undefined, undefined)).toBe('none'));
	test('bare flag means unreviewed', () => expect(resolveFailOn(true, 'rejected', 'changes')).toBe('unreviewed'));
	test('flag beats env beats config', () => {
		expect(resolveFailOn('rejected', 'changes', 'none')).toBe('rejected');
		expect(resolveFailOn(undefined, 'changes', 'rejected')).toBe('changes');
		expect(resolveFailOn(undefined, undefined, 'Rejected')).toBe('rejected');
	});
	test('rejects unknown policies', () => expect(() => resolveFailOn('everything')).toThrow(/invalid --fail-on/));
});

describe('resolveResultsFile', () => {
	test('off when not given', () => expect(resolveResultsFile(undefined)).toBe(''));
	test('bare flag writes results.json', () => expect(resolveResultsFile(true)).toBe('results.json'));
	test('keeps a .json name', () => expect(resolveResultsFile('out/sb.json')).toBe('out/sb.json'));
	test('rejects other extensions', () => expect(() => resolveResultsFile('out.txt')).toThrow(/\.json/));
});

describe('summarise and policies', () => {
	const data = {
		totalScreenshots: 6,
		baseline: false,
		screenshots: [shot('Approved'), shot('Changes Found'), shot('Under Screening'), shot('Rejected'), shot('new-screenshot')],
	};

	test('counts every status and treats captures without a compared row as new', () => {
		const { counts, rows } = summarise(data);
		expect(counts).toEqual({ total: 6, approved: 1, changesFound: 1, underScreening: 1, rejected: 1, new: 2 });
		expect(rows[1]).toEqual({ name: 'Button--primary', browser: 'chrome', viewport: '1920x1080', status: 'changesFound', mismatch: 1.5 });
	});

	test.each([
		['unreviewed', { changesFound: 0, underScreening: 0, new: 1, rejected: 0 }, true],
		['changes', { changesFound: 0, underScreening: 0, new: 1, rejected: 0 }, false],
		['changes', { changesFound: 1, underScreening: 0, new: 0, rejected: 0 }, true],
		['rejected', { changesFound: 3, underScreening: 2, new: 1, rejected: 0 }, false],
		['rejected', { changesFound: 0, underScreening: 0, new: 0, rejected: 1 }, true],
		['none', { changesFound: 9, underScreening: 9, new: 9, rejected: 9 }, false],
	])('policy %s on %o fails=%s', (policy, counts, fails) => {
		expect(policyFails(policy, counts, false)).toBe(fails);
	});

	test('a baseline build always passes', () => {
		expect(policyFails('unreviewed', { changesFound: 1, underScreening: 0, new: 5, rejected: 1 }, true)).toBe(false);
	});
});

describe('finishRun', () => {
	let dir;
	beforeEach(() => { process.exitCode = undefined; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-results-')); jest.spyOn(console, 'log').mockImplementation(() => {}); });
	afterEach(() => { process.exitCode = undefined; fs.rmSync(dir, { recursive: true, force: true }); console.log.mockRestore(); });

	const completed = { buildName: 'b', buildURL: 'https://smartui/b', baseline: false, totalScreenshots: 2, screenshots: [shot('Approved'), shot('Changes Found')] };

	test('exit 4 when the policy fails, with the results file written', () => {
		const file = path.join(dir, 'r.json');
		finishRun('completed', completed, 'id-1', { failOn: 'unreviewed', resultsFile: file });
		expect(process.exitCode).toBe(4);
		const out = JSON.parse(fs.readFileSync(file, 'utf8'));
		expect(out).toMatchObject({ buildId: 'id-1', buildUrl: 'https://smartui/b', policy: 'unreviewed', verdict: 'failed', counts: { changesFound: 1, approved: 1 } });
		expect(JSON.stringify(out)).not.toMatch(/token/i);
	});

	test('no exit code under policy none even with changes', () => {
		finishRun('completed', completed, 'id-1', { failOn: 'none' });
		expect(process.exitCode).toBeUndefined();
	});

	test('exit 5 when no verdict arrived under a policy', () => {
		finishRun('timeout', undefined, 'id-1', { failOn: 'changes' });
		expect(process.exitCode).toBe(5);
	});

	test('a timeout without a policy keeps exit 0', () => {
		finishRun('timeout', undefined, 'id-1', { failOn: 'none' });
		expect(process.exitCode).toBeUndefined();
	});

	test('an earlier exit code (URL mode tunnel timeout) is kept', () => {
		process.exitCode = 1;
		finishRun('timeout', undefined, 'id-1', { failOn: 'unreviewed' });
		expect(process.exitCode).toBe(1);
	});
});
