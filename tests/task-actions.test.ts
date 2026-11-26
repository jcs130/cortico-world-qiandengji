import { describe, expect, it, vi } from 'vitest';
import Ajv from 'ajv';
import { QIANDENGJI_SERVER_QUERIES } from '../integrations/qiandengji/engine/server-query.ts';
import { TASK_ACTION_DECL, taskActionArgs } from '../integrations/qiandengji/task-actions.ts';
import { MymcWorld, MYMC_TOOL_DECLS } from '../integrations/qiandengji/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { ServerQueryLane } from 'agent-mc-world/extension';

const query = (id: string) => QIANDENGJI_SERVER_QUERIES.find(item => item.id === id)!;
const journal = {
  schemaVersion: 1, type: 'journal', scope: 'self', readOnly: true,
  subjectUuid: '00000000-0000-4000-8000-000000000001', filter: 'guild', page: 1, pages: 2, pageSize: 7,
  total: 8, groups: ['guild', 'skills'], autoContinue: false,
  items: [{ itemId: 'contract:tm_fixture', group: 'guild', sourceSystem: 'contract', sourceId: 'tm_fixture',
    title: '当前委托', state: 'ready', runId: 'run-fixture', readOnly: true,
    nextAction: '交付当前材料', nextCommand: '/mycli guild claim',
    journalSubmitCommand: '/mycli journal submit contract:tm_fixture' }],
  nextCommand: '/mycli journal guild 2',
};
const marker = (value: unknown) => 'MC_JOURNAL ' + JSON.stringify(value);

describe('current two-axis journal query', () => {
  it('correlates current self data without executing nextCommand', () => {
    const lane = new ServerQueryLane(), send = vi.fn();
    const context = { generation: 'current', username: 'ag_Fixture', afterSequence: 10, send };
    try {
      const sent = lane.call({ query: 'journal', arguments: ['guild'] }, QIANDENGJI_SERVER_QUERIES, context);
      expect(send).toHaveBeenCalledWith('/mycli journal guild --json');
      expect(send).toHaveBeenCalledTimes(1);
      expect(lane.receive(marker({ ...journal, subjectUuid: 'other' }), 'current', 'ag_Fixture', 11)).toBe(false);
      expect(lane.receive(marker({ ...journal, filter: 'skills' }), 'current', 'ag_Fixture', 11)).toBe(false);
      expect(lane.receive(marker({ ...journal, pageSize: 20 }), 'current', 'ag_Fixture', 11)).toBe(false);
      expect(lane.receive(marker({ ...journal, items: Array.from({ length: 8 }, () => journal.items[0]) }), 'current', 'ag_Fixture', 11)).toBe(false);
      expect(lane.receive(marker(journal), 'old', 'ag_Fixture', 11)).toBe(false);
      expect(lane.receive(marker(journal), 'current', 'ag_Fixture', 11)).toBe(true);
      expect(lane.call({ requestId: sent.data?.requestId }, QIANDENGJI_SERVER_QUERIES, context).data)
        .toMatchObject({ phase: 'replied', goal_completed: false, reply: { ok: true, data: journal } });
      expect(send).toHaveBeenCalledTimes(1);
    } finally { lane.reset('done'); }
  });

  it('builds only bounded group/page commands and matches exact paging', () => {
    expect(query('journal').command([])).toBe('/mycli journal --json');
    expect(query('journal').command(['guild', '2'])).toBe('/mycli journal guild 2 --json');
    expect(query('tasks.overview').command(['2'])).toBe('/mycli journal 2 --json');
    expect(query('journal').matchReply(marker({ ...journal, page: 2, items: [] }), ['guild', '2'], 'ag_Fixture')).toMatchObject({ ok: true });
    for (const args of [['submit'], ['guild', '2', 'submit'], ['all', '2'], ['2', 'guild'], ['0'], ['1000'], ['guild;claim'], ['--json'], ['skills', '1', '2']])
      expect(query('journal').command(args)).toBeNull();
    expect(query('journal').matchReply(marker(journal), ['guild', '2'], 'ag_Fixture')).toBeNull();
    expect(query('journal').matchReply('MC_GUILD_EXAM ' + JSON.stringify(journal), [], 'ag_Fixture')).toBeNull();
  });

  it('accepts current Vortex authority without treating class status as a write', () => {
    const value = { id: 'ranger', class: 'ranger', queryOnly: true, authority: 'VortexRPG' };
    const text = 'MC_RPG ' + JSON.stringify(value);
    expect(query('profession.status').matchReply(text, [], 'ag_Fixture')).toEqual({ ok: true, data: value });
    expect(query('profession.status').matchReply('MC_RPG ' + JSON.stringify({ ...value, authority: 'Other' }), [], 'ag_Fixture')).toBeNull();
    expect(query('profession.status').command(['choose'])).toBeNull();
  });

  it('publishes journal and explicit task action schemas through offline and mounted tools', () => {
    const world = new MymcWorld({ cfg: structuredClone(MYMC_DEFAULTS) });
    const mounted = world.tools();
    for (const schema of [MYMC_TOOL_DECLS.find(tool => tool.name === 'mymc_task_action')!.parameters,
      mounted.find(tool => tool.name === 'mymc_task_action')!.parameters]) {
      const validate = new Ajv({ strict: false }).compile(schema as object);
      expect(validate({ action: 'migrate' })).toBe(true);
      expect(validate({ action: 'journal_submit', id: 'contract:tm_fixture' })).toBe(true);
      expect(validate({ action: 'learn', id: 'sword_parry' })).toBe(true);
      expect(validate({ action: 'learn' })).toBe(false);
      expect(validate({ action: 'migrate', id: '13' })).toBe(false);
      expect(validate({ action: 'journal_submit', id: 'x;claim' })).toBe(false);
      expect(validate({ action: 'claim', id: 'tm_fixture' })).toBe(false);
    }
  });
});

describe('explicit journal/skill writes', () => {
  it('queues one exact current command without inventing IDs or amounts', () => {
    expect(taskActionArgs({ action: 'journal_submit', id: 'contract:tm_fixture' }))
      .toEqual({ steps: [{ skill: 'chat', text: '/mycli journal submit contract:tm_fixture' }] });
    expect(taskActionArgs({ action: 'learn', id: 'sword_parry' }))
      .toEqual({ steps: [{ skill: 'chat', text: '/mycli skills learn sword_parry --json' }] });
    expect(taskActionArgs({ action: 'migrate' }))
      .toEqual({ steps: [{ skill: 'chat', text: '/mycli profession migrate --json' }] });
    for (const args of [{ action: 'migrate', id: '13' }, { action: 'learn' }, { action: 'journal_submit', id: 'bad id' }, { action: 'claim', id: 'x' }])
      expect(() => taskActionArgs(args)).toThrow();
  });
});
