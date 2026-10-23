/** Optional Cortico read-only observation adapter. No game/model dispatch or framework changes. */
import { describeCombatDecision, type CombatDecisionFrame } from 'agent-mc-world/decisions';
type RecordValue = Record<string, any>;
export type ActivitySink = (value: RecordValue) => void;
const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (parts: unknown) => typeof parts === 'string' ? parts : Array.isArray(parts)
  ? parts.filter(part => part && typeof part.text === 'string').map(part => part.text).join('\n') : '';
const parsed = (value: unknown) => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return value; } };
export function activityConsoleUrl(value: string): string | null {
  if (!value.trim()) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) throw new Error('Activity console URL must be an explicit loopback HTTP origin without credentials.');
  return url.origin;
}
export function createCorticoActivityMapper(sink: ActivitySink, { now = () => new Date().toISOString() } = {}) {
  const calls = new Map<string, RecordValue>(), decisions = new Map<string, RecordValue>(), combatFrames = new Map<string, CombatDecisionFrame>(), combatResults = new Map<string, RecordValue>(); let run: string | undefined;
  const publish = (value: RecordValue) => { try { sink({ at: now(), run, source: 'system2', ...value }); } catch { /* Presentation never interrupts the host. */ } };
  function record(value: unknown) {
    const rec = object(value), item = object(rec.item), context = object(rec.context);
    const at = context.ts || now(), model = object(context.origin).model;
    const base = { at, session: rec.sess, round: rec.round, model };
    if (item.type === 'reasoning') publish({ ...base, id: `reasoning:${item.id || context.responseId || at}`,
      kind: 'reasoning', title: '模型思考', status: 'completed', text: text(item.content) || text(item.summary) });
    if (item.type === 'message' && item.role === 'assistant') publish({ ...base, id: `message:${item.id || context.responseId || at}`,
      kind: 'message', title: '模型回应', status: 'completed', text: text(item.content) });
    if (item.type === 'function_call' && typeof item.call_id === 'string') {
      const call = { ...base, id: `tool:${item.call_id}`, kind: 'tool', title: item.name, tool: item.name,
        callId: item.call_id, status: 'started', arguments: parsed(item.arguments) };
      calls.set(item.call_id, call); if (calls.size > 160) calls.delete(calls.keys().next().value!); publish(call);
    }
    if (item.type === 'function_call_output' && typeof item.call_id === 'string') {
      const output = parsed(item.output), result = object(output), body = text(result.text || item.output);
      const accepted = /任务#\d+.*(?:收下了|已受理)|"accepted"\s*:\s*true/.test(body);
      const failed = result.failed === true || item.status === 'failed' || /\[(?:mymc|mc|agentmc)_[a-z_]+\s*失败\]/.test(body);
      const visibleOutput = output && typeof output === 'object' && !Array.isArray(output)
        ? { text: result.text, failed: result.failed, execution: result.execution, meta: result.meta } : output;
      publish({ ...calls.get(item.call_id), ...base, id: `tool:${item.call_id}`, callId: item.call_id, kind: 'tool',
        title: calls.get(item.call_id)?.title || '工具回执', status: failed ? 'failed' : accepted ? 'accepted' : 'completed', result: visibleOutput });
    }
  }
  function frame(value: unknown) {
    const frame = object(value);
    if (frame.t === 'hello') { for (const row of (Array.isArray(frame.session) ? frame.session : []).slice(-160)) record(row); }
    else if (frame.t === 'session.append') record(frame.message);
    // A context handoff does not replay or erase the viewer's already observed activity.
    else if (frame.t === 'session.reset') { for (const row of (Array.isArray(frame.messages) ? frame.messages : []).slice(-80)) record(row); }
    else if (frame.t === 'phase') {
      const phase = object(frame.phase), labels: Record<string, string> = { idle: '等待事件', delivering: '接收事件', model: '模型推理中', tools: '执行工具', backoff: '模型退避等待', handoff: '上下文交接' };
      if (labels[phase.state]) publish({ id: 'current-phase', kind: 'phase', title: labels[phase.state], at: phase.enteredAt || now(), round: phase.round,
        status: phase.state === 'idle' ? 'completed' : 'running', text: Array.isArray(phase.running) && phase.running.length ? `正在执行：${phase.running.join('、')}` : undefined });
    } else if (frame.t === 'event') {
      const event = object(frame.envelope); if (!/^mymc\.task$|^minecraft\.task$/.test(event.type)) return;
      const task = String(event.text || '').match(/任务#(\d+)/)?.[1];
      publish({ id: `execution:${event.run || run || ''}:${event.cursor}`, at: event.ts, kind: 'execution', taskId: task,
        title: task ? `身体任务 #${task}` : '身体执行回执', text: event.text,
        status: /(?:取消|中止|中断)/.test(event.text) ? 'cancelled' : /没做成|失败/.test(event.text) ? 'failed' : /完成:|完成：/.test(event.text) ? 'completed' : 'unknown' });
    } else if (frame.t === 'runlog') {
      const entry = object(frame.entry), data = object(entry.data); if (entry.run) run = entry.run;
      if (entry.event === 'provider-decision') {
        const previous = decisions.get(data.id), attempt = object(data.attempt || (Array.isArray(data.attempts) ? data.attempts.at(-1) : data));
        const origin = object(attempt.origin), role = entry.sess || data.role || previous?.session || '';
        // Classifier/host combat provenance is explicit, never inferred from a player's text.
        const source = /^decision:|system1|host-decision/.test(role) ? 'system1' : role === 'main' ? 'system2' : 'unknown';
        const record = { id: `decision:${entry.run || ''}:${data.id || entry.seq}`, at: entry.ts, source, session: role, kind: 'decision',
          title: origin.model || data.model || previous?.model || '快决策调用统计', model: origin.model || data.model || previous?.model,
          status: data.kind === 'started' ? 'started' : attempt.outcome === 'failed' ? 'failed' : attempt.outcome === 'completed' ? 'completed' : 'unknown',
          durationMs: attempt.elapsedMs, result: { outcome: attempt.outcome,
            meters: attempt.meters || { input: attempt.inputTokens ?? null, output: attempt.outputTokens ?? null, cachedInput: attempt.cachedInputTokens ?? null, reasoning: attempt.reasoningTokens ?? null },
            reasoning: attempt.requestedReasoning || (data.kind === 'started' ? { thinking: data.thinking ?? null, effort: data.effort ?? null } : previous?.result?.reasoning) } };
        if (data.id) { decisions.set(data.id, record); if (decisions.size > 160) decisions.delete(decisions.keys().next().value!); } publish(record);
      } else if (/^host\.combat\./.test(entry.event || '')) {
        const event = entry.event.slice('host.combat.'.length), key = `${entry.run || ''}:${data.decisionId || data.id || entry.seq}`;
        if (event === 'requested' && object(data.frame).battlefield) {
          combatFrames.set(key, structuredClone(data.frame));
          if (combatFrames.size > 64) combatFrames.delete(combatFrames.keys().next().value!);
        }
        const sampled = combatFrames.get(key);
        const frame = sampled && (data.connectionGeneration === undefined || sampled.battlefield.connectionGeneration === data.connectionGeneration) ? sampled : null;
        if (event === 'result') {
          combatResults.set(key, { application: data.application, choice: data.choice, outcome: data.outcome, selections:data.selections,candidates:data.candidates });
          if (combatResults.size > 64) combatResults.delete(combatResults.keys().next().value!);
        }
        const result = event === 'observation' ? { ...combatResults.get(key), ...data } : data;
        const view = describeCombatDecision(event, result, frame);
        publish({ id: `combat:${key}`, at: entry.ts, source: 'system1', kind: 'decision',
          title: `战斗快决策 · ${view.label}`, text: view.text,
          status: view.phase === 'requested' ? 'started' : view.phase === 'dispatched' ? 'accepted'
            : ['kept','observed'].includes(view.phase) ? 'completed' : ['not-applied','error'].includes(view.phase) ? 'failed' : 'unknown',
          ...(event === 'requested' ? { arguments: data.frame } : {}), result: { ...result, display: view } });
      }
    }
  }
  return { frame, record };
}
export function connectCorticoActivity(origin: string, sink: ActivitySink, options: {
  createSocket?: (url: string) => WebSocket; now?: () => string; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout;
} = {}) {
  const endpoint = activityConsoleUrl(origin); if (!endpoint) return { dispose() {} };
  const now = options.now || (() => new Date().toISOString()), mapper = createCorticoActivityMapper(sink, { now });
  const create = options.createSocket || (url => new WebSocket(url)), setTimer = options.setTimer || setTimeout, clearTimer = options.clearTimer || clearTimeout;
  let stopped = false, socket: WebSocket | null = null, timer: ReturnType<typeof setTimeout> | null = null, delay = 1000;
  const report = (status: string, title: string) => sink({ id: 'activity-connection', at: now(), source: 'unknown', kind: 'phase', status, title });
  function open() {
    if (stopped) return;
    try { socket = create(endpoint!.replace(/^http/, 'ws') + '/ws/debug'); } catch { reconnect(); return; }
    socket.addEventListener('open', () => { if (stopped) return; delay = 1000; report('running', '思考记录已连接'); });
    socket.addEventListener('message', event => {
      if (stopped || typeof event.data !== 'string') return;
      if (event.data.length > 4 * 1024 * 1024) { socket?.close(1009, 'activity frame too large'); return; }
      try { mapper.frame(JSON.parse(event.data)); } catch { /* Malformed observation has no game effect. */ }
    });
    socket.addEventListener('error', () => { report('failed', '思考记录连接不可用，游戏不受影响'); });
    socket.addEventListener('close', reconnect, { once: true });
  }
  function reconnect() {
    if (stopped || timer) return; report('unknown', '思考记录断开，等待重连');
    timer = setTimer(() => { timer = null; open(); }, delay); timer.unref?.(); delay = Math.min(30000, delay * 2);
  }
  open(); return { dispose() { if (stopped) return; stopped = true; if (timer) clearTimer(timer); timer = null; socket?.close(); socket = null; } };
}
