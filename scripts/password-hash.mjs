import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {stdin,stdout} from 'node:process';
import {randomBytes,scryptSync} from 'node:crypto';
if(!stdin.isTTY||!stdout.isTTY){console.error('Jalankan langsung di terminal interaktif. Jangan masukkan password lewat argumen atau pipe.');process.exit(1);}
let hidden=false;
const output=new Writable({write(chunk,encoding,done){if(!hidden)stdout.write(chunk,encoding);done();}});
const rl=createInterface({input:stdin,output,terminal:true}),controller=new AbortController();rl.on('SIGINT',()=>controller.abort());
async function secret(prompt){stdout.write(prompt);hidden=true;try{return await rl.question('',{signal:controller.signal});}finally{hidden=false;stdout.write('\n');}}
try{const first=await secret('Password baru (12–128 karakter, disembunyikan): '),second=await secret('Ulangi password: ');if(first.length<12||first.length>128)throw new Error('Password harus 12–128 karakter.');if(first!==second)throw new Error('Ulangan password tidak sama.');const salt=randomBytes(16).toString('hex');console.log('Salin nilai ini ke passwordHash di src/server/internal-accounts.mjs:\n'+salt+':'+scryptSync(first,salt,64).toString('hex'));}catch(error){console.error(error.name==='AbortError'?'Dibatalkan.':error.message);process.exitCode=1;}finally{rl.close();}
