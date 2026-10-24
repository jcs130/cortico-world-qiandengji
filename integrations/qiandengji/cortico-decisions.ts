import {createHttpDecisionPort,COMBAT_DECISION_DEFAULTS,type HttpDecisionSettings} from 'agent-mc-world/decisions';
import type {World,WorldHost,WorldConsoleDecl} from 'agent-mc-world/contracts';
import type {MymcConfigSection} from './config.ts';

export type DecisionServiceConfig=NonNullable<MymcConfigSection['decisionService']>;
export const DECISION_SERVICE_DEFAULTS:DecisionServiceConfig={enabled:false,endpoint:'',model:'',apiKeyEnv:'',timeoutMs:1000};
export function decisionServiceSettings(cfg:MymcConfigSection):HttpDecisionSettings|null {
  const service=cfg.decisionService;
  if(service?.enabled)return {endpoint:service.endpoint,model:service.model,apiKeyEnv:service.apiKeyEnv,timeoutMs:service.timeoutMs};
  // A previously explicit HTTP service can be retained; a private provider id cannot be resolved through public API 6.
  const old=cfg.hostDecisions?.combat;
  return old?.enabled&&old.endpoint?.trim()&&old.connection!=='host'
    ?{endpoint:old.endpoint,model:old.model,apiKeyEnv:old.apiKeyEnv,timeoutMs:old.timeoutMs}:null;
}
export function publicHostDecisions(cfg:MymcConfigSection):MymcConfigSection['hostDecisions'] {
  return {...cfg.hostDecisions,choice:{decisionProvider:''},
    combat:{...COMBAT_DECISION_DEFAULTS,...cfg.hostDecisions?.combat,connection:'host',endpoint:'',decisionProvider:''}};
}
export function validateDecisionService(cfg:MymcConfigSection):void {
  const settings=decisionServiceSettings(cfg);
  if(!settings){if(cfg.hostDecisions?.combat?.enabled)throw Error('请为本 World 配置明确的快决策服务地址；标准 Cortico API 6 不提供私有的已保存决策连接。');return;}
  const url=new URL(settings.endpoint);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)throw Error('快决策服务必须是无内嵌凭据的完整 HTTP(S) 地址。');
  if(settings.apiKeyEnv&&!/^[A-Za-z_][A-Za-z0-9_]*$/.test(settings.apiKeyEnv))throw Error('请填写密钥环境变量名。');
}
/** The World creates its own optional decision port from explicit settings and public secret/reportUsage capabilities. */
export function withCorticoDecisionService<T extends World>(world:T,cfg:()=>MymcConfigSection,secret:(name:string)=>string):T {
  const start=world.start.bind(world),stop=world.stop.bind(world),base=world.console?.bind(world);
  let lifetime:AbortController|null=null;
  const publisher=(world as T&{publishAgentActivity?(value:unknown):void}).publishAgentActivity?.bind(world);
  world.start=async(host:WorldHost)=>{
    validateDecisionService(cfg());const controller=new AbortController();lifetime=controller;
    const port=decisionServiceSettings(cfg())?createHttpDecisionPort(()=>decisionServiceSettings(cfg())!,{secret,signal:controller.signal,
      observe:value=>{
        if(lifetime!==controller||controller.signal.aborted)return;
        publisher?.({id:'decision:'+value.id,at:value.at,source:'system1',kind:'decision',title:'快决策',status:value.state,
          model:value.model,result:{answers:value.answers,elapsedMs:value.elapsedMs,usage:value.usage,error:value.error}});
        if(value.state==='completed'){
          const usage=value.usage;
          // Unknown token counters are not converted into zero usage. The bounded observation keeps their nulls.
          if(usage?.input_tokens!==null&&usage?.input_tokens!==undefined&&usage.output_tokens!==null&&usage.cached_input_tokens!==null)
            host.reportUsage({promptTokens:usage.input_tokens,completionTokens:usage.output_tokens,
              cacheHitTokens:usage.cached_input_tokens,cacheMissTokens:Math.max(0,usage.input_tokens-usage.cached_input_tokens)},
              {model:value.model,label:'Minecraft fast decision'});
          else host.log.emit('info','Decision usage has unknown counters',{event:'mymc.decision.usage',data:{requestId:value.id,...usage,model:value.model}});
        }
      }}):undefined;
    // No read of a private host.decisions field; getters such as public cognition remain live.
    const adapter=new Proxy(host,{get(target,key){if(key==='decisions')return port;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    try{await start(adapter);}catch(error){controller.abort();if(lifetime===controller)lifetime=null;throw error;}
  };
  world.stop=async()=>{lifetime?.abort();lifetime=null;await stop();};
  world.console=():WorldConsoleDecl=>{const declaration=base?.();return {...declaration,
    config:[...(declaration?.config??[]),{id:'world:mymc:decision-service',owner:'world:mymc',schema:{type:'object',title:'快决策服务',properties:{
      'worlds.mymc.decisionService.enabled':{type:'boolean',title:'启用快决策服务','x-hot':false},
      'worlds.mymc.decisionService.endpoint':{type:'string',title:'完整服务地址','x-hot':false,description:'服务接受 state/questions 并返回带概率的 answers；例如自有局域网服务。不是普通聊天接口。'},
      'worlds.mymc.decisionService.model':{type:'string',title:'模型名','x-hot':false},
      'worlds.mymc.decisionService.apiKeyEnv':{type:'string',title:'部署 .env 中的密钥变量名','x-hot':false,description:'密钥通过 Cortico secret() 读取，不填写密钥本身。'},
      'worlds.mymc.decisionService.timeoutMs':{type:'integer',minimum:1,maximum:60000,title:'服务等待上限（毫秒）','x-hot':false},
    }}}]};};
  Object.defineProperty(world,'webUi',{value:world.console.bind(world),configurable:true});return world;
}
