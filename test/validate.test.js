const { ValidationError, pickCredentials, normalizeStorybookUrl, isStorybookUrl } = require('./../commands/utils/validate');

describe('tunnel credentials', () => {
	test('options win over the environment', () => {
		expect(pickCredentials({ userName: 'flag-user', accessKey: 'flag-key' }, { LT_USERNAME: 'env-user', LT_ACCESS_KEY: 'env-key' }))
			.toEqual({ user: 'flag-user', key: 'flag-key' });
	});

	test('falls back to the environment per field', () => {
		expect(pickCredentials({ userName: 'flag-user' }, { LT_USERNAME: 'env-user', LT_ACCESS_KEY: 'env-key' }))
			.toEqual({ user: 'flag-user', key: 'env-key' });
		expect(pickCredentials({}, { LT_USERNAME: 'env-user', LT_ACCESS_KEY: 'env-key' }))
			.toEqual({ user: 'env-user', key: 'env-key' });
	});

	test('returns null when either value is missing', () => {
		expect(pickCredentials({}, {})).toBeNull();
		expect(pickCredentials({ userName: 'u' }, {})).toBeNull();
		expect(pickCredentials({}, { LT_ACCESS_KEY: 'k' })).toBeNull();
	});
});

describe('normalizeStorybookUrl', () => {
	test.each([
		['http://localhost:6006', 'http://localhost:6006/'],
		['http://localhost:6006/', 'http://localhost:6006/'],
		['http://localhost:6006/?path=/story/example-button--primary', 'http://localhost:6006/'],
		['https://host/storybook', 'https://host/storybook/'],
		['https://host/storybook/#fragment', 'https://host/storybook/'],
		['https://host/storybook/iframe.html?id=x', 'https://host/storybook/'],
		['https://host/storybook/index.html', 'https://host/storybook/'],
	])('%s -> %s', (input, expected) => {
		expect(normalizeStorybookUrl(input)).toBe(expected);
	});

	test('rejects non-http schemes and garbage', () => {
		expect(() => normalizeStorybookUrl('ftp://host/storybook')).toThrow(ValidationError);
		expect(() => normalizeStorybookUrl('not a url')).toThrow(ValidationError);
	});
});

describe('isStorybookUrl', () => {
	test.each([
		'http://localhost:6006',
		'HTTPS://storybook.example.com/sb',
		'localhost:6006',
		'localhost',
		'127.0.0.1:6006/',
		'[::1]:6006',
		'my-app.localhost',
		'storybook.internal:8080/ui',
	])('%s is a url', (input) => {
		expect(isStorybookUrl(input)).toBe(true);
	});

	test.each([
		'./storybook-static',
		'storybook-static',
		'/tmp/build',
		'C:\\builds\\storybook-static',
		'',
	])('%s is not a url', (input) => {
		expect(isStorybookUrl(input)).toBe(false);
	});

	test('an existing path wins over a host-looking name', () => {
		// the repo's own test directory exists on disk
		expect(isStorybookUrl('test')).toBe(false);
	});
});

describe('normalizeStorybookUrl without a scheme', () => {
	test.each([
		['localhost:6006', 'http://localhost:6006/'],
		['127.0.0.1:6006/sb', 'http://127.0.0.1:6006/sb/'],
		['storybook.internal:8080/ui?path=/x', 'http://storybook.internal:8080/ui/'],
	])('%s -> %s', (input, expected) => {
		expect(normalizeStorybookUrl(input)).toBe(expected);
	});
});
