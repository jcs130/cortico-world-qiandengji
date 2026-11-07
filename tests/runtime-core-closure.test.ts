import {afterEach, describe, expect, it} from 'vitest';
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {verifyRuntimeCore} from '../scripts/verify-runtime-core.mjs';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mymc-core-closure-')); roots.push(root);
  const pkg = (dir: string, data: object) => {
    mkdirSync(dir, {recursive:true}); writeFileSync(join(dir, 'package.json'), JSON.stringify(data)); return dir;
  };
  const core = pkg(join(root, 'core'), {name:'agent-mc-world',version:'0.5.7-rc.100'});
  const server = pkg(join(root, 'server'), {name:'agent-mc-qiandengji',version:'0.5.0-rc.3',peerDependencies:{'agent-mc-world':'^0.5.7-rc.99'}});
  const world = pkg(join(root, 'world'), {name:'cortico-world-qiandengji',version:'0.4.1-rc.1',dependencies:{'agent-mc-world':'^0.5.7-rc.100','agent-mc-qiandengji':'^0.5.0-rc.3'}});
  const link = (owner: string, name: string, target: string) => {
    mkdirSync(join(owner,'node_modules'),{recursive:true});symlinkSync(target,join(owner,'node_modules',name),'junction');
  };
  link(world,'agent-mc-world',core);link(world,'agent-mc-qiandengji',server);
  return {root,core,server,world,link,pkg};
}
afterEach(()=>{
  for(const root of roots.splice(0)) {
    const path=resolve(root);if(!path.startsWith(resolve(tmpdir())+sep)||!path.includes('mymc-core-closure-'))throw Error('Unsafe test cleanup');
    rmSync(path,{recursive:true,force:true});
  }
});
describe('installed core dependency closure',()=>{
  it('accepts an unchanged server peer when both real entrypoints resolve the candidate',()=>{
    const f=fixture();f.link(f.server,'agent-mc-world',f.core);
    expect(verifyRuntimeCore(join(f.world,'package.json'),join(f.core,'package.json')))
      .toMatchObject({verified:true,runtimeStarted:false,canonicalCore:realpathSync(join(f.core,'package.json'))});
  });
  it('rejects the observed old server junction even though the new World satisfies its own pin',()=>{
    const f=fixture(),old=f.pkg(join(f.root,'old-core'),{name:'agent-mc-world',version:'0.5.7-rc.99'});
    f.link(f.server,'agent-mc-world',old);
    expect(()=>verifyRuntimeCore(join(f.world,'package.json'),join(f.core,'package.json'))).toThrow('CORE_RUNTIME_MISMATCH');
  });
  it('rejects two physical cores with identical version strings',()=>{
    const f=fixture(),copy=f.pkg(join(f.root,'copy-core'),{name:'agent-mc-world',version:'0.5.7-rc.100'});
    f.link(f.server,'agent-mc-world',copy);
    expect(()=>verifyRuntimeCore(join(f.world,'package.json'))).toThrow('CORE_RUNTIME_MISMATCH');
  });
  it('checks the expected candidate even when both consumers agree on a different copy',()=>{
    const f=fixture(),expected=f.pkg(join(f.root,'candidate'),{name:'agent-mc-world',version:'0.5.7-rc.100'});
    f.link(f.server,'agent-mc-world',f.core);
    expect(()=>verifyRuntimeCore(join(f.world,'package.json'),join(expected,'package.json'))).toThrow('CORE_RUNTIME_MISMATCH');
  });
  it('fails closed when the server peer cannot resolve a core',()=>{
    const f=fixture();expect(()=>verifyRuntimeCore(join(f.world,'package.json'))).toThrow();
  });
  it('resolves a linked World from its physical location, as the real Node engine does',()=>{
    const f=fixture();f.link(f.server,'agent-mc-world',f.core);
    const host=join(f.root,'host');f.link(host,'cortico-world-qiandengji',f.world);
    expect(verifyRuntimeCore(join(host,'node_modules/cortico-world-qiandengji/package.json')))
      .toMatchObject({verified:true,world:{manifest:realpathSync(join(f.world,'package.json'))}});
  });
  it('reads a server that hides package.json without executing its entry',()=>{
    const f=fixture();f.link(f.server,'agent-mc-world',f.core);
    f.pkg(f.server,{name:'agent-mc-qiandengji',version:'0.5.0-rc.3',exports:{'.':'./entry.js'},peerDependencies:{'agent-mc-world':'^0.5.7-rc.99'}});
    writeFileSync(join(f.server,'entry.js'),'throw Error("Entry must never execute")');
    expect(verifyRuntimeCore(join(f.world,'package.json'))).toMatchObject({verified:true,runtimeStarted:false});
  });
});
