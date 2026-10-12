import { expect, it } from 'vitest';
import { portableStorageMisuseNote } from '../integrations/qiandengji/engine/portable-storage.ts';
import type { Bot } from 'mineflayer';

it('requires a server-supplied backpack name and works independently of head order', () => {
  const head = { name: 'player_head', count: 1 };
  const bag = { ...head, customName: '大背包' };
  let items = [head];
  const bot = { inventory: { items: () => items } } as unknown as Bot;
  const steps = [{ skill: 'stow' as const, item: 'player_head', count: 1 }];
  expect(portableStorageMisuseNote(bot, steps)).toBeNull();
  items = [head, bag];
  expect(portableStorageMisuseNote(bot, steps)).toContain('随身容器');
  items = [bag, head];
  expect(portableStorageMisuseNote(bot, steps)).toContain('随身容器');
});
