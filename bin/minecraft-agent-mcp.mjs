#!/usr/bin/env node
import { register } from 'tsx/esm/api';
register();
const { startMcpStdio } = await import('../src/mcp/stdio.ts');
await startMcpStdio();
