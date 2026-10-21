const test=require('node:test');
const assert=require('node:assert/strict');
const W=require('../dist/sales-workflow.js');
const fixed='2026-10-15T12:00:00.000Z';
const clone=value=>JSON.parse(JSON.stringify(value));
function env(saved){const state=saved||{crm:{connected:true}};W.initialize(state);if(!saved)state.sales.crm.reviewMode='auto';return {state,s:state.sales,crm:state.sales.crm,f:W.create(state,{now:()=>fixed})};}
const values=(company='Workflow customer')=>({company,contact:'Taylor Reed',email:'taylor@example.com',jobTitle:'Director',region:'North America',value:82000,need:'Consolidate customer sales reporting across regional offices.',consent:true,source:'Customer referral'});
const dealValues=company=>({...values(company),name:'Regional rollout',product:'Sales Cloud',expectedClose:'2026-12-20',confirmedNeed:true});
function leadAt(e,status,origin='partner'){const l=e.f.createLead(values(status+' '+origin));Object.assign(l,{status,origin,crmId:'00Q-'+l.id,sync:{status:'synced'}});e.crm.leads[l.crmId]=clone(l);return l;}
function dealAt(e,registration='Approved',lead){const d=e.f.createDeal(dealValues('Deal '+(e.s.sequence+1)),lead?.id);e.f.submitDeal(d.id);e.f.sync();e.f.sync();e.f.sync();d.registration=registration;e.crm.registrations[d.crmId].registration=registration;if(registration!=='Approved'){delete e.crm.opportunities[d.opportunityId];d.stage=null;d.opportunityId=null;e.crm.registrations[d.crmId]=clone(d);}return d;}

test('qualified lead locks each identity field but synchronizes contact and title',()=>{
 const e=env(),l=e.f.get('lead','L103');
 for(const changes of [{company:'Changed'},{email:'new@example.com'},{region:'Europe'},{value:123},{need:'A different customer need'}])assert.throws(()=>e.f.edit('lead',l.id,changes),/Qualified lead identity is locked/);
 assert.equal(e.s.outbox.length,0);
 e.f.edit('lead',l.id,{contact:'New sponsor',jobTitle:'VP of Sales'});e.f.sync();assert.equal(l.contact,'New sponsor');assert.equal(e.crm.leads[l.crmId].jobTitle,'VP of Sales');assert.equal(l.status,'Qualified');
});

test('apply rechecks a new qualification before committing queued identity changes',()=>{
 const e=env(),l=leadAt(e,'Submitted');e.f.edit('lead',l.id,{value:125000});e.crm.leads[l.crmId].status='Qualified';assert.equal(e.f.sync().ok,false);assert.match(l.sync.error,/identity is locked/);assert.equal(e.crm.leads[l.crmId].value,82000);
});

test('an active linked registration makes the lead fully read-only including activity',()=>{
 const e=env(),l=e.f.get('lead','L103'),d=e.f.createDeal(dealValues(),l.id);
 assert.throws(()=>e.f.edit('lead',l.id,{contact:'Different contact'}),/read-only/);assert.throws(()=>e.f.closeLead(l.id,'Other','Customer paused the project.'),/active linked deal/);assert.throws(()=>e.f.addActivity('lead',l.id,{type:'Note',note:'A note'}),/read-only/);assert.equal(e.f.permissions('lead',l.id).editable,false);
 d.registration='Rejected';d.crmId='REG-'+d.id;e.crm.registrations[d.crmId]=clone(d);e.f.edit('deal',d.id,{name:'Revised registration'});assert.equal(d.registration,'Draft');assert.equal(e.crm.registrations[d.crmId].registration,'Rejected');assert.equal(e.f.permissions('lead',l.id).editable,false);assert.throws(()=>e.f.createDeal(dealValues(),l.id),/already has a registration/);
});

test('apply rejects an edit queued before an active registration appeared',()=>{
 const e=env(),l=e.f.get('lead','L103');e.f.edit('lead',l.id,{contact:'Pending contact'});const d=e.f.createDeal(dealValues('New registration'));d.leadId=l.id;l.dealId=d.id;assert.equal(e.f.sync().ok,false);assert.match(l.sync.error,/read-only/);assert.notEqual(e.crm.leads[l.crmId].contact,'Pending contact');
});

