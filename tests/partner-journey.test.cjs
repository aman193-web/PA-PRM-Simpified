const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../dist/sales-workflow.js'),A=require('../dist/deal-assist.js');
const {environment}=require('./ui-environment.cjs');
const clock='2026-10-15T12:00:00.000Z';
const values={company:'Juniper Research',contact:'Dana Lee',email:'dana@juniper.example',region:'North America',value:25000,need:'Replace spreadsheets with a connected sales workspace.',consent:true,confirmedNeed:true,name:'Juniper annual rollout',product:'Sales Cloud',quantity:100,expectedClose:'2026-12-15'};
function setup(){const state={crm:{connected:true}};W.initialize(state);state.sales.crm.reviewMode='auto';return {state,f:W.create(state,{now:()=>clock})};}
const click=(a,action,type,id,extra={})=>a.click({salesAction:action,salesType:type,salesId:id,...extra});

test('registration acknowledgement, vendor review, approval and opportunity outcome are separate persisted events',()=>{
 const {state,f}=setup(),lead=f.get('lead','L103'),d=f.createDeal(values,lead.id);
 assert.equal(f.leadStage(lead),'Qualified','a saved draft is not a converted lead');
 f.submitDeal(d.id);assert.equal(d.registration,'Draft');assert.equal(d.sync.status,'pending');assert.equal(d.crmId,null);
 f.sync();assert.equal(d.registration,'Submitted');assert.equal(f.leadStage(lead),'Converted');assert.equal(d.opportunityId,null);assert.equal(d.submittedAt,clock);
 assert.throws(()=>f.submitDeal(d.id),/Only a draft/);
 f.sync();assert.equal(d.registration,'Pending review');assert.equal(d.reviewStartedAt,clock);assert.equal(d.opportunityId,null);
 f.sync();assert.equal(d.registration,'Approved');assert.equal(d.stage,'Discovery');assert.equal(state.sales.crm.opportunities[d.opportunityId].quantity,100);
 const saved=JSON.parse(JSON.stringify(state));W.initialize(saved);const restored=W.create(saved,{now:()=>clock});restored.sync();assert.equal(restored.get('deal',d.id).quantity,100);
 assert.equal(Object.values(saved.sales.crm.opportunities).filter(o=>o.registrationId===d.crmId).length,1);
 assert.ok(d.history.some(h=>h.detail.includes('Submitted')));assert.ok(d.history.some(h=>h.detail.includes('Pending review')));assert.ok(d.history.some(h=>h.detail.includes('Approved')));
});

test('manual vendor review acknowledges a registration without allowing the partner to approve it',()=>{
 const {state,f}=setup();state.sales.crm.reviewMode='manual';const d=f.createDeal(values);f.submitDeal(d.id);f.sync();assert.equal(d.registration,'Submitted');f.sync();assert.equal(d.registration,'Pending review');f.sync();assert.equal(d.registration,'Pending review');assert.equal(d.opportunityId,null);assert.equal(f.approve,undefined);assert.throws(()=>f.updateStage(d.id,'Won'),/approved/);
});

test('failed registration sync keeps quantity and one operation without claiming CRM receipt',()=>{
 const {state,f}=setup(),d=f.createDeal(values);f.submitDeal(d.id);f.failNext();assert.equal(f.sync().ok,false);assert.equal(d.registration,'Draft');assert.equal(d.crmId,null);assert.equal(d.sync.status,'failed');assert.equal(d.quantity,100);
 f.sync();assert.equal(d.registration,'Submitted');f.sync();f.sync();f.sync();assert.equal(d.registration,'Approved');assert.equal(state.sales.outbox.filter(o=>o.recordId===d.id&&o.action==='register').length,1);assert.equal(Object.values(state.sales.crm.registrations).filter(r=>r.id===d.id).length,1);
});

test('quantity validates positive whole numbers and an omitted quantity stays absent on draft edits',()=>{
 const {f}=setup();for(const quantity of [0,-1,1.5,1000001,'bad'])assert.throws(()=>f.validate({...values,quantity},true),/Quantity/);
 const d=f.createDeal({...values,quantity:null});f.edit('deal',d.id,{...d});assert.equal(d.quantity,null);f.submitDeal(d.id);f.sync();assert.equal(d.registration,'Submitted');
});

test('natural-language input extracts the requested company, quantity, value and close date without inventing a product',()=>{
 const r=A.extract('Register a deal for ABC Technologies. The customer is interested in 100 software licenses, with an estimated value of $25,000 and an expected closing date of December 15.',{today:'2026-10-15'});
 assert.equal(r.fields.company,'ABC Technologies');assert.equal(r.fields.quantity,100);assert.equal(r.fields.value,25000);assert.equal(r.fields.expectedClose,'2026-12-15');assert.ok(r.missing.includes('product'));assert.equal(r.engine,'simulated');
});

