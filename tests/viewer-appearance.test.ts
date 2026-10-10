import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { io, type Socket } from 'socket.io-client';
import { expect, it, vi } from 'vitest';
import { startModernViewer } from '../engine/modern-viewer.ts';
import { APPEARANCE_CHANNEL, PAPER_YSM_JAR_SHA256 } from '../engine/viewer-appearance.mjs';
import { MYMC_DEFAULTS } from '../src/config.ts';
import { freeViewerPort, viewerBot } from './fixtures/viewer-bot.ts';

it('relays verified original appearance assets over both existing viewer paths and releases all observers', async () => {
  const { bot, protocol } = viewerBot();
  const uuid = '00000000-0000-4000-8000-000000000001';
  const writes: Array<{ channel: string; data: Buffer }> = [];
  Object.assign(protocol, { uuid, state: 'play', write(name: string, packet: { channel: string; data: Buffer }) {
    expect(name).toBe('custom_payload');
    expect(packet.channel).toBe('mcagent:ysm_asset');
    writes.push(packet);
  } });
  const files = Object.fromEntries(Object.entries({
    'ysm.json': JSON.stringify({ spec: 2, properties: { free: true } }),
    'model.json': JSON.stringify({ format_version: '1.12.0', 'minecraft:geometry': [] }),
    'animation.json': JSON.stringify({ format_version: '1.8.0', animations: {} }),
    'texture.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'),
  }).map(([path, source]) => {
    const bytes = Buffer.from(source);
    return [path, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') }];
  }));
  const bundle = { schemaVersion: 1, ysmVersion: '2.4.1', format: 'ysm-bedrock-original', modelId: 'fixture',
    files, model: 'model.json', animation: 'animation.json', textures: { original: 'texture.png' } };
  const compressed = gzipSync(JSON.stringify(bundle));
  const assetSha256 = createHash('sha256').update(compressed).digest('hex');
  const row = { schemaVersion: 1, type: 'state', source: 'freesia_worker',
    epoch: '00000000-0000-4000-8000-000000000002', playerUuid: uuid, entityId: bot.entity.id,
    available: true, ysmVersion: '2.4.1', protocolVersion: '2.4.0', jarSha256: PAPER_YSM_JAR_SHA256,
    modelId: 'fixture', texture: 'original', mandatory: false, animation: 'idle',
    webAvailable: true, assetSha256, assetBytes: compressed.length };
  const emitState = (value = row) => protocol.emit('custom_payload', {
    channel: APPEARANCE_CHANNEL, data: Buffer.from(JSON.stringify(value)),
  });
  const viewer = await startModernViewer(bot as never, {
    port: await freeViewerPort(), assetsDir: MYMC_DEFAULTS.viewerAssetsDir,
  });
  const clients: Socket[] = [];
  const connect = async (path: string) => {
    const events: Array<{ name: string; value: Record<string, unknown> }> = [];
    const socket = io(viewer.url, { path, autoConnect: false, reconnection: false,
      forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.onAny((name, value) => events.push({ name, value }));
    const connected = new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve); socket.once('connect_error', reject);
    });
    socket.connect(); await connected;
    await vi.waitFor(() => expect(events.some(e => e.name === 'appearanceState')).toBe(true));
    return { socket, events };
  };
  try {
    emitState();
    expect(writes).toHaveLength(0);
    const first = await connect('/socket.io');
    const third = await connect('/third/socket.io');
    expect(writes).toHaveLength(1);
    const request = JSON.parse(writes[0].data.toString());
    expect(request).toMatchObject({ type: 'get', modelId: 'fixture', sha256: assetSha256 });
    protocol.emit('custom_payload', { channel: 'mcagent:ysm_asset', data: Buffer.from(JSON.stringify({
      schemaVersion: 1, type: 'chunk', requestId: request.requestId, sha256: assetSha256,
      count: 1, index: 0, bytes: compressed.length, data: compressed.toString('base64'),
    })) });
    for (const client of [first, third]) {
      await vi.waitFor(() => expect(client.events.some(e => e.name === 'appearanceState' && e.value.renderAvailable)).toBe(true));
      const assetIndex = client.events.findIndex(e => e.name === 'appearanceAsset');
      const boundIndex = client.events.findIndex(e => e.name === 'appearanceState' && e.value.renderAvailable);
      expect(assetIndex).toBeGreaterThan(-1);
      expect(assetIndex).toBeLessThan(boundIndex);
      expect(client.events[assetIndex].value).toEqual({ ...bundle, assetSha256 });
      expect(client.events[boundIndex].value).toMatchObject({ entityId: bot.entity.id,
        playerUuid: uuid, completeEntityParityVerified: false });
    }
    const health = await (await fetch(viewer.url + '/healthz')).json();
    expect(health.appearance).toEqual({ states: 1 });
    first.socket.disconnect();
    protocol.emit('custom_payload', { channel: APPEARANCE_CHANNEL,
      data: Buffer.from(JSON.stringify({ ...row, type: 'remove' })) });
    await vi.waitFor(() => expect(third.events.some(e => e.name === 'appearanceRemove')).toBe(true));
    bot.emit('respawn');
    await vi.waitFor(() => expect(third.events.filter(e => e.name === 'appearanceReset').length).toBeGreaterThan(1));
  } finally {
    for (const client of clients) client.disconnect();
    await viewer.close();
  }
  expect(protocol.listenerCount('custom_payload')).toBe(0);
  expect(bot.listenerCount('entitySpawn')).toBe(0);
  expect(bot.listenerCount('respawn')).toBe(0);
}, 15_000);