test('deleteDraft removes only local never-submitted drafts and clears linked pointers',()=>{
 const e=env(),f=e.f,l=f.get('lead','L103'),d=f.createDeal(dealValues(),l.id);e.crm.leads[l.crmId].dealId=d.id;e.state.crm.connected=false;
 const result=f.deleteDraft('deal',d.id);assert.equal(result.deleted,true);assert.equal(l.dealId,undefined);assert.equal(e.crm.leads[l.crmId].dealId,undefined);assert.throws(()=>f.get('deal',d.id),/not available/);assert.equal(e.s.outbox.at(-1).action,'deleteDraft');assert.equal(e.s.outbox.at(-1).state,'done');assert.ok(e.s.outbox.at(-1).result.history.some(h=>h.title==='Draft deleted'));
 const draft=f.createLead({company:'Delete me'});f.deleteDraft('lead',draft.id);assert.throws(()=>f.get('lead',draft.id),/not available/);assert.throws(()=>f.deleteDraft('lead',l.id),/never-submitted/);
 e.state.crm.connected=true;const revised=dealAt(e,'Rejected');f.edit('deal',revised.id,{name:'Revised'});assert.throws(()=>f.deleteDraft('deal',revised.id),/never-submitted/);
 const pending=f.createLead(values('Pending draft'));f.submitLead(pending.id);assert.throws(()=>f.deleteDraft('lead',pending.id),/never-submitted/);f.sync();f.sync();assert.ok(!f.list('deal').some(r=>r.id===d.id));
});

test('every allowed origin/status can close and stays closed through delayed vendor jobs',()=>{
 for(const [origin,statuses] of [['partner',['Submitted','Needs information','Approved','Working','Qualified']],['crm',['Accepted','Working','Qualified']]])for(const status of statuses){
  const e=env(),l=leadAt(e,status,origin);e.f.closeLead(l.id,'No budget','Customer postponed their budget.');assert.equal(l.status,status);assert.equal(e.s.outbox.at(-1).action,'close');e.f.sync();assert.equal(l.status,'Closed');assert.equal(l.closedFrom,status);assert.equal(l.closeReason,'No budget');assert.match(l.reviewReason,/postponed/);
  e.crm.jobs.push({kind:'qualify',crmId:l.crmId,due:e.crm.tick+1});e.f.sync();assert.equal(l.status,'Closed');assert.equal(e.crm.leads[l.crmId].status,'Closed');assert.equal(e.f.permissions('lead',l.id).canActivity,false);
  assert.throws(()=>e.f.edit('lead',l.id,{contact:'Changed'}),/cannot be edited/);assert.throws(()=>e.f.addActivity('lead',l.id,{type:'Call',note:'Customer call'}),/read-only/);
 }
});

test('close rejects invalid states, reasons, notes, and active linked registrations',()=>{
 const e=env();for(const status of ['Draft','Assigned','Declined','Rejected','Closed']){const l=leadAt(e,status,status==='Assigned'?'crm':'partner');assert.throws(()=>e.f.closeLead(l.id,'Other','Closing the customer lead.'),/cannot be closed/);}
 const l=e.f.get('lead','L103');assert.throws(()=>e.f.closeLead(l.id,'Invalid','A valid note'),/Select a reason/);assert.throws(()=>e.f.closeLead(l.id,'Other','No'),/5 characters/);e.f.createDeal(dealValues(),l.id);assert.throws(()=>e.f.closeLead(l.id,'Other','Closing this lead'),/active linked deal/);
});

