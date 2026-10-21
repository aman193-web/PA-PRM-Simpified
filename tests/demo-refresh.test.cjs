const test=require('node:test'),assert=require('node:assert/strict'),W=require('../dist/sales-workflow.js');
test('refresh restores sample journeys and cancels stale sample operations while preserving created leads',()=>{
 const state={crm:{connected:true}};W.initialize(state);const f=W.create(state);
 const custom=f.createLead({company:'User Created Customer',contact:'Jamie Lee',email:'jamie@example.com',region:'North America',value:30000,need:'Unify sales records across three regional offices.',consent:true});
 f.accept('L114');f.sync();assert.equal(f.get('lead','L114').status,'Accepted');
 f.accept('L115');assert.equal(f.get('lead','L115').sync.status,'pending');
 const customBefore=JSON.stringify(custom);W.resetSamples(state);
 assert.equal(f.get('lead','L114').status,'Assigned');assert.equal(f.get('lead','L115').status,'Assigned');assert.equal(state.sales.crm.leads['00Q-L114'].status,'Assigned');
 assert.equal(f.get('lead','L101').status,'Draft');assert.equal(JSON.stringify(f.get('lead',custom.id)),customBefore);assert.ok(!state.sales.outbox.some(o=>['L114','L115'].includes(o.recordId)));
 f.sync();assert.equal(f.get('lead','L114').status,'Assigned');W.resetSamples(state);assert.equal(f.list('lead').filter(l=>l.id==='L114').length,1);
});
test('sample-derived registrations reset with their source and custom direct deals stay saved',()=>{
 const state={crm:{connected:true}};W.initialize(state);const f=W.create(state),values={company:'Custom Customer',contact:'Jamie Lee',email:'jamie@example.com',region:'North America',value:30000,need:'Unify sales records across three regional offices.',consent:true,confirmedNeed:true,name:'Annual rollout',product:'Sales Cloud',expectedClose:'2027-12-15'};
 const direct=f.createDeal(values),demo=f.createDeal(values,'L103');f.submitDeal(demo.id);f.sync();
 W.resetSamples(state);assert.equal(f.get('lead','L103').dealId,undefined);assert.ok(!f.list('deal').some(d=>d.id===demo.id));assert.ok(f.get('deal',direct.id));assert.ok(!Object.values(state.sales.crm.registrations).some(d=>d.id===demo.id));
});
