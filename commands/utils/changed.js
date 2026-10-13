const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const STATS_FILE = 'preview-stats.json';
const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

// changed files that never force a full capture when the dependency graph doesn't know them
const ALLOWLIST = [
    /\.md$/i,
    /^\.github\//,
    /^\.gitlab-ci\.yml$/,
    /^\.circleci\//,
    /(^|\/)azure-pipelines\.yml$/,
    /(^|\/)Jenkinsfile$/,
    /\.(test|spec)\.[^/]+$/,
    /(^|\/)__tests__\//
];

const PREVIEW_PATTERN = /^\.storybook\/preview\.[^/]+$/;

// null when git fails or is missing, so callers can tell a failure from empty output
function runGit(args, cwd) {
    try {
        return cp.execFileSync('git', args, {
            cwd: cwd,
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf-8',
            maxBuffer: 256 * 1024 * 1024
        });
    } catch (error) {
        return null;
    }
}

function toPosix(p) {
    return p.split(path.sep).join('/');
}

function splitNul(output) {
    return (output || '').split('\0').filter(Boolean);
}

// tracked files changed in the working tree; untracked files only matter once a tracked file imports them
function parsePorcelain(output) {
    const files = [];
    const entries = splitNul(output);
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        files.push(entry.slice(3));
        // a rename or copy is followed by its original path
        if (entry[0] === 'R' || entry[0] === 'C') {
            files.push(entries[++i]);
        }
    }
    return files.filter(Boolean);
}

// Files changed by the last commit (HEAD~1..HEAD) plus uncommitted tracked changes, relative to the repository root.
function getChangedFiles(cwd, run = runGit) {
    const top = run(['rev-parse', '--show-toplevel'], cwd);
    if (top === null) {
        return { reason: 'not a git repository, or git is not installed' };
    }
    const repoRoot = top.trim();
    const hasParent = () => run(['rev-parse', '--verify', '--quiet', 'HEAD~1^{commit}'], cwd) !== null;

    if (!hasParent()) {
        const shallow = (run(['rev-parse', '--is-shallow-repository'], cwd) || '').trim() === 'true';
        if (!shallow) {
            return { reason: 'the last commit has no parent commit to diff against' };
        }
        console.log('[smartui] --only-changed: shallow clone, fetching the parent commit (git fetch --deepen=1)');
        run(['fetch', '--deepen=1', '--quiet'], cwd);
        if (!hasParent()) {
            return { reason: 'could not fetch the parent of the last commit in this shallow clone. Use fetch-depth: 2 or more in the CI checkout' };
        }
    }

    const diff = run(['diff', '--name-only', '-z', 'HEAD~1', 'HEAD'], cwd);
    if (diff === null) {
        return { reason: 'git diff HEAD~1 HEAD failed' };
    }
    const status = run(['status', '--porcelain', '-z', '--untracked-files=no'], cwd);
    const files = new Set([...splitNul(diff), ...parsePorcelain(status)]);
    return { repoRoot, files: [...files] };
}

function addVersion(map, name, version) {
    if (!name) return;
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(String(version || ''));
}

// package-lock.json v2/v3; v1 has no `packages` map and is reported as unrecognised
function parsePackageLock(text) {
    let json;
    try {
        json = JSON.parse(text);
    } catch (error) {
        return null;
    }
    if (!json || !json.packages || typeof json.packages !== 'object') return null;
    const versions = new Map();
    for (const [key, entry] of Object.entries(json.packages)) {
        const i = key.lastIndexOf('node_modules/');
        if (i === -1) continue;
        addVersion(versions, key.slice(i + 'node_modules/'.length), (entry && (entry.version || entry.resolved)) || '');
    }
    return versions;
}

// "@scope/name@^1.0.0" or "name@npm:^1.0.0" -> package name
function yarnSpecName(spec) {
    const at = spec.indexOf('@', 1);
    return at === -1 ? spec : spec.slice(0, at);
}

