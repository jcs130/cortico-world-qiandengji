// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import type {WebUiPanelContext} from 'cortico/web/shared/client-panel.ts';
const runtimeEntry='../dist/webui.js';
const {mountLogin,mountClient}=await import(runtimeEntry) as typeof import('../src/webui.ts');
const wait=async(fn:()=>boolean)=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,10));expect(fn()).toBe(true);};
describe('single-click account UI',()=>{
  it('uses the Agent name, requires no invitation and never treats API preparation as actual entry',async()=>{
    const root=document.createElement('div'),abort=new AbortController(),calls:any[]=[];let accepted=false;
    const ctx={root,signal:abort.signal,interval:()=>({dispose(){}}),invoke:async(method:string,args:any[])=>{
      calls.push({method,args});
      if(method==='state')return {agentName:'Coobot',server:'micro.kangqiang.site:25702',username:'',suggestedUsername:'ag_Coobot',passwordSet:false,portal:{identitySaved:false},connection:{ready:false,stage:accepted?'waiting_world':'unconfigured'},onboarding:accepted?{phase:'waiting_game',message:'账号已准备，等待当前连接认证与世界就绪'}:{phase:'idle'}};
      if(method==='onboarding.connect'){expect(args[0]).toEqual({mode:'register',username:'ag_Coobot',server:'micro.kangqiang.site:25702'});accepted=true;return {phase:'waiting_game',message:'账号已准备，等待游戏认证'};}
      throw Error('Unexpected operation');
    }} as unknown as WebUiPanelContext;
    try{
      mountLogin(ctx);await wait(()=>root.textContent!.includes('Agent：Coobot'));
      expect(root.querySelector<HTMLInputElement>('input[name="game-username"]')!.value).toBe('ag_Coobot');
      expect(root.querySelector('input[name*="invite"]')).toBe(null);
      Array.from(root.querySelectorAll('button')).find(b=>b.textContent==='注册并进入游戏')!.click();
      await wait(()=>accepted&&root.textContent!.includes('等待当前连接认证'));
      expect(root.textContent).not.toContain('入服成功');expect(calls.filter(x=>x.method==='onboarding.connect')).toHaveLength(1);
    }finally{abort.abort();}
  });
  it('keeps existing-login passwords private, clears the field and sends no registration request',async()=>{
    const root=document.createElement('div'),abort=new AbortController();let saved=false;
    const ctx={root,signal:abort.signal,interval:()=>({dispose(){}}),invoke:async(method:string,args:any[])=>{
      if(method==='state')return {agentName:'Original',server:'fixture.invalid:25565',username:'Original',passwordSet:false,portal:{identitySaved:false},connection:{ready:false,stage:'unknown'},onboarding:{phase:'idle'}};
      if(method==='onboarding.connect'){expect(args[0]).toEqual({mode:'login',username:'Original',server:'fixture.invalid:25565',password:'fixture-password'});saved=true;return {phase:'waiting_game'};}
      throw Error('Unexpected operation');
    }} as unknown as WebUiPanelContext;
    try{mountLogin(ctx);await wait(()=>root.textContent!.includes('Agent：Original'));
      const password=root.querySelector<HTMLInputElement>('input[name="server-password"]')!;expect(password.type).toBe('password');password.value='fixture-password';
      Array.from(root.querySelectorAll('button')).find(b=>b.textContent==='登录并进入游戏')!.click();expect(password.value).toBe('');
      await wait(()=>saved);expect(root.textContent).not.toContain('fixture-password');
    }finally{abort.abort();}
  });
  it('refreshes the suggested Agent name while retaining a user-selected account',async()=>{
    const root=document.createElement('div'),abort=new AbortController();let agent='Before',tick:()=>void=()=>{};
    const ctx={root,signal:abort.signal,interval:(callback:()=>void)=>{tick=callback;return {dispose(){}};},invoke:async(method:string)=>{
      expect(method).toBe('state');return {agentName:agent,server:'fixture.invalid:25565',username:'',suggestedUsername:'ag_'+agent,passwordSet:false,portal:{identitySaved:false},connection:{ready:false,stage:'unconfigured'},onboarding:{phase:'idle'}};
    }} as unknown as WebUiPanelContext;
    try{
      mountLogin(ctx);await wait(()=>root.textContent!.includes('Agent：Before'));
      const name=root.querySelector<HTMLInputElement>('input[name="game-username"]')!;
      expect(name.value).toBe('ag_Before');agent='After';tick();
      await wait(()=>root.textContent!.includes('Agent：After'));expect(name.value).toBe('ag_After');
      name.value='MyChoice';name.dispatchEvent(new Event('input'));agent='Renamed';tick();
      await wait(()=>root.textContent!.includes('Agent：Renamed'));expect(name.value).toBe('MyChoice');
    }finally{abort.abort();}
  });
  it('keeps the Java client as an official-site download and preserves the observer account rule',()=>{
    const root=document.createElement('div'),signal=new AbortController().signal;mountClient({root,signal} as unknown as WebUiPanelContext);
    expect(root.querySelector('a')!.href).toBe('https://mc.kangqiang.site/downloads.html#game-clients');
    expect(root.textContent).toContain('xxx_eye');expect(root.textContent).not.toContain('作弊');
  });
});