test('pending, rejected, and revised registrations can withdraw and the linked lead can register again',()=>{
 for(const registration of ['Pending review','Rejected','Draft']){const e=env(),l=e.f.get('lead','L103'),d=dealAt(e,registration,l);e.f.withdrawDeal(d.id,'Customer requested a new project scope.');e.f.sync();assert.equal(d.registration,'Withdrawn');assert.match(d.withdrawReason,/new project/);assert.equal(e.f.permissions('deal',d.id).editable,false);assert.equal(e.f.permissions('deal',d.id).canActivity,false);
  e.crm.jobs.push({kind:'registration',crmId:d.crmId,due:e.crm.tick+1});e.f.sync();assert.equal(d.registration,'Withdrawn');const next=e.f.createDeal(dealValues(),l.id);assert.equal(next.registration,'Draft');assert.equal(l.dealId,next.id);e.f.submitDeal(next.id);e.f.sync();e.f.sync();e.f.sync();assert.equal(next.registration,'Approved');
 }
});

test('withdrawal loses safely to canonical approval with the exact conflict',()=>{
 const e=env(),d=dealAt(e,'Pending review');e.f.withdrawDeal(d.id,'Withdraw before the customer proceeds.');e.crm.registrations[d.crmId].registration='Approved';const result=e.f.sync();assert.equal(result.ok,false);assert.equal(e.s.outbox.at(-1).errorCode,'CONFLICT');assert.equal(d.sync.error,'Registration was already approved. Close the opportunity as Lost instead.');assert.equal(e.crm.registrations[d.crmId].registration,'Approved');
});

test('terminal changes arriving from CRM reject queued activity and completion',()=>{
 for(const action of ['activity','complete']){const e=env(),l=leadAt(e,'Working','crm');l.activities.push({id:'F1',type:'Follow-up',note:'Call customer',dueDate:'2026-10-20',completed:false});e.crm.leads[l.crmId]=clone(l);if(action==='activity')e.f.addActivity('lead',l.id,{type:'Note',note:'Preparing a customer summary'});else e.f.completeActivity('lead',l.id,'F1');e.crm.leads[l.crmId].status='Closed';assert.equal(e.f.sync().ok,false);assert.equal(e.crm.leads[l.crmId].activities.length,1);assert.equal(e.crm.leads[l.crmId].activities[0].completed,false);}
 const e=env(),d=dealAt(e);e.f.addActivity('deal',d.id,{type:'Note',note:'Preparing a customer summary'});e.crm.registrations[d.crmId].registration='Withdrawn';assert.equal(e.f.sync().ok,false);assert.equal(e.crm.opportunities[d.opportunityId].activities.length,0);
});

test('notes and follow-ups keep Approved or Accepted while a call, email, or meeting starts Working',()=>{
 for(const [origin,status]of [['crm','Accepted'],['partner','Approved']])for(const type of ['Call','Email','Meeting']){const e=env(),l=leadAt(e,status,origin);for(const activity of [{type:'Note',note:'Reviewing customer context'},{type:'Follow-up',note:'Call this customer tomorrow',dueDate:'2026-10-16'}]){e.f.addActivity('lead',l.id,activity);e.f.sync();assert.equal(l.status,status);}e.f.addActivity('lead',l.id,{type,outcome:'Connected',note:'Customer confirmed the initial discussion'});e.f.sync();assert.equal(l.status,'Working');assert.equal(l.workingAt,fixed);assert.equal(e.crm.leads[l.crmId].activities.at(-1).type,type);}
 const e=env(),l=leadAt(e,'Working');assert.throws(()=>e.f.addActivity('lead',l.id,{type:'Call',outcome:'Maybe',note:'Customer call'}),/conversation/);
});

test('resubmit validates and sends changes plus review request in one durable operation',()=>{
 {const e=env(),l=leadAt(e,'Needs information'),before=e.s.outbox.length;e.f.resubmit(l.id,{need:'The customer needs centralized reporting for eight teams.',contact:'New contact'});assert.equal(e.s.outbox.length,before+1);assert.equal(e.s.outbox.at(-1).action,'resubmit');assert.notEqual(l.contact,'New contact');e.f.sync();assert.equal(l.status,'Submitted');assert.equal(l.contact,'New contact');assert.equal(e.crm.leads[l.crmId].need,l.need);assert.equal(e.crm.jobs.filter(j=>j.crmId===l.crmId).length,1);e.f.sync();assert.equal(l.status,'Approved');}
 {const e=env(),l=leadAt(e,'Needs information','crm');assert.throws(()=>e.f.resubmit(l.id),/Only a lead needing information/);}
 const e=env(),l=leadAt(e,'Needs information');assert.throws(()=>e.f.resubmit(l.id,{email:'bad'}),/valid customer email/);assert.equal(e.s.outbox.length,0);e.f.resubmit(l.id);e.f.sync();assert.equal(l.status,'Submitted');assert.throws(()=>e.f.resubmit(l.id),/Only a lead needing information/);
});

