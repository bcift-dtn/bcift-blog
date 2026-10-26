import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaUrl} from '../src/lib/media-url.mjs';
const id='1234567890abcdef1234567890abcdef';
test('uploaded image URLs always include the required trailing slash',()=>{assert.equal(mediaUrl('/blog/media/'+id),'/blog/media/'+id+'/');assert.equal(mediaUrl('/blog/media/'+id+'/'),'/blog/media/'+id+'/');});
test('existing static and external images remain unchanged',()=>{for(const value of ['/images/ferry.webp','https://example.com/photo.jpg','',null])assert.equal(mediaUrl(value),value);});
