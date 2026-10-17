import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {itemAppearanceCatalog} from '../integrations/qiandengji/presentation.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('the standalone presentation carries every original item resource and exact custom model selector',async()=>{
  const file=new URL(itemAppearanceCatalog.fileUrl),bytes=await fs.readFile(file);assert.equal(sha(bytes),itemAppearanceCatalog.sha256);
  const catalog=JSON.parse(bytes);assert.equal(catalog.id,'qiandengji-items-1.21.1');assert.equal(catalog.items.length,6);
  for(const [path,expected] of Object.entries(catalog.assets)){const image=await fs.readFile(new URL(path,file));assert.equal(image.length,expected.bytes);assert.equal(sha(image),expected.sha256);}
  assert.equal(catalog.items.find(row=>row.baseId==='minecraft:blaze_rod').customModelData,731004);
  const backpack=catalog.items.find(row=>row.baseId==='minecraft:player_head');
  assert.equal(backpack.profileTextureHash,'8dcc6eb40f3bada41e4339888d6d207437598bdbd175c2e731191d5a9a42d3c8');
  assert.equal(catalog.assets[backpack.icon].sha256,backpack.profileTextureHash);
});
