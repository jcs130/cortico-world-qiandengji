import {expect,it} from 'vitest';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dryMountWorld} from 'cortico/extensions/dry-mount.ts';
import {MC as worldDefinition} from '../../../src/adapters/minecraft.ts';
  it('passes the public API 5 dry mount without starting a player or model', async () => {
    const report = await dryMountWorld(worldDefinition, {
      scratchDir: join(fileURLToPath(new URL('../../../scratch/', import.meta.url)), 'public-sdk-mount'),
      packageDir: fileURLToPath(new URL('../../../', import.meta.url)),
      hasConsoleClient: false,
    });
    expect(report.failures).toEqual([]);
  });
