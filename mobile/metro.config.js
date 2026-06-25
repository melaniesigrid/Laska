// Metro config — makes the SHARED engine (../src) and protocol types
// (../server/src/net/protocol.ts) resolvable from the mobile app, so they are
// bundled directly instead of copied. See ../MOBILE.md.
//
// VERIFY against current Expo Metro docs for the installed SDK; the
// getDefaultConfig signature is stable but resolver fields occasionally move.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..'); // Laska/

const config = getDefaultConfig(projectRoot);

// 1. Watch the repo root so changes in ../src and ../server are picked up.
config.watchFolders = [repoRoot];

// 2. Resolve modules from both the app's and the repo root's node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];

// The shared engine uses explicit `.ts` extensions in its relative imports
// (e.g. `from './rules.ts'`). Metro resolves a literal path that exists on disk,
// so these work as-is. `sourceExts` already includes ts/tsx by default. If a
// future Metro version stops resolving explicit `.ts` imports, add a thin
// re-export shim in src/engine/ instead of rewriting the engine.

module.exports = config;
