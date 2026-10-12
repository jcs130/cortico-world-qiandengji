#!/usr/bin/env node
import { register } from 'tsx/esm/api';
register();
const { startMinecraftClientConsole } = await import('../src/client/cli.ts');
await startMinecraftClientConsole();
