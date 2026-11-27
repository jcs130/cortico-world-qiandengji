import {describe,it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiteConnection,publicConnection,type ConnectionScope} from '../src/connection.ts';
import {Credentials,accountScope} from '../src/credentials.ts';
import {sensitiveCommand,publicLogEntries} from '../src/extra-tools.ts';
const scope:ConnectionScope={host:'fixture.invalid',port:25565,username:'fixture_player',instanceId:'current'};
const receipt=(patch:Record<string,unknown>={})=>({server:{host:scope.host,port:scope.port,username:scope.username},
  connection:{ready:true,worldReady:true,serverLogin:{authSuccessReceived:true,stage:'authenticated'},...patch}});
afterEach(()=>vi.useRealTimers());
describe('public shared World connection readiness',()=>{
  it.each([[false,true,true],[true,false,true],[true,true,false],[true,true,true]])('requires ready=%s worldReady=%s authSuccess=%s',(ready,worldReady,success)=>{
    expect(publicConnection(receipt({ready,worldReady,serverLogin:{authSuccessReceived:success}}),scope,1000,1000).ready).toBe(ready&&worldReady&&success);
  });
  it('rejects missing public readings even if an old native journal claims ready',()=>{
    expect(publicConnection({schema:'qiandengji-lite-connection/v1',ready:true,worldReady:true,authSuccessReceived:true},scope,1000,1000).ready).toBe(false);
    expect(publicConnection(receipt({worldReady:undefined}),scope,1000,1000).ready).toBe(false);
    expect(publicConnection(receipt({serverLogin:{authSuccessReceived:undefined}}),scope,1000,1000).ready).toBe(false);
  });
  it.each([{host:'foreign.invalid'},{port:25566},{username:'another'},{username:null}])('rejects foreign or unknown server identity %j',patch=>{
    const value=receipt();Object.assign(value.server,patch);
    expect(publicConnection(value,scope,1000,1000).ready).toBe(false);
  });
  it('rejects expired, future or invalid observations',()=>{
    for(const sampledAt of [0,8000,NaN])expect(publicConnection(receipt(),scope,sampledAt,6000).ready).toBe(false);
  });
  it('does not expose arbitrary secrets, raw diagnostic messages or invented RPG skills',()=>{
    const value={...receipt({serverLogin:{authSuccessReceived:true,reason:'fixture-password',stage:'/login fixture-password'}}),password:'fixture-password',
      profile:{level:99,skillIds:['invented'],password:'fixture-password'},skills:{secret:'fixture-password'},playerRoster:['guessed']};
    const result=publicConnection(value,scope,1000,1000);
    expect(result).toMatchObject({ready:true,profile:null,skills:null,playerRoster:[]});
    expect(JSON.stringify(result)).not.toContain('fixture-password');
  });
  it('a successful start alone never establishes readiness; stop clears the timer and cache',async()=>{
    vi.useFakeTimers();const read=vi.fn(async()=>receipt({worldReady:false}));
    const connection=new LiteConnection({target:()=>scope,instanceId:scope.instanceId,read});
    connection.start();await connection.refresh();expect(connection.snapshot().ready).toBe(false);
    read.mockResolvedValue(receipt());await connection.refresh();expect(connection.snapshot().ready).toBe(true);
    connection.stop();expect(connection.snapshot()).toMatchObject({ready:false,stage:'closed'});
    const count=read.mock.calls.length;await vi.advanceTimersByTimeAsync(10000);expect(read).toHaveBeenCalledTimes(count);expect(vi.getTimerCount()).toBe(0);
  });
  it('does not call an onboarding refresh from a stopped timer generation',async()=>{
    vi.useFakeTimers();let release!:(value:unknown)=>void;
    const refreshed=vi.fn(),connection=new LiteConnection({target:()=>scope,instanceId:scope.instanceId,
      read:()=>new Promise(resolve=>{release=resolve;})});
    connection.start(refreshed);const pending=connection.refresh();connection.stop();release(receipt());await pending;
    await vi.advanceTimersByTimeAsync(1000);expect(refreshed).not.toHaveBeenCalled();expect(connection.snapshot().ready).toBe(false);
  });
  it('invalidates the cache when host, port or account changes and on expiry',async()=>{
    let target={...scope},now=1000;
    const connection=new LiteConnection({target:()=>target,instanceId:scope.instanceId,read:async()=>receipt(),now:()=>now});
    connection.start();await connection.refresh();expect(connection.snapshot().ready).toBe(true);
    for(const patch of [{host:'other.invalid'},{port:25566},{username:'other'}]){target={...scope,...patch};expect(connection.snapshot().ready).toBe(false);}
    target={...scope};now=7001;expect(connection.snapshot().ready).toBe(false);connection.stop();
  });
  it('ignores a pending result after stop, restart, instance replacement or scope change',async()=>{
    let release!:(value:unknown)=>void,target={...scope};
    const read=vi.fn(()=>new Promise<unknown>(resolve=>{release=resolve;}));
    const previous=new LiteConnection({target:()=>target,instanceId:'previous',read});
    previous.start();const pending=previous.refresh();previous.stop();release(receipt());await pending;expect(previous.snapshot().ready).toBe(false);
    const current=new LiteConnection({target:()=>target,instanceId:'current',read:async()=>receipt({worldReady:false})});
    current.start();await current.refresh();expect(current.snapshot()).toMatchObject({instanceId:'current',ready:false});current.stop();
    previous.start();const old=previous.refresh(),first=release;previous.stop();previous.start();const fresh=previous.refresh(),second=release;
    first(receipt());await old;expect(previous.snapshot().ready).toBe(false);
    target={...scope,username:'other'};second(receipt());await fresh;expect(previous.snapshot().ready).toBe(false);previous.stop();
  });
  it('does not rejuvenate a slow RPC and redacts a private read error',async()=>{
    let now=1000,release!:(value:unknown)=>void;
    const connection=new LiteConnection({target:()=>scope,instanceId:scope.instanceId,now:()=>now,
      read:()=>new Promise(resolve=>{release=resolve;})});
    connection.start();const pending=connection.refresh();now=7000;release(receipt());await pending;expect(connection.snapshot().ready).toBe(false);connection.stop();
    const failed=new LiteConnection({target:()=>scope,instanceId:scope.instanceId,read:async()=>{throw Error('/login fixture-private-password');}});
    failed.start();expect(JSON.stringify(await failed.refresh())).not.toContain('fixture-private-password');failed.stop();
  });
});
describe('private account scope',()=>{
  it('separates server, port and role credentials',()=>{const a=accountScope(scope);for(const patch of [{port:25566},{username:'another'},{host:'other.invalid'}])expect(accountScope({...a,...patch}).key).not.toBe(a.key);});
  it('rejects unsafe credentials without storing them',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'qiandengji-lite-secret-'));
    try{const store=new Credentials(directory);await expect(store.save(scope,'bad\npassword')).rejects.toThrow();expect((await store.state(scope)).passwordSet).toBe(false);}
    finally{await rm(directory,{recursive:true,force:true});}
  });
  it('whitelists public log fields and redacts private command aliases and diagnostics',()=>{
    const source={entries:[{seq:1,ts:'now',lane:'link',msg:'/l fixture-private-password',password:'fixture-private-password',data:{credentialFile:'private-path'}},
      {seq:2,ts:'now',lane:'task',msg:'completed',taskId:7,durMs:10},
      {seq:3,ts:'now',lane:'link',msg:'password = fixture-private-password'}],token:'private-token'};
    const result=publicLogEntries(source);expect(JSON.stringify(result)).not.toMatch(/fixture-private-password|private-path|private-token/);
    expect(result.entries[1]).toEqual({seq:2,ts:'now',lane:'task',msg:'completed',taskId:7,durMs:10});
  });
  it('blocks credential commands without changing ordinary public chat',()=>{
    expect(sensitiveCommand({steps:[{skill:'chat',text:'/login fixture-secret'}]})).toBe(true);
    expect(sensitiveCommand({steps:[{skill:'chat',text:'一起组队吧'}]})).toBe(false);
  });
});
