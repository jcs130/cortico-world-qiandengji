import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Ajv } from 'ajv';
import { MYMC_CLIENT_CONFIG_GROUP, MYMC_CONFIG_GROUP, MYMC_DEFAULTS, MYMC_PLAYER_CONFIG_GROUP,
  MYMC_RHYTHM_CONFIG_GROUP, type MymcConfigSection } from '../config.ts';
import { assertMymcReady } from '../guard.ts';

function merge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(base, key)) throw new Error(`Unknown Minecraft configuration field: ${key}`);
    const previous = base[key];
    if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected object: ${key}`);
      merge(previous as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      if (typeof previous !== typeof value) throw new Error(`Invalid Minecraft configuration type: ${key}`);
      base[key] = value;
    }
  }
  return base;
}

export function loadMymcMcpConfig(path: string) {
  const fullPath = resolve(path);
  const input = JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, unknown>;
  if (!input.world || typeof input.world !== 'object' || Array.isArray(input.world)) throw new Error('Configuration requires a world object.');
  if (typeof input.dataDir !== 'string' || !input.dataDir.trim()) throw new Error('Configuration requires a private dataDir.');
  if (input.acceptsImages !== undefined && typeof input.acceptsImages !== 'boolean') throw new Error('acceptsImages must be boolean.');
  if (input.timezone !== undefined && typeof input.timezone !== 'string') throw new Error('timezone must be a string.');
  const cfg: MymcConfigSection = { ...structuredClone(MYMC_DEFAULTS), viewerPort: 0 };
  merge(cfg as unknown as Record<string, unknown>, input.world as Record<string, unknown>);
  const ajv = new Ajv({ strict: false, validateFormats: false });
  for (const group of [MYMC_CONFIG_GROUP, MYMC_RHYTHM_CONFIG_GROUP, MYMC_CLIENT_CONFIG_GROUP, MYMC_PLAYER_CONFIG_GROUP]) {
    for (const [path, schema] of Object.entries(group.schema.properties)) {
      if (!path.startsWith('worlds.mymc.')) continue;
      const value = path.slice('worlds.mymc.'.length).split('.').reduce<unknown>((object, key) =>
        object && typeof object === 'object' ? (object as Record<string, unknown>)[key] : undefined, cfg);
      if (value === undefined) continue;
      const validate = ajv.compile(schema);
      if (!validate(value)) throw new Error(`Invalid ${path}: ${ajv.errorsText(validate.errors)}`);
    }
  }
  if (cfg.loginConfigFile) cfg.loginConfigFile = resolve(dirname(fullPath), cfg.loginConfigFile);
  assertMymcReady(cfg);
  return { cfg, dataDir: resolve(dirname(fullPath), input.dataDir), timezone: String(input.timezone ?? 'UTC'),
    acceptsImages: input.acceptsImages === true };
}
