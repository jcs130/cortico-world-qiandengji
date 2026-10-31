import {readFile,access} from 'node:fs/promises';
const root=new URL('../',import.meta.url),p=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
if(p.cortico.kind!=='world'||p.cortico.api!==6||p.name!=='cortico-world-qiandengji-lite')throw Error('Invalid lite package manifest');
for(const file of [p.main,p.cortico.webUiClient,p.cortico.webUiStyle,p.cortico.describe,'UPSTREAM.json','README.md','CHANGELOG.md','LICENSE','THIRD-PARTY-NOTICES.md','dist/upstream/engine-child.js','dist/upstream/dependency-patches.js'])await access(new URL(file,root));
const provenance=JSON.parse(await readFile(new URL('UPSTREAM.json',root),'utf8'));
if(provenance.official.version!=='0.2.11'||provenance.files.filter(f=>f.mechanical.length).length!==2)throw Error('Unexpected official gameplay changes');
console.log('Qiandengji-lite package, official provenance and native child files verified');