test('resubmit preserves conflicts rather than overwriting newer CRM details',()=>{
 const e=env(),l=leadAt(e,'Needs information');e.f.resubmit(l.id,{contact:'Partner corrected contact'});e.crm.leads[l.crmId].contact='Vendor corrected contact';e.f.sync();assert.equal(l.sync.status,'failed');assert.equal(e.s.outbox.at(-1).errorCode,'CONFLICT');assert.equal(e.crm.leads[l.crmId].status,'Needs information');assert.equal(e.crm.leads[l.crmId].contact,'Vendor corrected contact');
});

test('forward stage skips and won actuals preserve estimated value and canonical revenue',()=>{
 const e=env(),d=dealAt(e);assert.equal(d.stage,'Discovery');e.f.updateStage(d.id,'Won','Customer signed the final agreement.',{wonAmount:93000,closeDate:'2026-10-14'});assert.equal(d.value,82000);e.f.sync();assert.equal(d.stage,'Won');assert.equal(d.value,93000);assert.equal(d.wonAmount,93000);assert.equal(d.estimatedValue,82000);assert.equal(d.closeDate,'2026-10-14');assert.equal(e.crm.opportunities[d.opportunityId].value,93000);assert.equal(e.crm.opportunities[d.opportunityId].estimatedValue,82000);assert.throws(()=>e.f.updateStage(d.id,'Discovery'),/Closed opportunities/);
 const fresh=env(),open=dealAt(fresh);fresh.f.updateStage(open.id,'Negotiation');fresh.f.sync();assert.equal(open.stage,'Negotiation');assert.throws(()=>fresh.f.updateStage(open.id,'Proposal'),/current or later/);
});

test('won and lost require meaningful terminal outcome information and valid actual dates',()=>{
 const e=env(),d=dealAt(e),note='Customer made a final decision.';
 for(const details of [{},{wonAmount:0,closeDate:'2026-10-14'},{wonAmount:-1,closeDate:'2026-10-14'},{wonAmount:90000},{wonAmount:90000,closeDate:'2026-10-16'},{wonAmount:90000,closeDate:'2026-02-31'}])assert.throws(()=>e.f.updateStage(d.id,'Won',note,details),/won amount|close date/);
 assert.throws(()=>e.f.updateStage(d.id,'Won','No',{wonAmount:90000,closeDate:'2026-10-15'}),/outcome note/);assert.throws(()=>e.f.updateStage(d.id,'Lost',note),/loss reason/);assert.throws(()=>e.f.updateStage(d.id,'Lost',note,{lostReason:'Unknown'}),/loss reason/);e.f.updateStage(d.id,'Lost',note,{lostReason:'Timing'});e.f.sync();assert.equal(d.stage,'Lost');assert.equal(e.crm.opportunities[d.opportunityId].lostReason,'Timing');
});

test('current-stage value and expected close updates sync without requiring a note',()=>{
 const e=env(),d=dealAt(e);e.f.updateStage(d.id,'Discovery','',{value:97000,expectedClose:'2027-01-10'});e.f.sync();assert.equal(d.stage,'Discovery');assert.equal(d.value,97000);assert.equal(d.expectedClose,'2027-01-10');assert.equal(e.crm.opportunities[d.opportunityId].expectedClose,'2027-01-10');assert.throws(()=>e.f.updateStage(d.id,'Discovery'),/Change the estimated value/);assert.throws(()=>e.f.updateStage(d.id,'Discovery','',{value:0}),/greater than zero/);assert.throws(()=>e.f.updateStage(d.id,'Discovery','',{expectedClose:'2026-10-14'}),/today or later/);
});

