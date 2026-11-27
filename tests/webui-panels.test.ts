// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import bundle from '../src/console-client.ts';
import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

function mount(invoke: WebUiPanelContext['invoke']) {
  const root = document.createElement('div'), controller = new AbortController();
  const timers: Array<() => void> = [];
  const h = (tag: string, cls?: string, text?: string) => {
    const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el;
  };
  const ctx = { root, signal: controller.signal, invoke,
    interval: (fn: () => void) => { timers.push(fn); return { dispose() {} }; },
    ui: { h, msgline: (s: string) => h('div', '', s), button: (s: string) => h('button', '', s), actions: () => h('div'),
      sheet: (s: {title: string}) => { const el = h('section'), body = h('div'); el.append(h('h3', '', s.title), body); return { el, body }; } },
  } as unknown as WebUiPanelContext;
  bundle.panels.practice.mount(ctx);
  return { root, controller, tick: () => timers.forEach(fn => fn()) };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function mountQuickStart(state: any) {
  const root = document.createElement('div'), controller = new AbortController(), confirm = vi.fn(async () => true);
  const invoke = vi.fn(async () => state), refresh = vi.fn(async () => {});
  const h = (tag: string, cls?: string, text?: string) => {
    const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el;
  };
  const ctx = { root, signal: controller.signal, invoke, refresh, interval: () => ({ dispose() {} }), ui: {
    h, confirm, msgline: () => h('div'), button: (text: string) => h('button', '', text), actions: () => h('div'),
    input: (options: any) => { const input = h('input') as HTMLInputElement; Object.assign(input, options); return input; },
    select: ({ options }: any) => { const select = h('select') as HTMLSelectElement;
      options.forEach((item: any) => { const option = h('option', '', item.label) as HTMLOptionElement; option.value = item.value; select.append(option); }); return select; },
    field: (label: string, input: HTMLElement) => { const field = h('label', '', label); field.append(input); return field; },
    sheet: ({ title }: any) => { const el = h('section'), body = h('div'); el.append(h('h3', '', title), body); return { el, body }; },
  } } as unknown as WebUiPanelContext;
  bundle.panels['quick-start'].mount(ctx);
  const button = (label: string) => Array.from(root.querySelectorAll('button')).find(button => button.textContent === label)!;
  return { root, controller, invoke, confirm, button };
}
function quickState(named = true) {
  const settings = { server: named ? 'tig' : '', host: 'tig.fixture.invalid', port: 25565, username: 'Fixture', auth: 'offline', version: '1.21.11', serverPack: 'none', viewerPort: 0 };
  return { available: true, mounted: true, enabled: true, provider: 'mineflayer', connectedServer: named ? 'tig' : '', settings,
    loginName: 'Fixture', connection: { ready: true, phase: 'online' }, lamps: [], links: [],
    ...(named ? { profiles: [
      { ...settings, id: 'tig', label: 'TIG 1.21.11', selected: true, selectable: true },
      { ...settings, id: 'tangerine', label: 'Tangerine 26.2', host: 'tangerine.fixture.invalid', version: '26.2', selected: false, selectable: true },
      { id: 'blocked', label: 'Disabled profile', selected: false, selectable: false },
    ] } : {}),
  };
}
describe('optional quick-start profile menu', () => {
  it('keeps the original no-profile form and does not mutate on mount', async () => {
    const r = mountQuickStart(quickState(false)); await flush();
    expect(r.root.querySelectorAll('select')).toHaveLength(2); expect(r.root.textContent).not.toContain('命名服务器');
    expect(r.invoke.mock.calls).toEqual([['state']]); r.controller.abort();
  });
  it('reuses the active profile without reconnect confirmation and sends only its id', async () => {
    const r = mountQuickStart(quickState()); await flush(); r.invoke.mockClear();
    r.button('进入已连接的游戏').click(); await flush();
    expect(r.confirm).not.toHaveBeenCalled(); expect(r.invoke).toHaveBeenCalledWith('start', [{ server: 'tig' }]); r.controller.abort();
  });
  it('saves a switch without confirmation, then confirms before reconnecting the mounted profile', async () => {
    const state = quickState(), r = mountQuickStart(state); await flush();
    const server = r.root.querySelector('select')!; server.value = 'tangerine'; server.dispatchEvent(new Event('change'));
    r.invoke.mockClear(); r.button('保存配置').click(); await flush();
    expect(r.confirm).not.toHaveBeenCalled(); expect(r.invoke).toHaveBeenCalledWith('save', [{ server: 'tangerine' }]);
    r.confirm.mockResolvedValueOnce(false); r.invoke.mockClear();
    r.button('进入已连接的游戏').click(); await flush();
    expect(r.confirm).toHaveBeenCalledOnce(); expect(r.invoke).not.toHaveBeenCalled(); r.controller.abort();
  });
  it('keeps the actual connected identity when another profile has only been saved', async () => {
    const before = quickState();
    const state = { ...before, connectedSettings: before.settings, connectedLoginName: 'OriginalRole', loginName: 'NextRole',
      settings: { ...before.settings, server: 'tangerine', host: 'tangerine.fixture.invalid', username: 'NextRole' } };
    const r = mountQuickStart(state); await flush();
    expect(r.root.textContent).toContain('已进入游戏 · OriginalRole');
    expect(r.root.textContent).toContain('当前连接尚未切换');
    expect(r.root.textContent).not.toContain('已进入游戏 · NextRole');
    r.controller.abort();
  });

  it('disables unavailable selections and clears selection on ordinary manual edits', async () => {
    const r = mountQuickStart(quickState()); await flush(); const server = r.root.querySelector('select')!;
    expect(server.querySelector<HTMLOptionElement>('option[value="blocked"]')!.disabled).toBe(true);
    server.value = 'blocked'; server.dispatchEvent(new Event('change'));
    expect(r.button('进入已连接的游戏').disabled).toBe(true); expect(r.button('保存配置').disabled).toBe(true);
    const address = r.root.querySelector<HTMLInputElement>('input[placeholder="例如 mc.example.com:25565"]')!;
    address.value = 'manual.fixture.invalid:25565'; address.dispatchEvent(new Event('input'));
    expect(server.value).toBe(''); expect(r.button('保存配置').disabled).toBe(false);
    r.invoke.mockClear(); r.button('保存配置').click(); await flush();
    expect(r.invoke).toHaveBeenCalledWith('save', [expect.objectContaining({ server: '', address: 'manual.fixture.invalid:25565' })]); r.controller.abort();
  });
  it('renders an unknown active selection as unavailable rather than falling back to another profile', async () => {
    const state = quickState(); state.settings.server = 'missing';
    const r = mountQuickStart(state); await flush();
    expect(r.root.querySelector('select')!.value).toBe('missing'); expect(r.button('进入已连接的游戏').disabled).toBe(true);
    r.controller.abort();
  });
});
describe('published WebUI panel coverage and practice lifecycle', () => {
  it('renders enabled/empty and disabled states without starting a model or a game action', async () => {
    const invoke = vi.fn().mockResolvedValueOnce({ enabled: true, jobs: [] }).mockResolvedValue({ enabled: false, jobs: [] });
    const r = mount(invoke); await flush(); expect(r.root.textContent).toContain('还没有练习记录');
    r.tick(); await flush(); expect(r.root.textContent).toContain('未启用');
    expect(invoke.mock.calls.every(([method]) => method === 'state')).toBe(true);
    r.controller.abort(); r.tick(); expect(invoke).toHaveBeenCalledTimes(2);
  });
  it('keeps unknown usage and separates isolated evidence from online adoption, with escaped labels', async () => {
    const r = mount(vi.fn().mockResolvedValue({ enabled: true, jobs: [{ id: 'example', methodId: '<img src=x onerror=alert(1)>',
      status: 'completed', phase: 'settled', stale: false, modelCalls: 2, trials: 6, memory: 'stored',
      usage: { inputTokens: null, outputTokens: 30, cachedTokens: null },
      result: { eligible: true, adopted: false, evidenceCount: 2, train: { baseline: null, candidate: null }, holdout: [] },
    }] }));
    await flush(); expect(r.root.querySelector('img')).toBeNull(); expect(r.root.textContent).toContain('输入 未知 / 缓存 未知');
    expect(r.root.textContent).toContain('已完成隔离试跑'); expect(r.root.textContent).toContain('线上采用：本页未验证');
    r.controller.abort();
  });
  it('does not overlap polls or render a reply after leaving the page', async () => {
    let resolve!: (v: unknown) => void; const invoke = vi.fn(() => new Promise(r => { resolve = r; }));
    const r = mount(invoke as any); r.tick(); r.tick(); expect(invoke).toHaveBeenCalledOnce();
    r.controller.abort(); const before = r.root.textContent; resolve({ enabled: true, jobs: [] }); await flush();
    expect(r.root.textContent).toBe(before); r.tick(); expect(invoke).toHaveBeenCalledOnce();
  });
  it('clears old results on failure and can recover through refresh', async () => {
    const invoke = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({ enabled: true, jobs: [] });
    const r = mount(invoke); await flush(); expect(r.root.textContent).toContain('当前状态未验证：offline');
    r.root.querySelector('button')!.click(); await flush(); expect(r.root.textContent).toContain('还没有练习记录');
    r.controller.abort();
  });
});
