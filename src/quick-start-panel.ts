import type { WebUiPanel } from 'cortico/web/shared/client-panel.ts';

interface SetupState {
  available: boolean; mounted: boolean; enabled: boolean; provider: string;
  settings: { host: string; port: number; username: string; auth: string; version: string; serverPack: string; viewerPort: number };
  loginName: string; connection: { ready: boolean; phase: string } | null;
  assets?: { phase: string; completed: number; total: number } | null;
  lamps: { label: string; state: string; hint?: string }[]; links: { label: string; href: string }[];
}

/** Only the owning World data plane is used; no host internals or model endpoints. */
export const quickStartPanel: WebUiPanel = {
  mount(ctx) {
    const { ui } = ctx;
    const card = ui.sheet({ title: '开始游戏', en: 'quick start',
      desc: '填写服务器和账号，保存并启动即可。思考模型沿用 Cortico 已有设置；网页观战无需另装游戏客户端。' });
    ctx.root.append(card.el);
    const address = ui.input({ placeholder: '例如 mc.example.com:25565' });
    const username = ui.input({ placeholder: '游戏名；正版模式填写账号标识' });
    const auth = ui.select({ options: [{ value: 'offline', label: '离线账号（服务器允许时）' }, { value: 'microsoft', label: '微软正版账号' }] });
    const form = ui.h('div', 'mc-quick-form');
    form.append(ui.field('服务器地址', address), ui.field('账号 / 游戏名', username), ui.field('账号验证', auth));
    const more = ui.h('details', 'mc-fold'), summary = ui.h('summary', '', '可选设置');
    const version = ui.input({ value: 'auto', placeholder: 'auto' });
    const pack = ui.select({ options: [{ value: 'none', label: '普通 Minecraft' }, { value: 'qiandengji', label: '千灯纪资料包' }] });
    const viewerPort = ui.input({ type: 'number', value: '7793' });
    const advanced = ui.h('div', 'mc-quick-form');
    advanced.append(ui.field('协议版本（自动识别）', version), ui.field('服务器资料包', pack), ui.field('网页观战端口（0 关闭）', viewerPort));
    more.append(summary, advanced, ui.h('p', 'pagedesc', '原生客户端、服务器密码登录、记忆服务和快决策在本页高级配置中按需设置。'));
    const msg = ui.msgline(), status = ui.msgline(), links = ui.actions(), actions = ui.actions();
    const save = ui.button('保存配置'), start = ui.button('保存并启动', { variant: 'primary' });
    const stop = ui.button('断开游戏', { variant: 'danger' });
    actions.append(start, save, stop);
    card.body.append(form, more, actions, msg, status, links);
    let current: SetupState | null = null, initialized = false, busy = false, reading = false;
    const locks = () => {
      start.disabled = save.disabled = busy || !current?.available;
      stop.disabled = busy || !current?.enabled;
      if (current?.provider === 'java-client') start.disabled = true;
    };
    const render = (state: SetupState) => {
      current = state;
      if (!initialized) {
        const s = state.settings;
        address.value = s.host ? `${s.host.includes(':') ? `[${s.host}]` : s.host}:${s.port}` : '';
        username.value = s.username; auth.value = s.auth; version.value = s.version; pack.value = s.serverPack; viewerPort.value = String(s.viewerPort);
        initialized = true;
      }
      status.textContent = state.connection?.ready ? `已进入游戏 · ${state.loginName}`
        : state.mounted ? `World 已启动，等待进服与认证${state.lamps.length ? ` · ${state.lamps.map(l => l.hint || l.label).join('；')}` : ''}`
          : state.enabled ? '正在启动；是否进入游戏以连接状态为准。' : '游戏未连接';
      if (!state.available) status.textContent = '宿主未提供快捷配置接口，请升级 Cortico 后使用。';
      if (state.assets && state.assets.phase !== 'ready') status.textContent = `准备 / 校验音画资源 ${state.assets.completed}/${state.assets.total}；完成后自动连接，复用已完成的缓存。`;
      if (state.provider === 'java-client') status.textContent += ' · 原生客户端请使用高级配置。';
      links.replaceChildren();
      for (const link of state.links.filter(link => /观战|第三人称|第一人称|基础画面/.test(link.label))) {
        try {
          const url = new URL(link.href);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
          const a = ui.h('a', 'btn', link.label); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a);
        } catch { /* An absent or malformed viewer link is not a connected viewer. */ }
      }
      locks();
    };
    const refresh = async () => {
      if (reading || ctx.signal.aborted) return;
      reading = true;
      try { const state = await ctx.invoke<SetupState>('state'); if (!ctx.signal.aborted) render(state); }
      catch (error) { if (!ctx.signal.aborted) status.textContent = error instanceof Error ? error.message : '连接状态未验证'; }
      finally { reading = false; }
    };
    const act = async (method: 'save' | 'start' | 'stop') => {
      if (busy || ctx.signal.aborted) return;
      busy = true; locks();
      try {
        if ((method === 'stop' || method === 'start') && current?.mounted && !await ui.confirm({
          title: method === 'stop' ? '断开游戏？' : '重新连接游戏？', body: '当前身体任务会结束，会话和记忆保留。',
        })) return;
        msg.textContent = method === 'save' ? '正在保存…' : method === 'start' ? '正在连接…' : '正在断开…';
        const result = await ctx.invoke<SetupState>(method, [{ address: address.value, username: username.value,
          auth: auth.value, version: version.value, serverPack: pack.value, viewerPort: Number(viewerPort.value) }]);
        if (ctx.signal.aborted) return;
        render(result);
        msg.textContent = method === 'save' ? '配置已保存，点击“保存并启动”进入游戏。'
          : method === 'start' ? '启动请求已处理；正版账号请在“服务器与账号登录”完成微软授权。' : '游戏已断开。';
        msg.className = 'msgline';
        await ctx.refresh();
      } catch (error) {
        if (!ctx.signal.aborted) { msg.textContent = error instanceof Error ? error.message : '操作失败'; msg.className = 'msgline bad'; }
      } finally { busy = false; locks(); }
    };
    for (const [button, method] of [[save, 'save'], [start, 'start'], [stop, 'stop']] as const)
      button.addEventListener('click', () => { void act(method); }, { signal: ctx.signal });
    locks(); void refresh(); ctx.interval(() => { void refresh(); }, 2000);
  },
};
