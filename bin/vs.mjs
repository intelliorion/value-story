#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { renderCase } from '../src/render/render-case.mjs';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [command, input, output] = process.argv.slice(2);

if (command !== 'render' || !input || !output) {
  fail('usage: vs render <input.json> <output.html>');
}

let doc;
try {
  doc = JSON.parse(readFileSync(input, 'utf8'));
} catch (error) {
  fail(`could not read ${input}: ${error.message}`);
}

try {
  writeFileSync(output, renderCase(doc), 'utf8');
} catch (error) {
  fail(`could not write ${output}: ${error.message}`);
}

process.stdout.write(`${output}\n`);
