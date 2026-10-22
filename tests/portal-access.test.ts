import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {QiandengjiPortalAccess} from '../integrations/qiandengji/portal-access.ts';
import {portalApiFixture} from './fixtures/portal-api.ts';

const dirs:string[]=[];
afterEach(async()=>{vi.unstubAllGlobals();await Promise.all(dirs.splice(0).map(d=>fs.rm(d,{recursive:true,force:true})));});
const inviteUrl='https://mc.kangqiang.site/join#invite=qdi_'+'i'.repeat(43);
async function fixture(){const directory=await fs.mkdtemp(path.join(tmpdir(),'mc-portal-'));dirs.push(directory);const api=portalApiFixture();vi.stubGlobal('fetch',api.fetch);return{directory,api,client:new QiandengjiPortalAccess({directory})};}

describe('official website invitation lifecycle, independent of host and model',()=>{
  it('does no network or registration when mounted or polled locally',async()=>{
    const f=await fixture();expect(await f.client.state()).toMatchObject({state:'missing',identitySaved:false,gameConnected:false});expect(f.api.fetch).not.toHaveBeenCalled();
  });
  it('persists an identity before exchange, activates once and waits on the original request',async()=>{
    const f=await fixture();const state=await f.client.prepare({inviteUrl,username:'ag_Fixture'});
    expect(state).toMatchObject({state:'pending',gameAccountCreated:false,identitySaved:true,gameConnected:false});
    const identity=JSON.parse(await fs.readFile(path.join(f.directory,'identity.json'),'utf8'));
    const registrations=f.api.requests.filter(x=>x.route==='register'),activations=f.api.requests.filter(x=>x.route==='activate');
    expect(registrations).toHaveLength(1);expect(activations).toHaveLength(1);
    expect(registrations[0].body.requestId).toBe(identity.clientId);expect(activations[0].body.requestId).toBe(identity.gameRequestId);
    expect(activations[0].body.gamePassword).toBe(identity.gamePassword);expect(registrations[0].authorization).toBe('Bearer qdi_'+'i'.repeat(43));
    const next=new QiandengjiPortalAccess({directory:f.directory});await next.prepare({});await next.status();
    expect(f.api.requests.filter(x=>x.route==='register')).toHaveLength(1);expect(f.api.requests.filter(x=>x.route==='activate')).toHaveLength(1);
    const retained=JSON.parse(await fs.readFile(path.join(f.directory,'identity.json'),'utf8'));
    for(const field of ['clientId','clientSecret','gameRequestId','gamePassword'])expect(retained[field]).toBe(identity[field]);
    const visible=JSON.stringify(await next.state());for(const field of ['clientSecret','gamePassword','token'])expect(visible).not.toContain(identity[field]);expect(visible).not.toContain('qdi_');
  });
  it('requires fresh ready AND gameAccountCreated before producing connection settings, without copying a password',async()=>{
    const f=await fixture();await f.client.prepare({inviteUrl,username:'ag_Fixture'});
    await expect(f.client.connectionSettings()).rejects.toThrow('GAME_ACCOUNT_NOT_READY');
    f.api.setState('ready');const settings=await f.client.connectionSettings();
    expect(settings).toMatchObject({host:'micro.kangqiang.site',port:25702,version:'1.21.1',username:'ag_Fixture',auth:'offline'});
    const config=JSON.parse(await fs.readFile(settings.loginConfigFile,'utf8'));
    expect(config.accounts[0]).toMatchObject({server:'micro.kangqiang.site:25702',username:'ag_Fixture',credentialFormat:'json',credentialField:'gamePassword',credentialFile:path.join(f.directory,'identity.json')});
    const identity=JSON.parse(await fs.readFile(path.join(f.directory,'identity.json'),'utf8'));
    expect(JSON.stringify(settings)+JSON.stringify(config)).not.toContain(identity.gamePassword);
    expect(await fs.readdir(f.directory)).not.toContain('invitation.txt');
    f.api.createdOverride=false;await expect(f.client.connectionSettings()).rejects.toThrow('GAME_CONNECTION_MISMATCH');
  });
  it('queries an uncertain activation and never posts a second activation',async()=>{
    const f=await fixture();f.api.activationUnknown=true;
    await expect(f.client.prepare({inviteUrl,username:'ag_Fixture'})).rejects.toThrow('RESULT_UNKNOWN');
    expect(await f.client.state()).toMatchObject({state:'unknown',identitySaved:true});
    await f.client.prepare({});expect(await f.client.state()).toMatchObject({state:'pending'});
    expect(f.api.requests.filter(x=>x.route==='activate')).toHaveLength(1);
  });
  it('retains an uncertain registration identity instead of consuming the invitation again',async()=>{
    const f=await fixture();f.api.registrationUnknown=true;
    await expect(f.client.prepare({inviteUrl,username:'ag_Fixture'})).rejects.toThrow('RESULT_UNKNOWN');
    f.api.setState('unknown');await f.client.prepare({});
    expect(f.api.requests.filter(x=>x.route==='register')).toHaveLength(1);expect(f.api.requests.filter(x=>x.route==='activate')).toHaveLength(0);
  });
  it('waits for an unavailable game bridge and preserves the same activation identity',async()=>{
    const f=await fixture();f.api.gameBridgeReady=false;expect(await f.client.prepare({inviteUrl,username:'ag_Fixture'})).toMatchObject({state:'awaiting_game_bridge'});
    expect(f.api.requests.filter(x=>x.route==='activate')).toHaveLength(0);
    f.api.gameBridgeReady=true;await f.client.prepare({});expect(f.api.requests.filter(x=>x.route==='activate')).toHaveLength(1);
  });
  it.each(['https://evil.invalid/join#invite=qdi_'+'i'.repeat(43),'https://mc.kangqiang.site/join','【粘贴接入链接】'])('rejects a missing, placeholder or wrong-origin invitation before HTTP: %s',async inviteUrl=>{
    const f=await fixture();await expect(f.client.prepare({inviteUrl,username:'ag_Fixture'})).rejects.toThrow();expect(f.api.fetch).not.toHaveBeenCalled();
  });
  it.each(['Other','ag_12345678901234','ag_bad-name'])('rejects invalid new names: %s',async username=>{
    const f=await fixture();await expect(f.client.prepare({inviteUrl,username})).rejects.toThrow('INVALID_AGENT_NAME');expect(f.api.fetch).not.toHaveBeenCalled();
  });
  it('does not adopt a different role or connection from the response',async()=>{
    const f=await fixture();await f.client.prepare({inviteUrl,username:'ag_Fixture'});f.api.setState('ready');
    f.api.wrongUsername=true;await expect(f.client.connectionSettings()).rejects.toThrow('STATUS_RESPONSE_MISMATCH');
    f.api.wrongUsername=false;f.api.wrongAddress=true;await expect(f.client.connectionSettings()).rejects.toThrow('GAME_CONNECTION_MISMATCH');
    await expect(f.client.prepare({username:'ag_Other'})).rejects.toThrow('EXISTING_IDENTITY_CONFLICT');
  });
  it('imports an official existing identity without registering or changing its password',async()=>{
    const f=await fixture();await f.client.prepare({inviteUrl,username:'ag_Fixture'});f.api.setState('ready');
    const directory=await fs.mkdtemp(path.join(tmpdir(),'mc-import-'));dirs.push(directory);
    const client=new QiandengjiPortalAccess({directory}),identity=path.join(f.directory,'identity.json');
    const before=JSON.parse(await fs.readFile(identity,'utf8'));
    expect(await client.importIdentity(identity)).toMatchObject({state:'ready',username:'ag_Fixture'});
    expect((await client.connectionSettings()).username).toBe('ag_Fixture');
    expect(f.api.requests.filter(x=>x.route==='register')).toHaveLength(1);
    expect(JSON.parse(await fs.readFile(identity,'utf8')).gamePassword).toBe(before.gamePassword);
  });
  it('pins the unmodified official helper to its verified public SHA',async()=>{
    const root=new URL('../integrations/qiandengji/portal/',import.meta.url);
    const source=JSON.parse(await fs.readFile(new URL('source.json',root),'utf8'));
    expect(createHash('sha256').update(await fs.readFile(new URL('agent-register.mjs',root))).digest('hex')).toBe(source.sha256);
    expect(source.modified).toBe(false);
  });
  it('keeps local state readable while serializing two instances that own the same identity directory',async()=>{
    const f=await fixture();let finish!:()=>void,entered=false;
    const gate=new Promise<void>(resolve=>{finish=resolve;});
    vi.stubGlobal('fetch',async(input:any,init?:RequestInit)=>{if(String(input).endsWith('/register')){entered=true;await gate;}return f.api.fetch(input,init);});
    const pending=f.client.prepare({inviteUrl,username:'ag_Fixture'});await vi.waitFor(()=>expect(entered).toBe(true));
    expect(await f.client.state()).toMatchObject({identitySaved:true});
    await expect(new QiandengjiPortalAccess({directory:f.directory}).status()).rejects.toThrow('稍候');
    finish();await pending;expect(f.api.requests.filter(x=>x.route==='register')).toHaveLength(1);
    expect(await fs.readdir(f.directory)).not.toContain('operation.lock');
  });
  it('does not pin a malformed imported file and permits correction without deleting identities',async()=>{
    const f=await fixture(),bad=path.join(f.directory,'bad.json');await fs.writeFile(bad,JSON.stringify({schemaVersion:1,portal:'https://mc.kangqiang.site'}),{mode:0o600});
    await expect(f.client.importIdentity(bad)).rejects.toThrow('INVALID_IDENTITY_FILE');
    expect(await f.client.prepare({inviteUrl,username:'ag_Fixture'})).toMatchObject({state:'pending',username:'ag_Fixture'});
  });
});
