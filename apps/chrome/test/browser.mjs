import { chromium } from 'playwright-core';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { installHost } from '../../native-host/scripts/install.mjs';
import { assertIsolatedExtensionTestPlatform } from './browser-platform.mjs';

assertIsolatedExtensionTestPlatform(process.platform);

const here=dirname(fileURLToPath(import.meta.url));
const extension=resolve(here,'../dist');
const id=(await readFile(join(extension,'extension-id.txt'),'utf8')).trim();
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';
const temp=await mkdtemp(join(tmpdir(),'sideband-browser-'));
const home=join(temp,'home');const project=join(temp,'project');const profile=join(temp,'profile');
await mkdir(project,{recursive:true});await mkdir(join(profile,'Default'),{recursive:true});
await writeFile(join(profile,'Default','Preferences'),JSON.stringify({extensions:{settings:{[id]:{allow_file_access:true}}}}));
const file=join(project,'한글 browser review.md');
const source='# Browser review\n\n## Details\n\nA precise phrase for browser review.\n\n```javascript\nconst ready = true;\n```\n\n```mermaid\ngraph TD; A[Read] --> B[Comment]\n```\n\n<script>globalThis.sidebandPwned = true</script>\n';
await writeFile(file,source);
await installHost({home,platform:process.platform,browser:process.platform==='darwin'?'chrome':'chromium',extensionId:id,project,author:'Browser tester',node:process.execPath,hostEntry:resolve(here,'../../native-host/dist/host.cjs')});
let context;
try {
  context=await chromium.launchPersistentContext(profile,{
    executablePath,headless:true,viewport:{width:1600,height:1000},
    ignoreDefaultArgs:['--disable-extensions'],
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files'],
    env:{...process.env,XDG_CONFIG_HOME:join(home,'.config')}
  });
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:20_000});
  assert.equal(new URL(worker.url()).hostname,id);
  const access=await worker.evaluate(()=>chrome.extension.isAllowedFileSchemeAccess());
  assert.equal(access,true,'Unpacked extension must have local file access enabled in the test profile.');
  const native=await worker.evaluate(async()=>chrome.runtime.sendNativeMessage('com.sideband_comments.chrome',{id:'probe',type:'settings.get'}));
  assert.equal(native.ok,true,JSON.stringify(native));
  console.log('PASS extension load, file URL permission and real Native Messaging connection');
  const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);
  await options.locator('#roots').fill(project);await options.locator('#author').fill('Browser reviewer');
  await options.getByRole('button',{name:'Save settings',exact:true}).click();
  await options.getByRole('status').filter({hasText:'Settings saved'}).waitFor();
  console.log('PASS settings page saves project and author through native host');
  const page=await context.newPage();page.on('pageerror',error=>console.error('PAGE ERROR',error.message));
  await page.goto(pathToFileURL(file).href);
  await page.locator('#sideband-comments [role="status"]').filter({hasText:'0 thread(s)'}).waitFor();
  await page.locator('.sideband-mermaid svg').waitFor({timeout:20_000});
  assert.equal(await page.locator('#sideband-toc a').count(),2);
  assert.equal(await page.locator('.token.keyword').first().innerText(),'const');
  assert.equal(await page.evaluate(()=>globalThis.sidebandPwned),undefined);
  console.log('PASS local Markdown, TOC, code highlighting, real Mermaid SVG and inert raw HTML');
  async function select(phrase) {
    await page.evaluate(phrase=>{
      const block=[...document.querySelectorAll('#sideband-document p')].find(x=>x.textContent.includes(phrase));
      const node=block.firstChild; const start=node.textContent.indexOf(phrase);
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
  const screenshot=process.env.SIDEBAND_SCREENSHOT;
  if(screenshot) await page.screenshot({path:screenshot,fullPage:true});
  await page.reload();
  await page.locator('.sideband-comment-body').filter({hasText:'A browser reply'}).waitFor();
  console.log('PASS selection → create → reply → native JSONL persistence → browser reload');
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
  const blocked=await worker.evaluate(async()=>chrome.runtime.sendMessage({id:'forged',type:'settings.save',roots:['/'],author:'attacker'}));
  assert.equal(blocked.ok,false);assert.match(blocked.error,/settings/i);
  console.log('PASS stale-write rejection, tab reload and non-settings sender rejection');
  await page.setViewportSize({width:680,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('PASS narrow-screen layout without horizontal overflow');
} finally {
  if(context) await context.close();
  await rm(temp,{recursive:true,force:true});
}
