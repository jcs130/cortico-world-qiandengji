/** Real Java 1.21.1 packets on an ephemeral loopback server; no production role or model. */
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {attachLiteConnection} from '../dist/connection.js';
const require=createRequire(import.meta.url),mineflayer=require('mineflayer');
const req=createRequire(require.resolve('mineflayer')),protocol=req('minecraft-protocol'),data=req('minecraft-data')('1.21.1');
const fromProtocol=createRequire(req.resolve('minecraft-protocol')),nbt=fromProtocol('prismarine-nbt');
const Chunk=req('prismarine-chunk')('1.21.1'),{Vec3}=require('vec3');
const directory=await mkdtemp(join(tmpdir(),'lite-native-ready-'));
const password=randomBytes(24).toString('base64url'),username='fixture_player';
let bot,gate,peer,received=0,correct=false,nativeSpawn=false,announced=0,serverError;
const server=protocol.createServer({host:'127.0.0.1',port:0,version:'1.21.1','online-mode':false,enforceSecureProfile:false,keepAlive:false});
server.on('error',error=>{serverError=error;});
try{
 await once(server,'listening');const port=server.socketServer.address().port;
 const credential=join(directory,'password'),bindings=join(directory,'bindings.json');
 await writeFile(credential,password,{mode:0o600});
 await writeFile(bindings,JSON.stringify({enabled:true,accounts:[{server:`127.0.0.1:${port}`,username,command:'login',credentialFile:credential,credentialFormat:'file'}]}),{mode:0o600});
 server.on('playerJoin',client=>{
  peer=client;client.on('error',error=>{serverError=error;});
  const system=text=>client.write('system_chat',{content:nbt.comp({text:nbt.string(text)}),isActionBar:false});
  for(const event of ['chat_command','chat_command_signed'])client.on(event,packet=>{
   received++;correct=packet.command===`login ${password}`;system('MC_AUTH_SUCCESS');
  });
  client.write('login',{...data.loginPacket,entityId:1,enforcesSecureChat:false});
  client.write('position',{x:8,y:65,z:8,yaw:0,pitch:0,flags:0,teleportId:1});
  client.write('update_health',{health:20,food:20,foodSaturation:5});
  setTimeout(()=>system('MC_AUTH_LOGIN'),50).unref();
 });
 bot=mineflayer.createBot({host:'127.0.0.1',port,username,version:'1.21.1',auth:'offline',hideErrors:true});
 bot.physicsEnabled=false;bot.on('error',error=>{serverError=error;});bot.on('spawn',()=>{nativeSpawn=true;});
 gate=attachLiteConnection(bot,{server:`127.0.0.1:${port}`,username,bindingsFile:bindings,statusFile:join(directory,'status.json'),instanceId:'native-loopback-only',onReady:()=>{announced++;}});
 let end=Date.now()+8000;
 while(Date.now()<end&&!gate.snapshot().authSuccessReceived&&!serverError)await new Promise(r=>setTimeout(r,10));
 if(serverError)throw serverError;
 const before=gate.snapshot();
 if(received!==1||!correct||!before.authSuccessReceived||before.worldReady||before.ready||announced)throw Error('Premature readiness or private-login failure');
 const column=new Chunk({minY:-64,worldHeight:384});
 for(let x=0;x<16;x++)for(let z=0;z<16;z++)column.setBlockStateId(new Vec3(x,64,z),data.blocksByName.stone.defaultState);
 const chunkData=column.dump();
 for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)peer.write('map_chunk',{x,z,heightmaps:nbt.comp({}),chunkData,blockEntities:[],skyLightMask:[],blockLightMask:[],emptySkyLightMask:[],emptyBlockLightMask:[],skyLight:[],blockLight:[]});
 end=Date.now()+8000;
 while(Date.now()<end&&!gate.ready()&&!serverError)await new Promise(r=>setTimeout(r,10));
 if(serverError)throw serverError;
 const after=gate.snapshot();
 if(!nativeSpawn||!after.ready||!after.worldReady||announced!==1)throw Error('Native loaded-world readiness not confirmed');
 console.log(JSON.stringify({scope:'loopback-native-protocol-only',version:'1.21.1',commandsReceived:received,correctScopedLogin:correct,nativeSpawnSeen:nativeSpawn,authSuccessReceived:after.authSuccessReceived,readyBeforeChunks:before.ready,worldReadyAfterChunks:after.worldReady,fullyReady:after.ready,readyCallbacks:announced,publicServerConnections:0,newProductionPlayers:0,modelCalls:0,actualPublicServerLoginVerified:false}));
}finally{
 gate?.stop();bot?.quit();for(const client of Object.values(server.clients))client.end('Fixture completed');server.close();
 await new Promise(r=>setTimeout(r,100));
 if(dirname(resolve(directory))!==resolve(tmpdir())||!basename(directory).startsWith('lite-native-ready-'))throw Error('Unexpected fixture directory');
 await rm(directory,{recursive:true,force:true});
}
