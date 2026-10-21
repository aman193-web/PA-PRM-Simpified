const test=require('node:test');
const assert=require('node:assert/strict');
const W=require('../dist/sales-workflow.js');
const fixed='2026-10-15T12:00:00.000Z';
// These journeys use automatic review by program rules; manual partner-manager review is covered in manager.test.cjs.
function env(saved){const state=saved||{crm:{connected:true}};W.initialize(state);if(!saved)state.sales.crm.reviewMode='auto';const flow=W.create(state,{now:()=>fixed,authorized:()=>state.authorized!==false});return {state,flow,s:state.sales,crm:state.sales.crm};}
const values=(company='Test Customer')=>({company,contact:'Taylor Reed',email:'taylor@example.com',value:82000,region:'North America',need:'Consolidate sales reporting across three regional offices.',consent:true,source:'Customer referral'});
const dealValues=(company)=>({...values(company),name:'Regional sales rollout',product:'Sales Cloud',expectedClose:'2026-12-20',confirmedNeed:true});
const bantValues={budgetConfirmed:true,decisionMaker:'Taylor Reed · Director',needConfirmed:true,timeline:'0–3 months'};
function draftDeal(e,company){return e.flow.createDeal(dealValues(company));}
function approvedDeal(e,company){const d=draftDeal(e,company);e.flow.submitDeal(d.id);e.flow.sync();e.flow.sync();e.flow.sync();return d;}

test('partner-created lead → vendor approval → contact → BANT qualification → registration → opportunity → Won',()=>{
 const e=env(),f=e.flow,l=f.createLead(values());
 assert.equal(l.status,'Draft');assert.equal(l.crmId,null);
 f.submitLead(l.id);assert.equal(l.status,'Draft');assert.equal(l.sync.status,'pending');
 f.sync();assert.equal(l.status,'Submitted');assert.ok(e.crm.leads[l.crmId]);assert.equal(e.crm.leads[l.crmId].company,l.company);
 f.sync();assert.equal(l.status,'Approved');assert.equal(l.protectedUntil,'2027-01-13');assert.equal(l.dealId,undefined);assert.throws(()=>f.createDeal(dealValues(),l.id),/qualification/);
 assert.throws(()=>f.qualify(l.id,bantValues),/Log a call/);
 f.addActivity('lead',l.id,{type:'Meeting',outcome:'Connected',note:'Discovery meeting with the sales director.'});f.sync();assert.equal(l.status,'Working');
 f.qualify(l.id,bantValues);assert.equal(l.status,'Working');f.sync();assert.equal(l.status,'Qualified');assert.equal(e.crm.leads[l.crmId].status,'Qualified');assert.equal(e.crm.leads[l.crmId].decisionMaker,bantValues.decisionMaker);
 const d=f.createDeal(dealValues(),l.id);assert.equal(d.registration,'Draft');assert.equal(l.dealId,d.id);assert.equal(d.leadId,l.id);
 f.submitDeal(d.id);f.sync();assert.equal(d.registration,'Submitted');f.sync();assert.equal(d.registration,'Pending review');f.sync();assert.equal(d.registration,'Approved');assert.equal(d.stage,'Discovery');assert.ok(d.opportunityId);
 for(const stage of ['Proposal','Negotiation','Won']){const before=d.stage;f.updateStage(d.id,stage,'Customer confirmed the agreement.',stage==='Won'?{wonAmount:82000,closeDate:'2026-10-15'}:{});assert.equal(d.stage,before);f.sync();assert.equal(d.stage,stage);assert.equal(e.crm.opportunities[d.opportunityId].stage,stage);}
 assert.equal(l.status,'Qualified');assert.equal(f.leadStage(l),'Converted');assert.equal(d.registration,'Approved');assert.equal(d.stage,'Won');
 assert.ok(l.history.some(h=>h.title==='Lead approved by vendor'));assert.ok(d.history.length>=8);
 assert.ok(f.notifications().some(n=>n.recordId===d.id&&n.detail.includes('Won')));
});

