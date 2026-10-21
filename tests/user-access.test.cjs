const test=require('node:test'),assert=require('node:assert/strict');
const U=require('../dist/user-access.js');
const {environment}=require('./ui-environment.cjs');
const user={name:'Jordan Avery',email:'jordan@example.com',role:'partner-manager',partnerId:'partner-acme',permissions:['leads'],active:true};
test('local directory validates roles, scope, duplicate emails, and role-limited permissions',()=>{
 const s={};const u=U.saveUser(s,user);assert.equal(u.role,'partner-manager');assert.deepEqual(u.permissions,['leads']);
 assert.throws(()=>U.saveUser(s,{...user,email:'JORDAN@example.com'}),/already exists/);
 assert.throws(()=>U.saveUser(s,{...user,email:'bad'}),/valid email/);
 assert.throws(()=>U.saveUser(s,{...user,email:'other@example.com',permissions:['reviews']}),/not available/);
 assert.throws(()=>U.saveUser(s,{...user,email:'other@example.com',partnerId:'unknown'}),/organization/);
 U.saveUser(s,{...u,active:false});assert.equal(u.active,false);assert.equal(s.userDirectory.history.length,2);
 const restored=JSON.parse(JSON.stringify(s));U.initialize(restored);assert.equal(restored.userDirectory.users.length,3);assert.equal(restored.userDirectory.users[2].active,false);
});
test('owner cannot be disabled or stripped of access',()=>{
 const s={},owner=U.initialize(s).users[0];
 for(const change of [{active:false},{permissions:['leads']},{role:'partner-manager',partnerId:'partner-acme',permissions:['leads']}])assert.throws(()=>U.saveUser(s,{...owner,...change}),/owner/);
});
test('account manager can add and edit local users through the existing shell',()=>{
 const a=environment(undefined,'',['sales-workflow.js','user-access.js','manager.js'],{session:{'prm-manager-session':'1'}});
 a.click({page:'users'});assert.match(a.html(),/Users &amp; permissions|Users & permissions/);assert.match(a.html(),/Partner Account Manager/);
 a.click({action:'add-user'});a.submit('mgr-form',{...user,permission_leads:'on',status:'active'});assert.match(a.html(),/Jordan Avery/);
 const id=a.saved().userDirectory.users.find(u=>u.email===user.email).id;
 a.click({action:'edit-user',userId:id});a.submit('mgr-form',{...user,permission_deals:'on',status:'inactive'});
 assert.equal(a.saved().userDirectory.users.find(u=>u.id===id).active,false);assert.match(a.html(),/Inactive/);
});
test('welcome uses the renamed roles without changing portal routes',()=>{
 const a=environment();assert.match(a.html(),/>Partner Manager</);assert.match(a.html(),/>Partner Account Manager</);assert.match(a.html(),/id="portal-partner"/);assert.match(a.html(),/id="portal-manager"/);
});
