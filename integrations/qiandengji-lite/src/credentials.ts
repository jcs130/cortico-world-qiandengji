import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, unlink, readFile, lstat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';

export interface AccountScope { host: string; port: number; username: string }
export function accountScope(input: AccountScope) {
  if (typeof input.host !== 'string' || !input.host.trim() || /[\s/\\\x00]/.test(input.host)
    || !Number.isInteger(input.port) || input.port < 1 || input.port > 65535
    || !/^[A-Za-z0-9_]{1,16}$/.test(input.username)) throw Error('服务器或角色配置无效');
  const scope = { host: input.host.toLowerCase(), port: input.port, username: input.username };
  return { ...scope, server: `${scope.host}:${scope.port}`,
    key: createHash('sha256').update(JSON.stringify(scope)).digest('hex') };
}
export async function privateJson(file: string): Promise<any> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 131072 || (process.platform !== 'win32' && (stat.mode & 0o077))) throw Error('私密文件不可用');
  return JSON.parse(await readFile(file, 'utf8'));
}
export async function atomicJson(file: string, value: unknown) {
  await mkdir(resolve(file, '..'), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2)+'\n', { flag: 'wx', mode: 0o600 });
  try { await rename(temp, file); } finally { await unlink(temp).catch(() => {}); }
}
async function protectWindows(bytes: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const script = "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v); try {[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))} finally {[Array]::Clear($b,0,$b.Length)}";
    const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let output=''; const timer=setTimeout(()=>{child.kill();reject(Error('私密密码保存超时'));},5000);
    child.stdout.on('data',part=>{output+=String(part);if(output.length>32768)child.kill();});
    child.stderr.resume();
    child.once('error',()=>{clearTimeout(timer);reject(Error('私密密码保存失败'));});
    child.once('close',code=>{clearTimeout(timer);if(code!==0||!output.trim())reject(Error('私密密码保存失败'));else resolve(Buffer.from(output.trim(),'base64'));});
    child.stdin.end(bytes.toString('base64'));
  });
}
export class Credentials {
  readonly directory: string;
  readonly bindingFile: string;
  constructor(directory: string) { this.directory=resolve(directory);this.bindingFile=join(this.directory,'bindings.json'); }
  async state(scope: AccountScope) {
    const selected=accountScope(scope);
    try { const cfg=await privateJson(this.bindingFile); return { server:selected.server,username:selected.username,passwordSet:cfg.accounts?.some((a:any)=>a.server===selected.server&&a.username===selected.username)===true }; }
    catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT')return {server:selected.server,username:selected.username,passwordSet:false};throw Error('私密登录配置不可用'); }
  }
  async save(scope: AccountScope, password: unknown) {
    const selected=accountScope(scope);
    if(typeof password!=='string'||!password||password.length>128||/\s|[\x00-\x1f\x7f]/.test(password))throw Error('密码不能为空，也不能含空白或控制字符');
    await mkdir(this.directory,{recursive:true,mode:0o700});
    let cfg:any={enabled:true,accounts:[]};
    try{cfg=await privateJson(this.bindingFile);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw Error('原登录配置不可用，未覆盖');}
    if(!Array.isArray(cfg.accounts))throw Error('原登录配置不可用，未覆盖');
    const bytes=Buffer.from(password,'utf8');
    let protectedBytes:Buffer;
    try{protectedBytes=process.platform==='win32'?await protectWindows(bytes):Buffer.from(bytes);}finally{bytes.fill(0);}
    const leaf=`${selected.key}-${randomUUID()}.${process.platform==='win32'?'dpapi':'secret'}`;
    try{await writeFile(join(this.directory,leaf),protectedBytes,{flag:'wx',mode:0o600});}finally{protectedBytes.fill(0);}
    const account={server:selected.server,username:selected.username,command:'login',credentialFile:leaf,
      credentialFormat:process.platform==='win32'?'dpapi':'file',requestMarkers:['MC_AUTH_LOGIN'],successMarkers:['MC_AUTH_SUCCESS'],
      failureMarkers:['MC_AUTH_FAILED','MC_AUTH_PASSWORD_ERROR','MC_AUTH_BAD_PASSWORD','MC_AUTH_LOCKED','MC_AUTH_2FA_REQUIRED','MC_AUTH_TOTP_REQUIRED'],timeoutMs:30000};
    await atomicJson(this.bindingFile,{enabled:true,accounts:[...cfg.accounts.filter((a:any)=>!(a.server===selected.server&&a.username===selected.username)),account]});
    return this.state(scope);
  }
  async importBinding(scope:AccountScope,file:string){
    const selected=accountScope(scope),input=await privateJson(file);
    const accounts=input.accounts?.filter((a:any)=>a.server===selected.server&&a.username===selected.username&&a.command==='login');
    if(input.enabled!==true||accounts?.length!==1||typeof accounts[0].credentialFile!=='string')throw Error('官网登录配置与当前角色不符');
    let previous:any={accounts:[]};try{previous=await privateJson(this.bindingFile);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw Error('原登录配置不可用，未覆盖');}
    if(!Array.isArray(previous.accounts))throw Error('原登录配置不可用，未覆盖');
    const account={...accounts[0],credentialFile:resolve(dirname(file),accounts[0].credentialFile)};
    await atomicJson(this.bindingFile,{enabled:true,accounts:[...previous.accounts.filter((a:any)=>!(a.server===selected.server&&a.username===selected.username)),account]});
    return this.state(scope);
  }
}
