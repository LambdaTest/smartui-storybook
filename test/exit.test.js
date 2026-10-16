const path = require('path');
const { spawnSync } = require('child_process');
const { EXIT_HINTS, exitHint } = require('./../commands/utils/exit');
const { constants } = require('./../commands/utils/constants');

const cli = path.join(__dirname, '..', 'index.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 20000 });

describe('exit hints', () => {
	test('every exit code has a one-line hint', () => {
		for (const code of [1, 2, 3, 4, 5]) {
			expect(exitHint(code)).toMatch(new RegExp(`^\\[smartui\\] Exit code ${code}: `));
			expect(exitHint(code)).not.toMatch(/\n/);
		}
		expect(Object.keys(EXIT_HINTS).sort()).toEqual(['1', '2', '3', '4', '5']);
	});

	test('no hint for success or unknown codes', () => {
		expect(exitHint(0)).toBe('');
		expect(exitHint(130)).toBe('');
	});
});

describe('usage errors exit 2', () => {
	test.each([
		[['storybook', './x', '--bogus'], /unknown option '--bogus'/],
		[['storybook'], /missing required argument/],
		[['storybook', './x', '--buildName'], /argument missing/],
		[['not-a-command'], /unknown command/],
	])('%j', (args, message) => {
		const res = run(...args);
		expect(res.status).toBe(constants.ERROR_USAGE);
		expect(res.stdout + res.stderr).toMatch(message);
		expect(res.stdout).toContain('[smartui] Exit code 2: usage error');
	});

	test('--buildName is rejected with --only-changed, from the flag or the config', () => {
		const fs = require('fs');
		const os = require('os');
		const config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-')), '.smartui.json');
		fs.writeFileSync(config, JSON.stringify({ storybook: { browsers: ['chrome'], viewports: [[1280, 800]], onlyChanged: true } }));
		for (const args of [['storybook', './x', '--buildName', 'b', '--only-changed'], ['storybook', './x', '--buildName', 'b', '--config', config]]) {
			const res = run(...args);
			expect(res.status).toBe(constants.ERROR_USAGE);
			expect(res.stdout).toContain('--buildName is not supported with --only-changed');
			expect(res.stdout).toContain('[smartui] Exit code 2: usage error');
		}
	});

	test('help and version still exit 0 with no hint', () => {
		for (const args of [['--help'], ['--version'], ['storybook', '--help']]) {
			const res = run(...args);
			expect(res.status).toBe(0);
			expect(res.stdout).not.toContain('Exit code');
		}
	});
});
