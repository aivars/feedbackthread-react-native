import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Runs only the backend's isolated Vitest Worker/D1 fixture; never a deployed API.
const backend = process.argv[2];
if (!backend) throw new Error('Usage: npm run test:worker -- /path/to/Loopline');
const backendRoot = resolve(backend);
const packageInfo = JSON.parse(await readFile(join(backendRoot, 'package.json'), 'utf8'));
if (packageInfo.name !== 'feedbackthread' || !packageInfo.private) throw new Error('Expected the private FeedbackThread backend repository.');
await access(join(backendRoot, 'test/apply-migrations.ts'));
await access(join(backendRoot, 'vitest.config.ts'));
const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = await readFile(join(sdkRoot, 'integration/worker-contract.template.ts'), 'utf8');
const destination = join(backendRoot, 'test', `expo-sdk-contract-${process.pid}.test.ts`);
const source = template.replace('"__SDK_CORE_IMPORT__"', JSON.stringify(join(sdkRoot, 'dist/core/index.js')));
// Never overwrite an existing project file. Cleanup touches only this new file.
await writeFile(destination, source, { flag: 'wx' });
try {
  const result = await new Promise((resolveExit, reject) => {
    const child = spawn('npm', ['test', '--', destination], { cwd: backendRoot, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  process.exitCode = result;
} finally {
  await unlink(destination);
}