// yarn.lock, classic (version "1.0.0") and berry (version: 1.0.0)
function parseYarnLock(text) {
    const versions = new Map();
    let names = null;
    let found = false;
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || line.startsWith('#')) continue;
        if (!/^\s/.test(line)) {
            names = line.startsWith('__metadata') ? null : line.replace(/:\s*$/, '').split(/,\s*/)
                .map(spec => yarnSpecName(spec.trim().replace(/^"|"$/g, '')));
            continue;
        }
        const match = /^ {2}version:?\s+"?([^"\s]+)"?/.exec(line);
        if (match && names) {
            found = true;
            names.forEach(name => addVersion(versions, name, match[1]));
            names = null;
        }
    }
    return found ? versions : null;
}

// pnpm keys: v5 "/name/1.0.0_peer@1", v6 "/name@1.0.0(peer@1)", v9 "name@1.0.0(peer@1)"
function pnpmKey(key) {
    const k = key.replace(/^['"]|['"]$/g, '').replace(/^\//, '');
    const v5 = /^((?:@[^/]+\/)?[^/@]+)\/(\d[^/_(]*)/.exec(k);
    if (v5) return { name: v5[1], version: v5[2] };
    const v6 = /^((?:@[^/]+\/)?[^/@]+)@([^(]+)/.exec(k);
    if (v6) return { name: v6[1], version: v6[2] };
    return null;
}

function parsePnpmLock(text) {
    if (!/^lockfileVersion:/m.test(text)) return null;
    const versions = new Map();
    let section = null;
    for (const line of text.split(/\r?\n/)) {
        if (/^\S/.test(line)) {
            section = line.replace(/:.*$/, '');
            continue;
        }
        if (section !== 'packages' && section !== 'snapshots') continue;
        const match = /^ {2}(\S.*?):\s*$/.exec(line);
        const parsed = match && pnpmKey(match[1]);
        if (parsed) addVersion(versions, parsed.name, parsed.version);
    }
    return versions;
}

function parseLockfile(fileName, text) {
    if (typeof text !== 'string') return null;
    switch (path.posix.basename(fileName)) {
        case 'package-lock.json': return parsePackageLock(text);
        case 'yarn.lock': return parseYarnLock(text);
        case 'pnpm-lock.yaml': return parsePnpmLock(text);
        default: return null;
    }
}

// package names whose resolved versions differ between the two lockfiles
function changedPackages(before, after) {
    const changed = new Set();
    const same = (a, b) => a && b && a.size === b.size && [...a].every(v => b.has(v));
    for (const name of new Set([...before.keys(), ...after.keys()])) {
        if (!same(before.get(name), after.get(name))) changed.add(name);
    }
    return changed;
}

// stats module names as paths relative to the Storybook root: no loaders, query, "+ N modules" suffix or leading ./
function normalizeModuleName(name) {
    if (typeof name !== 'string' || name === '') return null;
    let n = name.slice(name.lastIndexOf('!') + 1);
    n = n.replace(/ \+ \d+ modules?$/, '').replace(/\?.*$/, '').replace(/\\/g, '/');
    return n.startsWith('./') ? n.slice(2) : n;
}

// module -> modules that import it, from Vite or webpack preview-stats.json
function buildImporterGraph(stats) {
    const importers = new Map();
    const visit = function (mod) {
        if (!mod || typeof mod !== 'object') return;
        const name = normalizeModuleName(mod.name || mod.id);
        if (name) {
            if (!importers.has(name)) importers.set(name, new Set());
            for (const reason of mod.reasons || []) {
                const from = normalizeModuleName(reason && reason.moduleName);
                if (from && from !== name) importers.get(name).add(from);
            }
        }
        // webpack nests concatenated modules under their root
        (mod.modules || []).forEach(visit);
    };
    ((stats && stats.modules) || []).forEach(visit);
    return importers;
}

function walkImporters(starts, importers) {
    const seen = new Set(starts);
    const queue = [...starts];
    while (queue.length) {
        const current = queue.shift();
        for (const from of importers.get(current) || []) {
            if (!seen.has(from)) {
                seen.add(from);
                queue.push(from);
            }
        }
    }
    return seen;
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (error) {
        return null;
    }
}

function realpath(p) {
    try {
        return fs.realpathSync(p);
    } catch (error) {
        return path.resolve(p);
    }
}

// Decides which of storyIds the last commit can affect. Returns { storyIds, changedFiles } or { reason } when every story must be captured.
function selectAffectedStories({ dirPath, stories, storyIds, configFile, cwd = process.cwd(), run = runGit }) {
    const statsFile = path.join(dirPath, STATS_FILE);
    if (!fs.existsSync(statsFile)) {
        return { reason: `${STATS_FILE} not found in ${dirPath}. Build Storybook with --stats-json (Storybook 7+) or --webpack-stats-json (6.4 to 6.5)` };
    }
    const stats = readJson(statsFile);
    if (!stats || !Array.isArray(stats.modules)) {
        return { reason: `${STATS_FILE} in ${dirPath} could not be read` };
    }

    const importPaths = new Map();
    for (const id of storyIds) {
        const importPath = stories[id] && normalizeModuleName(stories[id].importPath);
        if (!importPath) {
            return { reason: 'the story index has no importPath for its stories (Storybook 6.3 or older)' };
        }
        importPaths.set(id, importPath);
    }
    const storyFiles = new Set(importPaths.values());

    const changes = getChangedFiles(cwd, run);
    if (changes.reason) return { reason: changes.reason };

    const root = realpath(cwd);
    const relToRoot = file => toPosix(path.relative(root, path.join(changes.repoRoot, file)));
    const staticDir = toPosix(path.relative(root, realpath(dirPath)));
    const configPath = configFile ? toPosix(path.relative(root, realpath(configFile))) : '';
    const importers = buildImporterGraph(stats);

    const starts = new Set();
    const changedFiles = [];
    for (const file of changes.files) {
        const rel = relToRoot(file);
        // the static build is the output being captured, not a source
        if (staticDir && (rel === staticDir || rel.startsWith(staticDir + '/'))) continue;
        changedFiles.push(file);
        const base = path.posix.basename(file);

        if (configPath && rel === configPath) return { reason: `the SmartUI config file ${file} changed` };
        if (rel.startsWith('.storybook/')) return { reason: `${file} is Storybook configuration` };
        if (base === 'package.json') return { reason: `${file} changed` };
        if (LOCKFILES.includes(base)) {
            const previous = run(['show', `HEAD~1:${file}`], cwd);
            const before = previous === null ? new Map() : parseLockfile(file, previous);
            const after = parseLockfile(file, fs.existsSync(path.join(changes.repoRoot, file)) ? fs.readFileSync(path.join(changes.repoRoot, file), 'utf-8') : null);
            if (!before || !after) return { reason: `${file} changed and could not be parsed` };
            const names = changedPackages(before, after);
            for (const module of importers.keys()) {
                for (const name of names) {
                    if (module.includes(`node_modules/${name}/`)) starts.add(module);
                }
            }
            continue;
        }
        if (importers.has(rel) || storyFiles.has(rel)) {
            starts.add(rel);
            continue;
        }
        if (ALLOWLIST.some(pattern => pattern.test(file))) continue;
        return { reason: `${file} is not in the Storybook dependency graph` };
    }

    const affected = walkImporters(starts, importers);
    const preview = [...affected].find(module => PREVIEW_PATTERN.test(module));
    if (preview) return { reason: `a changed file is imported by ${preview}` };

    return {
        storyIds: storyIds.filter(id => affected.has(importPaths.get(id))),
        changedFiles: changedFiles
    };
}

// Scoped builds on the baseline branch would become the baseline once approved and drop every story they skipped.
function baselineGuardReason(branch, baselineBranch) {
    if (!branch) return 'the build has no branch. Set CURRENT_BRANCH';
    if (!baselineBranch) return 'the project baseline branch is unknown (none is set, or the SmartUI backend does not report it)';
    if (branch === baselineBranch) return `builds on the baseline branch '${baselineBranch}' always capture every story`;
    return '';
}

module.exports = {
    selectAffectedStories,
    baselineGuardReason,
    getChangedFiles,
    parsePorcelain,
    parsePackageLock,
    parseYarnLock,
    parsePnpmLock,
    changedPackages,
    normalizeModuleName,
    buildImporterGraph,
    walkImporters,
    STATS_FILE
};
