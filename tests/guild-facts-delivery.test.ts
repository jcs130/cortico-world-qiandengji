import { expect, it } from 'vitest';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { nullLogger } from 'agent-mc-world/client';
import type { MinecraftWorldProxy } from 'agent-mc-world/extension';
import type { WorldHost } from 'agent-mc-world/contracts';

it('makes multiline guild facts visible before event admission without duplicating trial history or replacing body work', async () => {
  let sink!: WorldHost;
  const duringPublish: string[] = [];
  const engine = { start: async (host: WorldHost) => { sink=host; }, stop: async () => {}, tools: () => [], envPromptVars: () => ({}),
    requestFacts: () => ({text:'original body work',parts:[{key:'queue',text:'original body work'}],snapshotTypes:[]}) } as unknown as MinecraftWorldProxy;
  const cfg={...structuredClone(MYMC_DEFAULTS),host:'example.test',username:'visitor'};
  const world=new MymcWorld({cfg},engine);
  const host={log:nullLogger(),pushEvent:async (event: unknown)=>{duringPublish.push(world.requestFacts()!.text);return event;}} as WorldHost;
  await world.start(host);
  try {
    for(const text of ['正在进行：现场调查 · 1/1 调查归来 [2/4]','【当前阶段】回到原遗迹继续',
      '➤ 进入已绑定的遗迹','还缺：有效调查区域','下一步：沿原有入口继续，不要换一座凑数。']) {
      await sink.pushEvent({ts:'2026-10-18T06:36:03Z',type:'minecraft.chat',source:'minecraft',text:'[MC 系统] '+text});
    }
    const facts=world.requestFacts()!;
    const guild=facts.parts!.filter(p=>p.key==='guildState');
    expect(guild).toHaveLength(1);expect(guild[0].text).toContain('回到原遗迹继续');expect(guild[0].text).toContain('不要换一座凑数');
    expect(facts.parts!.find(p=>p.key==='trialHistory')?.text??'').not.toContain('现场调查');
    expect(duringPublish.at(-1)).toContain('不要换一座凑数');expect(facts.text).toContain('original body work');
  } finally {await world.stop();}
});
