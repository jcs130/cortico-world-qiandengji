import type { ConsolePanel } from 'cortico/web/shared/client-panel.ts';
import type { PublicAccountState } from './client/authentication.ts';

/** Thin Cortico UI adapter; credentials and challenges stay in the operator panel. */
export const connectionPanel: ConsolePanel = {
  mount(ctx) {
    const sheet = ctx.ui.foldSheet('connection', { title: '服务器与正版账号', en: 'connection',
      desc: '连接外部 Java 服务器。协议、正版验证和客户端窗口分别确认；账号在本 World 配置中填写。' });
    ctx.root.append(sheet.el);
    let reading = false;
    const refresh = async () => {
      if (reading || ctx.signal.aborted) return; reading = true;
      try {
        const state = await ctx.invoke<{ server: { host: string; port: number; actualVersion: string | null; requestedVersion: string };
          accounts: Record<string, PublicAccountState>; clients: Record<string, { phase: string; detail: string | null }> }>('state');
        if (ctx.signal.aborted) return;
        sheet.body.replaceChildren(ctx.ui.h('p', '', `${state.server.host}:${state.server.port} · Java ${state.server.actualVersion ?? '尚未协商'} · 配置 ${state.server.requestedVersion}`));
        for (const [lane, title] of [['agent', 'Agent'], ['observer', '观察者'], ['player', '玩家']]) {
          const auth = state.accounts[lane], row = ctx.ui.h('section', '');
          row.append(ctx.ui.h('h3', '', `${title} · ${auth.mode === 'microsoft' ? '微软正版' : '离线'} · ${auth.profile?.name ?? auth.phase}`));
          if (auth.challenge) {
            row.append(ctx.ui.h('p', '', `微软登录码：${auth.challenge.userCode}`));
            const link = ctx.ui.h('a', '', '打开微软授权'); link.href = auth.challenge.verificationUri; link.target = '_blank'; link.rel = 'noreferrer noopener'; row.append(link);
          }
          if (auth.detail) row.append(ctx.ui.h('p', '', auth.detail));
          const client = state.clients[lane];
          if (client) row.append(ctx.ui.h('p', '', `客户端 ${client.phase}${client.detail ? ` · ${client.detail}` : ''}`));
          if (lane !== 'agent') {
            for (const [action, label] of [['start', '启动窗口'], ['stop', '关闭窗口']]) {
              const button = ctx.ui.h('button', '', label);
              button.disabled = action === 'start' && ['starting', 'running'].includes(client?.phase);
              button.onclick = async () => {
                button.disabled = true;
                try { await ctx.invoke(`${lane}.${action}`); await refresh(); }
                catch { row.append(ctx.ui.h('p', '', '操作未完成，请查看客户端状态。')); }
              };
              row.append(button);
            }
          }
          sheet.body.append(row);
        }
      } catch { if (!ctx.signal.aborted) sheet.body.textContent = '连接状态未验证。请确认 World 已启动。'; }
      finally { reading = false; }
    };
    void refresh(); ctx.interval(() => { void refresh(); }, 2000);
  },
};
