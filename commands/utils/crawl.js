const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');
const { httpClient } = require('./httpClient');
const { skipStory } = require('./story');
var { constants } = require('./constants');

const DEFAULT_STORY_TIMEOUT_MS = 30000;

// Dev-server plumbing that must never end up in the static copy.
const IGNORED_PATH_PATTERNS = [
    /__webpack_hmr/,
    /sockjs-node/,
    /\.hot-update\./,
    /__vite_ping/,
    /^\/@vite\//,
];

// Markers of a Vite-builder dev server. Its module graph (CSS served as JS, `?import` / `?direct`
// query variants) cannot be replayed by a plain static file server, so such servers are refused.
const VITE_MARKERS = ['/@vite/client', '/virtual:/@storybook/builder-vite', '@storybook/builder-vite'];

class StoryCaptureError extends Error {
    constructor(storyId, url, cause) {
        super(`Cannot capture story "${storyId}" (${url}): ${cause.message}`);
        this.name = 'StoryCaptureError';
        this.storyId = storyId;
        this.url = url;
        this.cause = cause;
    }
}

class CrawlUnsupportedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CrawlUnsupportedError';
    }
}

function storyReadyState(doc) {
    doc = doc || document;
    const body = doc.body;
    if (!body) return '';
    if (body.classList.contains('sb-show-errordisplay')) return 'error';
    if (body.classList.contains('sb-show-nopreview')) return 'nopreview';
    // Storybook 7/8 render into #storybook-root, 6.x into #root. Storybook un-hides the
    // root before it renders, so only child nodes prove the story actually committed.
    const root = doc.getElementById('storybook-root') || doc.getElementById('root');
    if (root && !root.hasAttribute('hidden') && root.childNodes.length > 0) return 'rendered';
    return '';
}

// Loads a story and resolves once it has rendered and settled.
// Resolves to 'rendered' | 'error' | 'nopreview' | 'timeout'; rejects if navigation or
// the post-render network settle exceeds the (shared) timeout budget.
async function waitForStoryReady(page, url, timeout = DEFAULT_STORY_TIMEOUT_MS) {
    const started = Date.now();
    const remaining = () => Math.max(1000, timeout - (Date.now() - started));

    // Not 'networkidle0': a webpack dev server (npm run storybook) keeps its hot-reload
    // EventSource (/__webpack_hmr) open for the life of the page, so Chrome's networkIdle
    // lifecycle event never fires. Wait for 'load', then for the story itself.
    await page.goto(url, { waitUntil: 'load', timeout });

    let state;
    try {
        const handle = await page.waitForFunction(storyReadyState, { polling: 100, timeout: remaining() });
        state = await handle.jsonValue();
    } catch (err) {
        // Soft: stories that render nothing into the root (return null, portal into
        // body) are still captured, as they always were.
        if (err.name !== 'TimeoutError') throw err;
        state = 'timeout';
    }

    // Settle whatever the render kicked off (lazy chunks, images, XHR). Puppeteer's own
    // counter only tracks requests still waiting for response headers, so an open
    // EventSource stream does not count and WebSockets are never tracked.
    await page.waitForNetworkIdle({ idleTime: 500, timeout: remaining() });
    return state;
}

function warnOnStoryState(storyId, url, state, timeout) {
    switch (state) {
        case 'error':
            console.log(`[smartui] Warning: story "${storyId}" threw while rendering; capturing Storybook's error display. ${url}`);
            break;
        case 'nopreview':
            console.log(`[smartui] Warning: Storybook showed no preview for "${storyId}" (docs-only or missing story); capturing as-is. ${url}`);
            break;
        case 'timeout':
            console.log(`[smartui] Warning: story root for "${storyId}" did not populate within ${timeout}ms; capturing current DOM. ${url}`);
            break;
        default:
            break;
    }
}

// Maps a captured URL to the relative file path it is served from once the copy is static.
// The query string is dropped because static servers (and the renderer's) ignore it.
function pathnameToFile(urlString) {
    const url = new URL(urlString);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    return pathname.replace(/^\/+/, '');
}

// Decides whether a response belongs in the static copy.
function shouldCapture(responseUrl, status, origin) {
    let url;
    try { url = new URL(responseUrl); } catch (err) { return false; }
    if (url.origin !== origin) return false;
    if (status !== 200) return false;
    return !IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

function isViteServer(iframeHtml) {
    return VITE_MARKERS.some((marker) => iframeHtml.includes(marker));
}

async function fetchOptional(url) {
    try {
        const response = await httpClient.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    } catch (err) {
        if (err.response && err.response.status === 404) return null;
        throw err;
    }
}

function countFiles(dir) {
    let count = 0;
    let bytes = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const nested = countFiles(full);
            count += nested.count;
            bytes += nested.bytes;
        } else {
            count += 1;
            bytes += fs.statSync(full).size;
        }
    }
    return { count, bytes };
}

