import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateThreeServiceContract } = require('../src/operations/compose-contract.js');

const result = validateThreeServiceContract(
  fs.readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../compose.production.yaml', import.meta.url), 'utf8')
);
console.log(JSON.stringify({ status: 'passed', ...result }));
