import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {initEditorToolbar} from '../src/scripts/editor-toolbar.mjs';

test('paragraph command restores the selected block after toolbar focus moves',()=>{
 const dom=new JSDOM('<form><div id="body" contenteditable><h2>Subjudul asli</h2><h2>Paragraf pembuka</h2></div></form><button data-block="p">Paragraf</button>');
 try{
  const w=dom.window,doc=w.document,body=doc.getElementById('body'),button=doc.querySelector('button');let changes=0;
  const toolbar=initEditorToolbar(body,[button],()=>changes++),selection=w.getSelection(),range=doc.createRange();
  range.selectNodeContents(body.lastElementChild);range.collapse(false);selection.addRange(range);doc.dispatchEvent(new w.Event('selectionchange'));
  // Keyboard/touch focus can clear the live selection before click is delivered.
  selection.removeAllRanges();button.focus();
  doc.execCommand=(command,_ui,tag)=>{
   assert.equal(command,'formatBlock');assert.equal(tag,'p');
   const old=selection.anchorNode.nodeType===3?selection.anchorNode.parentElement:selection.anchorNode;assert.equal(old.textContent,'Paragraf pembuka');
   const paragraph=doc.createElement(tag);paragraph.append(...old.childNodes);old.replaceWith(paragraph);return true;
  };
  button.click();assert.equal(body.innerHTML,'<h2>Subjudul asli</h2><p>Paragraf pembuka</p>');assert.equal(changes,1);
  toolbar.reset();selection.removeAllRanges();button.click();assert.equal(changes,1);
 }finally{dom.window.close();}
});
