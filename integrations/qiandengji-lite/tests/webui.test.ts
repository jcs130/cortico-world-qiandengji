// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Credentials} from '../src/credentials.ts';
import type {WebUiPanelContext} from 'cortico/web/shared/client-panel.ts';
const runtimeEntry='../dist/webui.js';
const {mountLogin}=await import(runtimeEntry) as typeof import('../src/webui.ts');

describe('private server password panel',()=>{
  it('saves to the scoped private store, clears the input and never renders the password',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'qiandengji-lite-panel-'));
    const store=new Credentials(directory),scope={host:'fixture.invalid',port:25565,username:'fixture_player'};
    const root=document.createElement('div'),controller=new AbortController();
    let saved=false,ordinaryTask=false;
    const context={root,signal:controller.signal,interval:()=>({dispose(){}}),invoke:async(method:string,args?:unknown[])=>{
      if(method==='state')return {...await store.state(scope),connection:{stage:'armed'},portal:{message:'官网未接入'}};
      if(method==='save'){const form=args?.[0] as any;expect(form.server).toBe('fixture.invalid:25565');expect(form.username).toBe(scope.username);await store.save(scope,form.password);saved=true;return {};}
      ordinaryTask=true;throw Error('Unexpected task operation');
    }} as unknown as WebUiPanelContext;
    try{
      mountLogin(context);
      for(let i=0;i<100&&!root.textContent?.includes('fixture.invalid');i++)await new Promise(r=>setTimeout(r,10));
      const password=root.querySelector<HTMLInputElement>('input[name="server-password"]')!;
      expect(password.type).toBe('password');password.value='fixture-ui-password';
      Array.from(root.querySelectorAll('button')).find(button=>button.textContent==='保存密码')!.click();
      expect(password.value).toBe('');
      for(let i=0;i<200&&!saved;i++)await new Promise(r=>setTimeout(r,20));
      expect(saved).toBe(true);expect(ordinaryTask).toBe(false);
      expect(root.textContent).not.toContain('fixture-ui-password');
      expect((await store.state(scope)).passwordSet).toBe(true);
    }finally{controller.abort();await rm(directory,{recursive:true,force:true});}
  },15000);
});
