import { QIANDENGJI_SERVER_QUERIES } from './server-query.ts';

/** Only trusted server messages reach this state; player chat is never parsed.
 * An unfinished room is a reason to look, not a position or permission to attack.
 */
export class TrialSearchState {
  private current: {key:string;remaining:number;observedAtMs:number;expiresAtMs:number} | undefined;
  private epoch=0;
  reset(){this.current=undefined;this.epoch++;}
  read(now=Date.now()){return this.current&&this.current.expiresAtMs>now?{...this.current}:undefined;}
  observe(text:string,username:string,now=Date.now()){
    const native=QIANDENGJI_SERVER_QUERIES.find(q=>q.id==='trial.status')!.matchReply(text,[],username)?.data as Record<string,unknown>|undefined;
    if(native){
      if(!native.active||!native.participant||Number(native.remainingMobs)<=0){this.reset();return;}
      this.set(Number(native.selfFloor??native.floor),Number(native.remainingMobs),now);return;
    }
    // The native self/global distinction is mandatory. A global count alone
    // cannot enlist this player or resurrect a previous challenge.
    const match=/^本人试炼：参赛中；全服试炼：第\s*(\d+)\/\d+\s*层[^\n]*本层剩余\s*(\d+)\s*只怪物[。.]?$/.exec(text);
    if(match){this.set(Number(match[1]),Number(match[2]),now);return;}
    if(/^(?:进入第|已恢复第|第\s*\d+\s*\/\s*\d+\s*层已通关|本人试炼：)/.test(text))this.reset();
  }
  private set(floor:number,remaining:number,now:number){
    if(!Number.isSafeInteger(floor)||floor<1||!Number.isSafeInteger(remaining)||remaining<=0){this.reset();return;}
    this.current={key:`trial-room:${this.epoch}:${floor}`,remaining,observedAtMs:now,expiresAtMs:now+60000};
  }
}
