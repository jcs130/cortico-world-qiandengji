import {describe,it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {LiteOnboarding} from '../src/onboarding.ts';
import {suggestedUsername,newAgentUsername} from '../src/names.ts';
const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0)){if(dirname(resolve(dir))!==resolve(tmpdir())||!basename(dir).startsWith('lite-onboarding-'))throw Error('Unexpected fixture directory');await rm(dir,{recursive:true,force:true});}});
async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'lite-onboarding-'));dirs.push(directory);
  const target={host:'micro.kangqiang.site',port:25702,version:'1.21.1',username:'',enabled:false};
  let identity=false,stored=false,state='ready';
  const access=()=>({available:true,identitySaved:identity,username:identity?'ag_Coobot':null,state,gameAccountCreated:state==='ready',checkedAt:null,message:'等待核对',website:'https://mc.kangqiang.site',gameAddress:'micro.kangqiang.site:25702',gameVersion:'1.21.1',gameConnected:false as const});
  const portal={state:vi.fn(async()=>access()),joinPlugin:vi.fn(async()=>{identity=true;return access();}),status:vi.fn(async()=>access()),connectionSettings:vi.fn(async()=>({host:'micro.kangqiang.site' as const,port:25702 as const,version:'1.21.1' as const,username:'ag_Coobot',loginConfigFile:join(directory,'private-binding.json'),auth:'offline' as const}))};
  const credentials={state:vi.fn(async()=>({passwordSet:stored,server:'micro.kangqiang.site:25702',username:target.username})),save:vi.fn(async()=>{stored=true;return {passwordSet:true,server:'micro.kangqiang.site:25702',username:target.username};}),importBinding:vi.fn(async()=>{stored=true;return {passwordSet:true,server:'micro.kangqiang.site:25702',username:'ag_Coobot'};})};
  const host={target:()=>target,persist:vi.fn((patch:any)=>Object.assign(target,patch)),restart:vi.fn(async()=>{})};
  const file=join(directory,'onboarding.json'),service=new LiteOnboarding(file,portal,credentials,host);
  return {service,file,portal,credentials,host,target,setState:(value:string)=>{state=value;},setIdentity:(value:boolean)=>{identity=value;},setStored:(value:boolean)=>{stored=value;}};
}
const registration={mode:'register' as const,username:'ag_Coobot',server:'micro.kangqiang.site:25702'};
describe('explicit plugin one-click connection',()=>{
  it('suggests the Agent name when valid and asks for input for unsupported names without truncation',()=>{
    expect(suggestedUsername('Coobot')).toBe('ag_Coobot');expect(suggestedUsername('可米')).toBe('');
    expect(suggestedUsername('averylongagentname')).toBe('');expect(newAgentUsername('Yui')).toBe('ag_Yui');
  });
  it('mounting and reading state cause no website calls or native connection',async()=>{
    const f=await fixture();expect(await f.service.state()).toMatchObject({phase:'idle',ready:false});
    expect(f.portal.joinPlugin).not.toHaveBeenCalled();expect(f.portal.status).not.toHaveBeenCalled();expect(f.host.restart).not.toHaveBeenCalled();
  });
  it('registers without an invitation, privately binds, enables and starts the same World once',async()=>{
    const f=await fixture();expect(await f.service.connect(registration)).toMatchObject({phase:'waiting_game',ready:false});
    expect(f.portal.joinPlugin).toHaveBeenCalledWith({username:'ag_Coobot'},{maxWaitMs:0});
    expect(f.credentials.importBinding).toHaveBeenCalledTimes(1);expect(f.host.restart).toHaveBeenCalledTimes(1);
    expect(f.target).toMatchObject({username:'ag_Coobot',enabled:true});
    await f.service.connect({...registration,mode:'login'});expect(f.host.restart).toHaveBeenCalledTimes(1);
    expect(await f.service.state({ready:false,stage:'waiting_world'})).toMatchObject({ready:false,phase:'waiting_game'});
    expect(await f.service.state({ready:true,stage:'authenticated'})).toMatchObject({ready:true,phase:'connected'});
    expect(await f.service.state({ready:false,stage:'closed'})).toMatchObject({ready:false,phase:'waiting_game'});
  });
  it('does not start a native connection while server provisioning is pending',async()=>{
    const f=await fixture();f.setState('pending');await f.service.connect(registration);
    expect(f.host.restart).not.toHaveBeenCalled();expect(f.target.username).toBe('');
    f.setState('ready');await f.service.advance();expect(f.host.restart).toHaveBeenCalledTimes(1);
  });
  it('keeps unknown outcomes query-only, including after reopening the original operation',async()=>{
    const f=await fixture();f.portal.joinPlugin.mockImplementationOnce(async()=>{f.setIdentity(true);throw Error('网站接入未完成（RESULT_UNKNOWN）。');});
    await expect(f.service.connect(registration)).rejects.toThrow('RESULT_UNKNOWN');
    const first=JSON.parse(await readFile(f.file,'utf8'));f.setState('ready');await f.service.advance(true);
    expect(f.portal.joinPlugin).toHaveBeenCalledTimes(1);expect(f.portal.status).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(f.file,'utf8')).id).toBe(first.id);
  });
  it('collapses simultaneous clicks before any awaited validation or API work',async()=>{
    const f=await fixture();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
    f.portal.joinPlugin.mockImplementationOnce(async()=>{await gate;f.setIdentity(true);return f.portal.state();});
    const first=f.service.connect(registration);await vi.waitFor(()=>expect(f.portal.joinPlugin).toHaveBeenCalledTimes(1));
    await f.service.connect(registration);release();await first;
    expect(f.portal.joinPlugin).toHaveBeenCalledTimes(1);expect(f.host.restart).toHaveBeenCalledTimes(1);
  });
  it('logs in an existing role without registering and never stores a password in operation status',async()=>{
    const f=await fixture();f.target.username='Original';
    await f.service.connect({mode:'login',username:'Original',server:registration.server,password:'fixture-private-password'});
    expect(f.portal.joinPlugin).not.toHaveBeenCalled();expect(f.credentials.save).toHaveBeenCalledTimes(1);
    expect(await readFile(f.file,'utf8')).not.toContain('fixture-private-password');expect(f.host.restart).toHaveBeenCalledTimes(1);
  });
  it('never reflects private file contents from a parser failure into the operator status',async()=>{
    const f=await fixture();f.target.username='Original';
    f.credentials.save.mockRejectedValueOnce(new SyntaxError('Unexpected token in private-fixture-password'));
    await expect(f.service.connect({mode:'login',username:'Original',server:registration.server,password:'private-fixture-password'})).rejects.toThrow('私密记录格式无效');
    expect(await readFile(f.file,'utf8')).not.toContain('private-fixture-password');
    expect(f.host.restart).not.toHaveBeenCalled();expect(f.portal.joinPlugin).not.toHaveBeenCalled();
  });
  it('refuses to replace another configured or saved role and rejects scope changes during provisioning',async()=>{
    const f=await fixture();f.target.username='Original';await expect(f.service.connect(registration)).rejects.toThrow('不会替换');
    expect(f.portal.joinPlugin).not.toHaveBeenCalled();f.target.username='';f.setState('pending');await f.service.connect(registration);
    f.target.host='different.invalid';await expect(f.service.advance()).rejects.toThrow('已变化');
    expect(f.host.restart).not.toHaveBeenCalled();expect(await f.service.state({ready:true})).toMatchObject({ready:false,phase:'blocked'});
  });
});
