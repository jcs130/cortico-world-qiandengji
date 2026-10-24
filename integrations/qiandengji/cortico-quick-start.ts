import type { World, WorldConsoleDecl } from 'agent-mc-world/contracts';
import { parseMinecraftServerAddress, prepareMinecraftViewerAssets, type ViewerAssetProgress } from 'agent-mc-world/client';
import { join } from 'node:path';
import type { MymcConfigSection } from './config.ts';
import { mymcLoginName } from './config.ts';
import type { WorldContext } from '../../adapters/cortico/types.ts';
import { QiandengjiPortalAccess } from './portal-access.ts';

/** Host setup only. No independent game loop, model configuration or credential copies. */
export function withQuickStart<T extends World>(world: T, ctx: WorldContext<MymcConfigSection>,
  validate: (cfg: MymcConfigSection) => void,
  viewer?: { templateDir(): string; setDirectory(directory: string): void }): T {
  const base = world.console?.bind(world);
  const start = world.start.bind(world), stop = world.stop.bind(world);
  let mounted = false, mutation: Promise<unknown> | null = null;
  let assets: ViewerAssetProgress | null = null, assetError: string | null = null, startupError: string | null = null;
  let phase: 'stopped' | 'preparing-assets' | 'starting' | 'running' | 'failed' = 'stopped', revision = 0;
  let assetTemplate: string | null = null;
  let assetJob: { controller: AbortController; work: Promise<void> } | null = null;
  const portal = ctx.dataDir ? new QiandengjiPortalAccess({ directory: join(ctx.dataDir, 'website-access') }) : null;
  const cancelAssets = async () => {
    const job = assetJob;
    if (job) { job.controller.abort(new Error('资源准备已取消。')); await job.work; }
  };
  const beginAssets = (templateDir: string): Promise<void> => {
    let resolveBase!: () => void, rejectBase!: (error: unknown) => void;
    const baseReady = new Promise<void>((resolve, reject) => { resolveBase = resolve; rejectBase = reject; });
    const job = { controller: new AbortController(), work: Promise.resolve() };
    assetJob = job; assets = null; assetError = null;
    job.work = prepareMinecraftViewerAssets({ templateDir,
      cacheDir: join(ctx.dataDir, 'minecraft-viewer'), signal: job.controller.signal,
      onBaseReady: base => {
        job.controller.signal.throwIfAborted();
        if (assetJob !== job) throw new Error('资源准备已被替换。');
        if (base.directory !== templateDir && !viewer) throw new Error('宿主未提供运行时资源目录接口。');
        viewer?.setDirectory(base.directory);
        resolveBase();
      },
      onProgress: value => {
        if (assetJob !== job || job.controller.signal.aborted) return;
        if (!ctx.cfg.enabled) { job.controller.abort(new Error('启动已取消。')); return; }
        assets = value;
      },
    }).then(result => {
      if (assetJob === job && !job.controller.signal.aborted)
        assets = { phase: 'ready', completed: result.total, total: result.total, downloaded: result.downloaded, bytes: assets?.bytes ?? 0 };
    }, error => {
      rejectBase(error);
      if (assetJob === job && !job.controller.signal.aborted)
        assetError = error instanceof Error ? error.message : '音频资源准备失败，请重试。';
    }).finally(() => { if (assetJob === job) assetJob = null; });
    return baseReady;
  };
  world.start = async host => {
    const current = ++revision;
    mounted = false; phase = 'preparing-assets'; startupError = null;
    await cancelAssets();
    try {
      if (current !== revision || !ctx.cfg.enabled) throw new Error('启动已取消。');
      assets = null; assetError = null;
      const templateDir = viewer?.templateDir() ?? ctx.cfg.viewerAssetsDir;
      assetTemplate = ctx.cfg.provider !== 'java-client' && ctx.cfg.viewerPort > 0 && templateDir ? templateDir : null;
      if (assetTemplate) await beginAssets(assetTemplate);
      if (current !== revision || !ctx.cfg.enabled) throw new Error('启动已取消。');
      phase = 'starting';
      await start(host);
      if (current !== revision || !ctx.cfg.enabled) { await stop(); throw new Error('启动已取消。'); }
      mounted = true; phase = 'running';
    } catch (error) {
      if (current === revision) {
        phase = 'failed'; startupError = error instanceof Error ? error.message : 'World 启动失败。';
        await cancelAssets();
      }
      throw error;
    }
  };
  world.stop = async () => {
    const current = ++revision; mounted = false; phase = 'stopped'; startupError = null;
    const settling = cancelAssets();
    try { await stop(); } finally {
      await settling;
      if (current === revision) { assets = null; assetError = null; assetTemplate = null; }
    }
  };
  const state = async () => {
    const cfg = ctx.cfg, declaration = base?.();
    return { available: !!ctx.persist && !!ctx.restart, mounted, enabled: cfg.enabled, provider: cfg.provider,
      phase, startupError, assets, assetError, assetPreparing: !!assetJob,
      settings: { host: cfg.host, port: cfg.port, username: cfg.username, auth: cfg.auth, version: cfg.version,
        serverPack: cfg.serverPack ?? 'none', viewerPort: cfg.viewerPort },
      loginName: cfg.serverPack === 'qiandengji' ? mymcLoginName(cfg.username, cfg.preserveLoginName) : cfg.username,
      connection: declaration?.connection ?? null, lamps: declaration?.lamps ?? [], links: declaration?.links ?? [],
      portal: portal ? await portal.state().catch(() => ({ available: false, state: 'unknown', message: '网站身份文件未验证；原游戏连接保留。' })) : null };
  };
  const patchFrom = (value: unknown): Partial<MymcConfigSection> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请填写服务器地址和账号。');
    const form = value as Record<string, unknown>;
    if (typeof form.address !== 'string' || typeof form.username !== 'string') throw new Error('请填写服务器地址和账号。');
    let address: { host: string; port: number };
    try { address = parseMinecraftServerAddress(form.address); }
    catch { throw new Error('服务器地址格式不正确，请填写主机名或 主机名:端口；IPv6 使用 [地址]:端口。'); }
    const patch: Partial<MymcConfigSection> = { ...address, username: form.username.trim() };
    if (form.auth !== undefined) {
      if (form.auth !== 'offline' && form.auth !== 'microsoft') throw new Error('账号验证请选择离线或微软正版。');
      patch.auth = form.auth;
    }
    if (form.version !== undefined) {
      if (typeof form.version !== 'string') throw new Error('协议版本须为 auto 或明确版本号。');
      patch.version = form.version.trim() || 'auto';
    }
    if (form.serverPack !== undefined) {
      if (form.serverPack !== 'none' && form.serverPack !== 'qiandengji') throw new Error('未知服务器资料包。');
      patch.serverPack = form.serverPack;
    }
    if (form.viewerPort !== undefined) {
      if (!Number.isInteger(form.viewerPort) || (form.viewerPort as number) < 0 || (form.viewerPort as number) > 65535)
        throw new Error('观战端口须为 0–65535 的整数。');
      patch.viewerPort = form.viewerPort as number;
    }
    validate({ ...ctx.cfg, ...patch });
    return patch;
  };
  const invoke = async (panel: string, method: string, args: unknown[]) => {
    if (panel !== 'quick-start') {
      if (panel === 'connection' && method === 'state' && !mounted) return {
        preparation: { phase, detail: startupError, assets, assetError },
        server: { host: ctx.cfg.host, port: ctx.cfg.port, requestedVersion: ctx.cfg.version, actualVersion: null },
        connection: null, accounts: {}, clients: {},
      };
      const parent = base?.();
      if (!parent?.invoke) throw new Error('World 面板暂不可用。');
      return parent.invoke(panel, method, args);
    }
    if (method === 'state') return state();
    if (!['save', 'start', 'stop', 'retry-assets', 'portal-prepare', 'portal-status', 'portal-import', 'portal-start'].includes(method)) throw new Error('未知启动操作。');
    if (method === 'retry-assets') {
      if (mutation) throw new Error('正在处理连接，请稍候。');
      if (!mounted || !ctx.cfg.enabled || !assetTemplate) throw new Error('请先启动启用了网页观战的游戏。');
      if (assetJob || (assets?.phase === 'ready' && !assetError)) return state();
      mutation = beginAssets(assetTemplate);
      try { await mutation; return await state(); } finally { mutation = null; }
    }
    if (!method.startsWith('portal-') || method === 'portal-start') {
      if (!ctx.persist || !ctx.restart) throw new Error('当前宿主未提供配置保存与 World 启停接口，请升级 Cortico。');
    }
    if (mutation) throw new Error('正在处理连接，请稍候。');
    if (method.startsWith('portal-') && !portal) throw new Error('宿主未提供私有数据目录，无法保存网站身份。');
    if (method.startsWith('portal-') && method !== 'portal-start') {
      const run = async () => {
        const form = args[0] as Record<string, unknown> | undefined;
        if (method === 'portal-prepare') await portal!.prepare({ inviteUrl: form?.inviteUrl, username: form?.username });
        else if (method === 'portal-import') await portal!.importIdentity(form?.identityFile);
        else await portal!.status();
        return state();
      };
      mutation = run(); try { return await mutation; } finally { mutation = null; }
    }
    const execute = async () => {
    // Validation precedes configuration changes or interruption. Allowlist form fields only.
    const starting = method === 'start' || method === 'portal-start';
    if (starting && ctx.cfg.provider === 'java-client') throw new Error('当前使用原生客户端，请在高级配置中连接；快捷启动用于 Mineflayer。');
    let patch: Partial<MymcConfigSection>;
    if (method === 'portal-start') {
      const settings = await portal!.connectionSettings();
      patch = { ...patchFrom({ address: `${settings.host}:${settings.port}`, username: settings.username,
        version: settings.version, auth: settings.auth, serverPack: 'qiandengji' }),
        preserveLoginName: true, loginConfigFile: settings.loginConfigFile };
      validate({ ...ctx.cfg, ...patch });
    } else patch = method === 'stop' ? {} : patchFrom(args[0]);
    // Opening an App that is already connected must not cancel its body task.
    // A failed/disconnected connection remains retryable through the same button.
    if (starting && ctx.cfg.enabled && mounted && (await state()).connection?.ready === true
      && Object.entries(patch).every(([key, value]) => Object.is(ctx.cfg[key as keyof MymcConfigSection], value))) {
      return { saved: true, requested: method, alreadyConnected: true, ...await state() };
    }
      if (method === 'stop') assetJob?.controller.abort(new Error('启动已取消。'));
      ctx.persist!({ ...patch, ...(method === 'save' ? {} : { enabled: starting }) });
      if (method !== 'save') await ctx.restart!();
      return { saved: true, requested: method, ...await state() };
    };
    mutation = execute();
    try { return await mutation; }
    finally { mutation = null; }
  };
  world.console = (): WorldConsoleDecl => {
    const declaration = base?.() ?? {};
    return { ...declaration, panels: [{ id: 'quick-start', title: '开始游戏', getMethods: ['state'] },
      ...(declaration.panels ?? []).filter(panel => panel.id !== 'quick-start')], invoke };
  };
  // API 6 and the explicitly built private API 5 adapter share one contribution.
  Object.defineProperty(world, 'webUi', { value: world.console.bind(world), configurable: true });
  return world;
}
