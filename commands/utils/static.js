const fs = require('fs');
const { httpClient } = require('./httpClient');
const archiver = require('archiver');
var { constants } = require('./constants');
const { pickIndexFromJson, filterStoriesFromIndex } = require('./story');

function getSignedUrl(options) {
    return httpClient.get(new URL(constants[options.env].GET_SIGNED_URL_PATH, constants[options.env].BASE_URL).href, {
        headers: {
            projectToken: process.env.PROJECT_TOKEN
        }});
}

async function compress(dirPath, uploadId) {
	return new Promise(function (resolve, reject) {
		// create a file to stream archive data to.
		const output = fs.createWriteStream('storybook-static.zip', {autoClose: true, emitClose: false});
		const archive = archiver('zip', {
		zlib: { level: 9 } // Sets the compression level.
		});

		output.on('end', function() {
			console.log('Data has been drained');
		});

		output.on('finish', function() {
			resolve();
		});

		// Catch warnings (ie stat failures and other non-blocking errors)
		archive.on('warning', function(err) {
		if (err.code === 'ENOENT') {
			console.log('Warning: ', err)
		} else {
			reject(err)
		}
		});

		// Catch errors
		archive.on('error', function(err) {
			reject(err);
		});

		// pipe archive data to the file
		archive.pipe(output);
		// append files from a sub-directory and naming it `new-subdir` within the archive
		archive.directory(dirPath, uploadId);
		archive.finalize();
	});
}

function reportStoriesFound(storyIds) {
	if (storyIds.length === 0) {
		console.log('[smartui] Error: No stories found');
		process.exit(constants.ERROR_CATCHALL);
	}
	console.log('[smartui] Stories found: ', storyIds.length);
	console.log('[smartui] Number of stories rendered may differ based on the config file.');
}

// Static build directory: read the story index from disk and return the ids to render.
function filterStories(dirPath, storybookConfig) {
	let stories = []
	if (fs.existsSync((`${dirPath}/stories.json`))){
		stories = JSON.parse(fs.readFileSync(`${dirPath}/stories.json`)).stories;
	} else if(fs.existsSync((`${dirPath}/index.json`))){
		stories = JSON.parse(fs.readFileSync(`${dirPath}/index.json`)).entries;
	}

	const { storyIds } = filterStoriesFromIndex(stories, storybookConfig);
	reportStoriesFound(storyIds);

	return storyIds
}

// Hosted / local Storybook URL: fetch the story index over HTTP and return the ids to
// render together with their screenshot names (the renderer has no static build to read).
async function fetchStoriesFromUrl(baseURL, storybookConfig) {
	let stories = null;
	for (const file of ['index.json', 'stories.json']) {
		const indexUrl = new URL(file, baseURL).href;
		let response;
		try {
			response = await httpClient.get(indexUrl, { responseType: 'json' });
		} catch (error) {
			if (error.response && error.response.status === 404) {
				continue;
			}
			console.log(`[smartui] Cannot fetch stories from ${indexUrl}. Error: ${error.message}`);
			process.exit(constants.ERROR_CATCHALL);
		}
		let parsed = response.data;
		if (typeof parsed === 'string') {
			try {
				parsed = JSON.parse(parsed);
			} catch (error) {
				parsed = null;
			}
		}
		stories = pickIndexFromJson(parsed);
		if (stories) {
			break;
		}
	}
	if (!stories) {
		console.log('[smartui] Error: Storybook did not serve index.json or stories.json. Storybook 6.x needs `features.buildStoriesJson` enabled.');
		process.exit(constants.ERROR_CATCHALL);
	}

	const { storyIds, screenshotNames } = filterStoriesFromIndex(stories, storybookConfig);
	reportStoriesFound(storyIds);

	return { storyIds, screenshotNames };
}

module.exports = { getSignedUrl, compress, filterStories, fetchStoriesFromUrl };
