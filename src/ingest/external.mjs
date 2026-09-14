/**
 * Optional shims for the two external converters this tool can use if they
 * happen to be installed: `pdftotext` for `.pdf`, `textutil` for `.rtf` and
 * `.doc`. Both are OPTIONAL. Neither is an npm package and neither is
 * required for anything else in this repository to run.
 *
 * Two rules govern this module.
 *
 * 1. A missing binary is never an exception and never an empty document. It
 *    returns a skip with a reason naming the binary and how to install it.
 *    An empty document is the dangerous outcome: an agent would go on to cite
 *    a source that was never actually read.
 * 2. No path ever reaches a shell. `execFileSync` is called with an argument
 *    array, so a filename containing a space, a quote or `$(...)` is inert
 *    data rather than syntax.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, statSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

export const DEFAULT_TOOLS = {
  '.pdf': {
    bin: 'pdftotext',
    args: (path) => ['-layout', '-enc', 'UTF-8', '-nopgbrk', path, '-'],
    install: '`pdftotext` ships with poppler: `brew install poppler` on macOS, `apt-get install poppler-utils` on Debian/Ubuntu.',
  },
  '.rtf': {
    bin: 'textutil',
    args: (path) => ['-convert', 'txt', '-stdout', path],
    install: '`textutil` is built in on macOS; on other platforms, convert the file to .txt or .docx first.',
  },
  '.doc': {
    bin: 'textutil',
    args: (path) => ['-convert', 'txt', '-stdout', path],
    install: '`textutil` is built in on macOS; on other platforms, convert the file to .txt or .docx first.',
  },
};

export const EXTERNAL_EXTENSIONS = Object.keys(DEFAULT_TOOLS);

/**
 * Resolve a binary name against PATH, WITHOUT running it. Availability is
 * detected rather than inferred from a failure, so "not installed" can be
 * reported precisely instead of being confused with "installed but broke".
 *
 * @returns {string|null} an absolute path, or null when the binary is absent
 */
export function findBinary(name, env = process.env) {
  const executable = (path) => {
    try {
      if (!statSync(path).isFile()) return false;
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };

  if (name.includes('/') || isAbsolute(name)) return executable(name) ? name : null;

  for (const dir of (env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (executable(candidate)) return candidate;
  }
  return null;
}

/**
 * Extract text from a file that needs an external converter.
 *
 * @param {string} path
 * @param {string} ext lowercase extension including the dot
 * @param {{tools?: object, env?: object, maxBuffer?: number}} [options]
 * @returns {{ok: true, text: string}|{ok: false, reason: string}}
 */
export function externalText(path, ext, { tools = DEFAULT_TOOLS, env = process.env, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const tool = tools[ext];
  if (!tool) return { ok: false, reason: `No external converter is configured for ${ext} files.` };

  const resolved = findBinary(tool.bin, env);
  if (!resolved) {
    return {
      ok: false,
      reason: `\`${tool.bin}\` is not on PATH, so ${ext} files cannot be read and this one was NOT ingested. ${tool.install}`,
    };
  }

  try {
    const stdout = execFileSync(resolved, tool.args(path), {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer,
      env,
      // No `shell` option: the argument array is passed to execve as-is.
    });
    return { ok: true, text: Buffer.from(stdout).toString('utf8') };
  } catch (error) {
    const detail = error.status !== undefined && error.status !== null
      ? `exit ${error.status}`
      : error.message;
    const stderr = error.stderr ? Buffer.from(error.stderr).toString('utf8').trim() : '';
    return {
      ok: false,
      reason: `\`${tool.bin}\` failed on this file (${detail})${stderr ? `: ${stderr.split('\n')[0]}` : ''}. The file was NOT ingested.`,
    };
  }
}
