import type { WebUiPanel } from 'cortico/web/shared/client-panel.ts';

interface SetupState {
  available: boolean; mounted: boolean; enabled: boolean; provider: string; startupError?: string | null;
  settings: { host: string; port: number; username: string; auth: string; version: string; serverPack: string; viewerPort: number };
  loginName: string; connection: { ready: boolean; phase: string } | null;
  assets?: { phase: string; completed: number; total: number } | null;
  assetError?: string | null; assetPreparing?: boolean;
  alreadyConnected?: boolean;
  portal?: { available: boolean; identitySaved?: boolean; username?: string | null; state: string;
    gameAccountCreated?: boolean; checkedAt?: string | null; message: string } | null;
  lamps: { label: string; state: string; hint?: string }[]; links: { label: string; href: string }[];
}

/** Only the owning World data plane is used; no host internals or model endpoints. */
export const quickStartPanel: WebUiPanel = {
  mount(ctx) {
    const { ui } = ctx;
    const card = ui.sheet({ title: '开始游戏', en: 'quick start',
      desc: '千灯纪邀请可在下方准备账号；已有服务器填写地址后进入。模型、人设和记忆沿用 Cortico。' });
    ctx.root.append(card.el);
    const address = ui.input({ placeholder: '例如 mc.example.com:25565' });
    const username = ui.input({ placeholder: '游戏名；正版模式填写账号标识' });
    const auth = ui.select({ options: [{ value: 'offline', label: '离线账号（服务器允许时）' }, { value: 'microsoft', label: '微软正版账号' }] });
    const pack = ui.select({ options: [{ value: 'none', label: '普通 Minecraft' }, { value: 'qiandengji', label: '千灯纪 RPG' }] });
    const identity = ui.msgline();
    const form = ui.h('div', 'mc-quick-form');
    form.append(ui.field('游戏类型', pack), ui.field('服务器地址', address), ui.field('账号 / 游戏名', username), ui.field('账号验证', auth));
    const more = ui.h('details', 'mc-fold'), summary = ui.h('summary', '', '可选设置');
    const version = ui.input({ value: 'auto', placeholder: 'auto' });
    const viewerPort = ui.input({ type: 'number', value: '7793' });
    const advanced = ui.h('div', 'mc-quick-form');
    advanced.append(ui.field('协议版本（自动识别）', version), ui.field('网页观战端口（0 关闭）', viewerPort));
    more.append(summary, advanced, ui.h('p', 'pagedesc', '原生客户端、服务器密码登录、记忆服务和快决策在本页高级配置中按需设置。'));
    const msg = ui.msgline(), status = ui.msgline(), links = ui.actions(), actions = ui.actions();
    const save = ui.button('保存配置'), start = ui.button('进入游戏', { variant: 'primary' });
    const stop = ui.button('断开游戏', { variant: 'danger' }), retryAssets = ui.button('重试音频资源');
    actions.append(start, save, stop, retryAssets);
    const portal = ui.h('details', 'mc-fold mc-portal'), portalSummary = ui.h('summary', '', '千灯纪网站邀请 · 准备账号并进入游戏');
    const portalBody = ui.h('div', 'mc-foldbody'), portalLinks = ui.actions();
    for (const [label, href] of [['打开网站连接中心', 'https://mc.kangqiang.site/#connections'], ['接入说明', 'https://mc.kangqiang.site/agent-api.html']]) {
      const a = ui.h('a', 'btn', label); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; portalLinks.append(a);
    }
    const invite = ui.input({ type: 'password', placeholder: '粘贴 https://mc.kangqiang.site/join#invite=…' });
    invite.autocomplete = 'off';
    const portalName = ui.input({ placeholder: 'ag_角色名，总长不超过16位' });
    const portalForm = ui.h('div', 'mc-quick-form');
    const inviteField = ui.field('专属接入链接', invite);
    portalForm.append(inviteField, ui.field('新角色名', portalName));
    const portalActions = ui.actions(), prepare = ui.button('准备账号'), query = ui.button('查询结果'), enterPortal = ui.button('使用此身份进入游戏', { variant: 'primary' });
    portalActions.append(prepare, query, enterPortal);
    const portalStatus = ui.msgline(), importDetails = ui.h('details', 'mc-fold');
    const identityFile = ui.input({ placeholder: '已有 identity.json 的本机绝对路径' }), importIdentity = ui.button('续用身份文件');
    importDetails.append(ui.h('summary', '', '已有网站 API 身份'), identityFile, importIdentity);
    portalBody.append(portalLinks, ui.h('p', 'pagedesc', '在网站连接中心点击“邀请自己的 Agent”，将专属链接粘贴到这里。已有游戏角色继续使用原账号连接，不用邀请重建。'),
      portalForm, portalActions, portalStatus, importDetails);
    portal.append(portalSummary, portalBody);
    const manual = ui.h('details', 'mc-fold');
    manual.append(ui.h('summary', '', '已有服务器 / 手动连接'), form, identity, more, actions);
    card.body.append(portal, manual, msg, status, links);
    let current: SetupState | null = null, initialized = false, busy = false, reading = false;
    const serverAddress = (s: SetupState['settings']) => s.host ? `${s.host.includes(':') ? `[${s.host}]` : s.host}:${s.port}` : '';
    const sameSettings = () => !!current && address.value.trim() === serverAddress(current.settings)
      && username.value.trim() === current.settings.username && auth.value === current.settings.auth
      && (version.value.trim() || 'auto') === current.settings.version && pack.value === current.settings.serverPack
      && Number(viewerPort.value) === current.settings.viewerPort;
    const explainIdentity = () => {
      identity.textContent = pack.value === 'qiandengji'
        ? '千灯纪资料与玩法协议已选择；Agent 登录名前缀由资料包处理，已有角色沿用高级配置中的原登录名设置。'
        : '连接你自己的 Minecraft Java 服务器，使用填写的账号；无需另配模型或安装观战客户端。';
    };
    const locks = () => {
      start.disabled = save.disabled = busy || !current?.available;
      stop.disabled = busy || !current?.enabled;
      retryAssets.hidden = !current?.assetError;
      retryAssets.disabled = busy || !current?.mounted || current?.assetPreparing === true;
      if (current?.provider === 'java-client') start.disabled = true;
      prepare.disabled = busy || !current?.portal?.available;
      query.disabled = busy || !current?.portal?.identitySaved;
      importIdentity.disabled = busy || !current?.portal?.available;
      enterPortal.disabled = busy || !current?.available || current.provider === 'java-client'
        || current.portal?.state !== 'ready' || current.portal.gameAccountCreated !== true;
      invite.disabled = portalName.readOnly = current?.portal?.identitySaved === true;
    };
    const render = (state: SetupState) => {
      current = state;
      if (!initialized) {
        const s = state.settings;
        address.value = serverAddress(s);
        username.value = s.username; auth.value = s.auth; version.value = s.version; pack.value = s.serverPack; viewerPort.value = String(s.viewerPort);
        initialized = true;
        explainIdentity();
        portal.open = !s.host; manual.open = !!s.host;
      }
      status.textContent = state.connection?.ready ? `已进入游戏 · ${state.loginName}`
        : state.mounted ? `World 已启动，等待进服与认证${state.lamps.length ? ` · ${state.lamps.map(l => l.hint || l.label).join('；')}` : ''}`
          : state.enabled ? '正在启动；是否进入游戏以连接状态为准。'
            : state.portal?.identitySaved ? (state.portal.state === 'ready' && state.portal.gameAccountCreated === true
              ? '网站账号已就绪，点击“使用此身份进入游戏”。' : '网站账号准备中；按上方结果继续，尚未连接游戏。')
              : '使用网站邀请接入，或展开“已有服务器 / 手动连接”。';
      if (!state.available) status.textContent = '宿主未提供快捷配置接口，请升级 Cortico 后使用。';
      if (state.startupError) status.textContent = `World 启动失败：${state.startupError}`;
      if (state.enabled && state.assets && state.assets.phase !== 'ready') status.textContent += state.assets.phase === 'copying'
        ? ' · 正在准备基础画面资源。'
        : ` · 音频后台准备 ${state.assets.completed}/${state.assets.total}，尚未全部就绪。`;
      if (state.assetError) status.textContent += ` · 音频资源未完整准备：${state.assetError}；可重试，当前游戏连接保留。`;
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
      start.textContent = state.connection?.ready ? '进入已连接的游戏' : '进入游戏';
      if (state.portal) {
        portalStatus.textContent = `${state.portal.username ? state.portal.username + ' · ' : ''}${state.portal.message}`;
        prepare.textContent = state.portal.identitySaved ? '继续准备原身份' : '准备账号';
        inviteField.hidden = state.portal.identitySaved === true;
        inviteField.style.display = state.portal.identitySaved ? 'none' : '';
        portalStatus.className = state.portal.state === 'ready' ? 'msgline' : state.portal.state === 'unknown' ? 'msgline bad' : 'mc-portal-status';
        if (state.portal.username) portalName.value = state.portal.username;
      }
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
        if ((method === 'stop' || (method === 'start' && !(current?.connection?.ready && sameSettings()))) && current?.mounted && !await ui.confirm({
          title: method === 'stop' ? '断开游戏？' : '重新连接游戏？', body: '当前身体任务会结束，会话和记忆保留。',
        })) return;
        msg.textContent = method === 'save' ? '正在保存…' : method === 'start' ? '正在连接…' : '正在断开…';
        const result = await ctx.invoke<SetupState>(method, [{ address: address.value, username: username.value,
          auth: auth.value, version: version.value, serverPack: pack.value, viewerPort: Number(viewerPort.value) }]);
        if (ctx.signal.aborted) return;
        render(result);
        msg.textContent = method === 'save' ? '配置已保存，点击“进入游戏”连接。'
          : result.alreadyConnected ? '已连接，继续当前游戏。点击下方观战入口查看画面。'
          : method === 'start' ? '正在连接。正版账号请在“服务器与账号登录”完成微软授权；进服状态见下方。' : '游戏已断开。';
        msg.className = 'msgline';
        await ctx.refresh();
      } catch (error) {
        if (!ctx.signal.aborted) { msg.textContent = error instanceof Error ? error.message : '操作失败'; msg.className = 'msgline bad'; }
      } finally { busy = false; locks(); }
    };
    for (const [button, method] of [[save, 'save'], [start, 'start'], [stop, 'stop']] as const)
      button.addEventListener('click', () => { void act(method); }, { signal: ctx.signal });
    retryAssets.addEventListener('click', () => {
      if (busy || ctx.signal.aborted) return;
      busy = true; locks();
      void ctx.invoke<SetupState>('retry-assets').then(result => {
        if (!ctx.signal.aborted) render(result);
      }, error => {
        if (!ctx.signal.aborted) msg.textContent = error instanceof Error ? error.message : '资源重试失败。';
      }).finally(() => { busy = false; locks(); });
    }, { signal: ctx.signal });
    const portalAct = async (method: 'portal-prepare' | 'portal-status' | 'portal-import' | 'portal-start') => {
      if (busy || ctx.signal.aborted) return;
      busy = true; locks();
      try {
        if (method === 'portal-start' && current?.mounted && !await ui.confirm({ title: '使用网站身份连接千灯纪？',
          body: '将连接 micro.kangqiang.site:25702。当前身体任务会结束，会话与记忆保留。' })) return;
        portalStatus.textContent = method === 'portal-start' ? '正在确认建号结果并连接…' : '正在核对网站接入状态…';
        const result = await ctx.invoke<SetupState>(method, method === 'portal-prepare'
          ? [{ inviteUrl: invite.value, username: portalName.value }]
          : method === 'portal-import' ? [{ identityFile: identityFile.value }] : []);
        if (ctx.signal.aborted) return;
        if (method === 'portal-start') initialized = false;
        render(result);
        if (method === 'portal-start') msg.textContent = result.alreadyConnected ? '继续当前游戏。'
          : '连接已启动；等待服务器认证成功并进入真实游戏世界。';
        await ctx.refresh();
      } catch (error) { if (!ctx.signal.aborted) { portalStatus.textContent = error instanceof Error ? error.message : '网站接入状态未验证'; portalStatus.className = 'msgline bad'; } }
      finally { invite.value = ''; busy = false; locks(); }
    };
    for (const [button, method] of [[prepare, 'portal-prepare'], [query, 'portal-status'], [importIdentity, 'portal-import'], [enterPortal, 'portal-start']] as const)
      button.addEventListener('click', () => { void portalAct(method); }, { signal: ctx.signal });
    pack.addEventListener('change', explainIdentity, { signal: ctx.signal });
    locks(); void refresh(); ctx.interval(() => { void refresh(); }, 2000);
  },
};