test('CRM-assigned lead → accept → contact → follow-up → qualification → deal → Lost',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L104'),origin=l.receivedFrom;
 assert.throws(()=>f.qualify(l.id,bantValues),/Log a call/);
 assert.throws(()=>f.addActivity('lead',l.id,{type:'Note',note:'Some note'}),/accept/);
 f.accept(l.id);assert.equal(l.status,'Assigned');f.sync();assert.equal(l.status,'Accepted');assert.equal(l.acceptedAt,fixed);assert.equal(f.leadDeadline(l).kind,'contact');
 f.addActivity('lead',l.id,{type:'Note',note:'Preparing for the customer meeting.'});f.sync();assert.equal(l.status,'Accepted');
 f.addActivity('lead',l.id,{type:'Call',outcome:'Left a message',note:'Customer confirmed their project need.'});f.sync();assert.equal(l.status,'Working');assert.equal(l.activities.at(-1).outcome,'Left a message');
 f.addActivity('lead',l.id,{type:'Follow-up',note:'Share the proposed implementation plan.',dueDate:'2026-10-20'});f.sync();
 const activity=l.activities.at(-1);assert.equal(activity.completed,false);f.completeActivity('lead',l.id,activity.id);f.sync();assert.equal(l.activities.at(-1).completed,true);
 f.qualify(l.id,bantValues);f.sync();assert.equal(l.status,'Qualified');
 const d=f.createDeal(dealValues(l.company),l.id);f.submitDeal(d.id);f.sync();f.sync();f.sync();f.updateStage(d.id,'Lost','Customer selected an existing supplier.',{lostReason:'Competitor'});f.sync();
 assert.equal(d.stage,'Lost');assert.equal(d.registration,'Approved');assert.equal(l.status,'Qualified');assert.equal(l.receivedFrom,origin);
 assert.deepEqual(e.crm.leads[l.crmId].activities,l.activities);assert.equal(e.crm.opportunities[d.opportunityId].outcomeReason,d.outcomeReason);
});

test('a lead requiring information returns to review after the partner corrects it',()=>{
 const e=env(),f=e.flow,l=f.createLead({...values('Needs more detail'),need:'Explore CRM now'});f.submitLead(l.id);f.sync();f.sync();
 f.edit('lead',l.id,{need:'Customer needs a shared workspace for regional sales operations.'});assert.equal(l.need,'Explore CRM now');f.sync();
 f.submitLead(l.id);f.sync();assert.equal(l.status,'Submitted');f.sync();assert.equal(l.status,'Approved');
});

test('vendor review can request more information or reject without creating a deal',()=>{
 const e=env(),f=e.flow,l=f.createLead({...values('Short need'),need:'CRM upgrade now'});f.submitLead(l.id);f.sync();f.sync();assert.equal(l.status,'Needs information');assert.ok(l.reviewReason);
 const other=f.createLead({...values('Outside territory'),region:'Other'});f.submitLead(other.id);f.sync();f.sync();assert.equal(other.status,'Rejected');assert.equal(other.rejectReason,'Outside territory');assert.equal(other.closedFrom,'Submitted');assert.throws(()=>f.createDeal(dealValues(other.company),other.id),/qualification/);
 assert.throws(()=>f.addActivity('lead',other.id,{type:'Call',note:'Trying to call'}),/read-only/);assert.throws(()=>f.edit('lead',other.id,{contact:'Changed'}),/cannot be edited/);
});

test('vendor rejects duplicate registrations without exposing the other partner',()=>{
 const e=env(),f=e.flow;for(const company of ['Beacon Medical','Larkspur Clinics','Evergreen Systems','Harbor Systems']){const l=f.createLead(values(company));f.submitLead(l.id);f.sync();f.sync();assert.equal(l.status,'Rejected',company);assert.equal(l.rejectReason,'Duplicate');assert.doesNotMatch(l.reviewReason,/another-partner|Acme|Negotiation/);}
 const fresh=f.createLead(values('Brand new customer'));f.submitLead(fresh.id);f.sync();f.sync();assert.equal(fresh.status,'Approved');
});

test('vendor-assigned leads carry a 48-hour acceptance and 3-day first-contact deadline',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L104');l.assignedAt='2026-10-14T12:00:00.000Z';
 assert.deepEqual(f.leadDeadline(l),{kind:'accept',due:'2026-10-16T12:00:00.000Z',overdue:false,hoursLeft:24,daysLeft:1});
 l.assignedAt='2026-10-13T11:00:00.000Z';assert.equal(f.leadDeadline(l).overdue,true);
 f.accept(l.id);f.sync();assert.deepEqual(f.leadDeadline(l),{kind:'contact',due:'2026-10-18T12:00:00.000Z',overdue:false,hoursLeft:72,daysLeft:3});
 f.addActivity('lead',l.id,{type:'Email',outcome:'No response',note:'Sent an introduction email.'});f.sync();assert.equal(l.status,'Working');assert.equal(f.leadDeadline(l),null);
 const approved=f.get('lead','L110');assert.equal(f.leadDeadline(approved).kind,'protection');
});

