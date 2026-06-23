#!/usr/bin/env node
// validate-charter.mjs — deterministic gate for Laska agent charters.
//
// The whole "agents that draft agents" idea rests on one invariant: every file has
// exactly ONE owner. A self-authored charter that claims a file another agent already
// owns would put two agents on the same seam overnight. That is checkable mechanically,
// so this script turns "is this charter ok?" into an exit code, not a judgment call.
//
// Usage:
//   node validate-charter.mjs <path-to-charter.md>   strict check of one candidate
//   node validate-charter.mjs --roster               cross-checks every live charter
//
// Exit 0 = no hard failures. Exit 1 = at least one. Warnings never fail the build.
//
// Hard failures (errors):  ownership overlap · duplicate name · (strict) missing
//                          frontmatter field · (strict) missing required section.
// Advisory (warnings):     no declared ownership · touches the sacred engine dir ·
//                          verify-loop references an undefined npm script.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(AGENTS_DIR, '..', '..');

// Headings every factory-drafted charter must carry (matched exactly, case-sensitive).
const REQUIRED_SECTIONS = ['Files you own', 'Off-limits', 'Guardrails', 'Verify loop', 'Golden path'];

// Files in the agents dir that are not charters and are never validated/owned.
// (The template is TEMPLATE.txt — a non-.md so the agent loader can't register it as a
// phantom agent — and listCharterFiles only scans .md, so it is excluded automatically.)
const NON_CHARTERS = new Set(['README.md']);

// The engine is sacred — owning anything under it is allowed only with engine-engineer
// review. We warn rather than fail, because new engine-adjacent files are sometimes valid.
// Compared after normalization (leading "Laska/" stripped), so this is "src/", not "Laska/src/".
const RESERVED_PREFIXES = ['src/'];

// package.json files whose "scripts" make a verify-loop command "real".
const PACKAGE_JSONS = ['Laska/package.json', 'Laska/web/package.json', 'Laska/server/package.json'];

function listCharterFiles() {
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md') && !NON_CHARTERS.has(f))
    .map((f) => join(AGENTS_DIR, f));
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return fm;
}

