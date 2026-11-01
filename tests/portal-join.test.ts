import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {QiandengjiPortalAccess} from '../integrations/qiandengji/portal-access.ts';
import {portalApiFixture} from './fixtures/portal-api.ts';
const directories:string[]=[];
afterEach(async()=>{vi.unstubAllGlobals();for(const dir of directories.splice(0)){
  if(path.dirname(path.resolve(dir))!==path.resolve(tmpdir())||!path.basename(dir).startsWith('portal-join-'))throw Error('Unexpected fixture directory');
  await fs.rm(dir,{recursive:true,force:true});
}});
async function fixture(){const directory=await fs.mkdtemp(path.join(tmpdir(),'portal-join-'));directories.push(directory);const api=portalApiFixture();vi.stubGlobal('fetch',api.fetch);return {directory,api,portal:new QiandengjiPortalAccess({directory})};}
const form={username:'ag_Fixture',inviteUrl:'https://mc.kangqiang.site/join#invite=qdi_'+'i'.repeat(43)};
describe('official resumable one-click registration',()=>{
  it('registers, logs in, activates and confirms the game account in one explicit call',async()=>{
    const f=await fixture();f.api.activationState='ready';
    expect(await f.portal.join(form)).toMatchObject({state:'ready',identitySaved:true,gameAccountCreated:true,gameConnected:false});
    for(const route of ['register','sessions','activate'])expect(f.api.requests.filter(x=>x.route===route)).toHaveLength(1);
    expect((await f.portal.connectionSettings()).username).toBe(form.username);
    expect((await fs.readdir(f.directory)).some(x=>x.startsWith('invitation-'))).toBe(false);
  });
  it('resumes pending and unknown outcomes using the original identity without reactivating',async()=>{
    const f=await fixture();await f.portal.join(form);
    const original=await fs.readFile(path.join(f.directory,'identity.json'),'utf8');
    f.api.setState('not_created');expect(await f.portal.join({username:form.username})).toMatchObject({state:'unknown'});
    expect(f.api.requests.filter(x=>x.route==='register')).toHaveLength(1);expect(f.api.requests.filter(x=>x.route==='activate')).toHaveLength(1);
    const before=JSON.parse(original),after=JSON.parse(await fs.readFile(path.join(f.directory,'identity.json'),'utf8'));
    for(const k of ['clientId','clientSecret','gameRequestId','gamePassword'])expect(after[k]).toBe(before[k]);
  });
  it('keeps a lost activation response query-only on the next attempt',async()=>{
    const f=await fixture();f.api.activationUnknown=true;
    await expect(f.portal.join(form)).rejects.toThrow('未完成');f.api.activationUnknown=false;
    await f.portal.join({username:form.username});expect(f.api.requests.filter(x=>x.route==='activate')).toHaveLength(1);
  });
  it('requires an invitation and a valid name before any public request, and rejects role substitution',async()=>{
    const f=await fixture();await expect(f.portal.join({username:form.username})).rejects.toThrow('INVITE_AND_NAME');
    expect(f.api.requests).toHaveLength(0);await f.portal.join(form);
    await expect(f.portal.join({username:'ag_Other'})).rejects.toThrow('EXISTING_IDENTITY_CONFLICT');
    f.api.wrongAddress=true;f.api.setState('ready');await expect(f.portal.join({username:form.username})).rejects.toThrow('GAME_CONNECTION_MISMATCH');
  });
});
