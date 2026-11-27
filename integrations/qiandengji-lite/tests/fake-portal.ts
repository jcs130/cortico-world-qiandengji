// Test-only public portal stand-in. No website calls, native connection or model.
export const QIANDENGJI_WEBSITE='https://mc.kangqiang.site';
export const QIANDENGJI_GAME={host:'micro.kangqiang.site',port:25702,version:'1.21.1'} as const;
export class QiandengjiPortalAccess {
  constructor(_options:{directory:string}){}
  async state(){return {identitySaved:false,username:null};}
  async joinPlugin(){throw Error('No portal registration in installation fixtures');}
  async status(){throw Error('No website calls in installation fixtures');}
  async connectionSettings(){throw Error('No identity in installation fixtures');}
  async importIdentity(){throw Error('No imports in installation fixtures');}
}
