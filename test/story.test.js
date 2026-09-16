const { filterStoriesFromIndex, pickIndexFromJson, storyScreenshotName } = require('./../commands/utils/story');

const sb8Index = {
	v: 5,
	entries: {
		'example-button--docs': { id: 'example-button--docs', title: 'Example/Button', name: 'Docs', type: 'docs' },
		'example-button--primary': { id: 'example-button--primary', title: 'Example/Button', name: 'Primary', type: 'story' },
		'example-button--secondary': { id: 'example-button--secondary', title: 'Example/Button', name: 'Secondary', type: 'story' },
		'example-header--logged-in': { id: 'example-header--logged-in', title: 'Example/Header', name: 'Logged In', type: 'story' },
	}
};

const sb6Stories = {
	v: 3,
	stories: {
		'example-introduction--page': { id: 'example-introduction--page', kind: 'Example/Introduction', name: 'Page', parameters: { docsOnly: true } },
		'example-button--primary': { id: 'example-button--primary', kind: 'Example/Button', name: 'Primary', parameters: {} },
		'example-button--large': { id: 'example-button--large', kind: 'Example/Button', name: 'Large', parameters: {} },
	}
};

describe('story index helpers', () => {
	describe('pickIndexFromJson', () => {
		test('returns entries for a Storybook 7/8 index.json', () => {
			expect(pickIndexFromJson(sb8Index)).toBe(sb8Index.entries);
		});

		test('returns stories for a Storybook 6 stories.json', () => {
			expect(pickIndexFromJson(sb6Stories)).toBe(sb6Stories.stories);
		});

		test('prefers entries when both keys exist', () => {
			const both = { entries: { a: {} }, stories: { b: {} } };
			expect(pickIndexFromJson(both)).toBe(both.entries);
		});

		test('returns null for anything else', () => {
			expect(pickIndexFromJson(null)).toBeNull();
			expect(pickIndexFromJson('<html>')).toBeNull();
			expect(pickIndexFromJson({ v: 4 })).toBeNull();
		});
	});

	describe('storyScreenshotName', () => {
		test('uses kind for Storybook 6 stories', () => {
			expect(storyScreenshotName({ kind: 'Example/Button', name: 'Primary' })).toBe('Example/Button: Primary');
		});

		test('uses title for Storybook 7/8 stories', () => {
			expect(storyScreenshotName({ title: 'Example/Button', name: 'Primary' })).toBe('Example/Button: Primary');
		});

		test('falls back to the bare name', () => {
			expect(storyScreenshotName({ name: 'Primary' })).toBe('Primary');
		});
	});

	describe('filterStoriesFromIndex', () => {
		test('drops docs entries and maps names for Storybook 8', () => {
			expect(filterStoriesFromIndex(sb8Index.entries, {})).toEqual({
				storyIds: ['example-button--primary', 'example-button--secondary', 'example-header--logged-in'],
				screenshotNames: {
					'example-button--primary': 'Example/Button: Primary',
					'example-button--secondary': 'Example/Button: Secondary',
					'example-header--logged-in': 'Example/Header: Logged In',
				}
			});
		});

		test('drops docsOnly stories and maps names for Storybook 6', () => {
			expect(filterStoriesFromIndex(sb6Stories.stories, {})).toEqual({
				storyIds: ['example-button--primary', 'example-button--large'],
				screenshotNames: {
					'example-button--primary': 'Example/Button: Primary',
					'example-button--large': 'Example/Button: Large',
				}
			});
		});

		test('honours include and exclude patterns against the story name', () => {
			const included = filterStoriesFromIndex(sb8Index.entries, { include: ['/^Primary$/'] });
			expect(included.storyIds).toEqual(['example-button--primary']);

			const excluded = filterStoriesFromIndex(sb8Index.entries, { exclude: ['Logged'] });
			expect(excluded.storyIds).toEqual(['example-button--primary', 'example-button--secondary']);
		});

		test('returns empty results for an empty or missing index', () => {
			expect(filterStoriesFromIndex({}, {})).toEqual({ storyIds: [], screenshotNames: {} });
			expect(filterStoriesFromIndex(null, {})).toEqual({ storyIds: [], screenshotNames: {} });
		});
	});
});
