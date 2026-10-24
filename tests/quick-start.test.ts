import { describe, expect, it, vi } from 'vitest';
import { MYMC } from '../integrations/qiandengji/cortico.ts';
import { withQuickStart } from '../integrations/qiandengji/cortico-quick-start.ts';
import type { World, WorldHost } from 'agent-mc-world/contracts';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { portalApiFixture } from './fixtures/portal-api.ts';

function fixture(dataDir = '') {
  const cfg = { ...MYMC.defaults(), viewerPort: 0 };
  let connection: any = null;
  const engine: World = { id: 'mymc', tools: () => [], envPromptVars: () => ({}), start: vi.fn(async () => {}), stop: vi.fn(async () => {}),
    console: () => ({ panels: [{ id: 'connection', title: 'login' }],
      invoke: vi.fn(async (panel, method) => ({ panel, method })), connection }) };
  const persist = vi.fn((patch: Partial<typeof cfg>) => Object.assign(cfg, patch));
  const restart = vi.fn(async () => { if (cfg.enabled) await world.start({} as WorldHost); else await world.stop(); });
  const ctx = { cfg, persist, restart, dataDir, timezone: 'UTC', botName: 'Fixture' };
  const world = withQuickStart(engine, ctx, candidate => MYMC.preflight?.({ cfg: candidate }));
  const invoke = (method: string, form?: unknown) => world.console!().invoke!('quick-start', method, form === undefined ? [] : [form]);
  return { cfg, world, ctx, invoke, persist, restart, setConnection: (value: unknown) => { connection = value; } };
}

