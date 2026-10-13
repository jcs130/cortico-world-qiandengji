import { serverViewerProtocol } from '../integrations/qiandengji/engine/viewer-state.ts';
import { io } from 'socket.io-client';
import { describe, expect, it, vi } from 'vitest';
import { startModernViewer } from '../node_modules/agent-mc-world/core/modern-viewer.ts';
import { MYMC_DEFAULTS } from '../src/config.ts';
import { freeViewerPort, viewerBot } from './fixtures/viewer-bot.ts';

describe('packaged OBS subject integration', () => {
  it('relays attested targets, item use and close/switch cleanup while skipping world chunk reads for overlays', async () => {
    const { bot, protocol } = viewerBot();
    const own = '00000000-0000-0000-0000-000000000001', target = '00000000-0000-0000-0000-000000000002';
    Object.assign(bot, { uuid: own });
    const register = vi.fn((name: string, packet: { channel: string; data: Buffer }) => {
      expect(name).toBe('custom_payload');
      expect(packet.channel).toBe('minecraft:register');
      expect(packet.data.toString()).toBe('mcviewer:state');
    });
    Object.assign(protocol, { state: 'play', write: register });
    Object.assign(bot.entity, { metadata: { 8: 3 } });
    const columns = vi.spyOn(bot.world, 'getColumnAt');
    const viewer = await startModernViewer(bot as never, {
      serverProtocol: serverViewerProtocol, port: await freeViewerPort(), assetsDir: MYMC_DEFAULTS.viewerAssetsDir, speechSourceId: 'offline-obs-test',
    });
    expect(register).toHaveBeenCalledTimes(1);
    const events: Array<{ name: string; value: any }> = [];
    const socket = io(viewer.url, { query: { overlay: '1' }, autoConnect: false, reconnection: false, transports: ['websocket'] });
    socket.onAny((name, value) => events.push({ name, value }));
    try {
      const ready = new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      socket.connect(); await ready;
      await vi.waitFor(() => expect(events.some(e => e.name === 'avatarState' && e.value.usingHeldItem && e.value.usingOffhand)).toBe(true));
      expect(columns).not.toHaveBeenCalled();
      const state = { schemaVersion: 1, viewerSession: { mode: 'observer', attached: true, recipientUuid: own,
        playerUuid: target, playerName: 'OtherAgent', worldUuid: own, entityId: 8, windowOpen: true },
        vitals: { health: 7 }, mana: { current: 3, max: 20 }, skills: [], abilities: [] };
      protocol.emit('custom_payload', { channel: 'mcviewer:state', data: Buffer.from(JSON.stringify(state)) });
      expect(events.some(e => e.name === 'observerState' && e.value.attached)).toBe(false);
      protocol.emit('camera', { cameraId: 8 });
      await vi.waitFor(() => expect(events.some(e => e.name === 'observerState' && e.value.entityId === 8 && e.value.vitals.health === 7)).toBe(true));
      const marker = events.length;
      protocol.emit('camera', { cameraId: 9 });
      await vi.waitFor(() => expect(events.slice(marker).some(e => e.name === 'viewerSession' && e.value.attached === false)).toBe(true));
      expect(events.slice(marker).some(e => e.name === 'containerState' && e.value === null)).toBe(true);
      expect(events.some(e => e.name === 'loadChunk')).toBe(false);
    } finally { socket.disconnect(); await viewer.close(); }
    expect(protocol.listenerCount('camera')).toBe(0);
    expect(bot.listenerCount('windowClose')).toBe(0);
  });
});
