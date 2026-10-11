import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect, it} from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const javaHome = process.env.JAVA_HOME;
const executable = (name: string): string => javaHome
  ? join(javaHome, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
let javaAvailable = false;
try { execFileSync(executable('javac'), ['--version'], {stdio:'pipe'}); javaAvailable = true; } catch {}

it.skipIf(!javaAvailable)('keeps authentication scoped and submits once until reconnect', () => {
  const scratch = join(root, 'scratch', 'client-login-checks');
  mkdirSync(scratch, {recursive:true});
  const output = mkdtempSync(join(scratch, 'run-'));
  execFileSync(executable('javac'), ['--release','21','-encoding','UTF-8','-d',output,
    join(root,'client-login/LoginSession.java'), join(root,'client-login/LoginSessionCheck.java')],
    {stdio:'pipe', windowsHide:true});
  const result = execFileSync(executable('java'), ['-cp',output,'LoginSessionCheck'],
    {encoding:'utf8', windowsHide:true});
  expect(result).toContain('28 authentication checks passed');
}, 20_000);