describe('operator quick setup through official WorldContext ports', () => {
  it('prepares a website identity without touching a live connection, then adopts only a fresh ready account',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'world-portal-')),api=portalApiFixture();vi.stubGlobal('fetch',api.fetch);
    try{
      const f=fixture(directory),beforeMemory=structuredClone(f.cfg.memory),beforeModels=structuredClone(f.cfg.hostDecisions);
      expect(await f.invoke('state')).toMatchObject({portal:{state:'missing',identitySaved:false}});expect(api.fetch).not.toHaveBeenCalled();
      expect(await f.invoke('portal-prepare',{inviteUrl:'https://mc.kangqiang.site/join#invite=qdi_'+'i'.repeat(43),username:'ag_Fixture'})).toMatchObject({portal:{state:'pending'}});
      expect(f.persist).not.toHaveBeenCalled();expect(f.restart).not.toHaveBeenCalled();
      await expect(f.invoke('portal-start')).rejects.toThrow('GAME_ACCOUNT_NOT_READY');expect(f.restart).not.toHaveBeenCalled();
      api.setState('ready');await f.invoke('portal-status');
      expect(await f.invoke('portal-start')).toMatchObject({mounted:true,loginName:'ag_Fixture',portal:{state:'ready'},connection:null});
      expect(f.cfg).toMatchObject({host:'micro.kangqiang.site',port:25702,username:'ag_Fixture',auth:'offline',version:'1.21.1',serverPack:'qiandengji',preserveLoginName:true,enabled:true});
      expect(f.cfg.memory).toEqual(beforeMemory);expect(f.cfg.hostDecisions).toEqual(beforeModels);expect(f.restart).toHaveBeenCalledOnce();
      expect(JSON.stringify(f.persist.mock.calls)).not.toMatch(/qdi_|qda_|gamePassword|clientSecret/);
      f.setConnection({ready:true,phase:'online'});f.persist.mockClear();f.restart.mockClear();
      expect(await f.invoke('portal-start')).toMatchObject({alreadyConnected:true});expect(f.restart).not.toHaveBeenCalled();
      api.setState('unknown');await expect(f.invoke('portal-start')).rejects.toThrow('GAME_ACCOUNT_NOT_READY');expect(f.persist).not.toHaveBeenCalled();
    }finally{vi.unstubAllGlobals();await rm(directory,{recursive:true,force:true});}
  });
  it('shows a default unconnected panel without network, game or model work', async () => {
    const f = fixture();
    const state = await f.invoke('state');
    expect(state).toMatchObject({ available: true, enabled: false, mounted: false, settings: { host: '', username: '', serverPack: 'none' } });
    expect(f.persist).not.toHaveBeenCalled(); expect(f.restart).not.toHaveBeenCalled();
    expect(f.world.console!().panels?.[0].id).toBe('quick-start');
    expect((f.world as any).webUi().panels[0].id).toBe('quick-start');
  });
  it('saves and starts from just an address and game name without changing unrelated settings', async () => {
    const f = fixture(), previousMemory = structuredClone(f.cfg.memory), previousHost = structuredClone(f.cfg.hostDecisions);
    const state = await f.invoke('start', { address: 'example.test:25577', username: ' Alice ',
      hostDecisions: { combat: { endpoint: 'https://ignored.invalid' } }, password: 'never-store-fixture' });
    expect(f.cfg).toMatchObject({ host: 'example.test', port: 25577, username: 'Alice', enabled: true, serverPack: 'none' });
    expect(state).toMatchObject({ saved: true, requested: 'start', mounted: true, connection: null, loginName: 'Alice' });
    expect(f.cfg.memory).toEqual(previousMemory); expect(f.cfg.hostDecisions).toEqual(previousHost);
    expect(JSON.stringify(f.persist.mock.calls)).not.toContain('never-store-fixture');
    expect(f.restart).toHaveBeenCalledOnce();
  });
  it('save does not connect, stop only disables the owning World', async () => {
    const f = fixture();
    await f.invoke('save', { address: '[2001:db8::1]:25577', username: 'Alice', version: 'auto' });
    expect(f.cfg.enabled).toBe(false); expect(f.restart).not.toHaveBeenCalled();
    await f.invoke('stop'); expect(f.cfg.host).toBe('2001:db8::1'); expect(f.cfg.port).toBe(25577);
    expect(f.restart).toHaveBeenCalledOnce(); expect(f.cfg.enabled).toBe(false);
  });
  it('reuses a connected saved identity without restarting or cancelling body work', async () => {
    const f = fixture();
    const form = { address: 'example.test:25577', username: 'Alice', auth: 'offline', version: 'auto', serverPack: 'none', viewerPort: 0 };
    await f.invoke('start', form);
    f.setConnection({ ready: true, phase: 'ready' });
    f.persist.mockClear(); f.restart.mockClear();
    const result = await f.invoke('start', form);
    expect(result).toMatchObject({ alreadyConnected: true, mounted: true, connection: { ready: true } });
    expect(f.persist).not.toHaveBeenCalled(); expect(f.restart).not.toHaveBeenCalled();
    await f.invoke('start', { ...form, username: 'Bob' });
    expect(f.cfg.username).toBe('Bob'); expect(f.restart).toHaveBeenCalledOnce();
    f.setConnection({ ready: false, phase: 'disconnected' }); f.restart.mockClear();
    await f.invoke('start', { ...form, username: 'Bob' });
    expect(f.restart).toHaveBeenCalledOnce();
  });
  it('uses server prefixes only when the operator explicitly selects the server pack', async () => {
    const f = fixture();
    expect(await f.invoke('save', { address: 'example.test', username: 'Alice', serverPack: 'qiandengji' })).toMatchObject({ loginName: 'ag_Alice' });
    expect(f.cfg.serverPack).toBe('qiandengji');
  });
  it('keeps Microsoft identity separate from offline game-name rules', async () => {
    const f = fixture();
    await f.invoke('save', { address: 'example.test', username: 'fixture@example.test', auth: 'microsoft' });
    expect(f.cfg.auth).toBe('microsoft'); expect(f.cfg.username).toBe('fixture@example.test');
    expect(f.restart).not.toHaveBeenCalled();
  });
  it.each([
    { address: 'https://example.test', username: 'Alice' },
    { address: 'example.test:0', username: 'Alice' },
    { address: 'example.test', username: 'bad-name' },
    { address: 'example.test', username: 'Alice', auth: 'typo' },
    { address: 'example.test', username: 'Alice', serverPack: 'typo' },
    { address: 'example.test', username: 'Alice', viewerPort: 65536 },
  ])('rejects invalid settings before any save or interruption: %j', async form => {
    const f = fixture(); await expect(f.invoke('start', form)).rejects.toThrow();
    expect(f.persist).not.toHaveBeenCalled(); expect(f.restart).not.toHaveBeenCalled();
  });
  it('serializes operator connection mutations and leaves state reads available', async () => {
    const f = fixture(); let finish!: () => void;
    f.restart.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = f.invoke('start', { address: 'example.test', username: 'Alice' });
    await expect(f.invoke('stop')).rejects.toThrow('稍候');
    expect(await f.invoke('state')).toMatchObject({ enabled: true });
    finish(); await pending; expect(f.restart).toHaveBeenCalledOnce();
  });
  it('does not expose host endpoints or secrets, and propagates an actual start failure', async () => {
    const f = fixture();
    f.cfg.hostDecisions!.combat!.endpoint = 'https://not-public.invalid';
    expect(JSON.stringify(await f.invoke('state'))).not.toContain('not-public');
    f.restart.mockRejectedValueOnce(new Error('fixture launch failed'));
    await expect(f.invoke('start', { address: 'example.test', username: 'Alice' })).rejects.toThrow('fixture launch failed');
  });
  it('preserves the existing panel data plane', async () => {
    const f = fixture();
    await f.invoke('start', { address: 'example.test', username: 'Alice' });
    expect(await f.world.console!().invoke!('connection', 'state', [])).toEqual({ panel: 'connection', method: 'state' });
  });
  it('returns an unverified preparation state without invoking an absent engine', async () => {
    const f = fixture();
    expect(await f.world.console!().invoke!('connection', 'state', [])).toMatchObject({
      preparation: { phase: 'stopped' }, server: { actualVersion: null }, connection: null, accounts: {}, clients: {},
    });
  });
  it('uses prepared resources without saving package/cache paths into operator configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'world-viewer-config-'));
    try {
      const template = join(root, 'template'); await mkdir(template);
      await writeFile(join(template, 'audio-downloads.json'), JSON.stringify({ schema: 'agent-mc-viewer-audio/v1', viewerArchiveSha256: 'a'.repeat(64), files: [] }));
      await writeFile(join(template, 'index.html'), 'current viewer fixture');
      const f = fixture(); f.cfg.enabled = true; f.cfg.viewerPort = 7793;
      expect(f.cfg.viewerAssetsDir).toBe('');
      const started = vi.fn(async () => {}), setDirectory = vi.fn();
      const engine: World = { id: 'mymc', tools: () => [], envPromptVars: () => ({}), start: started, stop: async () => {} };
      const instance = withQuickStart(engine, { ...f.ctx, dataDir: join(root, 'data') }, () => {}, { templateDir: () => template, setDirectory });
      await instance.start({} as WorldHost);
      expect(started).toHaveBeenCalledOnce(); expect(setDirectory).toHaveBeenCalledOnce();
      expect(await readFile(join(setDirectory.mock.calls[0][0], 'index.html'), 'utf8')).toBe('current viewer fixture');
      expect(f.cfg.viewerAssetsDir).toBe(''); expect(f.persist).not.toHaveBeenCalled();
      await instance.stop();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

async function assetFixture(start?: () => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'world-audio-lifecycle-')), template = join(root, 'template');
  await mkdir(template);
  const bytes = Buffer.from('OggS delayed audio fixture');
  const hash = (algorithm: string) => createHash(algorithm).update(bytes).digest('hex');
  await writeFile(join(template, 'audio-downloads.json'), JSON.stringify({ schema: 'agent-mc-viewer-audio/v1',
    viewerArchiveSha256: 'a'.repeat(64), files: [{ file: 'public/sounds/test.ogg', sha1: hash('sha1'), sha256: hash('sha256'), bytes: bytes.length }] }));
  await writeFile(join(template, 'index.html'), 'ready before audio');
  const cfg = { ...MYMC.defaults(), enabled: true, viewerPort: 7793 };
  const started = vi.fn(start ?? (async () => {})), stopped = vi.fn(async () => {}), setDirectory = vi.fn();
  const engine: World = { id: 'mymc', tools: () => [], envPromptVars: () => ({}), start: started, stop: stopped,
    console: () => ({ connection: { ready: true, phase: 'online' }, invoke: async () => ({ actualEngine: true }) }) };
  const world = withQuickStart(engine, { cfg, dataDir: join(root, 'data'), timezone: 'UTC', botName: 'Fixture' }, () => {},
    { templateDir: () => template, setDirectory });
  const invoke = (method = 'state') => world.console!().invoke!('quick-start', method, []);
  return { root, template, bytes, cfg, world, started, stopped, setDirectory, invoke,
    async close() { await world.stop(); vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); } };
}

