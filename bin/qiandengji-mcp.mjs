#!/usr/bin/env node
import { register } from 'tsx/esm/api';
register();
const { startQiandengjiMcp } = await import('../integrations/qiandengji/stdio.ts');
await startQiandengjiMcp();
