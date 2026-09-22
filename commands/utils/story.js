// Returns true or false if the story should be skipped based on include and exclude config
function skipStory(story, config) {
	// skip story if it's docs for version 7
	if (story.parameters && story.parameters.docsOnly) {
		return true;
	}

	// skip story if it's docs for version 8
	if(story.type && story.type === 'docs'){
		return true;
	}

    let matches = regexp => {
		if (typeof regexp === 'string') {
			let [, parsed, flags] = /^\/(.+)\/(\w+)?$/.exec(regexp) || [];
			regexp = new RegExp(parsed ?? regexp, flags);
		}
  
      	return regexp?.test?.(story.name);
    };
  
    let include = [].concat(config?.include).filter(Boolean);
    let exclude = [].concat(config?.exclude).filter(Boolean);

    let skip = include?.length ? !include.some(matches) : false;
    if (!skip && !exclude?.some(matches)) return false;
    return true;
};

// Screenshot name for a story, in the exact format the rendering service uses:
// "<kind|title>: <name>" when a kind/title exists, otherwise just the name.
function storyScreenshotName(story) {
	const kind = story.kind || story.title;
	return kind ? `${kind}: ${story.name}` : story.name;
}

// Pick the story map out of a parsed Storybook index file.
// Storybook 7/8 `index.json` uses `entries`; Storybook 6 `stories.json` uses `stories`.
function pickIndexFromJson(parsed) {
	if (!parsed || typeof parsed !== 'object') {
		return null;
	}
	if (parsed.entries && typeof parsed.entries === 'object') {
		return parsed.entries;
	}
	if (parsed.stories && typeof parsed.stories === 'object') {
		return parsed.stories;
	}
	return null;
}

// Apply include/exclude/docs filtering to a story map and return the ids to render
// together with their screenshot names. Pure: no logging, no process.exit.
function filterStoriesFromIndex(storiesObject, storybookConfig) {
	let storyIds = [];
	let screenshotNames = {};
	for (const [storyId, storyInfo] of Object.entries(storiesObject || {})) {
		if (skipStory(storyInfo, storybookConfig)) {
			continue;
		}
		storyIds.push(storyId);
		screenshotNames[storyId] = storyScreenshotName(storyInfo);
	}
	return { storyIds, screenshotNames };
}

module.exports = { skipStory, storyScreenshotName, pickIndexFromJson, filterStoriesFromIndex };
