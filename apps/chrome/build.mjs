import { build } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here=dirname(fileURLToPath(import.meta.url));
const output=join(here,'dist'); await mkdir(output,{recursive:true});
const result=await build({absWorkingDir:here,entryPoints:{content:'src/content.ts',background:'src/background.ts',options:'src/settings/options.ts'},outdir:output,bundle:true,platform:'browser',format:'iife',target:'chrome120',minify:true,metafile:true,legalComments:'eof'});
for (const [from,to] of [
  ['manifest.json','manifest.json'],['options.html','options.html'],
  ['styles/viewer.css','viewer.css'],['styles/options.css','options.css'],
  ['../../node_modules/github-markdown-css/github-markdown-light.css','github.css'],
  ['../../node_modules/prismjs/themes/prism.css','syntax.css']
]) await copyFile(join(here,from),join(output,to));
const manifest=JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));
const hash=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32);
const id=[...hash].map(x=>String.fromCharCode(97+parseInt(x,16))).join('');
await writeFile(join(output,'extension-id.txt'),id+'\n');
// Preserve notices for every package that actually contributed bundled code, plus copied CSS.
const packages=new Map();
for(const input of [...Object.keys(result.metafile.inputs),'../../node_modules/github-markdown-css/github-markdown-light.css','../../node_modules/prismjs/themes/prism.css']) {
  if(!input.includes('node_modules/')) continue;
  let directory=dirname(resolve(here,input));
  while(directory!==dirname(directory)) {
    try {
      const metadata=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
      if(metadata.name && metadata.version) {packages.set(`${metadata.name}@${metadata.version}`,{directory,metadata});break;}
    } catch(error) {if(error.code!=='ENOENT') throw error;}
    directory=dirname(directory);
  }
}
let notices='Sideband Comments\n\n'+await readFile(join(here,'../../LICENSE'),'utf8');
for(const [name,{directory,metadata}] of [...packages].sort(([a],[b])=>a.localeCompare(b))) {
  notices+=`\n\n${'='.repeat(72)}\n${name}\nDeclared license: ${JSON.stringify(metadata.license || metadata.licenses || 'See upstream package')}\n`;
  for(const file of (await readdir(directory,{withFileTypes:true})).filter(x=>x.isFile() && /^(licen[sc]e|copying|notice)(\.|$|-)/i.test(x.name))) {
    notices+=`\n--- ${file.name} ---\n`+await readFile(join(directory,file.name),'utf8');
  }
}
await writeFile(join(output,'THIRD_PARTY_NOTICES.txt'),notices);
console.log(`Chrome extension built: ${output}\nExtension ID: ${id}\nThird-party notices: ${packages.size} packages`);
