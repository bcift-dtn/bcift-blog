import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {stdin,stdout} from 'node:process';
import {createAccount,hasAdmin,db} from '../src/server/cms.mjs';

if(!stdin.isTTY||!stdout.isTTY){console.error('Jalankan perintah ini langsung di terminal interaktif. Password tidak diterima lewat argumen, file, atau pipe.');db.close();process.exit(1);}
let hidden=false;
const output=new Writable({write(chunk,encoding,done){if(!hidden)stdout.write(chunk,encoding);done();}});
const rl=createInterface({input:stdin,output,terminal:true});
const controller=new AbortController();
rl.on('SIGINT',()=>controller.abort());
async function ask(prompt){return rl.question(prompt,{signal:controller.signal});}
async function password(prompt){stdout.write(prompt);hidden=true;try{return await ask('');}finally{hidden=false;stdout.write('\n');}}
try{
 console.log('BCIFT Blog Studio — buat akun internal\nPassword tidak akan ditampilkan atau disimpan dalam source code.');
 const email=(await ask('Email anggota: ')).trim();
 const role=hasAdmin()?((await ask('Peran [editor/admin] (default editor): ')).trim().toLowerCase()||'editor'):'admin';
 if(!['admin','editor'].includes(role))throw new Error('Peran harus editor atau admin.');
 if(role==='admin')console.log('Akun ini memiliki akses Admin.');
 const first=await password('Password (minimal 12 karakter, input disembunyikan): ');
 const second=await password('Ulangi password: ');
 if(first!==second)throw new Error('Ulangan password tidak sesuai.');
 const user=createAccount(email,first,role);
 console.log(`Akun ${user.email} (${user.role}) berhasil dibuat.\nSilakan login di /blog/admin/, gunakan email dan password akun.`);
}catch(error){console.error(error.name==='AbortError'?'Dibatalkan.':error.message);process.exitCode=1;}finally{rl.close();db.close();}
