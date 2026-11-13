import { QIANDENGJI_SERVER_QUERIES } from './server-query.ts';

/** Only trusted server messages reach this state; player chat is never parsed.
 * An unfinished room is a reason to look, not a position or permission to attack.
 */
export class TrialSearchState {
  private current: {key:string;remaining:number;observedAtMs:number;expiresAtMs:number} | undefined;
  private progress: {source:string;run:string|null;revision:number|null;participant:boolean;active:boolean;
    floor:number;remainingMobs:number|null;floorCleared:boolean;observedAtMs:number} | undefined;
  private epoch=0;
  reset(){this.current=undefined;this.progress=undefined;this.epoch++;}
  read(now=Date.now()){return this.current&&this.current.expiresAtMs>now?{...this.current}:undefined;}
  facts(now=Date.now()){
    if(!this.progress)return {source:'server',fresh:false,status:'unverified',floorCleared:null,query:'trial.status'};
    const fresh=now-this.progress.observedAtMs<60000;
    return {...this.progress,fresh,status:fresh?'observed':'stale',
      floorCleared:fresh?this.progress.floorCleared:null,query:'trial.status',
      meaning:'当前挑战观察；历史 lastOutcome、局部战斗 clear、没看见敌人均不是本层通关证据。过期后须重新查询。'};
  }
  observe(text:string,username:string,now=Date.now()){
    // This method is only fed trusted server feedback. The server decorates
    // room lifecycle messages; preserve that protocol instead of losing them.
    text=text.replace(/^【试炼塔·第\d+层】\s*/, '');
    const native=QIANDENGJI_SERVER_QUERIES.find(q=>q.id==='trial.status')!.matchReply(text,[],username)?.data as Record<string,unknown>|undefined;
    if(native){
      this.record(native,'MC_TRIAL_STATE',now);return;
    }
    if(text.startsWith('MC_DUNGEON status ')){
      const fields=Object.fromEntries(text.slice('MC_DUNGEON status '.length).split(/\s+/).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
      if(!username||fields.recipient!==username||fields.activityType!=='trial_tower'
        ||!['true','false'].includes(fields.participant)||!['true','false'].includes(fields.globalActive))return;
      this.record({active:fields.globalActive==='true',participant:fields.participant==='true',
        floor:Number(fields.selfFloor),globalFloor:Number(fields.globalFloor),remainingMobs:Number(fields.remainingMobs),globalState:fields.globalState,
        run:fields.run,revision:fields.revision},'MC_DUNGEON status',now);return;
    }
    // The native self/global distinction is mandatory. A global count alone
    // cannot enlist this player or resurrect a previous challenge.
    const match=/^本人试炼：参赛中；全服试炼：第\s*(\d+)\/\d+\s*层[^\n]*本层剩余\s*(\d+)\s*只怪物[。.]?$/.exec(text);
    if(match){this.record({active:true,participant:true,floor:Number(match[1]),remainingMobs:Number(match[2])},'server-message',now);return;}
    const entered=/^(?:附近\s+\d+\s+人进入第|进入第|已恢复第)\s*(\d+)\s*\/\s*\d+\s*层/.exec(text);
    if(entered){
      // Nearby room broadcasts alone cannot prove that this account entered.
      // Preserve a verified participant; otherwise require a self query.
      const previous=this.progress;this.current=undefined;this.epoch++;
      this.progress=previous?.participant&&previous.active?{...previous,source:'server-room-transition',
        floor:Number(entered[1]),remainingMobs:null,floorCleared:false,observedAtMs:now}:undefined;return;
    }
    const cleared=/^第\s*(\d+)\s*\/\s*\d+\s*层已通关/.exec(text);
    if(cleared&&this.progress?.active&&this.progress.participant&&this.progress.floor===Number(cleared[1])){
      this.current=undefined;this.progress={...this.progress,source:'server-floor-clear',remainingMobs:0,floorCleared:true,observedAtMs:now};return;
    }
    if(/^(?:进入第|已恢复第|第\s*\d+\s*\/\s*\d+\s*层已通关|本人试炼：)/.test(text))this.reset();
  }
  private record(native:Record<string,unknown>,source:string,now:number){
    const floor=Number(native.selfFloor??native.floor),remaining=Number(native.remainingMobs);
    if(!Number.isSafeInteger(floor)||floor<0||!Number.isSafeInteger(remaining)||remaining<0)return;
    const run=typeof native.run==='string'?native.run:null;
    const revision=native.revision!==undefined&&Number.isSafeInteger(Number(native.revision))?Number(native.revision):null;
    if(run&&run===this.progress?.run&&revision!==null&&this.progress.revision!==null&&revision<this.progress.revision)return;
    if(run&&run!==this.progress?.run)this.epoch++;
    this.progress={source,run,revision,participant:native.participant===true,active:native.active===true,
      floor,remainingMobs:remaining,floorCleared:native.participant===true&&native.active===true&&remaining===0
        &&(native.globalFloor===undefined||Number(native.globalFloor)===floor)
        &&(native.globalState==='cleared'||native.state==='cleared'),observedAtMs:now};
    if(native.active&&native.participant&&remaining>0)this.set(floor,remaining,now);
    else this.current=undefined;
  }
  private set(floor:number,remaining:number,now:number){
    if(!Number.isSafeInteger(floor)||floor<1||!Number.isSafeInteger(remaining)||remaining<=0){this.reset();return;}
    this.current={key:`trial-room:${this.epoch}:${floor}`,remaining,observedAtMs:now,expiresAtMs:now+60000};
  }
}