test('qualification needs first contact and all four BANT items; progress can be saved earlier',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L110');assert.equal(l.status,'Approved');assert.equal(f.permissions('lead',l.id).canBant,true);assert.equal(f.permissions('lead',l.id).canQualify,false);
 f.edit('lead',l.id,{decisionMaker:'Priya Nair · VP, Operations',budgetConfirmed:true});f.sync();assert.equal(l.status,'Approved');assert.equal(f.bant(l).count,3);assert.deepEqual(f.bantMissing(l),['the customer need']);
 assert.throws(()=>f.qualify(l.id,{needConfirmed:true}),/Log a call/);
 f.addActivity('lead',l.id,{type:'Call',outcome:'Connected',note:'Walked through the support workflow.'});f.sync();assert.equal(l.status,'Working');assert.equal(f.permissions('lead',l.id).canQualify,true);
 for(const missing of [{budgetConfirmed:false},{decisionMaker:''},{needConfirmed:false},{timeline:'12+ months'},{timeline:'Not sure yet'}])assert.throws(()=>f.qualify(l.id,{needConfirmed:true,...missing}),/To qualify this lead, confirm/);
 assert.equal(e.s.outbox.filter(o=>o.recordId===l.id&&o.action==='qualify').length,0);
 f.qualify(l.id,{needConfirmed:true});f.sync();assert.equal(l.status,'Qualified');assert.equal(l.qualifiedAt,fixed);assert.throws(()=>f.qualify(l.id,{}),/already qualified/);
 assert.throws(()=>f.edit('lead',l.id,{value:1}),/identity is locked/);
});

test('large direct registrations wait for vendor review; approval remains distinct from winning',()=>{
 const e=env(),f=e.flow,d=f.createDeal({...dealValues('Large registration'),value:400000});f.submitDeal(d.id);f.sync();assert.equal(d.registration,'Submitted');f.sync();assert.equal(d.registration,'Pending review');assert.equal(d.opportunityId,null);assert.equal(d.stage,null);
 assert.throws(()=>f.updateStage(d.id,'Won','Customer won.'),/Registration/);
 f.sync();assert.equal(d.registration,'Approved');assert.equal(d.stage,'Discovery');
});

test('rejected territory registration can be revised and resubmitted without duplicate records',()=>{
 const e=env(),f=e.flow,d=f.createDeal({...dealValues('Region correction'),region:'Other'});f.submitDeal(d.id);f.sync();f.sync();f.sync();assert.equal(d.registration,'Rejected');const id=d.id,crmId=d.crmId;
 f.edit('deal',id,{region:'Europe'});assert.equal(d.registration,'Draft');assert.equal(d.sync.status,'local');f.sync();assert.equal(d.registration,'Draft');
 f.edit('deal',id,{name:'Updated rollout'});f.submitDeal(id);f.sync();f.sync();f.sync();assert.equal(d.registration,'Approved');assert.equal(d.crmId,crmId);assert.equal(f.list('deal').filter(r=>r.id===id).length,1);
});

test('incomplete and invalid submissions fail with actionable validation',()=>{
 const e=env(),f=e.flow,l=f.createLead({company:'Incomplete'});assert.throws(()=>f.submitLead(l.id),/Contact name.*email.*Estimated value.*customer need.*permission/);
 for(const v of [{value:-10},{email:'invalid'},{consent:false},{need:'Tiny'}]){const l=f.createLead({...values('Invalid '+JSON.stringify(v)),...v});assert.throws(()=>f.submitLead(l.id),W.WorkflowError);}
 for(const v of [{expectedClose:'2026-02-31'},{expectedClose:'2026-01-01'},{expectedClose:'2026-13-01'},{confirmedNeed:false},{product:'Unsupported'}]){const d=f.createDeal({...dealValues('Invalid deal '+JSON.stringify(v)),...v});assert.throws(()=>f.submitDeal(d.id),W.WorkflowError);}
});

