const test=require('node:test'),assert=require('node:assert/strict');
const {environment}=require('./ui-environment.cjs');
const leadValues={company:'Workflow UX Customer',contact:'Taylor Reed',email:'taylor@workflow.example',jobTitle:'Director',value:'82000',region:'North America',need:'Replace disconnected sales reporting across regional teams.',source:'Partner referral',consent:'on'};
const registration={...leadValues,name:'Regional rollout',product:'Sales Cloud',expectedClose:'2026-12-20',confirmedNeed:'on'};
const act=(app,action,type,id)=>app.click({salesAction:action,salesType:type,salesId:id});
const submit=(app,id,values,intent)=>app.element(id).onsubmit({preventDefault(){},target:{values},submitter:intent?{value:intent}:undefined});
const recordValues=(app,type,id)=>JSON.parse(app.run(`JSON.stringify(getRecord('${type}','${id}'))`));
const fixtureStatus=(app,id,status)=>app.run(`{const r=getRecord('lead','${id}');r.status='${status}';state.sales.crm.leads[r.crmId].status='${status}';state.sales.crm.jobs=[];}`);

test('qualified lead form visibly locks customer identity and leaves contact fields editable',()=>{
 const a=environment();a.login();act(a,'edit','lead','L103');const html=a.overlay();
 for(const name of ['company','email','value','need'])assert.match(html,new RegExp('<(?:input|textarea)[^>]*name="'+name+'"[^>]* readonly[^>]*title="Qualified'));
 assert.match(html,/<select[^>]*name="region"[^>]* disabled[^>]*title="Qualified/);assert.match(html,/<input type="hidden" name="region" value="North America">/);
 for(const name of ['contact','jobTitle'])assert.doesNotMatch(html,new RegExp('<input[^>]*name="'+name+'"[^>]*readonly'));
 const values=recordValues(a,'lead','L103');a.submit('sales-record-form',{...values,contact:'Updated contact',consent:'on'});a.sync();assert.equal(a.run("getRecord('lead','L103').contact"),'Updated contact');
});

test('linked leads have a deal-specific next action and no edit or activity controls',()=>{
 const a=environment();a.login();a.run(`workflow.createDeal(${JSON.stringify({...registration,consent:true,confirmedNeed:true})},'L103')`);const id=a.run("getRecord('lead','L103').dealId");
 a.run("getRecord('lead','L103').activities.push({id:'fixture-follow-up',type:'Follow-up',note:'Customer discussion',dueDate:'2026-10-20',completed:false,time:'2026-10-14T12:00:00Z'})");act(a,'open','lead','L103');
 assert.match(a.overlay(),/View deal registration · Draft/);assert.match(a.overlay(),new RegExp('Deal registration '+id+' · Draft · CRM opportunity not created yet'));assert.doesNotMatch(a.overlay(),/data-sales-action="(?:edit|activity|complete|close-lead)"/);assert.match(a.overlay(),/Refresh Salesforce/);
 act(a,'linked','lead','L103');act(a,'edit','deal',id);assert.match(a.overlay(),/name="company"[^>]*readonly/);
});

test('draft deletion is confirmed and returns to the list with the source lead unlinked',()=>{
 const a=environment();a.login();a.click({page:'deals'});a.run(`workflow.createDeal(${JSON.stringify({...registration,consent:true,confirmedNeed:true})},'L103')`);const id=a.run("getRecord('lead','L103').dealId");act(a,'open','deal',id);assert.match(a.overlay(),/Delete draft/);
 act(a,'delete-draft','deal',id);assert.match(a.overlay(),/aria-label="Delete draft"/);assert.ok(a.run(`workflow.list('deal').some(r=>r.id==='${id}')`));act(a,'open','deal',id);assert.ok(a.run(`workflow.list('deal').some(r=>r.id==='${id}')`));
 act(a,'delete-draft','deal',id);a.submit('sales-delete-form',{});assert.equal(a.overlay(),'');assert.equal(a.run(`workflow.list('deal').some(r=>r.id==='${id}')`),false);assert.equal(a.run("Boolean(getRecord('lead','L103').dealId)"),false);
});

test('Close lead validates notes, syncs the outcome and removes all mutation controls',()=>{
 const a=environment();a.login();act(a,'open','lead','L103');assert.match(a.overlay(),/Close lead/);act(a,'close-lead','lead','L103');a.submit('sales-close-form',{reason:'No budget',note:'No'});assert.match(a.element('sales-form-error').textContent,/5 characters/);a.submit('sales-close-form',{reason:'No budget',note:'Budget is unavailable this year.'});a.sync();assert.equal(a.run("getRecord('lead','L103').status"),'Closed');assert.match(a.overlay(),/No budget · Budget is unavailable this year/);assert.doesNotMatch(a.overlay(),/data-sales-action="(?:edit|activity|complete|close-lead)"/);
 a.click({page:'leads'});assert.match(a.html(),/<h2>Disqualified \/ Closed<\/h2>/);assert.match(a.run("stagePill('Closed')"),/pill red/);
});

test('withdrawal is an explicit drawer action and a withdrawn registration is read-only',()=>{
 const a=environment();a.login();a.run('state.sales.crm.jobs=[]');act(a,'open','deal','D102');assert.match(a.overlay(),/Withdraw registration/);act(a,'withdraw','deal','D102');a.submit('sales-withdraw-form',{note:'The customer has paused this registration.'});a.sync();assert.equal(a.run("getRecord('deal','D102').registration"),'Withdrawn');assert.match(a.overlay(),/The customer has paused this registration/);assert.doesNotMatch(a.overlay(),/data-sales-action="(?:edit|activity|complete|withdraw|stage)"/);a.click({page:'deals'});assert.match(a.html(),/<h2>Withdrawn<\/h2>/);assert.match(a.run("stagePill('Withdrawn')"),/pill red/);
});

test('first contact offers a call, email, or meeting with an outcome while a note does not start Working',()=>{
 const a=environment();a.login();act(a,'accept','lead','L104');a.sync();assert.equal(a.run("recordAction(getRecord('lead','L104'),'lead').action"),'first-contact');act(a,'first-contact','lead','L104');assert.match(a.overlay(),/aria-label="Log first contact"/);assert.match(a.overlay(),/<option selected>Call<\/option>/);assert.match(a.overlay(),/>Email<\/option>/);assert.match(a.overlay(),/>Meeting<\/option>/);assert.doesNotMatch(a.overlay(),/>Note<\/option>|>Follow-up<\/option>/);assert.match(a.overlay(),/name="outcome"/);assert.match(a.overlay(),/<option selected>Connected<\/option>/);assert.match(a.overlay(),/Save contact & sync/);
 act(a,'activity','lead','L104');a.submit('sales-activity-form',{type:'Note',note:'Reviewing the account background.'});assert.equal(a.element('toast').textContent,'Saved. Log a call, email, or meeting to start working this lead.');a.sync();assert.equal(a.run("getRecord('lead','L104').status"),'Accepted');act(a,'first-contact','lead','L104');a.submit('sales-activity-form',{type:'Email',outcome:'No response',note:'Emailed the customer with discovery questions.'});a.sync();assert.equal(a.run("getRecord('lead','L104').status"),'Working');assert.match(a.overlay(),/Email · No response/);assert.match(a.overlay(),/BANT 2 of 4|0 of 4 confirmed/);
});

test('Needs information form saves and resubmits a partner lead as one queued update',()=>{
 for(const [id,expected]of [['L103','Submitted']]){const a=environment();a.login();fixtureStatus(a,id,'Needs information');act(a,'open','lead',id);assert.match(a.overlay(),/Update & resubmit/);assert.match(a.overlay(),/Resubmit to vendor/);assert.match(a.overlay(),/Information requested/);act(a,'resubmit','lead',id);assert.match(a.overlay(),/Save & resubmit/);const values=recordValues(a,'lead',id),before=a.run('state.sales.outbox.length');a.submit('sales-record-form',{...values,need:'Confirmed need for an integrated customer platform across regions.',consent:'on'});assert.equal(a.run('state.sales.outbox.length'),before+1);assert.equal(a.run('state.sales.outbox.at(-1).action'),'resubmit');a.sync();assert.equal(a.run(`getRecord('lead','${id}').status`),expected);assert.equal(a.run(`getRecord('lead','${id}').need`),'Confirmed need for an integrated customer platform across regions.');}
});

test('stage form exposes forward stages and toggles native validation for conditional fields',()=>{
 const a=environment();a.login();const select=a.element('test-stage'),note=a.element('test-note'),inputs={};select.value='Keep current stage (Proposal)';const originalQuery=a.context.document.querySelector;a.context.document.querySelector=selector=>selector==='#sales-stage-form [name="stage"]'?select:selector==='#sales-stage-form [name="reason"]'?note:originalQuery(selector);
 for(const group of ['stage-open-fields','stage-won-fields','stage-lost-fields']){inputs[group]=[a.element(group+'-one'),a.element(group+'-two')];a.element(group).querySelectorAll=()=>inputs[group];}
 act(a,'stage','deal','D103');assert.match(a.overlay(),/Keep current stage \(Proposal\)/);assert.match(a.overlay(),/>Negotiation<\/option>/);assert.match(a.overlay(),/>Won<\/option>/);assert.doesNotMatch(a.overlay(),/>Discovery<\/option>/);assert.equal(note.required,false);assert.equal(a.element('stage-won-fields').hidden,true);assert.ok(inputs['stage-won-fields'].every(input=>input.disabled&&!input.required));
 select.value='Won';select.onchange();assert.equal(note.required,true);assert.equal(a.element('stage-won-fields').hidden,false);assert.ok(inputs['stage-won-fields'].every(input=>!input.disabled&&input.required));assert.ok(inputs['stage-open-fields'].every(input=>input.disabled&&!input.required));
 select.value='Lost';select.onchange();assert.equal(a.element('stage-lost-fields').hidden,false);assert.ok(inputs['stage-lost-fields'].every(input=>!input.disabled&&input.required));assert.ok(inputs['stage-won-fields'].every(input=>input.disabled&&!input.required));
 select.value='Keep current stage (Proposal)';select.onchange();assert.equal(note.required,false);assert.equal(a.element('stage-open-fields').hidden,false);a.submit('sales-stage-form',{stage:select.value,value:'135000',expectedClose:'2026-12-30',reason:''});a.sync();assert.equal(a.run("getRecord('deal','D103').value"),135000);assert.equal(a.run("getRecord('deal','D103').expectedClose"),'2026-12-30');assert.equal(a.run("getRecord('deal','D103').stage"),'Proposal');
});

test('Won and Lost stage forms forward the actual outcome details to Salesforce',()=>{
 for(const [stage,details]of [['Won',{wonAmount:'115000',closeDate:'2026-10-15'}],['Lost',{lostReason:'Competitor'}]]){const a=environment();a.login();act(a,'stage','deal','D103');a.submit('sales-stage-form',{stage,reason:'The customer confirmed the final outcome.',...details});a.sync();assert.equal(a.run("getRecord('deal','D103').stage"),stage);if(stage==='Won'){assert.equal(a.run("getRecord('deal','D103').value"),115000);assert.equal(a.run("getRecord('deal','D103').estimatedValue"),125000);}else assert.equal(a.run("getRecord('deal','D103').lostReason"),'Competitor');}
});

test('next action text distinguishes linked registration, withdrawal and overdue follow-ups',()=>{
 const a=environment();a.login();a.run("{const d=getRecord('deal','D103');d.expectedClose='2026-10-14';d.activities.push({id:'overdue',type:'Follow-up',note:'Confirm the decision',dueDate:'2026-10-14',completed:false});}");assert.equal(a.run("recordAction(getRecord('deal','D103'),'deal').detail"),'Follow-up overdue: Confirm the decision · Expected close date has passed. Update the close date or move the stage.');for(const stage of ['Won','Lost']){a.run("getRecord('deal','D103').stage='"+stage+"'");assert.match(a.run("recordAction(getRecord('deal','D103'),'deal').detail"),/^Follow-up overdue: Confirm the decision · /);}a.run("getRecord('deal','D103').stage='Proposal'");a.run("{const l=getRecord('lead','L103');l.dealId='D103';}");assert.equal(a.run("recordAction(getRecord('lead','L103'),'lead').label"),'View deal registration · Proposal');a.run("getRecord('deal','D103').registration='Withdrawn'");assert.equal(a.run("recordAction(getRecord('lead','L103'),'lead').action"),'register-linked');assert.equal(a.run("recordAction(getRecord('lead','L103'),'lead').label"),'Register deal');
});

test('Submit for approval retains the same lead draft on validation failure and retry submits it once',()=>{
 const a=environment();a.login();const before=a.run("workflow.list('lead').length");act(a,'new-lead');assert.match(a.overlay(),/btn-outline btn-secondary[^>]*type="submit"[^>]*value="draft"/);assert.match(a.overlay(),/value="submit" formnovalidate/);assert.match(a.overlay(),/Submit for approval/);submit(a,'sales-record-form',{...leadValues,consent:undefined},'submit');assert.match(a.overlay(),/sales-record-form/);assert.match(a.element('sales-form-error').textContent,/permission/);assert.equal(a.run("workflow.list('lead').length"),before+1);const id=a.run("workflow.list('lead').find(r=>r.company==='Workflow UX Customer').id");assert.equal(a.run(`getRecord('lead','${id}').status`),'Draft');submit(a,'sales-record-form',leadValues,'submit');assert.equal(a.run("workflow.list('lead').length"),before+1);a.sync();assert.equal(a.run(`getRecord('lead','${id}').status`),'Submitted');assert.equal(a.run(`state.sales.outbox.filter(o=>o.recordId==='${id}'&&o.action==='submitLead').length`),1);
});

test('Save & submit preserves a failed registration draft and Cancel leaves it available',()=>{
 const a=environment();a.login();const before=a.run("workflow.list('deal').length");const wizard=(values,intent)=>{submit(a,'deal-describe-form',{story:''},'manual');submit(a,'deal-review-form',values,'continue');submit(a,'deal-confirm-form',{consent:'on'},intent);};
 act(a,'new-deal');wizard(registration,'submit');assert.match(a.overlay(),/deal-confirm-form/);assert.match(a.element('sales-form-error').textContent,/customer need/);assert.equal(a.run("workflow.list('deal').length"),before+1);a.click({action:'close'});assert.equal(a.overlay(),'');const id=a.run("workflow.list('deal').find(r=>r.company==='Workflow UX Customer').id");assert.equal(a.run(`getRecord('deal','${id}').registration`),'Draft');
 act(a,'new-deal');wizard({...registration,company:'A second customer',email:'second@example.com'},'submit');submit(a,'deal-confirm-form',{consent:'on',confirmedNeed:'on'},'submit');assert.equal(a.run("workflow.list('deal').length"),before+2);a.sync();a.review();a.sync();a.review();a.sync();assert.equal(a.run("workflow.list('deal').find(r=>r.company==='A second customer').registration"),'Approved');
});


test('Pending approval and Closed columns show one card while View all retains every record',()=>{
 for(const [status,stage,label,total]of [['Submitted','Draft','New',7],['Rejected','Closed','Disqualified / Closed',3]]){
  const a=environment();a.login();
  a.run(`for(let i=0;i<3;i++){const r=workflow.createLead({company:'Limited '+i});r.status='${status}';}`);
  a.click({page:'leads'});
  const column=[...a.html().matchAll(/<section class="lead-column"[\s\S]*?<\/section>/g)].map(m=>m[0]).find(html=>html.includes('data-stage="'+stage+'"'));
  assert.match(column,new RegExp('<h2>'+label+'</h2>'));
  assert.equal((column.match(/class="card lead-card sales-card"/g)||[]).length,stage==='Draft'?2:1);
  assert.match(column,new RegExp('Showing '+(stage==='Draft'?2:1)+' of '+total+' '+(stage==='Draft'?'new leads':'records')));
  a.click({salesAction:'all-status',salesStatus:stage});
  assert.equal(a.run('salesView'),'list');assert.equal(a.run('salesFilter'),stage);
  for(let i=0;i<3;i++)assert.match(a.html(),new RegExp('Limited '+i));
 }
});


test('lead drawer shows the journey tracker, deadlines, protection, and the BANT checklist',()=>{
 const a=environment();a.login();a.click({page:'assigned'});
 assert.match(a.html(),/<h2>New<\/h2>/);assert.match(a.html(),/Alder Health/);assert.match(a.html(),/Riverton Digital/);assert.match(a.html(),/data-stage="Converted"/);
 act(a,'open','lead','L104');assert.match(a.overlay(),/class="current" aria-current="step"><span>1<\/span>New/);assert.match(a.overlay(),/Accept by [^<]* · 48 hours left/);assert.doesNotMatch(a.overlay(),/lead-bant-grid/);
 a.click({page:'leads'});assert.match(a.html(),/<h2>New<\/h2>/);assert.match(a.html(),/View all new leads/);
 act(a,'open','lead','L110');const html=a.overlay();
 assert.match(html,/Ready for first contact/);assert.match(html,/class="current" aria-current="step"><span>1<\/span>New/);
 assert.match(html,/Protected for Acme Partners until/);assert.match(html,/Log first contact/);
 assert.match(html,/Qualification · BANT <span>1 of 4 confirmed<\/span>/);assert.match(html,/data-sales-action="bant"/);assert.doesNotMatch(html,/data-sales-action="qualify"/);
 for(const label of ['Phone','Website','Industry','Company size','Product interest','Purchase timeline','Lead rating','Lead source'])assert.match(html,new RegExp('<span class="crm-record-label">'+label+'</span>'));
 act(a,'open','lead','L103');assert.match(a.overlay(),/4 of 4 confirmed/);assert.match(a.overlay(),/Register deal/);assert.match(a.overlay(),/Ready to convert|Qualified/);
});

test('BANT progress saves before contact and the qualify form marks a working lead qualified',()=>{
 const a=environment();a.login();act(a,'bant','lead','L110');assert.match(a.overlay(),/aria-label="Update BANT"/);assert.doesNotMatch(a.overlay(),/value="qualify"/);assert.match(a.overlay(),/Log a call, email, or meeting/);
 a.submit('sales-qualify-form',{value:'120000',budgetConfirmed:'on',decisionMaker:'Priya Nair · VP, Operations',need:recordValues(a,'lead','L110').need,timeline:'3–6 months'});a.sync();
 const saved=recordValues(a,'lead','L110');assert.equal(saved.status,'Approved');assert.equal(saved.budgetConfirmed,true);assert.equal(saved.needConfirmed,false);assert.equal(saved.decisionMaker,'Priya Nair · VP, Operations');
 act(a,'first-contact','lead','L110');a.submit('sales-activity-form',{type:'Meeting',outcome:'Connected',note:'Site visit with the operations team.'});a.sync();assert.equal(a.run("getRecord('lead','L110').status"),'Working');assert.match(a.overlay(),/Qualify lead/);
 act(a,'qualify','lead','L110');assert.match(a.overlay(),/aria-label="Qualify lead"/);assert.match(a.overlay(),/value="qualify"/);
 a.submit('sales-qualify-form',{value:'120000',budgetConfirmed:'on',decisionMaker:'Priya Nair · VP, Operations',need:saved.need,timeline:'3–6 months'});assert.match(a.element('sales-form-error').textContent,/confirm the customer need/);assert.equal(a.run("getRecord('lead','L110').status"),'Working');
 a.submit('sales-qualify-form',{value:'120000',budgetConfirmed:'on',decisionMaker:'Priya Nair · VP, Operations',need:saved.need,needConfirmed:'on',timeline:'3–6 months'});a.sync();assert.equal(a.run("getRecord('lead','L110').status"),'Qualified');assert.match(a.overlay(),/Register deal/);
 act(a,'register-linked','lead','L110');assert.match(a.overlay(),/deal-describe-form/);submit(a,'deal-describe-form',{story:''},'manual');assert.match(a.overlay(),/<option selected>Service Cloud<\/option>/);
});

test('decline uses a reason list and returns the lead to the vendor',()=>{
 const a=environment();a.login();act(a,'open','lead','L104');assert.match(a.overlay(),/Decline assignment/);act(a,'decline','lead','L104');assert.match(a.overlay(),/<option selected>Outside our territory<\/option>/);
 a.submit('decline-form',{reason:'Other',note:'No'});assert.match(a.element('sales-form-error').textContent,/5 characters/);
 a.submit('decline-form',{reason:'No capacity right now',note:''});a.sync();assert.equal(a.run("getRecord('lead','L104').status"),'Declined');assert.match(a.overlay(),/class="stopped" aria-current="step"><span>1<\/span>Closed/);assert.doesNotMatch(a.overlay(),/data-sales-action="(?:accept|decline|edit|activity)"/);
 a.click({page:'assigned'});const closed=a.html().match(/<section class="lead-column" data-stage="Closed"[\s\S]*?<\/section>/)[0];assert.match(closed,/Harbor Systems/);
});

test('lead form leads with essentials, folds optional details, and keeps the lead source after submission',()=>{
 const a=environment();a.login();act(a,'new-lead');const html=a.overlay();
 for(const section of ['CUSTOMER','CONTACT','OPPORTUNITY'])assert.match(html,new RegExp('<p class="lead-form-section">'+section+'</p>'));
 assert.match(html,/<details class="lead-more-details"><summary>More details/);assert.match(html,/id="lead-duplicate-hint"[^>]*hidden/);
 assert.match(html,/name="product"[\s\S]*?<option selected>Not sure yet<\/option>/);
 a.submit('sales-record-form',{company:'Form Customer',contact:'Lee Park',email:'lee@form.example',value:'40000',region:'Europe',product:'Platform',need:'Bring partner and customer onboarding into one workflow.',consent:'on',phone:'+44 20 7946 0000',website:'form.example',industry:'Retail',employees:'51–200',timeline:'6–12 months',rating:'Hot',source:'Event'});
 const id=a.run('detailRecord.id'),r=recordValues(a,'lead',id);assert.equal(r.product,'Platform');assert.equal(r.industry,'Retail');assert.equal(r.rating,'Hot');assert.equal(r.source,'Event');assert.equal(r.phone,'+44 20 7946 0000');
 act(a,'edit','lead',id);assert.match(a.overlay(),/<details class="lead-more-details" open>/);
 a.submit('sales-record-form',{...r,consent:'on',phone:'call me'});assert.equal(recordValues(a,'lead',id).phone,'call me');act(a,'submit-lead','lead',id);assert.match(a.element('sales-action-error').textContent,/valid phone/);
 act(a,'edit','lead','L110');a.submit('sales-record-form',{...recordValues(a,'lead','L110'),consent:'on',phone:'call me'});assert.match(a.element('sales-form-error').textContent,/valid phone/);assert.equal(a.run("getRecord('lead','L110').phone"),'+1 415 555 0142');
 act(a,'edit','lead','L102');assert.match(a.overlay(),/name="source" disabled title="The lead source is fixed after submission."/);
});
