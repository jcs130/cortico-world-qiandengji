import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
// Unit fixtures deliberately do not use website credentials or an installed portal runtime.
export default defineConfig({resolve:{alias:{'agent-mc-qiandengji/portal':fileURLToPath(new URL('./tests/fake-portal.ts',import.meta.url))}},
  test:{include:['tests/**/*.test.ts'],maxWorkers:3,minWorkers:1}});
