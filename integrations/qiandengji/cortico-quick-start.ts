import type { World, WorldConsoleDecl } from 'agent-mc-world/contracts';
import { parseMinecraftServerAddress, prepareMinecraftViewerAssets, type ViewerAssetProgress } from 'agent-mc-world/client';
import { join } from 'node:path';
import type { MymcConfigSection } from './config.ts';
import { mymcLoginName } from './config.ts';
import type { WorldContext } from '../../adapters/cortico/types.ts';

/** Host setup only. No independent game loop, model configuration or credential copies. */
export function withQuickStart<T extends World>(world: T, ctx: WorldContext<MymcConfigSection>,
  validate: (cfg: MymcConfigSection) => void,
  viewer?: { templateDir(): string; setDirectory(directory: string): void }): T {
  const base = world.console?.bind(world);
  const start = world.start.bind(world), stop = world.stop.bind(world);
  let mounted = false, mutation: Promise<unknown> | null = null;
  let assets: ViewerAssetProgress | null = null, assetAbort: AbortController | null = null;
  world.start = async host => {
    const templateDir = viewer?.templateDir() ?? ctx.cfg.viewerAssetsDir;
    if (ctx.cfg.provider !== 'java-client' && ctx.cfg.viewerPort > 0 && templateDir) {
      assetAbort = new AbortController();
      try {
        const prepared = await prepareMinecraftViewerAssets({ templateDir,
          cacheDir: join(ctx.dataDir, 'minecraft-viewer'), signal: assetAbort.signal, onProgress: value => {
            assets = value; if (!ctx.cfg.enabled) assetAbort?.abort(new Error('启动已取消。'));
          } });
        if (prepared.directory !== templateDir && !viewer) throw new Error('宿主未提供运行时资源目录接口。');
        viewer?.setDirectory(prepared.directory);
      } finally { assetAbort = null; }
    }
    if (!ctx.cfg.enabled) throw new Error('启动已取消。');
    await start(host); mounted = true;
  };
  world.stop = async () => { mounted = false; assetAbort?.abort(); await stop(); };
  const state = () => {
    const cfg = ctx.cfg, declaration = base?.();
    return { available: !!ctx.persist && !!ctx.restart, mounted, enabled: cfg.enabled, provider: cfg.provider, assets,
      settings: { host: cfg.host, port: cfg.port, username: cfg.username, auth: cfg.auth, version: cfg.version,
        serverPack: cfg.serverPack ?? 'none', viewerPort: cfg.viewerPort },
      loginName: cfg.serverPack === 'qiandengji' ? mymcLoginName(cfg.username, cfg.preserveLoginName) : cfg.username,
      connection: declaration?.connection ?? null, lamps: declaration?.lamps ?? [], links: declaration?.links ?? [] };
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
      const parent = base?.();
      if (!parent?.invoke) throw new Error('World 面板暂不可用。');
      return parent.invoke(panel, method, args);
    }
    if (method === 'state') return state();
    if (!['save', 'start', 'stop'].includes(method)) throw new Error('未知启动操作。');
    if (!ctx.persist || !ctx.restart) throw new Error('当前宿主未提供配置保存与 World 启停接口，请升级 Cortico。');
    if (mutation) throw new Error('正在处理连接，请稍候。');
    // Validation precedes any disk write or interruption. Allowlist form fields only.
    const patch = method === 'stop' ? {} : patchFrom(args[0]);
    if (method === 'start' && ctx.cfg.provider === 'java-client') throw new Error('当前使用原生客户端，请在高级配置中连接；快捷启动用于 Mineflayer。');
    const perform = async () => {
      if (method === 'stop') assetAbort?.abort(new Error('启动已取消。'));
      ctx.persist!({ ...patch, ...(method === 'save' ? {} : { enabled: method === 'start' }) });
      if (method !== 'save') await ctx.restart!();
      return { saved: true, requested: method, ...state() };
    };
    mutation = perform();
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
