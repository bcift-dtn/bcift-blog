import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {initLinkEditor} from '../src/scripts/link-editor.mjs';
function editor(html){
 const dom=new JSDOM('<form><button type="button" id="toolbar">Tautan</button><div id="body" contenteditable="true">'+html+'</div></form>',{pretendToBeVisual:true});
 const w=dom.window,doc=w.document,body=doc.getElementById('body');let changes=0;
 initLinkEditor(body,doc.getElementById('toolbar'),()=>changes++);
 const panel=doc.getElementById('article-link-editor'),input=panel.querySelector('[data-url]');
 const submit=()=>panel.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 return {dom,w,doc,body,panel,input,submit,changes:()=>changes};
}
test('clicking an existing link edits its URL and removes it without losing formatted text',()=>{
 const e=editor('<p>Visit <a href="https://old.example/"><strong>Ranoh Island</strong></a> today. <a href="https://other.example/">Other source</a></p>');
 try{
  const target=e.body.querySelector('a');target.querySelector('strong').dispatchEvent(new e.w.MouseEvent('click',{bubbles:true,cancelable:true}));
  assert.equal(e.panel.hidden,false);assert.equal(e.input.value,'https://old.example/');
  e.input.value='https://ranohisland.com/about-us/';e.submit();assert.equal(target.getAttribute('href'),e.input.value);assert.equal(e.body.querySelectorAll('a').length,2);assert.equal(target.innerHTML,'<strong>Ranoh Island</strong>');assert.equal(e.changes(),1);assert.equal(e.panel.hidden,true);
  target.click();e.panel.querySelector('[data-remove]').click();assert.equal(e.body.querySelectorAll('a').length,1);assert.equal(e.body.querySelector('strong').textContent,'Ranoh Island');assert.equal(e.body.querySelector('a').href,'https://other.example/');assert.equal(e.changes(),2);
 }finally{e.dom.window.close();}
});
test('selected text shows controls and keeps its range while the URL input has focus',()=>{
 const e=editor('<p>Explore <em>Ranoh Island</em> with friends.</p>');
 try{
  const range=e.doc.createRange();range.selectNodeContents(e.body.querySelector('em'));e.w.getSelection().addRange(range);e.body.dispatchEvent(new e.w.MouseEvent('mouseup',{bubbles:true}));assert.equal(e.panel.hidden,false);
  e.doc.getElementById('toolbar').click();assert.equal(e.doc.activeElement,e.input);e.w.getSelection().removeAllRanges();e.input.value='https://ranohisland.com/';e.submit();assert.equal(e.body.querySelector('a').textContent,'Ranoh Island');assert.equal(e.body.querySelector('a').href,e.input.value);assert.equal(e.body.textContent,'Explore Ranoh Island with friends.');assert.equal(e.changes(),1);
 }finally{e.dom.window.close();}
});
test('unsafe URLs are rejected and Escape dismisses the controls',()=>{
 const e=editor('<p><a href="https://ranohisland.com/">Ranoh Island</a></p>');
 try{
  const link=e.body.querySelector('a');link.click();e.input.value='javascript:alert(1)';e.submit();assert.equal(e.panel.querySelector('[role="alert"]').hidden,false);assert.equal(link.href,'https://ranohisland.com/');assert.equal(e.changes(),0);
  e.input.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(e.panel.hidden,true);
 }finally{e.dom.window.close();}
});
