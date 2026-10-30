import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPasteFormatter} from '../src/scripts/paste-content.mjs';
const window=new JSDOM('').window;
const paste=createPasteFormatter(window);
const dir=mkdtempSync(join(tmpdir(),'bcift-paste-test-'));process.env.CMS_DATA_DIR=dir;
const {db,cleanBody,articleBody}=await import('../src/server/cms.mjs');
function parsed(html){const holder=window.document.createElement('div');holder.innerHTML=html;return holder;}
test('formatted paste preserves headings, lists, emphasis and citations through save/render',()=>{
 const html=paste({html:'<div class="source"><h1>Autogate BCIFT</h1><p style="color:red">Perjalanan <strong>lebih mudah</strong> dan <em>nyaman</em>.</p><h2>Persiapan</h2><ul><li>Siapkan paspor</li><li>Cek jadwal</li></ul><p><a href="https://www.bcift.co.id/schedule" target="_blank">Jadwal ferry</a></p></div>',text:'fallback'});
 const doc=parsed(html);assert.equal(doc.querySelectorAll('h1').length,0);assert.equal(doc.querySelectorAll('h2').length,2);assert.equal(doc.querySelector('strong').textContent,'lebih mudah');assert.equal(doc.querySelector('em').textContent,'nyaman');assert.equal(doc.querySelectorAll('li').length,2);assert.equal(doc.querySelector('a').getAttribute('href'),'https://www.bcift.co.id/schedule');assert.equal(doc.querySelector('[style]'),null);
 const saved=cleanBody(html),rendered=articleBody(saved);assert.equal(rendered.headings.length,2);assert.ok(rendered.html.includes('<strong>lebih mudah</strong>'));assert.ok(rendered.html.includes('<ul>'));
});
test('plain Markdown becomes article formatting instead of literal syntax',()=>{
 const doc=parsed(paste({text:'## Autogate BCIFT\n\nPerjalanan **lebih mudah**.\n\n- Siapkan paspor\n- Cek jadwal\n\n[Jadwal](https://bcift.co.id/schedule)'}));
 assert.equal(doc.querySelector('h2').textContent,'Autogate BCIFT');assert.equal(doc.querySelector('strong').textContent,'lebih mudah');assert.equal(doc.querySelectorAll('li').length,2);assert.ok(doc.querySelector('a'));
});

test('normal-weight clipboard wrappers do not bold the whole article',()=>{
 for(const weight of ['normal','400','500']){
  const doc=parsed(paste({html:`<b style="font-weight:${weight}"><h2>Persiapan</h2><p>Paragraf biasa dengan <strong>kata penting</strong>.</p><p>Paragraf kedua.</p></b>`}));
  assert.equal(doc.querySelectorAll('b').length,0);assert.equal(doc.querySelectorAll('strong').length,1);
  assert.equal(doc.querySelector('strong').textContent,'kata penting');assert.equal(doc.querySelectorAll('p').length,2);
  assert.equal(doc.querySelector('[style]'),null);
  const saved=parsed(cleanBody(doc.innerHTML));assert.equal(saved.querySelectorAll('strong').length,1);assert.equal(saved.querySelector('strong').textContent,'kata penting');
 }
});

test('normal-weight wrappers preserve nested bold, links, lists and headings',()=>{
 const doc=parsed(paste({html:'<strong style="font-weight:normal!important"><h2>Judul</h2><p>Teks <b style="font-weight:700">tebal</b> dan <em>miring</em>.</p><ul><li><a href="https://bcift.co.id/">BCIFT</a></li></ul></strong>'}));
 assert.equal(doc.querySelector('strong'),null);assert.equal(doc.querySelectorAll('b').length,1);assert.equal(doc.querySelector('b').textContent,'tebal');
 assert.equal(doc.querySelector('h2').textContent,'Judul');assert.equal(doc.querySelector('li a').getAttribute('href'),'https://bcift.co.id/');assert.equal(doc.querySelector('em').textContent,'miring');assert.equal(doc.querySelector('[style]'),null);
});
test('paragraphs and tables stay separate, pasted scripts and handlers are removed',()=>{
 const doc=parsed(paste({html:'<div>Paragraf pertama</div><div>Paragraf kedua</div><table><tr><th>Rute</th></tr><tr><td>Batam</td></tr></table><script>alert(1)</script><img src="https://example.com/photo.jpg" onerror="alert(1)"><a href="javascript:alert(1)">Bahaya</a><iframe src="https://evil.example"></iframe><svg onload="alert(1)"></svg><img src="data:image/svg+xml,unsafe"/>'}));
 assert.equal(doc.querySelectorAll('p').length,2);assert.equal(doc.querySelectorAll('table td').length,1);assert.equal(doc.querySelector('p').textContent,'Paragraf pertama');assert.equal(doc.querySelector('script,iframe,svg,[onerror],[onload]'),null);assert.equal(doc.querySelector('a').hasAttribute('href'),false);assert.equal(doc.querySelectorAll('img').length,1);
});
test('plain paragraphs and soft breaks remain readable',()=>{const doc=parsed(paste({text:'Paragraf pertama.\nBaris berikutnya.\n\nParagraf kedua.'}));assert.equal(doc.querySelectorAll('p').length,2);assert.equal(doc.querySelectorAll('br').length,1);});
test.after(()=>{window.close();db.close();rmSync(dir,{recursive:true,force:true});});
