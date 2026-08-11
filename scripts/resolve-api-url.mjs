import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const [engine, stackName] = process.argv.slice(2);
if (!['cdk', 'cdkd'].includes(engine) || !stackName) {
  throw new Error('Usage: node scripts/resolve-api-url.mjs <cdk|cdkd> <stack-name>');
}

let apiUrl;

if (engine === 'cdk') {
  const outputPath = process.env.CDK_OUTPUTS_FILE ?? 'cdk.outputs.json';
  const outputs = JSON.parse(await readFile(outputPath, 'utf8'));
  apiUrl = outputs[stackName]?.ApiUrl;
} else {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const output = execFileSync(
    npx,
    ['cdkd', 'state', 'show', stackName, '--json'],
    { encoding: 'utf8' },
  );
  const state = JSON.parse(output);
  apiUrl = state.state?.outputs?.ApiUrl;
}

if (typeof apiUrl !== 'string' || !apiUrl.startsWith('https://')) {
  throw new Error(`ApiUrl was not found for ${stackName}.`);
}

process.stdout.write(apiUrl);

