// Browser UI + real native-host subprocess test. This does not load a Chrome extension.
// Keep test:browser separate: that test requires a browser permitting unpacked extensions.
import { chromium } from 'playwright-core';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { installHost } from '../../native-host/scripts/install.mjs';

const here=dirname(fileURLToPath(import.meta.url));const dist=resolve(here,'../dist');
const id=(await readFile(join(dist,'extension-id.txt'),'utf8')).trim();
const temp=await mkdtemp(join(tmpdir(),'sideband-ui-'));const project=join(temp,'project');await mkdir(project);
const file=join(project,'한글 browser review.md');
const source='# Browser review\n\n## Details\n\nA precise phrase for browser review.\n\n```javascript\nconst ready = true;\n```\n\n```mermaid\ngraph TD; A[Read] --> B[Comment]\n```\n\n<script>globalThis.sidebandPwned = true</script>\n';
await writeFile(file,source);
const hostEntry=resolve(here,'../../native-host/dist/host.cjs');
const paths=await installHost({home:temp,platform:'darwin',browser:'chrome',extensionId:id,project,author:'Browser tester',node:process.execPath,hostEntry});
function nativeRequest(name,request) {
  assert.equal(name,'com.sideband_comments.chrome');
  const body=Buffer.from(JSON.stringify(request));const header=Buffer.alloc(4);header.writeUInt32LE(body.length);
  const processResult=spawnSync(process.execPath,[hostEntry,'--config',paths.config,`chrome-extension://${id}/`],{input:Buffer.concat([header,body]),timeout:10_000});
  assert.equal(processResult.status,0,processResult.stderr.toString());
  const length=processResult.stdout.readUInt32LE(0);assert.equal(length,processResult.stdout.length-4);
  return JSON.parse(processResult.stdout.subarray(4).toString());
}
let listener;
const sandbox=vm.createContext({URL,chrome:{runtime:{id,onMessage:{addListener(fn){listener=fn;}},sendNativeMessage:async(name,request)=>nativeRequest(name,request),openOptionsPage:async()=>{}},action:{onClicked:{addListener(){}}}}});
vm.runInContext(await readFile(join(dist,'background.js'),'utf8'),sandbox);
function relay(request,senderUrl){return new Promise(resolve=>listener(request,{id,url:senderUrl},resolve));}
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.exposeBinding('sidebandTestRelay',({page},request)=>relay(request,new URL(page.url()).pathname==='/options.html'?`chrome-extension://${id}/options.html`:pathToFileURL(file).href));
  await context.addInitScript(()=>{
    window.chrome=window.chrome || {};
    const listeners=new Set();
    const notify=changes=>{for(const fn of listeners)fn(changes,'local');};
    window.addEventListener('storage',event=>{if(event.key)notify({[event.key]:{newValue:JSON.parse(event.newValue || 'null')}});});
    window.chrome.storage={local:{get:async key=>({[key]:JSON.parse(localStorage.getItem(key) || 'null')}),set:async values=>{const changes={};for(const [key,value] of Object.entries(values)){localStorage.setItem(key,JSON.stringify(value));changes[key]={newValue:value};}notify(changes);}},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};

    window.chrome.runtime={sendMessage:message=>window.sidebandTestRelay(message),getURL:name=>`https://sideband.test/${name}`};
  });
  await context.route('https://sideband.test/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/review.md') {
      const text=await readFile(file,'utf8');
      await route.fulfill({contentType:'text/html',body:`<!doctype html><link rel="stylesheet" href="/github.css"><link rel="stylesheet" href="/syntax.css"><link rel="stylesheet" href="/viewer.css"><pre>${escape(text)}</pre><script src="/content.js"></script>`});
    }else{
      const name=path.slice(1);assert.ok(['options.html','options.js','options.css','content.js','github.css','syntax.css','viewer.css','icon.png'].includes(name),name);
      await route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html',body:await readFile(join(dist,name))});
    }
  });
  const options=await context.newPage();await options.goto('https://sideband.test/options.html');
  await options.getByRole('status').filter({hasText:'Local host connected'}).waitFor();
  await options.locator('#roots').fill(project);await options.locator('#author').fill('Browser reviewer');
  await options.getByRole('button',{name:'Save settings',exact:true}).click();
  await options.getByRole('status').filter({hasText:'Settings saved'}).waitFor();
  console.log('PASS settings UI → production background authorization → native subprocess');
  const page=await context.newPage();page.on('pageerror',error=>console.error('PAGE ERROR',error.message));
  await page.goto('https://sideband.test/review.md');
  await page.locator('#sideband-comments [role="status"]').filter({hasText:'0 thread(s)'}).waitFor();
  await page.locator('.sideband-mermaid svg').waitFor({timeout:20_000});
  assert.equal(await page.locator('#sideband-toc a').count(),2);
  assert.equal(await page.locator('.token.keyword').first().innerText(),'const');
  assert.equal(await page.evaluate(()=>globalThis.sidebandPwned),undefined);
  console.log('PASS Markdown/GFM, source-backed TOC, code highlighting, real Mermaid SVG and inert raw HTML');
  async function select(phrase) {
    await page.evaluate(phrase=>{
      const block=[...document.querySelectorAll('#sideband-document p')].find(x=>x.textContent.includes(phrase));
      const node=block.firstChild;const start=node.textContent.indexOf(phrase);
      const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+phrase.length);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    },phrase);
    await page.locator('.sideband-compose blockquote').filter({hasText:phrase}).waitFor();
  }
  await select('precise phrase');
  await page.getByRole('textbox',{name:'New comment',exact:true}).fill('Browser comment <script>no execution</script>');
  await page.getByRole('button',{name:'Add comment',exact:true}).click();
  await page.locator('.sideband-comment-body').filter({hasText:'Browser comment'}).waitFor();
  await page.getByRole('textbox',{name:'Reply',exact:true}).fill('A browser reply');
  await page.getByRole('button',{name:'Reply',exact:true}).click();
  await page.locator('.sideband-comment-body').filter({hasText:'A browser reply'}).waitFor();
  assert.equal(await readFile(file,'utf8'),source);
  assert.equal(await page.locator('.sideband-thread section strong').first().innerText(),'Browser reviewer');
  assert.equal(await page.locator('#sideband-comments script').count(),0);
  if(process.env.SIDEBAND_SCREENSHOT) await page.screenshot({path:process.env.SIDEBAND_SCREENSHOT,fullPage:true});
  await page.reload();
  await page.locator('.sideband-comment-body').filter({hasText:'A browser reply'}).waitFor();
  console.log('PASS selection → create → reply → real JSONL persistence → reload, preserving Markdown');
  const python=spawnSync('python3',[resolve(here,'../../../plugin/skills/sideband-comments/scripts/sideband_comments.py'),'list',file,'--json'],{encoding:'utf8'});
  assert.equal(python.status,0,python.stderr);assert.match(python.stdout,/A browser reply/);JSON.parse(python.stdout);
  console.log('PASS existing Python Sideband client reads browser comments and replies');
  await writeFile(file,source+'\nDocument changed externally.\n');
  await select('browser review');
  await page.getByRole('textbox',{name:'New comment',exact:true}).fill('Must not be saved');
  await page.getByRole('button',{name:'Add comment',exact:true}).click();
  await page.locator('#sideband-comments [role="status"]').filter({hasText:'Document changed'}).waitFor();
  await page.reload();
  await page.locator('#sideband-document').filter({hasText:'Document changed externally.'}).waitFor();
  assert.equal(await page.locator('.sideband-thread').count(),1);
  await page.getByRole('button',{name:'Resolve',exact:true}).click();
  await page.locator('.sideband-thread-state').filter({hasText:'Resolved'}).waitFor();
  await options.getByRole('button',{name:'Hide Resolved',exact:true}).click();
  assert.equal(await page.locator('.sideband-thread').count(),0);
  await options.getByRole('button',{name:'Show Resolved',exact:true}).click();
  assert.equal(await page.locator('.sideband-thread').count(),1);
  console.log('PASS Resolve uses the shared store and filtering hides only resolved threads');
  const blocked=await relay({id:'forged',type:'settings.save',roots:['/'],author:'attacker'},pathToFileURL(file).href);
  assert.equal(blocked.ok,false);assert.match(blocked.error,/settings/i);
  await page.setViewportSize({width:680,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.locator('#sideband-toc').isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'Refresh',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Toggle contents',exact:true}).count(),0);
  console.log('PASS stale-write rejection, tab reload, unauthorized settings rejection and narrow-screen layout');
} finally {
  if(browser) await browser.close();
  await rm(temp,{recursive:true,force:true});
}
