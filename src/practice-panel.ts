import type { WebUiPanel } from 'cortico/web/shared/client-panel.ts';
import type { ExperimentsSnapshot, ExperimentAssessment } from 'agent-mc-world/decisions';

type PracticeState = Partial<ExperimentsSnapshot> & {
  enabled: boolean;
  cognition?: { inFlight: boolean; cancellation: string } | null;
};
const statuses: Record<string, string> = {
  'not-started': '尚未开始', running: '进行中', completed: '已完成隔离试跑',
  blocked: '受阻', failed: '失败', unknown: '状态未确认',
};
const value = (n: number | null | undefined) => n == null ? '未知' : String(n);
const assessment = (a: ExperimentAssessment | null) => a
  ? `目标 ${a.achieved === null ? '未确认' : a.achieved ? '达成' : '未达成'}；SDK 调用 ${value(a.measurements.sdkCalls)}；耗时 ${value(a.measurements.elapsedMs)} ms；生命损失 ${value(a.measurements.healthLoss)}`
  : '尚无对照证据';

/** Read-only view of the shared core's bounded evidence projection. Opening it starts no practice or model work. */
export const practicePanel: WebUiPanel = {
  mount(ctx) {
    const { ui } = ctx;
    const card = ui.sheet({ title: 'Harness² 方法练习', en: 'practice',
      desc: '查看隔离练习、原版与候选对照。隔离通过不代表已经在游戏里采用或改善。' });
    const status = ui.msgline('正在读取练习状态…');
    status.setAttribute('role', 'status');
    const refresh = ui.button('刷新'), actions = ui.actions(), list = ui.h('div', 'mc-practice-jobs');
    actions.append(refresh); card.body.append(status, actions, list); ctx.root.append(card.el);
    let busy = false;
    const render = (state: PracticeState) => {
      if (typeof state?.enabled !== 'boolean' || !Array.isArray(state.jobs)) throw Error('练习状态格式不完整，结果未验证。');
      status.textContent = !state.enabled ? '隔离方法练习未启用。可在本 World 的配置中设置 worker 后启用；当前游戏不受影响。'
        : `隔离方法练习已启用 · ${state.jobs.length} 项记录${state.cognition?.inFlight ? ' · 模型请求尚在执行' : ''}`;
      list.replaceChildren();
      if (!state.jobs.length) {
        list.append(ui.h('p', 'pagedesc', state.enabled
          ? '还没有练习记录。Agent 选择已保存的方法后，通过 mymc_practice 发起；打开本页不会自动发起训练。'
          : '启用后在这里查看真实试跑记录。'));
        return;
      }
      for (const job of state.jobs.slice().reverse()) {
        const detail = ui.h('details', 'mc-fold'), summary = ui.h('summary');
        summary.textContent = `${job.methodId} · ${statuses[job.status] ?? '状态未确认'}${job.stale ? '（读数已过期）' : ''}`;
        const body = ui.h('div', 'mc-foldbody');
        body.append(ui.h('p', '', `任务 ${job.id} · 阶段 ${job.phase ?? '未知'} · 模型调用 ${value(job.modelCalls)} · 试跑 ${value(job.trials)}`));
        body.append(ui.h('p', '', `Token：输入 ${value(job.usage.inputTokens)} / 缓存 ${value(job.usage.cachedTokens)} / 输出 ${value(job.usage.outputTokens)}`));
        body.append(ui.h('p', '', `记忆投递 ${job.memory}；线上采用：本页未验证。`));
        if (job.failure) body.append(ui.h('p', 'bad', `失败：${job.failure.kind} / ${job.failure.stage} / ${job.failure.category}`));
        if (job.result) {
          body.append(ui.h('p', '', `隔离候选资格：${job.result.eligible === null ? '未知' : job.result.eligible ? '通过' : '未通过'}；证据 ${value(job.result.evidenceCount)} 条。`));
          body.append(ui.h('p', '', `训练原版：${assessment(job.result.train.baseline)}`));
          body.append(ui.h('p', '', `训练候选：${assessment(job.result.train.candidate)}`));
          for (const trial of job.result.holdout) body.append(ui.h('p', '',
            `独立场景 ${trial.caseId}：原版 ${assessment(trial.baseline)}；候选 ${assessment(trial.candidate)}`));
        }
        detail.append(summary, body); list.append(detail);
      }
    };
    const read = async () => {
      if (busy || ctx.signal.aborted) return;
      busy = true; refresh.disabled = true;
      try { const state = await ctx.invoke<PracticeState>('state'); if (!ctx.signal.aborted) render(state); }
      catch (error) {
        if (!ctx.signal.aborted) { status.textContent = `读取失败，当前状态未验证：${error instanceof Error ? error.message : String(error)}`; list.replaceChildren(); }
      } finally { busy = false; if (!ctx.signal.aborted) refresh.disabled = false; }
    };
    refresh.addEventListener('click', () => { void read(); }, { signal: ctx.signal });
    ctx.interval(() => { void read(); }, 5000);
    void read();
  },
};
