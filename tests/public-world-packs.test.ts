import { describe, expect, it, vi } from 'vitest';
import { MYMC, selectedServerPack } from '../integrations/qiandengji/cortico.ts';
import { mymcCoreConfig, mymcEngineConfig, type MymcConfigSection } from '../integrations/qiandengji/config.ts';
import { GenericMymcWorld } from '../integrations/qiandengji/generic-world.ts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { readServerGuide, MYMC_GUIDE_TOPICS } from '../integrations/qiandengji/server-guide.ts';
import { QIANDENGJI_PACK } from '../integrations/qiandengji/data-packs/qiandengji/manifest.ts';
import {corticoContext} from './cortico-context.ts';

describe('one public World, explicitly selected server pack', () => {
  it('gives every visible host setting a concrete owning default without enabling host inference',()=>{
    const cfg=MYMC.defaults(),world=MYMC.create(corticoContext(cfg));
    const unset:string[]=[];
    for(const group of world.console?.().config??[])for(const path of Object.keys(group.schema.properties)){
      const keys=path.replace(/^worlds\.mymc\./,'').split('.');
      const value=keys.reduce((object:any,key)=>object?.[key],cfg);
      if(value===undefined)unset.push(path);
    }
    expect(unset).toEqual([]);
    expect(cfg.memoryAgentId).toBe('');
    expect(cfg.localSkinEnabled).toBe(true);
    expect(cfg.knowledge?.minedojo).toEqual({indexFile:'',retrieval:'hybrid'});
    const configured=structuredClone(cfg);
    configured.knowledge!.minedojo!.indexFile='D:/fixture/wiki.sqlite';
    configured.knowledge!.minedojo!.retrieval='lexical';
    expect(mymcEngineConfig(configured).knowledge?.minedojo).toEqual({indexFile:'D:/fixture/wiki.sqlite',retrieval:'lexical'});
    expect(cfg.viewDistance).toBe(12); // Existing native 'far' default, now explicit for the host contract.
    expect(mymcEngineConfig({...cfg,viewDistance:16}).viewDistance).toBe(16);
    expect(cfg.hostDecisions?.combat?.enabled).toBe(false);
    expect(cfg.hostDecisions?.combat?.connection).toBe('auto');
    expect(cfg.hostDecisions?.combat?.decisionProvider).toBe('');
    expect(JSON.parse(JSON.stringify(mymcEngineConfig(cfg)))).not.toHaveProperty('hostDecisions');
  });
  it('forwards explicit core owner and skin settings live and preserves omitted legacy scope',()=>{
    const cfg=MYMC.defaults(),engine=mymcEngineConfig(cfg);
    expect(JSON.parse(JSON.stringify(engine))).not.toHaveProperty('memoryAgentId');
    cfg.memoryAgentId='fixture-owner';cfg.localSkinEnabled=false;
    expect(engine.memoryAgentId).toBe('fixture-owner');expect(engine.localSkinEnabled).toBe(false);
    cfg.memoryAgentId='  ';
    expect(engine.memoryAgentId).toBeUndefined();
    Reflect.deleteProperty(cfg,'memoryAgentId');Reflect.deleteProperty(cfg,'localSkinEnabled');
    expect(JSON.parse(JSON.stringify(engine))).not.toHaveProperty('memoryAgentId');
    expect(JSON.parse(JSON.stringify(engine))).not.toHaveProperty('localSkinEnabled');
  });
  it('normalizes host placeholders at the core boundary without changing account names or hiding invalid IDs',()=>{
    const cfg={...MYMC.defaults(),host:'example.test',username:'Alice'};
    const core=mymcCoreConfig(cfg);
    expect(core.memoryAgentId).toBeUndefined();
    expect(core.username).toBe('Alice');
    expect(()=>MYMC.preflight?.({cfg} as never)).not.toThrow();
    cfg.memoryAgentId='fixture-owner';
    expect(core.memoryAgentId).toBe('fixture-owner');
    cfg.memoryAgentId='invalid\u0000id';
    expect(()=>MYMC.preflight?.({cfg} as never)).toThrow('memoryAgentId');
  });
  it('defaults to generic tools, normal account identity and no server commands or network', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'));
    try {
      const cfg = { ...MYMC.defaults(), host: 'example.test', username: 'Alice' };
      expect(cfg.serverPack).toBe('none');
      expect(cfg.escapeCommand).toBe('');
      MYMC.preflight?.({ cfg } as never);
      const world = MYMC.create(corticoContext(cfg));
      expect(world).toBeInstanceOf(GenericMymcWorld);
      const tools = world.tools().map(t => t.name);
      expect(tools).toContain('mymc_do');
      expect(tools).toEqual(expect.arrayContaining(['mymc_choose', 'mymc_life', 'mymc_combat_tactic']));
      expect(tools.filter(t => t === 'mymc_combat_tactic')).toHaveLength(1);
      expect(tools).not.toContain('mymc_cast');
      expect(tools).not.toContain('mymc_guide');
      expect(JSON.stringify(await world.envPromptVars())).not.toContain('/mycli');
      expect(world.console?.().config?.flatMap(g => Object.keys(g.schema.properties))).toContain('worlds.mymc.serverPack');
      expect(world.console?.().config?.flatMap(g => Object.keys(g.schema.properties))).toContain('worlds.mymc.decisionService.endpoint');
      expect(world.console?.().config?.flatMap(g => Object.keys(g.schema.properties))).toContain('worlds.mymc.hostDecisions.combat.enabled');
      await world.stop();
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it('bundles source manuals and only activates the server implementation by explicit selection', () => {
    const cfg = { ...MYMC.defaults(), serverPack: 'qiandengji' as const, host: 'example.test', username: 'Alice' };
    const world = MYMC.create(corticoContext(cfg));
    expect(world).toBeInstanceOf(MymcWorld);
    expect(world.tools().map(t => t.name)).toEqual(expect.arrayContaining(['mymc_cast', 'mymc_combat_tactic', 'mymc_guide']));
    expect(MYMC_GUIDE_TOPICS.map(t => t.id)).toContain('stories');
    expect(readServerGuide('stories').text).toContain('不是玩家的亲历');
    expect(readServerGuide().text).toContain(QIANDENGJI_PACK.version);
    expect(mymcEngineConfig(cfg).username).toBe('ag_Alice');
  });
  it('rejects an unknown pack and does not silently activate server rules for old configuration', () => {
    expect(selectedServerPack(MYMC.defaults())).toBe('none');
    expect(selectedServerPack({ ...MYMC.defaults(), serverPack: undefined })).toBe('none');
    expect(() => selectedServerPack({ ...MYMC.defaults(), serverPack: 'typo' } as unknown as MymcConfigSection)).toThrow('serverPack');
  });
  it('keeps host model configuration out of the child game process', () => {
    const cfg = { ...MYMC.defaults(), host: 'example.test', username: 'Alice',
      hostDecisions: { combat: { enabled: true, mode: 'act' as const, endpoint: 'http://host.invalid/judge' } } };
    expect(JSON.stringify(mymcEngineConfig(cfg))).not.toContain('host.invalid');
    expect(JSON.parse(JSON.stringify(mymcEngineConfig(cfg)))).not.toHaveProperty('hostDecisions');
    expect(() => MYMC.preflight?.({ cfg } as never)).not.toThrow();
  });
});