function writeFile(dir, relativePath, body) {
    const file = path.join(dir, relativePath);
    if (!file.startsWith(dir + path.sep) && file !== dir) {
        throw new Error(`Refusing to write outside the capture directory: ${relativePath}`);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
}

// Captures a running Storybook into a directory laid out like `storybook build` output, so it can
// be uploaded through the static-build flow. Returns the directory; the caller removes it.
async function captureStaticFromUrl(storybookUrl, storybookConfig) {
    const origin = new URL(storybookUrl).origin;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartui-storybook-'));

    try {
        // Story index: index.json (Storybook 7+) or stories.json (6.x). The renderer reads either.
        let stories;
        for (const [file, key] of [['index.json', 'entries'], ['stories.json', 'stories']]) {
            const body = await fetchOptional(new URL(file, storybookUrl).href);
            if (!body) continue;
            const parsed = JSON.parse(body.toString());
            if (!parsed[key]) continue;
            writeFile(dir, file, body);
            stories = parsed[key];
            break;
        }
        if (!stories) {
            throw new CrawlUnsupportedError('Storybook did not serve index.json or stories.json. Storybook 6.x needs the `buildStoriesJson` feature enabled.');
        }

        const projectJson = await fetchOptional(new URL('project.json', storybookUrl).href);
        if (projectJson) writeFile(dir, 'project.json', projectJson);

        const iframeHtml = await fetchOptional(new URL('iframe.html', storybookUrl).href);
        if (!iframeHtml) {
            throw new CrawlUnsupportedError('Storybook did not serve iframe.html.');
        }
        if (isViteServer(iframeHtml.toString())) {
            throw new CrawlUnsupportedError('This Storybook is served by the Vite dev server, which cannot be captured as a static build. Run `storybook build` and pass the output directory instead: smartui storybook ./storybook-static');
        }
        writeFile(dir, 'iframe.html', iframeHtml);

        const storyList = {};
        for (const [storyId, storyInfo] of Object.entries(stories)) {
            if (!skipStory(storyInfo, storybookConfig)) {
                storyList[storyId] = new URL('/iframe.html?id=' + storyId + '&viewMode=story', storybookUrl).href;
            }
        }
        // filterStories() reports the count once the copy is uploaded; only the empty case is fatal here.
        if (Object.keys(storyList).length === 0) {
            console.log('[smartui] Error: No stories found');
            process.exit(constants.ERROR_CATCHALL);
        }

        const captured = new Map();
        let pending = [];
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        try {
            const page = await browser.newPage();
            page.on('response', (response) => {
                if (!shouldCapture(response.url(), response.status(), origin)) return;
                const file = pathnameToFile(response.url());
                if (captured.has(file)) return;
                captured.set(file, null);
                pending.push(
                    response.buffer()
                        .then((body) => { captured.set(file, body); })
                        .catch(() => { captured.delete(file); })
                );
            });

            for (const [storyId, url] of Object.entries(storyList)) {
                try {
                    const state = await waitForStoryReady(page, url, DEFAULT_STORY_TIMEOUT_MS);
                    warnOnStoryState(storyId, url, state, DEFAULT_STORY_TIMEOUT_MS);
                } catch (err) {
                    throw new StoryCaptureError(storyId, url, err);
                }
                // Bodies are disposed when the page navigates away; drain before the next story.
                await Promise.allSettled(pending);
                pending = [];
            }
            await Promise.allSettled(pending);
        } finally {
            // Always release Chrome; a leaked browser keeps the Node process alive after a failure.
            await browser.close();
        }

        for (const [file, body] of captured) {
            if (body) writeFile(dir, file, body);
        }
        const { count, bytes } = countFiles(dir);
        console.log(`[smartui] Captured ${count} files (${(bytes / (1024 * 1024)).toFixed(1)} MB) from ${storybookUrl}`);
        return dir;
    } catch (err) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw err;
    }
}

module.exports = {
    captureStaticFromUrl,
    StoryCaptureError,
    CrawlUnsupportedError,
    // exported for tests
    shouldCapture,
    pathnameToFile,
    isViteServer,
    storyReadyState,
};
