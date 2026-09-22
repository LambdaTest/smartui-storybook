const { buildRenderPayload, toDownloadKey, toRenderBaseURL } = require('./../commands/storybook');

const git = {
	branch: 'main',
	baselineBranch: '',
	commitId: 'abc1234',
	commitAuthor: 'dev',
	commitMessage: 'msg',
	githubURL: '',
};

const baseConfig = {
	browsers: ['Chrome', 'firefox'],
	resolutions: [[1920, 1080], [1280, 0]],
	waitForTimeout: 0,
	customViewports: [],
};

describe('render payload', () => {
	const savedToken = process.env.PROJECT_TOKEN;
	beforeAll(() => { process.env.PROJECT_TOKEN = 'token-123'; });
	afterAll(() => { process.env.PROJECT_TOKEN = savedToken; });

	test.each([
		['http://localhost:6006/', 'http://localhost:6006/'],
		['http://localhost:6006', 'http://localhost:6006/'],
		['https://host/storybook/', 'https://host/storybook/'],
		['https://host/storybook', 'https://host/storybook/'],
	])('toRenderBaseURL(%s) -> %s', (input, expected) => {
		expect(toRenderBaseURL(input)).toBe(expected);
	});

	test('toDownloadKey extracts the S3 object key from the presigned URL', () => {
		const url = 'https://bucket.s3.amazonaws.com/org-1/2/static-builds/abc.zip?X-Amz-Signature=sig';
		expect(toDownloadKey(url)).toBe('org-1/2/static-builds/abc.zip');
	});

	test('static build payload has upload source and no screenshotNames key', () => {
		const payload = buildRenderPayload({
			storybookConfig: baseConfig,
			storyIds: ['a--b'],
			source: { downloadURL: 'org-1/2/static-builds/abc.zip', uploadId: 'abc' },
			git,
			buildName: '',
			tunnel: {},
			maxStories: 100,
		});

		expect(payload).toEqual({
			downloadURL: 'org-1/2/static-builds/abc.zip',
			uploadId: 'abc',
			projectToken: 'token-123',
			storybookConfig: {
				browsers: ['chrome', 'firefox'],
				resolutions: [{ width: 1920, height: 1080 }, { width: 1280, height: 0 }],
				storyIds: ['a--b'],
				waitForTimeout: 0,
				customViewports: [],
				useOnlyCustomViewports: undefined,
				lazyLoadedStories: [],
				useGlobals: true,
				backgroundTheme: 'light',
			},
			git,
			buildName: '',
			tunnel: {},
			maxStories: 100,
		});
		expect(Object.keys(payload.storybookConfig)).not.toContain('screenshotNames');
	});

	test('url payload has an empty source, screenshotNames and an auto tunnel', () => {
		const payload = buildRenderPayload({
			storybookConfig: baseConfig,
			storyIds: ['a--b'],
			screenshotNames: { 'a--b': 'A: B' },
			source: { downloadURL: '', uploadId: '' },
			git,
			buildName: 'nightly',
			tunnel: { type: 'auto', tunnelName: 'smartui-storybook-tunnel-1234567', user: 'u', key: 'k', baseURL: 'http://localhost:6006/' },
			maxStories: 50,
		});

		expect(payload.downloadURL).toBe('');
		expect(payload.uploadId).toBe('');
		expect(payload.storybookConfig.screenshotNames).toEqual({ 'a--b': 'A: B' });
		expect(payload.tunnel.type).toBe('auto');
		expect(payload.tunnel.baseURL).toBe('http://localhost:6006/');
		expect(payload.buildName).toBe('nightly');
		expect(payload.maxStories).toBe(50);
	});

	test.each([
		[{}, true, 'light'],
		[{ backgroundTheme: 'Dark' }, true, 'dark'],
		[{ backgroundTheme: 'light' }, true, 'light'],
		[{ backgroundTheme: 'dark', useGlobals: true }, true, 'light'],
		[{ backgroundTheme: 'sepia' }, false, 'sepia'],
	])('useGlobals/backgroundTheme for config %j', (extra, useGlobals, backgroundTheme) => {
		const payload = buildRenderPayload({
			storybookConfig: { ...baseConfig, ...extra },
			storyIds: ['a--b'],
			source: { downloadURL: 'k', uploadId: 'u' },
			git,
			buildName: '',
			tunnel: {},
			maxStories: 100,
		});
		expect(payload.storybookConfig.useGlobals).toBe(useGlobals);
		expect(payload.storybookConfig.backgroundTheme).toBe(backgroundTheme);
	});

	test('falls back to viewports and passes lazyLoadedStories through', () => {
		const payload = buildRenderPayload({
			storybookConfig: { browsers: ['safari'], viewports: [[360, 640]], lazyLoadedStories: ['x--y'] },
			storyIds: ['x--y'],
			source: { downloadURL: 'k', uploadId: 'u' },
			git,
			buildName: '',
			tunnel: {},
			maxStories: 100,
		});
		expect(payload.storybookConfig.resolutions).toEqual([{ width: 360, height: 640 }]);
		expect(payload.storybookConfig.lazyLoadedStories).toEqual(['x--y']);
	});
});
