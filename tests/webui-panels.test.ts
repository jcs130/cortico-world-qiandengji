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
