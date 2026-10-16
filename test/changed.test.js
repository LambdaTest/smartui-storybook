const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const {
	selectAffectedStories, getChangedFiles, findGlobalModule, parsePorcelain, parsePackageLock, parseYarnLock,
	parsePnpmLock, changedPackages, normalizeModuleName, buildImporterGraph, walkImporters
} = require('./../commands/utils/changed');

// the shape Storybook 8 with Vite writes to preview-stats.json
const STATS = {
	modules: [
		{ name: './src/Button.stories.jsx', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/storybook-stories.js' }] },
		{ name: './src/Card.stories.jsx', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/storybook-stories.js' }] },
		{ name: './.storybook/preview.js', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/vite-app.js' }] },
		{ name: './src/Button.jsx', reasons: [{ moduleName: './src/Button.stories.jsx' }] },
		{ name: './src/Card.jsx', reasons: [{ moduleName: './src/Card.stories.jsx' }] },
		{ name: './src/button.css', reasons: [{ moduleName: './src/Button.jsx' }] },
		{ name: './src/shared.js', reasons: [{ moduleName: './src/Button.jsx' }, { moduleName: './src/Card.jsx' }] },
		{ name: './src/Theme.jsx', reasons: [{ moduleName: './.storybook/preview.js' }] },
		{ name: './node_modules/left-pad/index.js', reasons: [{ moduleName: './src/Card.jsx' }] },
		{ name: './config/sb/preview.js', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/vite-app.js' }] },
		{ name: './src/Decor.jsx', reasons: [{ moduleName: './config/sb/preview.js' }] },
		{ name: './src/annotations.js', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/vite-app.js' }] },
		{ name: './src/Intro.mdx', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/storybook-stories.js' }] },
		{ name: './src/Callout.jsx', reasons: [{ moduleName: './src/Intro.mdx' }] },
	]
};
const STORIES = {
	'button--primary': { importPath: './src/Button.stories.jsx' },
	'button--secondary': { importPath: './src/Button.stories.jsx' },
	'card--basic': { importPath: './src/Card.stories.jsx' },
	'intro--docs': { importPath: './src/Intro.mdx', type: 'docs' },
};
const STORY_IDS = ['button--primary', 'button--secondary', 'card--basic'];
const LOCK = versions => JSON.stringify({
	lockfileVersion: 3,
	packages: Object.fromEntries([['', { name: 'app' }], ...Object.entries(versions).map(([n, v]) => [`node_modules/${n}`, { version: v }])])
}, null, 2);

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (dir, ...args) => cp.execFileSync('git', args, { cwd: dir, env: ENV, stdio: 'pipe' });
const write = (dir, file, text) => {
	fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
	fs.writeFileSync(path.join(dir, file), text);
};

// a repository with one base commit; each test commits its own change on top
function fixtureRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-only-changed-'));
	['src/Button.stories.jsx', 'src/Card.stories.jsx', 'src/Button.jsx', 'src/Card.jsx', 'src/button.css', 'src/shared.js', 'src/Theme.jsx', '.storybook/preview.js', 'src/tokens.css', 'README.md',
		'config/sb/preview.js', 'src/Decor.jsx', 'src/annotations.js', 'src/Intro.mdx', 'src/Callout.jsx']
		.forEach(file => write(dir, file, '// v1\n'));
	write(dir, 'package.json', '{}\n');
	write(dir, 'package-lock.json', LOCK({ 'left-pad': '1.0.0', 'eslint': '8.0.0' }));
	write(dir, '.gitignore', 'storybook-static\n');
	write(dir, 'storybook-static/preview-stats.json', JSON.stringify(STATS));
	git(dir, 'init', '-q');
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'base');
	return dir;
}

function commitChange(dir, changes) {
	Object.entries(changes).forEach(([file, text]) => write(dir, file, text));
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'change');
}

// the fixture's base commit plays the approved baseline build
const baselineOf = dir => ({
	buildId: 'baseline-build',
	commitId: git(dir, 'rev-list', '--max-parents=0', '--abbrev-commit', 'HEAD').toString().trim(),
	branch: git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').toString().trim()
});
const select = (dir, extra = {}) => selectAffectedStories({ dirPath: path.join(dir, 'storybook-static'), stories: STORIES, storyIds: STORY_IDS, cwd: dir, baseline: baselineOf(dir), ...extra });

describe('selectAffectedStories', () => {
	let dir;
	beforeEach(() => { dir = fixtureRepo(); });
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

	test('a component change selects the stories importing it', () => {
		commitChange(dir, { 'src/Button.jsx': '// v2\n' });
		expect(select(dir)).toEqual({ storyIds: ['button--primary', 'button--secondary'], changedFiles: ['src/Button.jsx'] });
	});

	test('a shared module selects every story above it', () => {
		commitChange(dir, { 'src/shared.js': '// v2\n' });
		expect(select(dir).storyIds).toEqual(['button--primary', 'button--secondary', 'card--basic']);
	});

	test('a changed story file selects its own stories', () => {
		commitChange(dir, { 'src/Card.stories.jsx': '// v2\n' });
		expect(select(dir).storyIds).toEqual(['card--basic']);
	});

	test('allowlisted files alone affect no story', () => {
		commitChange(dir, { 'README.md': 'v2\n', '.github/workflows/ci.yml': 'on: push\n', 'src/Button.test.jsx': '// t\n' });
		expect(select(dir).storyIds).toEqual([]);
	});

	test.each([
		[{ 'src/tokens.css': '/* v2 */\n' }, /src\/tokens\.css is not in the Storybook dependency graph/],
		[{ 'src/Theme.jsx': '// v2\n' }, /^src\/Theme\.jsx reaches \.storybook\/preview\.js, which no story imports/],
		[{ 'src/Decor.jsx': '// v2\n' }, /reaches config\/sb\/preview\.js/],
		[{ 'src/annotations.js': '// v2\n' }, /reaches src\/annotations\.js/],
		[{ '.storybook/main.js': '// v2\n' }, /Storybook configuration/],
		[{ 'package.json': '{"a":1}\n' }, /package\.json changed/],
		[{ 'package-lock.json': '{ not json' }, /could not be parsed/],
	])('captures everything for %o', (changes, reason) => {
		commitChange(dir, changes);
		expect(select(dir).reason).toMatch(reason);
	});

	test('the SmartUI config file forces a full capture', () => {
		write(dir, '.smartui.json', '{}');
		commitChange(dir, { '.smartui.json': '{"storybook":{}}' });
		expect(select(dir, { configFile: path.join(dir, '.smartui.json') }).reason).toMatch(/SmartUI config file/);
	});

	test('a lockfile bump selects only stories that import the package', () => {
		commitChange(dir, { 'package-lock.json': LOCK({ 'left-pad': '1.0.1', 'eslint': '8.0.0' }) });
		expect(select(dir).storyIds).toEqual(['card--basic']);
	});

	test('a bumped package outside the graph captures everything', () => {
		commitChange(dir, { 'package-lock.json': LOCK({ 'left-pad': '1.0.0', 'eslint': '9.0.0' }) });
		expect(select(dir).reason).toMatch(/^eslint changed in package-lock\.json and is not in the Storybook dependency graph/);
	});

	test('a bumped package that only Storybook\'s entry loads captures everything', () => {
		const stats = JSON.parse(fs.readFileSync(path.join(dir, 'storybook-static/preview-stats.json')));
		stats.modules.push(
			{ name: './node_modules/renderer/index.js', reasons: [{ moduleName: './node_modules/fw/entry-preview.mjs' }] },
			{ name: './node_modules/fw/entry-preview.mjs', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/vite-app.js' }] }
		);
		write(dir, 'storybook-static/preview-stats.json', JSON.stringify(stats));
		['node_modules/renderer/index.js', 'node_modules/fw/entry-preview.mjs'].forEach(file => write(dir, file, '// pkg\n'));
		write(dir, 'package-lock.json', LOCK({ 'left-pad': '1.0.0', 'eslint': '8.0.0', renderer: '1.0.0' }));
		commitChange(dir, {});
		const baseline = { ...baselineOf(dir), commitId: git(dir, 'rev-parse', '--short', 'HEAD').toString().trim() };
		commitChange(dir, { 'package-lock.json': LOCK({ 'left-pad': '1.0.0', 'eslint': '8.0.0', renderer: '1.1.0' }) });
		expect(select(dir, { baseline }).reason).toMatch(/^renderer \(package-lock\.json\) reaches node_modules\/fw\/entry-preview\.mjs/);
	});

	test('a component used by a story the filter dropped affects nothing', () => {
		commitChange(dir, { 'src/Card.jsx': '// v2\n' });
		expect(select(dir, { storyIds: ['button--primary', 'button--secondary'] }).storyIds).toEqual([]);
	});

	test('a component used only in MDX docs affects no captured story', () => {
		commitChange(dir, { 'src/Callout.jsx': '// v2\n' });
		expect(select(dir).storyIds).toEqual([]);
	});

	test('uncommitted changes to tracked files count', () => {
		commitChange(dir, { 'README.md': 'v2\n' });
		write(dir, 'src/Card.jsx', '// local\n');
		expect(select(dir).storyIds).toEqual(['card--basic']);
	});

	test('missing stats file captures everything with the build flag to add', () => {
		fs.rmSync(path.join(dir, 'storybook-static/preview-stats.json'));
		expect(select(dir).reason).toMatch(/--stats-json/);
	});

	test('stories without importPath capture everything', () => {
		commitChange(dir, { 'src/Button.jsx': '// v2\n' });
		expect(select(dir, { stories: { 'button--primary': {} }, storyIds: ['button--primary'] }).reason).toMatch(/importPath/);
	});

	test('no baseline build captures everything', () => {
		commitChange(dir, { 'src/Card.jsx': '// v2\n' });
		expect(select(dir, { baseline: null }).reason).toMatch(/no approved baseline build/);
	});

	test('nothing changed since the baseline commit affects no story', () => {
		expect(select(dir)).toEqual({ storyIds: [], changedFiles: [] });
	});

	test('every commit since the baseline counts, not only the last one', () => {
		commitChange(dir, { 'src/Card.jsx': '// v2\n' });
		commitChange(dir, { 'README.md': 'v2\n' });
		expect(select(dir).storyIds).toEqual(['card--basic']);
	});

	test('a lockfile is compared with the baseline commit\'s version', () => {
		commitChange(dir, { 'package-lock.json': LOCK({ 'left-pad': '1.0.1', 'eslint': '8.0.0' }) });
		commitChange(dir, { 'README.md': 'v2\n' });
		expect(select(dir).storyIds).toEqual(['card--basic']);
	});

	test('a shallow clone fetches the baseline commit first', () => {
		const baseline = baselineOf(dir);
		commitChange(dir, { 'src/Card.jsx': '// v2\n' });
		commitChange(dir, { 'README.md': 'v2\n' });
		const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-only-changed-clone-'));
		try {
			git(clone, 'clone', '-q', '--depth', '1', `file://${dir}`, '.');
			write(clone, 'storybook-static/preview-stats.json', JSON.stringify(STATS));
			jest.spyOn(console, 'log').mockImplementation(() => {});
			expect(select(clone, { baseline }).storyIds).toEqual(['card--basic']);
		} finally {
			fs.rmSync(clone, { recursive: true, force: true });
		}
	});
});

describe('findGlobalModule', () => {
	test('a module reached only through story files is not global', () => {
		const importers = new Map([['a.js', new Set(['a.stories.js'])], ['a.stories.js', new Set(['/virtual:/stories.js'])]]);
		expect(findGlobalModule(['a.js'], importers, new Set(['a.stories.js']), '/')).toBeNull();
	});

	test('names the changed module that reaches the global one', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-only-changed-global-'));
		try {
			['preview.js', 'theme.js'].forEach(file => write(dir, file, '//\n'));
			const importers = new Map([['theme.js', new Set(['preview.js'])], ['preview.js', new Set(['/virtual:/entry.js'])]]);
			expect(findGlobalModule(['theme.js'], importers, new Set(), dir)).toEqual({ module: 'preview.js', start: 'theme.js' });
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('getChangedFiles', () => {
	const BASELINE = { buildId: 'b1', commitId: 'abc1234', branch: 'main' };

	test('outside a git repository', () => {
		expect(getChangedFiles('/', BASELINE, () => null).reason).toMatch(/not a git repository/);
	});

	test('a baseline commit that cannot be fetched', () => {
		jest.spyOn(console, 'log').mockImplementation(() => {});
		const run = args => {
			if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
			if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') return 'true\n';
			if (args[0] === 'rev-parse') return null;
			return '';
		};
		expect(getChangedFiles('/repo', BASELINE, run).reason).toMatch(/abc1234 is not in this clone\. Use fetch-depth: 0/);
	});

	test('the baseline fetch cannot prompt for credentials, has a timeout and stays shallow only in a shallow clone', () => {
		jest.spyOn(console, 'log').mockImplementation(() => {});
		const fetches = [];
		const runWith = shallow => (args, cwd, options) => {
			if (args[0] === 'fetch') fetches.push({ args, options });
			if (args[1] === '--show-toplevel') return '/repo\n';
			if (args[1] === '--is-shallow-repository') return `${shallow}\n`;
			return args[0] === 'rev-parse' ? null : '';
		};
		getChangedFiles('/repo', BASELINE, runWith(true));
		getChangedFiles('/repo', BASELINE, runWith(false));
		expect(fetches[0].options.timeout).toBeGreaterThan(0);
		expect(fetches[0].options.env.GIT_TERMINAL_PROMPT).toBe('0');
		expect(fetches[0].args).toEqual(expect.arrayContaining(['--depth=500', 'origin', 'main']));
		expect(fetches[1].args.some(arg => arg.startsWith('--depth'))).toBe(false);
	});
});

describe('parsePorcelain', () => {
	test('reads modified paths and both sides of a rename', () => {
		expect(parsePorcelain(' M src/a.js\0R  src/new.js\0src/old.js\0')).toEqual(['src/a.js', 'src/new.js', 'src/old.js']);
	});
});

describe('lockfile parsers', () => {
	test('package-lock v3 uses the innermost package name', () => {
		const versions = parsePackageLock(JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/a': { version: '1.0.0' }, 'node_modules/a/node_modules/@s/b': { version: '2.0.0' } } }));
		expect([...versions.keys()]).toEqual(['a', '@s/b']);
	});

	test('package-lock v1 is not recognised', () => {
		expect(parsePackageLock(JSON.stringify({ lockfileVersion: 1, dependencies: {} }))).toBeNull();
	});

	test('yarn classic', () => {
		const text = '# yarn lockfile v1\n\n"@babel/core@^7.0.0", "@babel/core@^7.1.0":\n  version "7.1.0"\n  dependencies:\n    version "9"\n\nlodash@^4.17.21:\n  version "4.17.21"\n';
		expect(Object.fromEntries([...parseYarnLock(text)].map(([k, v]) => [k, [...v]]))).toEqual({ '@babel/core': ['7.1.0'], lodash: ['4.17.21'] });
	});

	test('yarn berry', () => {
		const text = '__metadata:\n  version: 6\n\n"lodash@npm:^4.17.20, lodash@npm:^4.17.21":\n  version: 4.17.21\n  resolution: "lodash@npm:4.17.21"\n';
		expect([...parseYarnLock(text).get('lodash')]).toEqual(['4.17.21']);
	});

	test('pnpm v5, v6 and v9 keys', () => {
		const v5 = 'lockfileVersion: 5.4\npackages:\n  /@babel/core/7.1.0:\n    resolution: {}\n  /react-dom/17.0.2_react@17.0.2:\n    dev: false\n';
		const v6 = "lockfileVersion: '6.0'\npackages:\n  /react-dom@18.2.0(react@18.2.0):\n    resolution: {}\n";
		const v9 = "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies: {}\npackages:\n  '@babel/core@7.24.0':\n    resolution: {}\nsnapshots:\n  react-dom@18.2.0(react@18.2.0):\n    dependencies: {}\n";
		expect(Object.fromEntries([...parsePnpmLock(v5)].map(([k, v]) => [k, [...v]]))).toEqual({ '@babel/core': ['7.1.0'], 'react-dom': ['17.0.2'] });
		expect([...parsePnpmLock(v6).get('react-dom')]).toEqual(['18.2.0']);
		expect([...parsePnpmLock(v9).keys()]).toEqual(['@babel/core', 'react-dom']);
	});

	test('changedPackages reports bumps, additions and removals', () => {
		const before = new Map([['a', new Set(['1'])], ['b', new Set(['1'])], ['c', new Set(['1'])]]);
		const after = new Map([['a', new Set(['1'])], ['b', new Set(['2'])], ['d', new Set(['1'])]]);
		expect([...changedPackages(before, after)].sort()).toEqual(['b', 'c', 'd']);
	});
});

describe('webpack stats', () => {
	test('module names drop loaders, queries and concatenation suffixes', () => {
		expect(normalizeModuleName('./node_modules/css-loader/dist/cjs.js!./src/button.css')).toBe('src/button.css');
		expect(normalizeModuleName('./src/index.js + 3 modules')).toBe('src/index.js');
		expect(normalizeModuleName('./src/icon.svg?react')).toBe('src/icon.svg');
		expect(normalizeModuleName('../shared/x.ts')).toBe('../shared/x.ts');
	});

	test('concatenated modules keep their own importers', () => {
		const importers = buildImporterGraph({ modules: [
			{ name: './src/A.stories.js + 1 modules', reasons: [], modules: [
				{ name: './src/A.js', reasons: [{ moduleName: './src/A.stories.js + 1 modules' }] }
			] }
		] });
		expect([...walkImporters(['src/A.js'], importers)]).toEqual(['src/A.js', 'src/A.stories.js']);
	});
});
