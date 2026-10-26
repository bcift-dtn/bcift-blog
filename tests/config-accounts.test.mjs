import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'bcift-config-test-'));process.env.CMS_DATA_DIR=dir;
const cms=await import('../src/server/cms.mjs');
const password='Config-test-only-password!';
const config=[{email:'fixed@example.com',passwordHash:cms.passwordHash(password),role:'admin',enabled:true}];
test('code account supports direct password login and configuration changes revoke sessions',()=>{
 cms.ensureConfiguredAccounts(config);const user=cms.db.prepare('SELECT * FROM admins WHERE email=?').get('fixed@example.com');assert.ok(user.managed_hash);assert.equal(user.password,config[0].passwordHash);
 const verified={token:cms.login('fixed@example.com',password,'config-test')};assert.equal(cms.authenticated(verified.token),true);
 cms.ensureConfiguredAccounts(config);assert.ok(cms.authenticated(verified.token));assert.equal(cms.db.prepare('SELECT count(*) AS count FROM admins').get().count,1);
 const actor=cms.currentUser(verified.token);assert.throws(()=>cms.updateMember(actor,user.id,{role:'editor'}),/kode/);assert.throws(()=>cms.inviteMember(actor,user.email,'admin','reset'),/diatur/);
 const changed=[{...config[0],passwordHash:cms.passwordHash('Changed-config-password!')}];cms.ensureConfiguredAccounts(changed);assert.equal(cms.authenticated(verified.token),false);assert.throws(()=>cms.login(user.email,password,'config-test'));
 const next=cms.login(user.email,'Changed-config-password!','config-test');assert.equal(cms.authenticated(next),true);
 cms.ensureConfiguredAccounts([{...changed[0],enabled:false}]);assert.equal(cms.authenticated(next),false);assert.throws(()=>cms.login(user.email,'Changed-config-password!','config-test'));
 cms.ensureConfiguredAccounts(changed);cms.ensureConfiguredAccounts([]);assert.equal(cms.db.prepare('SELECT active FROM admins WHERE id=?').get(user.id).active,0);cms.ensureConfiguredAccounts(changed);assert.equal(cms.db.prepare('SELECT active FROM admins WHERE id=?').get(user.id).active,1);
});
test('code configuration never overwrites unrelated existing accounts',()=>{
 cms.createAccount('existing@example.com','Existing-only-password!','editor');
 assert.throws(()=>cms.ensureConfiguredAccounts([{email:'existing@example.com',passwordHash:config[0].passwordHash,role:'admin',enabled:true}]),/sudah dipakai/);
 assert.equal(cms.db.prepare('SELECT role FROM admins WHERE email=?').get('existing@example.com').role,'editor');
});
test.after(()=>{cms.db.close();rmSync(dir,{recursive:true,force:true});});
