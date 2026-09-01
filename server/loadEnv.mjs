import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

/**
 * Finds and loads the .env file, forgivingly.
 *
 * People put this file where it feels like it belongs — next to the server that
 * uses it, or in the folder they happened to be in — so all the sensible places
 * are checked rather than one. It also survives the things a Windows editor
 * does to a text file: a UTF-8 BOM on the first line (which would otherwise
 * corrupt the first key's name), CRLF endings, and `export KEY=value` pasted
 * from a Linux guide.
 */
// Variables that were already set in the shell when the process started. Those
// always win over the file, so `GROQ_API_KEY=... npm run api` still overrides.
const SHELL_KEYS = new Set(Object.keys(process.env));

// The same folder can be reached two ways (the project root is usually also the
// working directory), so the list is de-duplicated — otherwise the "looked in"
// help repeats a path and reads like a bug.
const CANDIDATES = [
  ...new Set([
    join(ROOT, '.env'),
    join(ROOT, '.env.local'),
    join(ROOT, 'server', '.env'),
    join(ROOT, 'server', '.env.local'),
    join(process.cwd(), '.env'),
    join(process.cwd(), '.env.local'),
  ]),
];

// Values still carrying the placeholder from .env.example are ignored, so a
// half-filled file reports "no key" instead of sending "gsk_..." to the API.
const PLACEHOLDER = /^(gsk_\.\.\.|sk-ant-\.\.\.|your[-_ ]?key|changeme|\.{3})$/i;

/** Reads one file into {key: value}, tolerating BOM, CRLF, quotes and `export`. */
function parseEnvFile(path) {
  const raw = readFileSync(path, 'utf8').replace(/^﻿/, '');
  const values = {};

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;

    const equals = line.indexOf('=');
    if (equals === -1) continue;

    const key = line.slice(0, equals).trim();
    const value = line
      .slice(equals + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (!key || !value || PLACEHOLDER.test(value)) continue;
    // Later lines win, so pasting your key underneath the example line works.
    values[key] = value;
  }
  return values;
}

export function loadEnv({ quiet = false } = {}) {
  // Every candidate is read, not just the first that exists: someone who left a
  // placeholder .env in the root and put the real key in server/.env should get
  // the real key rather than silence. Earlier files still win where both have a
  // usable value, and anything already set in the shell beats all of them.
  const files = [];
  const found = [];

  for (const path of CANDIDATES) {
    if (!existsSync(path)) continue;

    let values;
    try {
      values = parseEnvFile(path);
    } catch {
      continue; // unreadable file — treated as absent rather than fatal
    }

    const used = [];
    for (const [key, value] of Object.entries(values)) {
      if (SHELL_KEYS.has(key) || found.includes(key)) continue;
      process.env[key] = value;
      found.push(key);
      used.push(key);
    }
    files.push({ path, keys: used });
  }

  if (!quiet) {
    for (const entry of files) {
      const shown = entry.path.replace(ROOT, '.');
      console.log(`  env: ${shown} (${entry.keys.join(', ') || 'nothing new'})`);
    }
  }
  return { file: files[0]?.path ?? null, files, keys: found, searched: CANDIDATES };
}

/** Human-readable help for when no key was found anywhere. */
export function describeMissingKey(searched) {
  return [
    'No API key found. Looked in:',
    ...searched.map((path) => `  ${path}`),
    '',
    'Create a file called exactly ".env" in the project root (next to package.json) containing:',
    '  GROQ_API_KEY=gsk_your_real_key',
    '',
    'On Windows, make sure the file is not secretly ".env.txt" —',
    'in Explorer turn on View > File name extensions and check.',
  ].join('\n');
}
