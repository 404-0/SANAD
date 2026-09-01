import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tests the .env loader against the ways people actually create the file.
 *
 * This exists because of a real report: the key was pasted into server/.env on
 * Windows and the app still said "no API key configured". Each case below is a
 * failure someone can hit without doing anything wrong, so each one is checked
 * rather than reasoned about.
 *
 * The loader resolves paths from its own location, so the cases have to write
 * real files into the project. Anything already there is moved aside first and
 * put back afterwards, even if a case throws.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

const TOUCHED = [
  join(ROOT, '.env'),
  join(ROOT, '.env.local'),
  join(ROOT, 'server', '.env'),
  join(ROOT, 'server', '.env.local'),
];

const REAL_KEY = 'gsk_TESTKEY0000000000000000000000000000';

/** Runs the loader in a fresh process so nothing leaks between cases. */
function loadInChild(shellEnv = {}) {
  const code = `
    import { loadEnv } from ${JSON.stringify(join(ROOT, 'server', 'loadEnv.mjs'))};
    const env = loadEnv({ quiet: true });
    process.stdout.write(JSON.stringify({
      keys: env.keys,
      files: env.files.map((f) => f.path.replace(${JSON.stringify(ROOT)}, '.')),
      searched: env.searched,
      groq: process.env.GROQ_API_KEY ?? null,
      model: process.env.SANAD_MODEL ?? null,
    }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, GROQ_API_KEY: undefined, SANAD_MODEL: undefined, ...shellEnv },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function clear() {
  for (const path of TOUCHED) rmSync(path, { force: true });
}

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---- move any real .env files out of the way --------------------------------
const stashed = [];
for (const path of TOUCHED) {
  if (existsSync(path)) {
    const backup = `${path}.testbackup`;
    renameSync(path, backup);
    stashed.push([backup, path]);
  }
}

try {
  console.log('env loader\n');

  // The reported failure: the file was put next to the server that reads it.
  clear();
  write(join(ROOT, 'server', '.env'), `GROQ_API_KEY=${REAL_KEY}\n`);
  let env = loadInChild();
  check('key in server/.env is found', env.groq === REAL_KEY, `got ${env.groq}`);

  // Notepad and PowerShell write a BOM. Without stripping it the first key
  // becomes "﻿GROQ_API_KEY" and silently never matches.
  clear();
  write(join(ROOT, '.env'), `﻿GROQ_API_KEY=${REAL_KEY}\r\nSANAD_MODEL=llama-3.3-70b-versatile\r\n`);
  env = loadInChild();
  check('BOM + CRLF file parses', env.groq === REAL_KEY, `got ${env.groq}`);
  check('second CRLF line parses', env.model === 'llama-3.3-70b-versatile', `got ${env.model}`);

  // Copying .env.example and adding the key underneath leaves the placeholder
  // above it. The real value must win and the placeholder must never be sent.
  clear();
  write(join(ROOT, '.env'), `GROQ_API_KEY=gsk_...\n\n# my key\nGROQ_API_KEY=${REAL_KEY}\n`);
  env = loadInChild();
  check('real key beats placeholder above it', env.groq === REAL_KEY, `got ${env.groq}`);

  // Placeholder left in the root, real key added in server/ — every candidate
  // is read, so the real one is still found.
  clear();
  write(join(ROOT, '.env'), 'GROQ_API_KEY=gsk_...\n');
  write(join(ROOT, 'server', '.env'), `GROQ_API_KEY=${REAL_KEY}\n`);
  env = loadInChild();
  check('placeholder root + real server/.env', env.groq === REAL_KEY, `got ${env.groq}`);

  // Pasted from a Linux guide, or quoted by a helpful editor.
  clear();
  write(join(ROOT, '.env'), `export GROQ_API_KEY="${REAL_KEY}"\n`);
  env = loadInChild();
  check('export + quotes are stripped', env.groq === REAL_KEY, `got ${env.groq}`);

  // A key set for one command must not be overridden by a stale file.
  clear();
  write(join(ROOT, '.env'), 'GROQ_API_KEY=gsk_from_file\n');
  env = loadInChild({ GROQ_API_KEY: 'gsk_from_shell' });
  check('shell value wins over the file', env.groq === 'gsk_from_shell', `got ${env.groq}`);

  // Root wins when both files have a usable value — one source of truth.
  clear();
  write(join(ROOT, '.env'), 'GROQ_API_KEY=gsk_root\n');
  write(join(ROOT, 'server', '.env'), 'GROQ_API_KEY=gsk_server\n');
  env = loadInChild();
  check('root .env wins over server/.env', env.groq === 'gsk_root', `got ${env.groq}`);

  // A file with nothing usable must report no keys, not a bogus one.
  clear();
  write(join(ROOT, '.env'), '# GROQ_API_KEY=gsk_commented_out\nGROQ_API_KEY=gsk_...\n');
  env = loadInChild();
  check('placeholder-only file yields no key', env.groq === null, `got ${env.groq}`);
  check('the file is still reported as found', env.files.length === 1, JSON.stringify(env.files));

  // Nothing anywhere: the help text must not repeat the same folder twice.
  clear();
  env = loadInChild();
  check('no files means no keys', env.keys.length === 0, JSON.stringify(env.keys));
  check(
    'searched paths are unique',
    new Set(env.searched).size === env.searched.length,
    env.searched.join(', '),
  );

  // .gitignore has to cover both locations or a key gets committed.
  const ignore = existsSync(join(ROOT, '.gitignore'))
    ? readFileSync(join(ROOT, '.gitignore'), 'utf8')
    : '';
  check('.gitignore covers .env anywhere', /(^|\n)\s*\**\.env\b/.test(ignore) || /(^|\n)\s*\.env\*/.test(ignore), ignore.trim());
} finally {
  clear();
  for (const [backup, path] of stashed) renameSync(backup, path);
}

console.log(failures ? `\n${failures} failed.` : '\nAll env cases passed.');
process.exit(failures ? 1 : 0);
