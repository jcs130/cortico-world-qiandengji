// Copy this file beside the consumer's package.json after installing the release archives.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MinecraftAgentClient, nullLogger } from 'agent-mc-world/client';
import { MYMC } from 'cortico-world-qiandengji';

const root = await mkdtemp(join(tmpdir(), 'mc-pack-check-'));
const log = nullLogger();
const guide = { profile:'survival', title:'Island guide', revision:'1', entries:[
  {id:'ferry', title:'Ferry', summary:'Travel', text:'Open the travel menu', reference:'Page 2'}
] };
const servers = {
  survival: { host:'127.0.0.1', port:1, guide },
  rpg: { host:'127.0.0.1', port:2, serverPack:'qiandengji' },
  third: { host:'127.0.0.1', port:3 },
};
try {
  for (const server of Object.keys(servers)) {
    const cfg = { ...MYMC.defaults(), provider:'mineflayer', server, servers, username:'Fixture', serverPack:'qiandengji' };
    const dataDir = join(root, server);
    const sdk = new MinecraftAgentClient({cfg, dataDir, log});
    try {
      const reply = await sdk.call('mc_knowledge', {source:'server', id:'ferry'});
      const data = JSON.parse(reply.text);
      if (server === 'survival') {
        assert.equal(data.entry.text, guide.entries[0].text);
        assert.equal(data.profile, server);
        assert.equal(data.currentWorldVerified, false);
      } else assert.equal(data.status, 'unavailable');
      assert.equal(sdk.status().phase, 'disconnected');
      const world = MYMC.create({id:'mymc', cfg, dataDir, botDir:root, repoRoot:root, packageDir:root,
        timezone:'UTC', botName:'Fixture', secret:()=>'', storeSecret:()=>{}, persist:()=>{}, restart:async()=>{}});
      assert.equal(world.tools().some(t => t.name === 'mymc_guide'), server === 'rpg');
    } finally { await sdk.disconnect(); }
  }
  console.log('Installed SDK and World passed the three-profile isolation check.');
} finally { await rm(root, { recursive:true, force:true }); }