test('lead qualification and registration cannot be bypassed; opportunities follow legal transitions',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L101');assert.throws(()=>f.createDeal(dealValues(),l.id),/qualification/);
 const d=approvedDeal(e,'Transition test');assert.throws(()=>f.updateStage(d.id,'Won','Won without details'),/won amount/i);
 f.updateStage(d.id,'Proposal');f.sync();f.updateStage(d.id,'Negotiation');f.sync();assert.throws(()=>f.updateStage(d.id,'Won',''),/outcome note/);
 f.updateStage(d.id,'Won','Signed agreement',{wonAmount:82000,closeDate:'2026-10-15'});f.sync();assert.throws(()=>f.updateStage(d.id,'Discovery'),/Closed opportunities/);
});

test('local duplicates are blocked; foreign CRM conflicts reject without exposing another partner',()=>{
 const e=env(),f=e.flow;draftDeal(e,'Duplicate Ltd');assert.throws(()=>draftDeal(e,'Duplicate, Ltd'),/already have a registration/);
 const d=approvedDeal(e,'Evergreen Systems');assert.equal(d.registration,'Rejected');assert.equal(d.opportunityId,null);assert.doesNotMatch(d.reason,/another-partner|Negotiation/);
});

test('registration links an existing authorized opportunity and uses its confirmed values',()=>{
 const e=env(),d=approvedDeal(e,'Northstar Services');assert.equal(d.registration,'Approved');assert.equal(d.opportunityId,'006-linkable');assert.equal(d.value,75000);assert.equal(e.crm.opportunities['006-linkable'].registrationId,d.crmId);
 assert.equal(Object.values(e.crm.opportunities).filter(o=>o.company==='Northstar Services').length,1);
});

test('linked registration keeps the qualified customer identity',()=>{
 const e=env(),l=e.flow.get('lead','L103'),d=e.flow.createDeal(dealValues('Different company'),l.id);assert.equal(d.company,l.company);assert.equal(d.contact,l.contact);assert.equal(d.email,l.email);
 e.flow.edit('deal',d.id,{company:'Different again'});assert.equal(d.company,l.company);
});

test('sync failure retains confirmed data and retries exactly once without duplicate activities',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L105'),old=l.email;
 f.edit('lead',l.id,{email:'updated@example.com'});f.failNext();assert.equal(f.sync().ok,false);assert.equal(l.email,old);assert.equal(e.crm.leads[l.crmId].email,old);assert.equal(l.sync.status,'failed');assert.throws(()=>f.qualify(l.id),/pending/);
 f.sync();assert.equal(l.email,'updated@example.com');assert.equal(l.sync.status,'synced');
 const count=l.activities.length;f.addActivity('lead',l.id,{type:'Note',note:'Only one copy of this activity.'});f.failNext();f.sync();assert.equal(l.activities.length,count);f.sync();f.sync();assert.equal(l.activities.length,count+1);assert.equal(e.crm.leads[l.crmId].activities.length,count+1);
});

test('double submission is blocked and repeated sync does not recreate a registration or opportunity',()=>{
 const e=env(),f=e.flow,d=draftDeal(e,'Idempotent');f.submitDeal(d.id);assert.throws(()=>f.submitDeal(d.id),/pending/);f.sync();f.sync();f.sync();const opportunity=d.opportunityId,op=e.s.outbox.find(o=>o.recordId===d.id);
 op.state='failed';d.sync={status:'failed',operationId:op.id};f.sync();f.sync();assert.equal(d.opportunityId,opportunity);assert.equal(Object.values(e.crm.opportunities).filter(o=>o.company===d.company).length,1);
});

test('offline queues survive reload; retry and discard retain the last confirmed values',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L105');e.state.crm.connected=false;f.edit('lead',l.id,{contact:'New Contact'});assert.throws(()=>f.sync(),/Connect Salesforce/);
 const restored=env(JSON.parse(JSON.stringify(e.state)));restored.state.crm.connected=true;restored.flow.sync();assert.equal(restored.flow.get('lead',l.id).contact,'New Contact');
 const r=restored.flow.get('lead',l.id);restored.flow.edit('lead',r.id,{contact:'Discarded Contact'});restored.flow.failNext();restored.flow.sync();restored.flow.discard('lead',r.id);assert.equal(r.contact,'New Contact');assert.equal(r.sync.status,'synced');restored.flow.sync();assert.equal(r.contact,'New Contact');
});

