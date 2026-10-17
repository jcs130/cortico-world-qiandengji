import { createCorticoActivityMapper, type ActivitySink } from './cortico-activity.ts';
type Value = Record<string, any>;
/** Official outputTap observer. It never externalizes output or changes preemption. */
export function createActivityOutputTap(sink: ActivitySink, { now = () => new Date().toISOString(), intervalMs = 200 } = {}) {
  const mapper = createCorticoActivityMapper(sink, { now }), items = new Map<string, Value>(), pending = new Map<string, Value>();
  let timer: ReturnType<typeof setTimeout> | null = null, model: string | undefined, stopped = false;
  const flush = () => { if (timer) clearTimeout(timer); timer = null; if (stopped) return; for (const row of pending.values()) try { sink(row); } catch { /* Read-only presentation. */ } pending.clear(); };
  const stage = (row: Value) => { pending.set(row.id, row); if (!timer) { timer = setTimeout(flush, intervalMs); timer.unref?.(); } };
  function onEvent(event: Value) {
    if (stopped || !event || typeof event.type !== 'string') return;
    if (event.type === 'response.created') { model = event.response?.model; return; }
    if (event.type === 'response.output_item.added' && event.item?.id) {
      items.set(event.item.id, { ...event.item, streamedText: '', at: now() });
      if (items.size > 32) items.delete(items.keys().next().value!);
      return;
    }
    if (['response.reasoning.delta', 'response.reasoning_summary_text.delta', 'response.output_text.delta'].includes(event.type)) {
      const item = items.get(event.item_id); if (!item || typeof event.delta !== 'string') return;
      item.streamedText = (item.streamedText + event.delta).slice(0, 12000);
      const kind = item.type === 'reasoning' ? 'reasoning' : item.type === 'message' ? 'message' : null; if (!kind) return;
      stage({ id: `${kind}:${event.item_id}`, at: item.at, source: 'system2', kind, title: kind === 'reasoning' ? '模型思考' : '模型回应',
        status: 'running', model, text: item.streamedText });
      return;
    }
    if (event.type === 'response.output_item.done' && event.item?.id) {
      const item = event.item, previous = items.get(item.id); pending.delete(`${item.type === 'reasoning' ? 'reasoning' : 'message'}:${item.id}`);
      // Prefer the provider's completed item; streamed text is only used when that item omits it.
      const content = item.content?.length || item.summary?.length ? item : previous?.streamedText
        ? { ...item, content: [{ type: item.type === 'reasoning' ? 'reasoning_text' : 'output_text', text: previous.streamedText }] } : item;
      mapper.record({ item: content, context: { ts: previous?.at || now(), origin: { model } } }); items.delete(item.id);
    }
  }
  return { onEvent, externalizes: () => false,
    onRoundEnd() { flush(); items.clear(); },
    onAbort(reason: string) { for (const [id, item] of items) if (item.type === 'reasoning' && item.streamedText) stage({
      id: `reasoning:${id}`, at: item.at, source: 'system2', kind: 'reasoning', title: '模型思考已中止', status: 'cancelled', model,
      text: item.streamedText + '\n中止原因：' + reason }); flush(); items.clear(); },
    dispose() { if (timer) clearTimeout(timer); timer = null; stopped = true; pending.clear(); items.clear(); },
  };
}
