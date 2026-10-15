import { serverViewerProtocol } from '../integrations/qiandengji/engine/viewer-state.ts';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { io, type Socket } from 'socket.io-client';
import { expect, it, vi } from 'vitest';
import { startModernViewer } from '../node_modules/agent-mc-world/core/modern-viewer.ts';
import { APPEARANCE_CHANNEL, PAPER_YSM_JAR_SHA256 } from '../integrations/qiandengji/engine/viewer-appearance.mjs';
import { MYMC_DEFAULTS } from '../src/config.ts';
import { freeViewerPort, viewerBot } from './fixtures/viewer-bot.ts';

it('does not register or request server plugin channels without an explicit extension', async () => {
  const {bot,protocol}=viewerBot();
  const write=vi.fn(()=>{throw Error('Unconfigured plugin packet');});
  Object.assign(protocol,{state:'play',write});
  const viewer=await startModernViewer(bot as never,{port:await freeViewerPort(),assetsDir:MYMC_DEFAULTS.viewerAssetsDir});
  try {
    bot.emit('spawn');
    protocol.emit('custom_payload',{channel:APPEARANCE_CHANNEL,data:Buffer.from('{}')});
    const health=await (await fetch(viewer.url+'/healthz')).json();
    expect(health.appearance).toBeNull();
    expect(write).not.toHaveBeenCalled();
  } finally { await viewer.close(); }
  expect(protocol.listenerCount('custom_payload')).toBe(0);
});

it.each(['1.21.1', '1.20.6'])('relays verified original appearance assets on Java %s over both viewer paths and releases observers', async version => {
  const { bot, protocol } = viewerBot(version);
  const uuid = '00000000-0000-4000-8000-000000000001';
  const writes: Array<{ channel: string; data: Buffer }> = [];
  let registrations = 0;
  Object.assign(protocol, { uuid, state: 'play', write(name: string, packet: { channel: string; data: Buffer }) {
    expect(name).toBe('custom_payload');
    if (packet.channel === 'minecraft:register') {
      expect(packet.data.toString()).toBe('mcviewer:state');
      registrations++;
      return;
    }
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
    serverProtocol: serverViewerProtocol, port: await freeViewerPort(), assetsDir: MYMC_DEFAULTS.viewerAssetsDir,
  });
  expect(registrations).toBe(1);
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
      const avatar = client.events.find(e => e.name === 'avatarState')?.value.entity;
      expect(avatar).toMatchObject({ id: row.entityId, uuid: row.playerUuid, isSelf: true });
    }
    const firstMoveStart = first.events.length;
    const thirdMoveStart = third.events.length;
    bot.emit('move');
    for (const [client, event, start] of [[first, 'playerEntity', firstMoveStart], [third, 'entityMoved', thirdMoveStart]] as const) {
      await vi.waitFor(() => expect(client.events.slice(start).some(e => e.name === event && e.value.id === row.entityId)).toBe(true));
      expect(client.events.slice(start).find(e => e.name === event && e.value.id === row.entityId)?.value)
        .toMatchObject({ id: row.entityId, uuid: row.playerUuid, isSelf: true });
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