test('stage, value, and close-date conflicts are detected against the CRM opportunity',()=>{
 for(const [field,value] of [['stage','Negotiation'],['value',90000],['expectedClose','2027-02-01']]){const e=env(),d=dealAt(e);e.f.updateStage(d.id,'Proposal','',{value:95000,expectedClose:'2027-01-01'});e.crm.opportunities[d.opportunityId][field]=value;assert.equal(e.f.sync().ok,false);assert.equal(d.stage,'Discovery');assert.equal(d.value,82000);assert.equal(e.s.outbox.at(-1).errorCode,'CONFLICT');assert.equal(e.crm.opportunities[d.opportunityId][field],value);e.f.discard('deal',d.id);assert.equal(d[field],value);}
});

test('new optional closure and actual-value fields pull without a version migration',()=>{
 const e=env(),l=e.f.get('lead','L105'),d=e.f.get('deal','D103');Object.assign(e.crm.leads[l.crmId],{status:'Closed',closeReason:'Other',closeNote:'Customer is no longer pursuing this.'});Object.assign(e.crm.opportunities[d.opportunityId],{stage:'Won',value:120000,wonAmount:120000,estimatedValue:125000,closeDate:'2026-10-15'});e.f.sync();assert.equal(l.closeReason,'Other');assert.equal(d.wonAmount,120000);assert.equal(d.estimatedValue,125000);const saved=clone(e.state),before=JSON.stringify(saved.sales);const restored=env(saved);assert.equal(JSON.stringify(restored.s),before);assert.equal(restored.s.version,1);
});


test('a real pending registration can be withdrawn before its next scheduled vendor review',()=>{
 const e=env(),d=e.f.createDeal({...dealValues('Pending withdrawal'),value:310000});e.f.submitDeal(d.id);e.f.sync();assert.equal(d.registration,'Submitted');e.f.sync();assert.equal(d.registration,'Pending review');assert.ok(e.crm.jobs.some(j=>j.crmId===d.crmId));e.f.withdrawDeal(d.id,'Customer paused registration until next quarter.');e.f.sync();assert.equal(d.registration,'Withdrawn');assert.equal(d.opportunityId,null);assert.equal(e.crm.registrations[d.crmId].registration,'Withdrawn');e.f.sync();assert.equal(d.registration,'Withdrawn');
});

test('resubmission and outcome updates survive reload and failure with a single result',()=>{
 const e=env(),l=leadAt(e,'Needs information');e.f.resubmit(l.id,{need:'Customer needs a unified workspace for sixty sales representatives.'});e.f.failNext();e.f.sync();assert.equal(l.status,'Needs information');const restored=env(clone(e.state));restored.f.sync();const lead=restored.f.get('lead',l.id);assert.equal(lead.status,'Submitted');assert.equal(restored.crm.jobs.filter(j=>j.crmId===lead.crmId).length,1);restored.f.sync();assert.equal(lead.status,'Approved');
 const d=dealAt(restored);restored.f.updateStage(d.id,'Won','Signed a confirmed annual customer contract.',{wonAmount:99000,closeDate:'2026-10-15'});restored.f.failNext();restored.f.sync();assert.equal(d.value,82000);const again=env(clone(restored.state));again.f.sync();again.f.sync();const won=again.f.get('deal',d.id);assert.equal(won.value,99000);assert.equal(won.estimatedValue,82000);assert.equal(again.s.outbox.filter(o=>o.recordId===d.id&&o.action==='stage').length,1);
});