test('human corrections and quantity survive back/forward navigation; no record is submitted before confirmation',()=>{
 const a=environment();a.login();const count=a.run("workflow.list('deal').length");click(a,'new-deal');
 const story='Dana Lee (dana@juniper.example) at Juniper Research wants Sales Cloud for 100 users, worth $25,000, closing December 15. They need a connected sales workspace.';
 a.submit('deal-describe-form',{story},'extract');assert.match(a.overlay(),/Quantity \(optional\)/);assert.equal(a.run("workflow.list('deal').length"),count);
 a.submit('deal-review-form',{...values,quantity:'125',value:'29000'},'back');a.submit('deal-describe-form',{story},'extract');assert.match(a.overlay(),/name="quantity"[^>]*value="125"/);assert.match(a.overlay(),/name="value"[^>]*value="29000"/);
 a.submit('deal-review-form',{},'continue');assert.match(a.overlay(),/Review & confirm/);assert.equal(a.run("workflow.list('deal').length"),count);
 a.submit('deal-confirm-form',{consent:'on',confirmedNeed:'on'},'back');assert.match(a.overlay(),/name="quantity"[^>]*value="125"/);
 a.submit('deal-review-form',{},'continue');a.submit('deal-confirm-form',{consent:'on',confirmedNeed:'on'},'submit');const id=a.run('detailRecord.id');a.sync();assert.equal(a.run(`getRecord('deal','${id}').registration`),'Submitted');assert.match(a.overlay(),/Deal registration status/);assert.match(a.overlay(),/In Review/);a.review();a.sync();a.review();a.sync();assert.equal(a.run(`getRecord('deal','${id}').registration`),'Approved');assert.equal(a.run(`getRecord('deal','${id}').quantity`),125);assert.match(a.overlay(),/Track opportunity/);
 click(a,'opportunity-detail','deal',id);assert.equal(a.location.hash,'#opportunities');assert.match(a.overlay(),/View registration/);click(a,'registration-detail','deal',id);assert.equal(a.location.hash,'#deals');
});

test('registration from a lead card ends on deal details and draft submission always requires confirmation',()=>{
 const a=environment();a.login();a.click({page:'leads'});click(a,'register-linked','lead','L103',{card:'1'});a.submit('deal-describe-form',{story:''},'manual');a.submit('deal-review-form',values,'continue');a.submit('deal-confirm-form',{consent:'on',confirmedNeed:'on'},'draft');const id=a.run('detailRecord.id');assert.equal(a.location.hash,'#deals');assert.match(a.overlay(),/Deal registration/);
 const before=a.run('state.sales.outbox.length');click(a,'submit-deal','deal',id,{card:'1'});assert.match(a.overlay(),/Review & confirm/);assert.equal(a.run('state.sales.outbox.length'),before);a.submit('deal-confirm-form',{consent:'on',confirmedNeed:'on'},'submit');assert.equal(a.run('detailRecord.id'),id);assert.match(a.overlay(),/Deal registration/);
});

test('dashboard totals and qualified filters include both authorized lead sources',()=>{
 const a=environment();a.login();a.run("getRecord('lead','L105').status='Qualified';state.sales.crm.leads['00Q-L105'].status='Qualified'");click(a,'dashboard-filter',null,null,{route:'leads',filter:'Qualified'});assert.equal(a.run('leadScope'),'all');assert.equal(a.run('salesFilter'),'Qualified');assert.match(a.html(),/Helios Freight/);assert.match(a.html(),/Beacon Medical/);assert.doesNotMatch(a.html(),/Larkspur Clinics/);
 click(a,'source-filter',null,null,{scope:'crm'});assert.equal(a.location.hash,'#assigned');assert.match(a.html(),/Harbor Systems/);assert.doesNotMatch(a.html(),/Beacon Medical/);
});

test('lead list supports source, contact, owner, last activity, sort and safe detail navigation',()=>{
 const a=environment();a.login();click(a,'source-filter',null,null,{scope:'all'});a.click({salesView:'list'});for(const label of ['Owner','Last activity','Source / destination','Sort records'])assert.match(a.html(),new RegExp(label));assert.match(a.html(),/marcus.lee@heliosfreight.example/);assert.match(a.html(),/table-record-link/);
 a.element('sales-sort').onchange({target:{value:'company'}});assert.equal(a.run('salesSort'),'company');const body=a.html().split('<tbody>')[1];assert.ok(body.indexOf('Beacon Medical')<body.indexOf('Cedar Analytics'));
 click(a,'open','lead','L105');assert.match(a.overlay(),/Back to Leads/);assert.match(a.overlay(),/Assigned owner/);assert.match(a.overlay(),/aria-label="Edit Contact"/);click(a,'back-list','lead','L105');assert.equal(a.location.hash,'#assigned');
});

test('expiry and rejected decisions remain separate from opportunity outcomes',()=>{
 const a=environment();a.login();a.run("{const d=getRecord('deal','D102');d.registration='Expired';state.sales.crm.registrations[d.crmId].registration='Expired';state.sales.crm.jobs=[];}");click(a,'open','deal','D102');assert.match(a.overlay(),/Expired/);assert.doesNotMatch(a.overlay(),/data-sales-action="(?:stage|edit|submit-deal)"/);assert.equal(a.run("workflow.permissions('deal','D102').allowedStages.length"),0);
});


test('month extraction does not mistake a customer name or email for a close month',()=>{
 const r=A.extract('Dana Lee (dana@juniper.example) at Juniper Research wants Sales Cloud for 100 users, worth $25,000, closing December 15.',{today:'2026-10-21'});
 assert.equal(r.fields.expectedClose,'2026-12-15');assert.ok(r.notes.some(n=>n.includes('December 15')));
});


test('two fresh CRM assignments are actionable, scoped and seeded once without resetting acceptance',()=>{
 const {state,f}=setup();
 for(const id of ['L114','L115']){
  const r=f.get('lead',id);assert.equal(r.status,'Assigned');assert.equal(r.origin,'crm');assert.equal(r.partnerId,state.sales.partnerId);assert.ok(r.vendorCompany);assert.ok(r.assignedAt);assert.equal(state.sales.crm.leads[r.crmId].company,r.company);
 }
 f.accept('L114');f.sync();assert.equal(f.get('lead','L114').status,'Accepted');
 W.initialize(state);assert.equal(f.get('lead','L114').status,'Accepted');assert.equal(f.list('lead').filter(r=>['L114','L115'].includes(r.id)).length,2);assert.equal(state.sales.notifications.filter(n=>n.id==='N-L114').length,1);
});
