import { vi } from 'vitest';
export function portalApiFixture(){
  const requests:Array<{route:string;method:string;body:any;authorization:string|null}>=[];
  let username='ag_Fixture',clientId='',state='not_created';
  const control={requests,gameBridgeReady:true,activationState:'pending',activationUnknown:false,registrationUnknown:false,
    wrongUsername:false,wrongAddress:false,createdOverride:undefined as boolean|undefined,
    setState(value:string){state=value;},
    fetch:vi.fn(async(input:any,init?:RequestInit)=>{
      const url=new URL(String(input));if(url.origin!=='https://mc.kangqiang.site')throw Error('Unexpected origin');
      const route=url.pathname.replace('/api/v1/agent-access/',''),body=init?.body?JSON.parse(String(init.body)):null;
      requests.push({route,method:init?.method??'GET',body,authorization:new Headers(init?.headers).get('authorization')});
      const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
      if(route==='register'){username=body.username;clientId=body.requestId;if(control.registrationUnknown)throw Error('Response lost');return reply({state:'registered',username,clientId});}
      if(route==='sessions'){clientId=body.clientId;return reply({username,clientId,token:'qda_'+'t'.repeat(43),expiresAt:new Date(Date.now()+3600000).toISOString()});}
      if(route==='status')return reply({state,username:control.wrongUsername?'ag_Other':username,
        gameAccountCreated:control.createdOverride??state==='ready',gameAddress:control.wrongAddress?'elsewhere.test:25565':'micro.kangqiang.site:25702',gameVersion:'1.21.1',game:{ready:control.gameBridgeReady}});
      if(route==='activate'){state=control.activationState;if(control.activationUnknown)throw Error('Response lost');return reply({state,username,gameAccountCreated:state==='ready'});}
      throw Error('Unexpected fixture endpoint '+route);
    }),
  };return control;
}
