import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {QiandengjiPortalAccess} from '../integrations/qiandengji/portal-access.ts';
import {portalApiFixture} from './fixtures/portal-api.ts';
const directories:string[]=[];
afterEach(async()=>{vi.unstubAllGlobals();for(const dir of directories.splice(0)){
  if(path.dirname(path.resolve(dir))!==path.resolve(tmpdir())||!path.basename(dir).startsWith('portal-plugin-'))throw Error('Unexpected fixture directory');
  await fs.rm(dir,{recursive:true,force:true});
}});
async function fixture(){const directory=await fs.mkdtemp(path.join(tmpdir(),'portal-plugin-'));directories.push(directory);const api=portalApiFixture();vi.stubGlobal('fetch',api.fetch);return {directory,api,portal:new QiandengjiPortalAccess({directory})};}
const username='ag_Fixture';
describe('deployed official plugin self-service contract',()=>{
  it('uses public-register without an invitation or client attestation, then confirms the same account',async()=>{
    const f=await fixture();f.api.activationState='ready';
    const value=await f.portal.joinPlugin({username});expect(value).toMatchObject({state:'ready',identitySaved:true,gameAccountCreated:true,gameConnected:false});
    const identity=JSON.parse(await fs.readFile(path.join(f.directory,'identity.json'),'utf8'));
    const requests=f.api.requests.filter(x=>x.route==='public-register');expect(requests).toHaveLength(1);
    expect(requests[0].authorization).toBeNull();expect(requests[0].body).toEqual({requestId:identity.clientId,username,clientSecret:identity.clientSecret});
    expect(f.api.requests.some(x=>x.route==='register')).toBe(false);
    expect(f.api.requests.filter(x=>x.route==='activate')).toHaveLength(1);
    const visible=JSON.stringify(value)+JSON.stringify(await f.portal.connectionSettings());
    for(const key of ['clientSecret','gamePassword','token'])expect(visible).not.toContain(identity[key]);
    expect((await fs.readdir(f.directory)).some(x=>x.startsWith('invitation'))).toBe(false);
  });
  it('continues pending requests with unchanged identity and never duplicates registration or activation',async()=>{
    const f=await fixture();expect(await f.portal.joinPlugin({username})).toMatchObject({state:'pending'});
    const original=JSON.parse(await fs.readFile(path.join(f.directory,'identity.json'),'utf8'));
    await f.portal.joinPlugin({username});f.api.setState('ready');expect(await f.portal.joinPlugin({username})).toMatchObject({state:'ready'});
    for(const route of ['public-register','activate'])expect(f.api.requests.filter(x=>x.route===route)).toHaveLength(1);
    const after=JSON.parse(await fs.readFile(path.join(f.directory,'identity.json'),'utf8'));
    for(const key of ['clientId','clientSecret','gameRequestId','gamePassword'])expect(after[key]).toBe(original[key]);
  });
  it('retains unknown activation and only queries it after a lost response',async()=>{
    const f=await fixture();f.api.activationUnknown=true;await expect(f.portal.joinPlugin({username})).rejects.toThrow('RESULT_UNKNOWN');
    f.api.activationUnknown=false;f.api.setState('not_created');expect(await f.portal.joinPlugin({username})).toMatchObject({state:'unknown'});
    for(const route of ['public-register','activate'])expect(f.api.requests.filter(x=>x.route===route)).toHaveLength(1);
  });
  it('retains the pre-exchange identity after a lost registration response and queries the original identity',async()=>{
    const f=await fixture();f.api.registrationUnknown=true;await expect(f.portal.joinPlugin({username})).rejects.toThrow('RESULT_UNKNOWN');
    const first=await fs.readFile(path.join(f.directory,'identity.json'),'utf8');
    expect(JSON.parse(first).username).toBe(username);f.api.registrationUnknown=false;
    expect(await f.portal.status()).toMatchObject({identitySaved:true,state:'not_created'});
    expect(f.api.requests.filter(x=>x.route==='public-register')).toHaveLength(1);expect(f.api.requests.filter(x=>x.route==='activate')).toHaveLength(0);
  });
  it('reports server rejection without inventing another name, identity or activation',async()=>{
    const f=await fixture();f.api.publicSignupError={status:429,reason:'FIXTURE_RATE_LIMIT'};
    await expect(f.portal.joinPlugin({username})).rejects.toThrow('FIXTURE_RATE_LIMIT');
    expect(f.api.requests.map(x=>x.route)).toEqual(['public-register']);expect((await f.portal.state()).username).toBe(username);
    await expect(f.portal.joinPlugin({username:'ag_Other'})).rejects.toThrow('EXISTING_IDENTITY_CONFLICT');
    expect(f.api.requests).toHaveLength(1);
  });
});
