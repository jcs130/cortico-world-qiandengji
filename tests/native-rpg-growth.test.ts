import {expect,it} from 'vitest';
import {NativeRpgState,readNativeTalentTree} from '../integrations/qiandengji/engine/native-rpg.ts';
import {QIANDENGJI_SERVER_QUERIES} from '../integrations/qiandengji/engine/server-query.ts';
import {ServerQueryLane} from 'agent-mc-world/extension';
const at='2026-11-16T02:00:00Z';
// VortexBridge.skills(tree) publishes maps, not the learning-node array.
const tree={talentPoints:7,allocated:{KNIGHT:['guard']},nodes:{guard:{id:'guard',displayName:'Guard',cost:1,prerequisites:[],description:'Passive defence'},
  advance:{id:'advance',cost:2,prerequisites:['guard'],description:'Passive health'}},summary:'server description'};
const line=(value:unknown)=>'MC_RPG '+JSON.stringify(value);
const packet=(combat='knight')=>Buffer.from(JSON.stringify({schemaVersion:1,profession:{backend:'vortex',available:true,combat,level:15,xp:100,skillPoints:10,activeSkill:'war_stomp',abilities:[{id:'fortify'},{id:'war_stomp'}]}}));
it('keeps talent points distinct from learning points and an empty learnable list',()=>{
 const state=new NativeRpgState();expect(state.chat(line(tree),at)).toBe(false);
 state.packet('mcagent:state',packet(),at);
 state.chat(line({available:['fortify','war_stomp'],common:['starbolt'],learnable:[],skillPoints:10}),at);
 expect(state.brief()).toContain('天赋点与天赋树尚未读取');
 expect(state.chat(line(tree),at)).toBe(true);
 expect(state.brief()).toContain('学习点 10');expect(state.brief()).toContain('天赋点 7');
 expect(state.skillsReadout()).toContain('"detailsQuery":"skills.tree"');
 expect(state.skillsReadout()).not.toContain('"prerequisites"');
 expect(state.skillsReadout()).not.toContain('"available":["guard"');
 state.packet('mcagent:state',packet('mage'),at);expect(state.brief()).not.toContain('天赋点 7');
 state.reset();expect(state.skillsReadout()).not.toContain('guard');
});
it('rejects malformed or unbounded trees without confusing mutation receipts for queries',()=>{
 for(const value of [{...tree,talentPoints:-1},{...tree,allocated:[]},{...tree,nodes:{x:{id:'other',cost:1,prerequisites:[]}}},
  {...tree,nodes:{guard:{...tree.nodes.guard,prerequisites:['/mycli learn']}}},{success:true,talentPoints:7}])
  expect(readNativeTalentTree(value,at)).toBeNull();
 expect(readNativeTalentTree(tree,'bad-date')).toBeNull();
});
it('uses the original read-only query lane, binds connection and returns the complete native tree',()=>{
 const q=QIANDENGJI_SERVER_QUERIES.find(q=>q.id==='skills.tree')!,commands:string[]=[],lane=new ServerQueryLane();
 expect(q.command([])).toBe('/mycli skills tree --json');expect(q.command(['learn'])).toBeNull();
 const context={generation:'now',username:'ag_Fixture',afterSequence:4,send:(c:string)=>commands.push(c)};
 try {const started=lane.call({query:'skills.tree'},QIANDENGJI_SERVER_QUERIES,context);
 expect(lane.receive(line(tree),'old','ag_Fixture',5)).toBe(false);
 expect(lane.receive(line(tree),'now','ag_Fixture',5)).toBe(true);
 expect(lane.call({requestId:started.data?.requestId},QIANDENGJI_SERVER_QUERIES,context).data).toMatchObject({phase:'replied',goal_completed:false,reply:{data:tree}});
 expect(commands).toEqual(['/mycli skills tree --json']);
 }finally{lane.reset('done')}
});
