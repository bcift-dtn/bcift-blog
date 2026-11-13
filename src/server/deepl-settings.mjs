import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {audit, dataDir, db, passwordHash, passwordMatches, requireAdmin} from './cms.mjs';

db.exec(`CREATE TABLE IF NOT EXISTS deepl_settings (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 encrypted_key TEXT NOT NULL,
 pin_hash TEXT NOT NULL,
 failures INTEGER NOT NULL DEFAULT 0,
 retry_after INTEGER NOT NULL DEFAULT 0
)`);

const settings = () => db.prepare('SELECT * FROM deepl_settings WHERE id=1').get();
const keyFile = resolve(dataDir, 'deepl.key');
export const deeplBaseUrl = 'https://api-free.deepl.com';
export const deeplConfigured = () => !!settings();

function encryptionKey(create = false) {
 if (create) {
  try {
   writeFileSync(keyFile, randomBytes(32), {flag:'wx', mode:0o600});
  } catch (error) {
   if (error.code !== 'EEXIST') throw error;
  }
 }
 const key = readFileSync(keyFile);
 if (key.length !== 32) throw new Error('Kunci penyimpanan DeepL tidak valid.');
 return key;
}

function encrypt(value, create) {
 const iv = randomBytes(12);
 const cipher = createCipheriv('aes-256-gcm', encryptionKey(create), iv);
 const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
 return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function deeplKey() {
 const record = settings();
 if (!record) return '';
 const payload = Buffer.from(record.encrypted_key, 'base64');
 const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), payload.subarray(0,12));
 decipher.setAuthTag(payload.subarray(12,28));
 return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}

export async function saveDeeplSettings(actor, input, request = fetch) {
 requireAdmin(actor);
 const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : '';
 const pin = typeof input?.pin === 'string' ? input.pin : '';
 if (!/^[A-Za-z0-9_:-]{20,128}$/.test(apiKey)) throw new Error('Masukkan API key DeepL yang valid.');
 if (!/^\d{6,12}$/.test(pin)) throw new Error('PIN harus terdiri dari 6–12 angka.');

 const current = settings();
 const now = Date.now();
 if (current?.retry_after > now) throw new Error('Terlalu banyak percobaan PIN. Coba lagi dalam 15 menit.');
 if (current && !passwordMatches(pin, current.pin_hash)) {
  const failures = (current.retry_after ? 0 : current.failures) + 1;
  const retryAfter = failures >= 5 ? now + 15 * 60_000 : 0;
  db.prepare('UPDATE deepl_settings SET failures=?,retry_after=? WHERE id=1').run(failures,retryAfter);
  throw new Error(retryAfter ? 'Terlalu banyak percobaan PIN. Coba lagi dalam 15 menit.' : 'PIN salah.');
 }
 if (!current && pin !== input.pinConfirmation) throw new Error('Konfirmasi PIN tidak sama.');

 let response;
 try {
  response = await request(deeplBaseUrl + '/v2/usage', {
   headers:{Authorization:'DeepL-Auth-Key ' + apiKey},
   redirect:'error',
   signal:AbortSignal.timeout(10_000),
  });
 } catch {
  throw new Error('DeepL tidak dapat dijangkau. Coba lagi.');
 }
 if (response.status === 401 || response.status === 403) throw new Error('DeepL menolak key ini. Periksa API key paket Developer.');
 if (!response.ok) throw new Error('API key belum bisa diperiksa. Coba lagi.');

 db.exec('BEGIN IMMEDIATE');
 try {
  const latest = settings();
  if (latest?.encrypted_key !== current?.encrypted_key || latest?.retry_after > Date.now()) {
   throw new Error('Pengaturan berubah saat key diperiksa. Muat ulang dan coba lagi.');
  }
  db.prepare(`INSERT INTO deepl_settings (id,encrypted_key,pin_hash) VALUES (1,?,?)
   ON CONFLICT(id) DO UPDATE SET encrypted_key=excluded.encrypted_key,failures=0,retry_after=0`)
   .run(encrypt(apiKey,!latest),latest?.pin_hash ?? passwordHash(pin));
  audit(actor.id,'translation.key.updated','DeepL');
  db.exec('COMMIT');
 } catch (error) {
  db.exec('ROLLBACK');
  throw error;
 }
 return {configured:true};
}
