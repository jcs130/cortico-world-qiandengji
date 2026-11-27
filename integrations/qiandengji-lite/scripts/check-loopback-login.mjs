/** Fake public World reads over a temporary TCP loopback. No game, Mineflayer, credentials or model. */
import {createServer,createConnection} from 'node:net';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
export async function checkLoopback(fullReady=false){
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/connection.ts',import.meta.url))],bundle:true,
    write:false,platform:'node',format:'esm',target:'node22'});
  const {LiteConnection}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  let worldReady=false,foreign=false,reads=0;
  const username='fixture_player';
  const server=createServer(socket=>{
    socket.on('error',()=>{});
    socket.once('data',()=>{reads++;socket.end(JSON.stringify({server:{host:'127.0.0.1',port:server.address().port,username:foreign?'foreign':username},
      connection:{ready:true,worldReady,serverLogin:{authSuccessReceived:true,password:'fixture-private-password',stage:'confirmed'}},
      profile:{level:99,skillIds:['not-public']}}));});
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const scope={host:'127.0.0.1',port:server.address().port,username};
  const read=()=>new Promise((resolve,reject)=>{
    let bytes='';const socket=createConnection({host:scope.host,port:scope.port});
    socket.setTimeout(2000,()=>{socket.destroy();reject(Error('Loopback fixture timeout'));});
    socket.once('connect',()=>socket.write('state'));
    socket.on('data',chunk=>{bytes+=chunk;if(bytes.length>16384){socket.destroy();reject(Error('Unexpected fixture size'));}});
    socket.once('error',reject);socket.once('end',()=>{try{resolve(JSON.parse(bytes));}catch{reject(Error('Invalid fixture reply'));}});
  });
  const gate=new LiteConnection({target:()=>scope,instanceId:'loopback-fixture-only',read});
  try{
    gate.start();const before=await gate.refresh();
    if(before.ready||!before.authSuccessReceived||before.worldReady)throw Error('Premature readiness from public authentication alone');
    if(JSON.stringify(before).includes('fixture-private-password'))throw Error('Private diagnostic data leaked');
    if(fullReady){worldReady=true;if(!(await gate.refresh()).ready)throw Error('Current full readiness not accepted');
      foreign=true;if((await gate.refresh()).ready)throw Error('Foreign account authorized');}
    gate.stop();if(gate.snapshot().ready)throw Error('Stopped instance authorized');
    console.log(JSON.stringify({scope:'fake-public-world-loopback-only',reads,fullReadyGateChecked:fullReady,
      credentialsLogged:false,publicServerConnections:0,botsStarted:0,modelCalls:0}));
  }finally{gate.stop();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await checkLoopback(false);
