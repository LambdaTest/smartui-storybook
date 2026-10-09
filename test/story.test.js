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

		test('a field prefix picks title, id or path instead of the name', () => {
			expect(filterStoriesFromIndex(sb8Index.entries, { include: ['title:Example/Button'] }).storyIds)
				.toEqual(['example-button--primary', 'example-button--secondary']);
			expect(filterStoriesFromIndex(sb8Index.entries, { include: ['id:/^example-header--/'] }).storyIds)
				.toEqual(['example-header--logged-in']);
			expect(filterStoriesFromIndex(sb8Index.entries, { include: ['path:Example/Button/Secondary'] }).storyIds)
				.toEqual(['example-button--secondary']);
			expect(filterStoriesFromIndex(sb8Index.entries, { exclude: ['title:/Header$/'] }).storyIds)
				.toEqual(['example-button--primary', 'example-button--secondary']);
		});

		test('name: is the explicit form of an unprefixed pattern', () => {
			expect(filterStoriesFromIndex(sb8Index.entries, { include: ['name:Primary'] }).storyIds)
				.toEqual(filterStoriesFromIndex(sb8Index.entries, { include: ['Primary'] }).storyIds);
		});

		test('unprefixed patterns still test only the name', () => {
			// "Button" is in every Button title but in no story name
			expect(filterStoriesFromIndex(sb8Index.entries, { include: ['Button'] }).storyIds).toEqual([]);
		});

		test('other colons and /regex/ patterns are not read as a prefix', () => {
			const index = {
				'a--state': { id: 'a--state', title: 'A', name: 'State: Active', type: 'story' },
				'a--title': { id: 'a--title', title: 'A', name: 'title:Intro', type: 'story' },
			};
			expect(filterStoriesFromIndex(index, { include: ['State: Active'] }).storyIds).toEqual(['a--state']);
			expect(filterStoriesFromIndex(index, { include: ['/^title:Intro$/'] }).storyIds).toEqual(['a--title']);
			expect(filterStoriesFromIndex(index, { include: ['name:title:Intro'] }).storyIds).toEqual(['a--title']);
		});

		test('Storybook 6 kind is used as the title', () => {
			expect(filterStoriesFromIndex(sb6Stories.stories, { include: ['title:Example/Button', 'path:/Large$/'] }).storyIds)
				.toEqual(['example-button--primary', 'example-button--large']);
		});

		test('returns empty results for an empty or missing index', () => {
			expect(filterStoriesFromIndex({}, {})).toEqual({ storyIds: [], screenshotNames: {} });
			expect(filterStoriesFromIndex(null, {})).toEqual({ storyIds: [], screenshotNames: {} });
		});
	});
});