test('retired company data is replaced across saved records without resetting workflows',()=>{
 const state={crm:{connected:true}};W.initialize(state);
 const lead=state.sales.leads.find(r=>r.id==='L103');
 Object.assign(lead,{company:'Redblink Technology',contact:'Former contact',email:'contact@redblink.com',jobTitle:'Former title'});
 state.sales.crm.leads[lead.crmId]=structuredClone(lead);
 state.sales.notifications.push({id:'notice-retired',detail:'Redblink Technologies sent a lead.'});
 state.sales.outbox.push({id:'operation-retired',recordId:lead.id,payload:{company:'Redblink Technology',contact:'Former contact'},baseline:{company:'Redblink Technology',contact:'Former contact'}});
 const untouched=JSON.stringify(state.sales.leads.find(r=>r.id==='L104'));
 W.initialize(state);
 assert.equal(lead.company,'Willowbrook Systems');assert.equal(lead.contact,'Jordan Ellis');assert.equal(lead.email,'jordan.ellis@willowbrook.example');
 assert.equal(lead.status,'Qualified');assert.equal(lead.id,'L103');assert.equal(state.sales.version,1);
 assert.equal(state.sales.crm.leads[lead.crmId].company,lead.company);
 assert.equal(state.sales.outbox.at(-1).payload.company,lead.company);
 assert.equal(state.sales.outbox.at(-1).baseline.company,lead.company);
 assert.equal(state.sales.outbox.at(-1).baseline.contact,lead.contact);
 assert.doesNotMatch(JSON.stringify(state),/redblink/i);
 assert.equal(JSON.stringify(state.sales.leads.find(r=>r.id==='L104')),untouched);
 const once=JSON.stringify(state);W.initialize(state);assert.equal(JSON.stringify(state),once);
});

test('Submitted sample is present and restored once for previously compacted browser data',()=>{
 const e=env(),sample=e.f.get('lead','L102');
 assert.equal(e.f.list('lead').filter(r=>r.origin==='partner'&&r.status==='Submitted').length,1);
 e.s.leads=e.s.leads.filter(r=>r.id!==sample.id);e.s.retiredSamples.push(clone(sample));
 delete e.crm.leads[sample.crmId];e.crm.jobs=e.crm.jobs.filter(j=>j.crmId!==sample.crmId);delete e.s.submittedSampleVersion;
 const other=JSON.stringify(e.f.get('lead','L103'));
 W.initialize(e.state);assert.equal(e.f.get('lead','L102').status,'Submitted');assert.equal(e.crm.leads[sample.crmId].status,'Submitted');
 assert.equal(JSON.stringify(e.f.get('lead','L103')),other);
 assert.equal(e.crm.jobs.filter(j=>j.crmId===sample.crmId).length,1);
 e.f.sync();assert.equal(e.f.get('lead','L102').status,'Approved');
 W.initialize(e.state);assert.equal(e.f.get('lead','L102').status,'Approved');assert.equal(e.s.leads.filter(r=>r.id==='L102').length,1);
});

test('New sample cards populate an empty saved column once without resetting other leads',()=>{
 const e=env();assert.equal(e.f.list('lead').filter(r=>r.origin==='partner'&&r.status==='Draft').length,2);
 e.s.leads=e.s.leads.filter(r=>r.status!=='Draft');delete e.s.newSamplesVersion;
 const qualified=JSON.stringify(e.f.get('lead','L103'));
 W.initialize(e.state);
 const cards=e.f.list('lead').filter(r=>r.origin==='partner'&&r.status==='Draft');
 assert.equal(cards.length,2);assert.ok(cards.every(r=>r.sync.status==='local'&&r.crmId===null));
 assert.equal(JSON.stringify(e.f.get('lead','L103')),qualified);
 e.f.deleteDraft('lead',cards[0].id);W.initialize(e.state);
 assert.equal(e.f.list('lead').filter(r=>r.origin==='partner'&&r.status==='Draft').length,1);
});

test('when every draft has been submitted, two new example drafts are ready on the next load',()=>{
 const e=env(),drafts=()=>e.f.list('lead').filter(r=>r.origin==='partner'&&r.status==='Draft');
 for(const r of drafts())e.f.submitLead(r.id);e.f.sync();assert.equal(drafts().length,0);
 W.initialize(e.state);assert.deepEqual(drafts().map(r=>r.company),['Pinewood Studios','Halden Foods']);assert.ok(drafts().every(r=>r.consent&&r.sync.status==='local'));
 for(const r of drafts())e.f.submitLead(r.id);e.f.sync();W.initialize(e.state);assert.deepEqual(drafts().map(r=>r.company),['Ridgeway Clinics','Seabright Labs'],'each refill uses new customers');
});