test('assigned lead can be declined with a reason; closed leads have no contact actions',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L104');assert.throws(()=>f.decline(l.id,''),/reason/);assert.throws(()=>f.decline(l.id,'Other','No'),/5 characters/);f.decline(l.id,'Outside our territory','Outside our service coverage.');f.sync();assert.equal(l.status,'Declined');assert.equal(l.declineReason,'Outside our territory');assert.equal(l.closedFrom,'Assigned');assert.match(e.crm.leads[l.crmId].reviewReason,/coverage/);assert.throws(()=>f.accept(l.id),/awaiting/);assert.throws(()=>f.addActivity('lead',l.id,{type:'Call',note:'Trying to call'}),/accept/);
});

test('follow-ups validate real dates and completion synchronizes to the CRM record',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L105');for(const dueDate of ['2026-01-01','2026-02-31','invalid',''])assert.throws(()=>f.addActivity('lead',l.id,{type:'Follow-up',note:'Customer callback',dueDate}),/date/);
 f.addActivity('lead',l.id,{type:'Follow-up',note:'Customer callback',dueDate:'2026-10-19'});f.sync();const a=l.activities.at(-1);f.completeActivity('lead',l.id,a.id);f.sync();assert.equal(e.crm.leads[l.crmId].activities.at(-1).completed,true);assert.throws(()=>f.completeActivity('lead',l.id,a.id),/not open/);
});

test('CRM is authoritative for external customer, activity, and opportunity updates',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L105'),d=f.get('deal','D103');e.crm.leads[l.crmId].contact='Vendor corrected contact';e.crm.leads[l.crmId].activities.push({id:'remote-activity',type:'Note',note:'Vendor recorded an update.',time:fixed});
 const opp=e.crm.opportunities[d.opportunityId];Object.assign(opp,{value:130000,stage:'Negotiation',contact:'New sponsor'});f.sync();assert.equal(l.contact,'Vendor corrected contact');assert.equal(l.activities.at(-1).id,'remote-activity');assert.equal(d.value,130000);assert.equal(d.contact,'New sponsor');assert.equal(d.stage,'Negotiation');
 const n=f.notifications().length;f.sync();assert.equal(f.notifications().length,n);
});

test('CRM stage conflicts preserve the confirmed value until discard and refresh',()=>{
 const e=env(),f=e.flow,d=approvedDeal(e,'Stage conflict');f.updateStage(d.id,'Proposal');e.crm.opportunities[d.opportunityId].stage='Lost';const result=f.sync();assert.equal(result.ok,false);assert.equal(d.stage,'Discovery');assert.equal(d.sync.status,'failed');assert.match(d.sync.error,/stage changed/);f.discard('deal',d.id);assert.equal(d.stage,'Lost');
});

test('unauthorized, revoked, and signed-out records are unavailable to partner actions',()=>{
 const e=env(),f=e.flow;f.sync();assert.ok(!f.list('lead').some(r=>r.company==='Larkspur Clinics'));assert.throws(()=>f.get('lead','private-lead'),/not available/);
 const l=f.get('lead','L104');e.crm.leads[l.crmId].partnerId='another-partner';assert.ok(!f.list('lead').some(r=>r.id===l.id));assert.throws(()=>f.accept(l.id),/not available/);assert.ok(!f.notifications().some(n=>n.recordId===l.id));f.sync();assert.ok(!f.list('lead').some(r=>r.id===l.id));
 e.state.authorized=false;assert.throws(()=>f.list('lead'),/Sign in/);assert.throws(()=>f.createLead(values()),/Sign in/);assert.throws(()=>f.sync(),/Sign in/);
});

test('legacy preview records are preserved without inventing CRM approvals',()=>{
 const state={crm:{connected:true},leads:[{id:1,company:'Preserved Company',status:'Won',value:5000,contact:'Ada',email:'ada@example.com'}],deals:[{id:2,company:'Old Deal',stage:'Negotiation'}]};const original=structuredClone(state);W.initialize(state,{migrate:true});const f=W.create(state);const imported=f.list('lead').find(l=>l.id==='L-import-0');assert.equal(imported.status,'Draft');assert.equal(imported.legacyStatus,'Won');assert.equal(imported.crmId,null);assert.deepEqual(state.sales.legacyArchive.leads,original.leads);assert.deepEqual(state.sales.legacyArchive.deals,original.deals);
 const before=JSON.stringify(state.sales);W.initialize(state,{migrate:true});assert.equal(JSON.stringify(state.sales),before);const created=f.createLead(values());assert.equal(f.list('lead').filter(l=>l.id===created.id).length,1);
});

