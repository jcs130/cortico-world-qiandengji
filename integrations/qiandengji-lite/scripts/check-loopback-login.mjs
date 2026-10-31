/** Native protocol fixture. Never connects to a public game server or starts a model. */
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {attachLiteConnection} from '../dist/connection.js';
const require=createRequire(import.meta.url),mineflayer=require('mineflayer');
const fromMineflayer=createRequire(require.resolve('mineflayer'));
const protocol=fromMineflayer('minecraft-protocol'),data=fromMineflayer('minecraft-data')('1.21.1');
const fromProtocol=createRequire(fromMineflayer.resolve('minecraft-protocol')),nbt=fromProtocol('prismarine-nbt');
const directory=await mkdtemp(join(tmpdir(),'qiandengji-lite-native-'));
const password=randomBytes(16).toString('hex'),username='fixture_player';
let bot,gate,received=0,nativeSpawn=false,readyCount=0,correct=false,serverError;
const server=protocol.createServer({host:'127.0.0.1',port:0,version:'1.21.1','online-mode':false,enforceSecureProfile:false,keepAlive:false});
server.on('error',error=>{serverError=error;});
try{
  await once(server,'listening');const port=server.socketServer.address().port;
  const credential=join(directory,'password');await writeFile(credential,password,{mode:0o600});
  const bindings=join(directory,'bindings.json');await writeFile(bindings,JSON.stringify({enabled:true,accounts:[{server:`127.0.0.1:${port}`,username,command:'login',credentialFile:credential,credentialFormat:'file'}]}),{mode:0o600});
  server.on('playerJoin',client=>{
    client.on('error',error=>{serverError=error;});
    const system=text=>client.write('system_chat',{content:nbt.comp({text:nbt.string(text)}),isActionBar:false});
    for(const name of ['chat_command','chat_command_signed'])client.on(name,packet=>{
      received++;correct=packet.command===`login ${password}`;system('MC_AUTH_SUCCESS');
    });
    client.write('login',{...data.loginPacket,entityId:1,enforcesSecureChat:false});
    client.write('position',{x:0,y:64,z:0,yaw:0,pitch:0,flags:0,teleportId:1});
    setTimeout(()=>{system('MC_AUTH_LOGIN');system('MC_AUTH_LOGIN');},50).unref();
  });
  bot=mineflayer.createBot({host:'127.0.0.1',port,username,version:'1.21.1',auth:'offline',hideErrors:true});
  bot.on('error',error=>{serverError=error;});bot.on('spawn',()=>{nativeSpawn=true;});
  gate=attachLiteConnection(bot,{server:`127.0.0.1:${port}`,username,bindingsFile:bindings,statusFile:join(directory,'status.json'),instanceId:'loopback-only',onReady:()=>{readyCount++;}});
  const deadline=Date.now()+8000;
  while(Date.now()<deadline&&!gate.snapshot().authSuccessReceived&&!serverError)await new Promise(resolve=>setTimeout(resolve,10));
  if(serverError)throw serverError;
  const state=gate.snapshot();
  if(received!==1||!correct||!state.authSuccessReceived||state.ready||readyCount)throw Error('Native private-login pre-world contract failed');
  console.log(JSON.stringify({scope:'loopback-protocol-fixture-only',version:'1.21.1',commandsReceived:received,correctScopedLogin:correct,
    nativeSpawnSeen:nativeSpawn,authSuccessReceived:state.authSuccessReceived,worldReady:state.worldReady,fullyReady:state.ready,
    stage:state.stage,publicServerConnections:0,newProductionPlayers:0,modelCalls:0}));
}finally{
  gate?.stop();bot?.quit();for(const client of Object.values(server.clients))client.end('Fixture completed');server.close();
  await new Promise(resolve=>setTimeout(resolve,100));await rm(directory,{recursive:true,force:true});
}