// Body of a "## <heading>" section, up to the next "## " heading (or end of file).
function sectionBody(text, heading) {
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b.*$`, 'm');
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^##\s+/m);
  return next === -1 ? rest : rest.slice(0, next);
}

// Owned paths follow the house convention: a DECLARATION bullet leads with a backticked
// path, and the owned path(s) sit before the " — " description separator. Prose bullets
// (those not starting with a backtick) are scope narration, not exclusive ownership, so
// they contribute nothing. Leading "Laska/" is stripped so paths from different charters
// compare on equal footing.
function normalize(p) {
  return p.replace(/^Laska\//, '');
}
function extractPaths(chunk) {
  if (!chunk) return [];
  const out = [];
  for (const raw of chunk.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('- `')) continue; // only declaration bullets
    const lead = line.split(/\s[—–]\s|\s-\s/)[0]; // owned paths precede the description
    for (const m of lead.matchAll(/`([^`]+)`/g)) {
      const tok = m[1].trim().replace(/[.,;:]+$/, '');
      if (tok.includes('<') || tok.includes('>')) continue; // template placeholder
      if (tok.includes('/') || /\.\w+$/.test(tok)) out.push(normalize(tok));
    }
  }
  return out;
}

// Two ownership paths conflict if equal, or one is a directory-ancestor of the other.
function pathsConflict(a, b) {
  if (a === b) return true;
  const ad = a.endsWith('/') ? a : a + '/';
  const bd = b.endsWith('/') ? b : b + '/';
  return b.startsWith(ad) || a.startsWith(bd);
}

// All ownership claims declared across the given charters: [{ owner, path }].
function buildOwnershipMap(charterPaths) {
  const claims = [];
  for (const cp of charterPaths) {
    const text = readFileSync(cp, 'utf8');
    const fm = parseFrontmatter(text);
    const owner = (fm && fm.name) || basename(cp, '.md');
    for (const p of extractPaths(sectionBody(text, 'Files you own'))) claims.push({ owner, path: p });
  }
  return claims;
}

function loadAllScripts() {
  const set = new Set();
  for (const rel of PACKAGE_JSONS) {
    try {
      const j = JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'));
      for (const k of Object.keys(j.scripts || {})) set.add(k);
    } catch { /* package not present — skip */ }
  }
  return set;
}

function validateOne(candidatePath, { strict }) {
  const errors = [];
  const warnings = [];
  const text = readFileSync(candidatePath, 'utf8');
  const fm = parseFrontmatter(text);
  const sectionIssue = (msg) => (strict ? errors : warnings).push(msg);

  // 1. Frontmatter conformance.
  if (!fm) {
    sectionIssue('Missing YAML frontmatter (--- ... ---).');
  } else {
    for (const k of ['name', 'description', 'tools']) {
      if (!fm[k]) sectionIssue(`Frontmatter missing "${k}".`);
    }
    if (fm.name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) {
      sectionIssue(`name "${fm.name}" is not kebab-case.`);
    }
  }

  // 2. Required sections.
  for (const s of REQUIRED_SECTIONS) {
    if (sectionBody(text, s) === null) sectionIssue(`Missing required section "## ${s}".`);
  }

  const others = listCharterFiles().filter((p) => resolve(p) !== resolve(candidatePath));

  // 3. Unique name (always a hard failure — duplicate routing is never ok).
  if (fm && fm.name) {
    for (const p of others) {
      const f = parseFrontmatter(readFileSync(p, 'utf8'));
      if (f && f.name === fm.name) errors.push(`name "${fm.name}" collides with ${basename(p)}.`);
    }
  }

  // 4. Ownership disjointness (the core gate — always a hard failure).
  const myPaths = extractPaths(sectionBody(text, 'Files you own'));
  if (myPaths.length === 0) warnings.push('No file paths under "Files you own" — declares no exclusive ownership.');
  const existing = buildOwnershipMap(others);
  for (const mine of myPaths) {
    for (const claim of existing) {
      if (pathsConflict(mine, claim.path)) {
        errors.push(`Ownership overlap: "${mine}" conflicts with "${claim.path}" (owned by ${claim.owner}).`);
      }
    }
    for (const pre of RESERVED_PREFIXES) {
      if (mine === pre || mine.startsWith(pre)) {
        warnings.push(`"${mine}" is inside the sacred engine dir (${pre}); requires engine-engineer review.`);
      }
    }
  }

  // 5. Verify-loop commands resolve to real scripts.
  const vloop = sectionBody(text, 'Verify loop') || '';
  const scripts = [...vloop.matchAll(/npm run ([a-z0-9:-]+)/g)].map((m) => m[1]);
  if (/\bnpm test\b/.test(vloop)) scripts.push('test');
  const known = loadAllScripts();
  for (const s of [...new Set(scripts)]) {
    if (!known.has(s)) warnings.push(`Verify loop references "npm run ${s}" but no package.json defines it.`);
  }

  return { errors, warnings };
}

const arg = process.argv[2];
const rosterMode = !arg || arg === '--roster';
const targets = rosterMode ? listCharterFiles() : [resolve(arg)];

let failed = 0;
for (const t of targets) {
  const { errors, warnings } = validateOne(t, { strict: !rosterMode });
  const label = basename(t);
  console.log(`${errors.length === 0 ? '✅' : '❌'} ${label}`);
  for (const e of errors) console.log(`   ✗ ${e}`);
  for (const w of warnings) console.log(`   ⚠ ${w}`);
  if (errors.length) failed++;
}
console.log('');
console.log(failed === 0 ? `PASS — ${targets.length} charter(s) valid.` : `FAIL — ${failed} charter(s) with errors.`);
process.exit(failed === 0 ? 0 : 1);