describe('game startup with independently owned audio preparation', () => {
  it('starts the body and serves base files before a slow audio request finishes', async () => {
    const f = await assetFixture(); let release!: () => void;
    const downloading = new Promise<void>(resolve => { release = resolve; });
    const transport = vi.fn(async () => { await downloading; return new Response(f.bytes); }); vi.stubGlobal('fetch', transport);
    try {
      await f.world.start({} as WorldHost);
      expect(f.started).toHaveBeenCalledOnce(); expect(f.setDirectory).toHaveBeenCalledOnce();
      expect(await readFile(join(f.setDirectory.mock.calls[0][0], 'index.html'), 'utf8')).toBe('ready before audio');
      expect(await f.invoke()).toMatchObject({ mounted: true, assets: { phase: 'downloading', completed: 0 }, assetPreparing: true });
      await f.invoke('retry-assets'); expect(transport).toHaveBeenCalledOnce();
      release();
      await vi.waitFor(async () => expect(await f.invoke()).toMatchObject({ mounted: true, assets: { phase: 'ready', completed: 1 }, assetPreparing: false }));
      expect(f.started).toHaveBeenCalledOnce();
    } finally { release(); await f.close(); }
  });
  it('reports a timeout and retries audio without restarting an already mounted game', async () => {
    const f = await assetFixture();
    const transport = vi.fn().mockRejectedValueOnce(new DOMException('simulated timeout', 'TimeoutError'))
      .mockResolvedValueOnce(new Response(f.bytes)); vi.stubGlobal('fetch', transport);
    try {
      await f.world.start({} as WorldHost);
      await vi.waitFor(async () => expect(await f.invoke()).toMatchObject({ mounted: true, assetError: 'simulated timeout', assetPreparing: false }));
      await f.invoke('retry-assets');
      await vi.waitFor(async () => expect(await f.invoke()).toMatchObject({ mounted: true, assetError: null, assets: { phase: 'ready' } }));
      expect(transport).toHaveBeenCalledTimes(2); expect(f.started).toHaveBeenCalledOnce(); expect(f.stopped).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it('aborts and settles in-flight audio when the World stops', async () => {
    const f = await assetFixture(); let signal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      signal = options.signal;
      return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }));
    try {
      await f.world.start({} as WorldHost); await vi.waitFor(() => expect(signal).toBeDefined());
      await f.world.stop();
      expect(signal.aborted).toBe(true);
      expect(await f.invoke()).toMatchObject({ mounted: false, phase: 'stopped', assets: null, assetError: null, assetPreparing: false });
    } finally { await f.close(); }
  });
  it('does not start an engine when the base catalog is invalid', async () => {
    const f = await assetFixture(), transport = vi.fn(); vi.stubGlobal('fetch', transport);
    try {
      await writeFile(join(f.template, 'audio-downloads.json'), JSON.stringify({ schema: 'invalid' }));
      await expect(f.world.start({} as WorldHost)).rejects.toThrow('catalog');
      expect(f.started).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
      expect(await f.world.console!().invoke!('connection', 'state', [])).toMatchObject({ preparation: { phase: 'failed' }, connection: null });
    } finally { await f.close(); }
  });
  it('does not resurrect a body whose asynchronous startup was stopped', async () => {
    let release!: () => void;
    const starting = new Promise<void>(resolve => { release = resolve; }), f = await assetFixture(() => starting);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(f.bytes)));
    const outcome = f.world.start({} as WorldHost).then(() => 'mounted', error => error.message);
    try {
      await vi.waitFor(() => expect(f.started).toHaveBeenCalledOnce());
      expect(await f.world.console!().invoke!('connection', 'state', [])).toMatchObject({ preparation: { phase: 'starting' }, connection: null });
      await f.world.stop(); release();
      expect(await outcome).toBe('启动已取消。');
      expect(await f.invoke()).toMatchObject({ mounted: false, phase: 'stopped', startupError: null, assets: null });
      expect(f.stopped).toHaveBeenCalled();
    } finally { release(); await outcome; await f.close(); }
  });
});
