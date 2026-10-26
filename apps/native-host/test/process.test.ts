import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MessageDecoder, encodeMessage } from '../src/framing.js';

const entry=resolve('apps/native-host/dist/host.cjs');
beforeAll(()=>{execFileSync(resolve('node_modules/.bin/esbuild'),['apps/native-host/src/main.ts','--bundle','--platform=node','--format=cjs',`--outfile=${entry}`],{stdio:'pipe'});});
describe('native host executable',()=>{
  it('reads a real frame over stdin and writes only a framed response to stdout',()=>{
    const temp=mkdtempSync(join(tmpdir(),'sideband-process-'));
    try{
      const config=join(temp,'config.json');writeFileSync(config,JSON.stringify({extensionId:'a'.repeat(32),roots:[temp],author:'Reader'}));
      const result=spawnSync(process.execPath,[entry,'--config',config,`chrome-extension://${'a'.repeat(32)}/`],{input:encodeMessage({id:'1',type:'settings.get'})});
      expect(result.status,result.stderr.toString()).toBe(0);
      expect(new MessageDecoder().push(result.stdout)).toEqual([{id:'1',ok:true,value:{roots:[temp],author:'Reader'}}]);
    }finally{rmSync(temp,{recursive:true,force:true});}
  });
  it('rejects an unregistered extension origin before handling settings',()=>{
    const temp=mkdtempSync(join(tmpdir(),'sideband-origin-'));
    try{
      const config=join(temp,'config.json');writeFileSync(config,JSON.stringify({extensionId:'a'.repeat(32),roots:[],author:''}));
      const result=spawnSync(process.execPath,[entry,'--config',config,`chrome-extension://${'b'.repeat(32)}/`],{input:encodeMessage({id:'1',type:'settings.get'})});
      expect(result.status).toBe(1);expect(result.stdout.length).toBe(0);expect(result.stderr.toString()).toContain('Unregistered');
    }finally{rmSync(temp,{recursive:true,force:true});}
  });
});

it('executes the installed launcher with spaces and apostrophes in its configuration path', async()=>{
  const { installHost }=await import('../scripts/install.mjs');
  const temp=mkdtempSync(join(tmpdir(),"sideband user's home-"));
  try{
    const paths=await installHost({home:temp,platform:'darwin',browser:'chrome',extensionId:'a'.repeat(32),hostEntry:entry,node:process.execPath});
    const result=spawnSync(paths.launcher,[`chrome-extension://${'a'.repeat(32)}/`],{input:encodeMessage({id:'launcher',type:'settings.get'})});
    expect(result.status,result.stderr.toString()).toBe(0);
    expect(new MessageDecoder().push(result.stdout)).toEqual([{id:'launcher',ok:true,value:{roots:[],author:''}}]);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