test('starter workspace shows eleven leads; edited and created records survive sample reduction',()=>{const e=env();assert.equal(e.flow.list('lead').length,11);assert.equal(e.flow.list('lead').filter(l=>l.origin==='partner').length,7);assert.equal(e.flow.list('lead').filter(l=>e.flow.leadStage(l)==='Qualified').length,3,'qualified leads ready to register');assert.equal(e.flow.list('lead').filter(l=>l.origin==='crm').length,4);const l=e.flow.createLead(values('Keep my lead'));const before=JSON.stringify(l);delete e.s.compactSamplesVersion;W.initialize(e.state);assert.equal(JSON.stringify(e.flow.get('lead',l.id)),before);});


test('queued edits preserve independent CRM changes and surface same-field conflicts',()=>{
 const e=env(),f=e.flow,l=f.get('lead','L105');f.edit('lead',l.id,{email:'newemail@example.com'});e.crm.leads[l.crmId].contact='Vendor changed contact';f.sync();assert.equal(l.contact,'Vendor changed contact');assert.equal(l.email,'newemail@example.com');
 f.edit('lead',l.id,{contact:'Partner contact change'});e.crm.leads[l.crmId].contact='New CRM sponsor';f.sync();assert.equal(l.sync.status,'failed');assert.match(l.sync.error,/changed in Salesforce/);f.discard('lead',l.id);assert.equal(l.contact,'New CRM sponsor');
});

test('stage and activity requests preserve newer opportunity customer data and vendor notes',()=>{
 const e=env(),f=e.flow,d=f.get('deal','D103'),opp=e.crm.opportunities[d.opportunityId];f.updateStage(d.id,'Negotiation');opp.contact='New opportunity sponsor';f.sync();assert.equal(d.contact,'New opportunity sponsor');assert.equal(d.value,125000);f.addActivity('deal',d.id,{type:'Note',note:'Partner update'});opp.activities.push({id:'vendor-note',type:'Note',note:'Vendor update',time:fixed});f.sync();assert.ok(d.activities.some(a=>a.id==='vendor-note'));assert.equal(d.activities.at(-1).note,'Partner update');
});


test('saved leads from the earlier flow migrate once without losing history',()=>{
 const e=env(),f=e.flow;
 // Recreate a browser that saved data before the lead-flow upgrade.
 delete e.s.leadFlowVersion;const helios=f.get('lead','L105'),meridian=f.get('lead','L102');
 const old=f.createLead(values('Old disqualified'));Object.assign(old,{status:'Disqualified',crmId:'00Q-old',sync:{status:'synced'}});e.crm.leads[old.crmId]=JSON.parse(JSON.stringify(old));
 const waiting=f.createLead(values('Old qualified'));Object.assign(waiting,{status:'Qualified',crmId:'00Q-legacy',sync:{status:'synced'}});e.crm.leads[waiting.crmId]=JSON.parse(JSON.stringify(waiting));
 for(const r of [helios,e.crm.leads[helios.crmId]])r.status='Qualification requested';
 e.s.outbox.push({id:'OP-old',type:'lead',recordId:helios.id,partnerId:e.s.partnerId,action:'qualify',payload:{},state:'pending',attempts:0});helios.sync={status:'pending',operationId:'OP-old'};e.crm.jobs.push({kind:'qualify',crmId:helios.crmId,due:1});
 const history=helios.history.length;W.initialize(e.state);
 assert.equal(helios.status,'Working');assert.equal(helios.sync.status,'synced');assert.equal(e.s.outbox.find(o=>o.id==='OP-old').state,'cancelled');assert.equal(helios.history.length,history+1);assert.ok(!e.crm.jobs.some(j=>j.crmId===helios.crmId));
 assert.equal(old.status,'Rejected');assert.equal(e.crm.leads[old.crmId].status,'Rejected');assert.equal(waiting.legacyQualified,true);assert.equal(meridian.status,'Submitted');
 assert.ok(e.crm.jobs.some(j=>j.crmId===meridian.crmId));
 const once=JSON.stringify(e.state);W.initialize(e.state);assert.equal(JSON.stringify(e.state),once);
});
