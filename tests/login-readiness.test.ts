import { EventEmitter } from 'node:events';
import mineflayer from 'mineflayer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bridge } from '../core/bridge.ts';

const bridges: Bridge[] = [];
afterEach(async () => {
  await Promise.all(bridges.splice(0).map(b => b.stop()));
  vi.restoreAllMocks();
});

describe('login readiness', () => {
  it('receives login messages before spawn without exposing the temporary entity as an operable body', () => {
    const bot = Object.assign(new EventEmitter(), {
      _client: new EventEmitter(), loadPlugin() {}, quit() {},
      entity: { position: { x: 0, y: -4207, z: 0 } },
    });
    vi.spyOn(mineflayer, 'createBot').mockReturnValue(bot as never);
    const seen: string[] = [];
    const log = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, emit() {}, child() { return this; } };
    const bridge = new Bridge({ host: 'localhost', port: 25565, username: 'tester', version: '1.20.6', viewerPort: 0,
      log: log as never, onSpawn() {}, onDisconnect() {},
      onBotCreated: live => live.on('message', message => { seen.push(message.toString()); }) });
    bridges.push(bridge);
    Object.assign(bridge, { installSpawnGear() {} });
    bridge.start();
    bot.emit('message', { toString: () => 'Authentication required' }, 'system');
    expect(seen).toEqual(['Authentication required']);
    expect(bridge.bot).toBeNull();
    expect(bridge.connected).toBe(false);
    bot.emit('spawn');
    expect(bridge.bot).toBe(bot);
    expect(bridge.connected).toBe(true);
    bot.emit('end', 'Disconnected');
    expect(bridge.bot).toBeNull();
    bot.emit('spawn');
    expect(bridge.connected).toBe(false);
  });
});
