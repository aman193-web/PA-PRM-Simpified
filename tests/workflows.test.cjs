const test=require('node:test'),assert=require('node:assert/strict');
const {environment}=require('./ui-environment.cjs');
const leadValues={company:'Workflow Customer',contact:'Taylor Reed',email:'taylor@example.com',jobTitle:'Director',value:'82000',region:'North America',need:'Replace disconnected sales reporting across regional teams.',source:'Partner referral',consent:'on'};
const registration={...leadValues,name:'Regional rollout',product:'Sales Cloud',expectedClose:'2026-12-20',confirmedNeed:'on'};
const act=(app,action,type,id,extra={})=>app.click({salesAction:action,salesType:type,salesId:id,...extra});

test('first screen offers the partner and partner manager portals; refresh returns to it while keeping records',()=>{
 const a=environment();assert.match(a.html(),/id="portal-partner"/);assert.match(a.html(),/id="portal-manager"/);assert.doesNotMatch(a.html(),/welcome-login-form/);
 a.run("go('deals')");assert.match(a.html(),/id="portal-partner"/);a.element('portal-partner').onclick();assert.match(a.html(),/welcome-login-form/);assert.match(a.html(),/Choose a different portal/);
 a.element('welcome-back').onclick();assert.match(a.html(),/id="portal-manager"/);
 a.element('portal-manager').onclick();assert.match(a.html(),/PARTNER ACCOUNT MANAGER SIGN-IN/);assert.match(a.html(),/Continue with Microsoft/);a.element('microsoft-login').onclick();assert.equal(a.context.sessionStorage.getItem('prm-manager-session'),'1');assert.equal(a.location.href,'manager.html#overview');
 const viaLink=environment(undefined,'#manager');assert.match(viaLink.html(),/PARTNER ACCOUNT MANAGER SIGN-IN/);viaLink.submit('welcome-login-form',{email:'riley@vendor.example',password:'x'});assert.equal(viaLink.location.href,'manager.html#overview');
 a.login();assert.match(a.html(),/class="sidebar/);
 a.run("workflow.createLead({company:'Preserved draft'})");const b=environment(a.saved(),'#deals');assert.equal(b.location.hash,'#welcome');assert.match(b.html(),/id="portal-partner"/);assert.equal(b.run('state.crm.connected'),false,'each sign-in starts at the Salesforce step');b.login();assert.equal(b.run("workflow.list('lead').filter(l=>l.company==='Preserved draft').length"),1);
 b.run('signOut()');assert.match(b.html(),/id="portal-partner"/);
});

test('email login does not store a password and connection requires explicit confirmation',()=>{
 const a=environment();a.element('portal-partner').onclick();a.submit('welcome-login-form',{email:'demo@example.com',password:'Never-store-this'});assert.equal(a.run('state.user.email'),'demo@example.com');assert.doesNotMatch(JSON.stringify(a.saved()),/Never-store-this/);assert.match(a.html(),/STEP 1 OF 2/);a.run("handleEntryAction('next');handleEntryAction('finish')");assert.equal(a.run('state.onboarding'),0);a.run("handleEntryAction('connect');closeModal();confirmSetupConnection()");assert.equal(a.run('state.crm.connected'),false);a.run("handleEntryAction('connect');confirmSetupConnection();handleEntryAction('next')");assert.match(a.html(),/STEP 2 OF 2/);assert.doesNotMatch(a.html(),/<input|<select|<form|60-Second Deal/);a.run("handleEntryAction('finish')");assert.equal(a.location.hash,'#dashboard');a.run('signOut()');assert.match(a.html(),/id="portal-partner"/);
});

test('all partner routes render with consistent headings and no vendor administration',()=>{
 const a=environment();a.login();for(const [route,title]of Object.entries({dashboard:'Your partner workspace.',leads:'My Leads',assigned:'Assigned Leads',deals:'Deal Registrations',opportunities:'CRM Opportunities',crm:'Salesforce updates',program:'My program',security:'Account & security'})){a.click({page:route});assert.match(a.html(),new RegExp('<h1>'+title.replace('&','&')+'</h1>'));assert.doesNotMatch(a.html(),/Invite member|Manage team|Approve registration|Reject registration|HubSpot|sec elapsed|id="elapsed"/)}
 a.run("go('team')");assert.equal(a.location.hash,'#program');assert.match(a.html(),/View only/);assert.doesNotMatch(a.html(),/<form/);
});

test('UI registers a lead, gets vendor approval, qualifies with BANT, converts, and closes the opportunity Won',()=>{
 const a=environment();a.login();act(a,'new-lead');a.submit('sales-record-form',leadValues);const id=a.run('detailRecord.id');assert.match(a.overlay(),/Submit for approval/);assert.equal(a.run(`getRecord('lead','${id}').status`),'Draft');
 act(a,'submit-lead','lead',id);assert.match(a.overlay(),/Syncing…/);a.sync();assert.equal(a.run(`getRecord('lead','${id}').status`),'Submitted');assert.match(a.overlay(),/Vendor review pending/);act(a,'refresh');a.sync();assert.equal(a.run(`getRecord('lead','${id}').status`),'Approved');assert.match(a.overlay(),/Protected for Acme Partners until Jan 13, 2027/);assert.match(a.overlay(),/Log first contact/);
 act(a,'first-contact','lead',id);a.submit('sales-activity-form',{type:'Call',outcome:'Connected',note:'Discovery call with the customer sponsor.'});a.sync();assert.match(a.overlay(),/Qualify lead/);
 act(a,'qualify','lead',id);assert.match(a.overlay(),/aria-label="Qualify lead"/);a.submit('sales-qualify-form',{value:'82000',budgetConfirmed:'on',decisionMaker:'Taylor Reed · Director',need:leadValues.need,needConfirmed:'on',timeline:'0–3 months'});a.sync();assert.equal(a.run(`getRecord('lead','${id}').status`),'Qualified');assert.match(a.overlay(),/Register deal/);
 a.registerDeal(id,registration);const d=a.run('detailRecord.id');assert.equal(a.location.hash,'#deals');assert.match(a.overlay(),/Review &amp; submit/);act(a,'submit-deal','deal',d);a.submit('deal-confirm-form',{confirmedNeed:'on',consent:'on'},'submit');a.sync();a.review();a.sync();a.review();a.sync();assert.match(a.overlay(),/02 · DEAL REGISTRATION/);assert.match(a.overlay(),/03 · CRM OPPORTUNITY/);assert.match(a.overlay(),/Approved/);assert.match(a.overlay(),/Discovery/);assert.doesNotMatch(a.overlay(),/>Won<\/strong>/);
 for(const stage of ['Proposal','Negotiation','Won']){act(a,'stage','deal',d);a.submit('sales-stage-form',{stage,reason:'Customer confirmed the signed agreement.',...(stage==='Won'?{wonAmount:'82000',closeDate:'2026-10-15'}:{})});a.sync();assert.equal(a.run(`getRecord('deal','${d}').stage`),stage)}
 assert.equal(a.run(`getRecord('lead','${id}').status`),'Qualified');act(a,'source-lead','deal',d);assert.equal(a.run('detailRecord.id'),id);assert.match(a.overlay(),/View deal registration · Won/);a.run("go('opportunities')");assert.match(a.html(),/Workflow Customer/);a.run("go('dashboard')");assert.equal(a.run("workflow.list('deal').filter(d=>d.stage==='Won').reduce((n,d)=>n+d.value,0)"),362000);
});

test('assigned lead UI accepts, logs contact and follow-up, qualifies, registers, then closes Lost',()=>{
 const a=environment();a.login();a.click({page:'assigned'});act(a,'open','lead','L104');assert.match(a.overlay(),/FROM CRM/);assert.match(a.overlay(),/Vendor · (NexaCloud|Vertex Software|Aster Platforms)/);assert.match(a.overlay(),/Accept by [^<]* · 48 hours left/);act(a,'accept','lead','L104');a.sync();assert.match(a.overlay(),/Log first contact/);assert.match(a.overlay(),/Make first contact by/);
 act(a,'activity','lead','L104');a.submit('sales-activity-form',{type:'Call',outcome:'Connected',note:'Customer confirmed their budget and business need.'});a.sync();assert.match(a.overlay(),/Qualify lead/);assert.match(a.overlay(),/Call · Connected/);
 act(a,'activity','lead','L104');a.element('activity-type-select').value='Follow-up';a.element('activity-type-select').onchange();assert.equal(a.element('follow-up-field').hidden,false);a.submit('sales-activity-form',{type:'Follow-up',note:'Send the proposed scope.',dueDate:'2026-10-20'});a.sync();assert.match(a.overlay(),/Due Oct 20/);const aid=a.run("getRecord('lead','L104').activities.at(-1).id");act(a,'complete','lead','L104',{activityId:aid});a.sync();assert.match(a.overlay(),/Follow-up · Completed/);
 act(a,'qualify','lead','L104');a.submit('sales-qualify-form',{value:'68000',budgetConfirmed:'on',decisionMaker:'Ava Chen · Director, Technology',need:'Replace disconnected sales processes with a shared customer workspace.',needConfirmed:'on',timeline:'3–6 months'});a.sync();assert.equal(a.run("getRecord('lead','L104').status"),'Qualified');a.registerDeal('L104',registration);const d=a.run('detailRecord.id');act(a,'submit-deal','deal',d);a.submit('deal-confirm-form',{confirmedNeed:'on',consent:'on'},'submit');a.sync();a.review();a.sync();a.review();a.sync();act(a,'stage','deal',d);a.submit('sales-stage-form',{stage:'Lost',reason:'Customer selected an alternative provider.',lostReason:'Competitor'});a.sync();assert.equal(a.run(`getRecord('deal','${d}').stage`),'Lost');assert.match(a.overlay(),/Customer selected an alternative/);
});

test('board/list, search, filters and category navigation use the same scoped records',()=>{
 const a=environment();a.login();a.click({page:'leads'});assert.equal(a.run('scopedRecords().length'),7);assert.match(a.html(),/sales-board/);a.click({salesView:'list'});assert.match(a.html(),/data-table/);a.element('sales-search').oninput({target:{value:'Beacon',selectionStart:6}});assert.match(a.html(),/1 of 7 records/);assert.doesNotMatch(a.html(),/Cedar Analytics/);a.element('sales-filter').onchange({target:{value:'Draft'}});assert.match(a.html(),/No matching records/);
 a.click({page:'assigned'});assert.match(a.html(),/Harbor Systems/);assert.doesNotMatch(a.html(),/Beacon Medical/);assert.equal(a.run('salesQuery'),'');const b=environment(a.saved());b.login();assert.equal(b.run('salesView'),'list');
});

test('form validation and unchecked permissions block submission without losing a draft',()=>{
 const a=environment();a.login();act(a,'new-lead');a.submit('sales-record-form',{...leadValues,consent:undefined});const id=a.run('detailRecord.id');act(a,'submit-lead','lead',id);assert.match(a.overlay(),/aria-label="Confirm permission"/,'missing permission is asked for, not an error');a.submit('consent-form',{});assert.match(a.element('sales-form-error').textContent,/permission/);assert.equal(a.run(`getRecord('lead','${id}').status`),'Draft');a.submit('consent-form',{consent:'on'});assert.equal(a.run(`getRecord('lead','${id}').consent`),true);a.sync();assert.equal(a.run(`getRecord('lead','${id}').status`),'Submitted');
 act(a,'edit','lead',id);a.submit('sales-record-form',{...leadValues,email:'bad email'});assert.match(a.element('sales-form-error').textContent,/valid customer email/);assert.equal(a.run(`getRecord('lead','${id}').email`),leadValues.email);
});

test('failure UI shows saved update, retains confirmed values, and offers retry and discard',()=>{
 const a=environment();a.login();a.run('workflow.failNext()');act(a,'edit','lead','L105');a.submit('sales-record-form',{...leadValues,company:'Helios Freight',contact:'Marcus Lee',email:'changed@example.com'});assert.match(a.overlay(),/View saved update/);a.sync();assert.match(a.overlay(),/Sync failed/);assert.match(a.overlay(),/Discard failed update/);assert.match(a.overlay(),/changed@example.com/);assert.notEqual(a.run("getRecord('lead','L105').email"),'changed@example.com');act(a,'retry','lead','L105');a.sync();assert.equal(a.run("getRecord('lead','L105').email"),'changed@example.com');assert.match(a.overlay(),/Salesforce confirmed/);
 a.run('workflow.failNext()');act(a,'edit','lead','L105');a.submit('sales-record-form',{...leadValues,email:'discard@example.com'});a.sync();act(a,'discard','lead','L105');assert.equal(a.run("getRecord('lead','L105').email"),'changed@example.com');
});

test('notifications link to their authorized record and mark the update as read',()=>{
 const a=environment();a.login();a.click({action:'notifications'});assert.match(a.overlay(),/New CRM lead assigned/);const n=a.run('workflow.notifications()[0].id');act(a,'notification',null,null,{notificationId:n});assert.equal(a.location.hash,'#assigned');assert.equal(a.run('detailRecord.id'),'L104');assert.equal(a.run(`workflow.notifications().find(n=>n.id==='${n}').read`),true);
});

test('private CRM data never appears in search, lists, exports, or revoked detail sheets',async()=>{
 const a=environment();a.login();a.click({action:'search'});assert.doesNotMatch(a.element('search-results').innerHTML,/Larkspur Clinics|Evergreen Systems|Harrow Aviation/);a.click({page:'assigned'});act(a,'export');const text=await a.blob().text();assert.match(text,/Harbor Systems/);assert.doesNotMatch(text,/Private customer/);
 act(a,'open','lead','L104');a.run("state.sales.crm.leads['00Q-L104'].partnerId='another-partner'");act(a,'refresh');a.sync();assert.equal(a.overlay(),'');assert.doesNotMatch(a.html(),/Harbor Systems/);
});

test('offline partner edits are saved and Retry works after connectivity returns',()=>{
 const a=environment();a.login();a.run('navigator.onLine=false');act(a,'edit','lead','L105');a.submit('sales-record-form',{...leadValues,email:'offline@example.com'});a.sync();assert.match(a.overlay(),/You are offline/);assert.notEqual(a.run("getRecord('lead','L105').email"),'offline@example.com');a.click({page:'crm'});assert.match(a.html(),/Your submitted updates/);assert.match(a.html(),/Retry saved updates/);a.run('navigator.onLine=true');act(a,'retry');a.sync();assert.equal(a.run("getRecord('lead','L105').email"),'offline@example.com');assert.match(a.html(),/All caught up/);
});

test('quick actions, Cancel, account editing, sidebar and keyboard shortcuts are connected',()=>{
 const a=environment();a.login();a.key({key:'j',metaKey:true,preventDefault(){}});assert.match(a.overlay(),/Create a lead/);a.click({action:'lead'});assert.match(a.overlay(),/sales-record-form/);a.click({action:'close'});assert.equal(a.overlay(),'');a.click({action:'register-deal'});assert.match(a.overlay(),/deal-describe-form/);assert.match(a.overlay(),/Review Deal/);a.key({key:'Escape'});assert.equal(a.overlay(),'');a.click({action:'sidebar-collapse'});assert.equal(a.run('state.sidebarCollapsed'),true);a.click({page:'security'});a.submit('profile-form',{name:'Taylor Reed',email:'taylor@partner.example'});assert.equal(a.run('state.user.name'),'Taylor Reed');a.click({toggle:'mfa'});assert.equal(a.run('state.settings.mfa'),false);a.click({action:'support'});assert.match(a.overlay(),/Three distinct records/);
});

function checkMarkup(html){
 const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'unique IDs');for(const m of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g))assert.ok(ids.includes(m[1]),'label target '+m[1]);
 const stack=[],voids=new Set(['input','img','br','hr','meta','link','source','area','base','embed','wbr','col','param','track']);for(const m of html.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)){const tag=m[1],text=m[0];if(voids.has(tag)||text.endsWith('/>'))continue;if(text.startsWith('</'))assert.equal(stack.pop(),tag,'balanced '+tag);else{if(tag==='button')assert.ok(!stack.includes('button'),'no nested buttons');stack.push(tag)}}assert.deepEqual(stack,[]);
}
test('all views and action forms render balanced markup, unique IDs and bound labels',()=>{
 const a=environment();checkMarkup(a.html());a.login();for(const page of ['dashboard','leads','assigned','deals','opportunities','crm','program','security']){a.click({page});checkMarkup(a.html());if(['leads','assigned','deals','opportunities'].includes(page)){a.click({salesView:'list'});checkMarkup(a.html());a.click({salesView:'board'});}}
 for(const code of ["openSalesRecord('lead','L101')","openSalesRecord('lead','L104')","openSalesRecord('lead','L105')","openSalesRecord('lead','L110')","openSalesRecord('lead','L103')","openSalesRecord('deal','D103')","salesForm('lead')","salesForm('lead','L103')","salesForm('lead','L110')","salesForm('deal','D103')","dealWizard()","dealWizard('L103')","activityModal('lead','L105')","activityModal('lead','L110','first-contact')","qualifyModal('L105')","qualifyModal('L110')","stageModal('D103')","declineModal('L104')","notifications()","journeyHelp()","startQuick()"]){a.run(code);checkMarkup(a.overlay())}
 a.run('dealWizard()');a.submit('deal-describe-form',{story:'Dana Lee (dana@brightpath.example) at BrightPath Logistics wants Sales Cloud, about $180K, signing by March 31.'},'extract');checkMarkup(a.overlay());a.submit('deal-review-form',{},'continue');checkMarkup(a.overlay());
});


test('partner portal exposes no CRM configuration, failure controls, team or approval administration',()=>{
 const a=environment();a.login();for(const page of ['dashboard','leads','assigned','deals','crm','program','security']){a.click({page});assert.doesNotMatch(a.html(),/data-sales-action="(?:connect|disconnect|fail-next|approve|reject)"|Invite member|Manage team|Test next sync failure|About this simulation/)}a.click({page:'crm'});assert.match(a.html(),/Your submitted updates/);assert.match(a.html(),/Your vendor manages CRM configuration/);
});


test('sidebar has Leads, Deal Registrations, and CRM Opportunities; lead pages keep their two tabs',()=>{
 const a=environment();a.login();
 for(const [route,active] of [['leads','leads'],['assigned','leads'],['deals','deals'],['opportunities','opportunities']]){
  a.click({page:route});const sidebar=a.html().match(/<aside class="sidebar[\s\S]*?<\/aside>/)[0];
  for(const p of ['leads','deals','opportunities'])assert.match(sidebar,new RegExp('data-page="'+p+'"'));assert.match(sidebar,new RegExp('data-page="'+active+'"[^>]+class="active"'));
  if(active==='leads'){assert.match(a.html(),/sales-category-tabs/);assert.match(a.html(),/data-scope="crm"/);}else assert.doesNotMatch(a.html(),/sales-category-tabs/);
 }
});

test('Draft column displays two cards and View all exposes the complete list',()=>{
 const a=environment();a.login();a.run("for(let i=0;i<4;i++)workflow.createLead({company:'Draft company '+i})");a.click({page:'leads'});const draftColumn=a.html().match(/<section class="lead-column"[\s\S]*?<\/section>/)[0];assert.equal((draftColumn.match(/class="card lead-card sales-card"/g)||[]).length,2);assert.match(draftColumn,/Showing 2 of 8 new leads/);act(a,'all-drafts');assert.equal(a.run('salesView'),'list');assert.equal(a.run('salesFilter'),'Draft');assert.match(a.html(),/8 of 11 records/);assert.match(a.html(),/Cedar Analytics/);for(let i=0;i<4;i++)assert.match(a.html(),new RegExp('Draft company '+i));
});

test('sign-in offers Google, Microsoft, and SSO, and each starts the same onboarding',()=>{
 for(const provider of ['google-login','microsoft-login','sso-login']){const a=environment();a.element('portal-partner').onclick();assert.match(a.html(),/Continue with Google/);assert.match(a.html(),/Continue with Microsoft/);assert.match(a.html(),/Continue with SSO/);a.element(provider).onclick();assert.match(a.html(),/STEP 1 OF 2/);assert.match(a.html(),/Connect Salesforce/);}
});

test('Connect later skips Salesforce without blocking program and dashboard access',()=>{
 const a=environment();a.run('beginOnboarding()');assert.match(a.html(),/Connect later/);a.run("handleEntryAction('skip')");assert.equal(a.run('state.crm.connected'),false);assert.match(a.html(),/Connect CRM · Skipped/);assert.match(a.html(),/STEP 2 OF 2/);a.run("handleEntryAction('finish')");assert.equal(a.location.hash,'#dashboard');assert.equal(a.run('state.onboarding'),3);assert.doesNotMatch(a.html(),/Salesforce simulation · Changes stay on this device|Salesforce is not connected/);a.click({page:'leads'});assert.match(a.html(),/My Leads/);
});

test('skipped connection keeps submissions queued without redirecting, and connecting later sends them',()=>{
 const a=environment();a.run("beginOnboarding();handleEntryAction('skip');handleEntryAction('finish')");a.click({page:'leads'});act(a,'new-lead');a.submit('sales-record-form',leadValues);const id=a.run('detailRecord.id');act(a,'submit-lead','lead',id);assert.equal(a.location.hash,'#leads','never redirected to Salesforce updates');assert.equal(a.run(`getRecord('lead','${id}').status`),'Draft');assert.equal(a.run(`getRecord('lead','${id}').sync.status`),'pending');assert.match(a.html(),/Salesforce not connected · 1 update waiting/);
 a.click({page:'crm'});assert.match(a.html(),/Connect Salesforce/);act(a,'connect-salesforce');a.click({action:'close'});a.run('confirmSetupConnection()');assert.equal(a.run('state.crm.connected'),false);act(a,'connect-salesforce');a.element('confirm-setup-connection').onclick();assert.equal(a.run('state.crm.connected'),true);assert.equal(a.run('state.onboarding'),3);a.sync();assert.equal(a.run(`getRecord('lead','${id}').status`),'Submitted');assert.equal(a.location.hash,'#crm');assert.match(a.html(),/Salesforce synced/);
});

test('skip remains intentional through back navigation and resets with a new sign-in',()=>{
 const a=environment();a.run("beginOnboarding();handleEntryAction('skip');handleEntryAction('back')");assert.match(a.html(),/STEP 1 OF 2/);a.run("handleEntryAction('skip');handleEntryAction('finish');signOut();beginOnboarding();handleEntryAction('finish')");assert.equal(a.run('state.crmSkipped'),false);assert.equal(a.run('state.onboarding'),0);assert.match(a.html(),/STEP 1 OF 2/);
});

test('every sign-in shows the Salesforce step with Connect Salesforce and Connect later',()=>{
 const a=environment();a.login();a.run('signOut()');a.run('beginOnboarding()');assert.match(a.html(),/STEP 1 OF 2/);assert.match(a.html(),/data-entry="connect"/);assert.match(a.html(),/Connect Salesforce/);assert.match(a.html(),/data-entry="skip"/);assert.match(a.html(),/Connect later/);
 a.run("handleEntryAction('connect');confirmSetupConnection();handleEntryAction('next');handleEntryAction('finish')");assert.equal(a.location.hash,'#dashboard');assert.match(a.html(),/sync-status ok/);
 a.run('workflow.failNext()');act(a,'edit','lead','L105');a.submit('sales-record-form',{...leadValues,company:'Helios Freight',contact:'Marcus Lee'});a.sync();assert.match(a.html(),/Salesforce sync failed · retry/);assert.notEqual(a.location.hash,'#crm');
});

test('dashboard keeps the journey hero, next moves without timings, stats, and attention list',()=>{
 const a=environment();a.login();a.run("go('dashboard')");const html=a.html();
 assert.match(html,/<h1>Your partner workspace\.<\/h1>/);assert.match(html,/class="hero"/);assert.match(html,/A clear path/);assert.match(html,/Your next moves/);
 for(const label of ['My Leads','Assigned Leads','CRM Opportunities','Total Leads','New Leads','Qualified Leads','Active Deals','Pending Registrations','Pending Actions','Recent Activities','Needs your attention'])assert.match(html,new RegExp(label));
 assert.doesNotMatch(html,/hero-minute|\d+ sec\b|SECONDS/);
 a.click({action:'my-deals'});assert.equal(a.location.hash,'#opportunities');
});

test('Submit for approval shows a short vendor review, then moves the lead to its next step',()=>{
 const a=environment();a.login();act(a,'new-lead');a.submit('sales-record-form',leadValues);const id=a.run('detailRecord.id');
 act(a,'submit-lead','lead',id);assert.match(a.overlay(),/btn btn-primary is-loading" disabled aria-busy="true"><span class="sales-spinner" aria-hidden="true"><\/span>Processing submission…/);a.sync();assert.equal(a.run(`getRecord('lead','${id}').status`),'Submitted');assert.match(a.overlay(),/Processing submission…/);
 assert.ok(a.run('reviewTimer'),'the vendor review is scheduled');a.review();a.sync();
 assert.equal(a.run(`getRecord('lead','${id}').status`),'Approved');assert.match(a.overlay(),/Log first contact/);assert.match(a.element('toast').textContent,/Lead approved by vendor · Workflow Customer · Approved\. Next: Log first contact\./);
 a.run("state.sales.crm.reviewMode='manual'");act(a,'new-lead');a.submit('sales-record-form',{...leadValues,company:'Manual Review Co',email:'pat@manualreview.example'});const m=a.run('detailRecord.id');act(a,'submit-lead','lead',m);a.sync();assert.match(a.overlay(),/Check approval status/,'manual review waits for the partner manager');
});

test('Deal Registrations and CRM Opportunities are separate lists of the same journey',()=>{
 const a=environment();a.login();a.click({page:'deals'});a.click({salesView:'list'});const regs=a.html();assert.match(regs,/In Review/);
 a.click({page:'opportunities'});const opps=a.run('scopedRecords().map(d=>d.id).sort().join()');assert.equal(opps,a.run("workflow.list('deal').filter(d=>d.registration==='Approved'&&d.opportunityId).map(d=>d.id).sort().join()"));assert.ok(!opps.includes('D102'),'pending registrations are not opportunities yet');
 assert.match(a.html(),/Proposal|Discovery/);act(a,'open','deal','D103');assert.match(a.overlay(),/CRM opportunity/);assert.match(a.overlay(),/03 · CRM OPPORTUNITY/);
});

test('Submit for approval on a Draft card runs from the card, shows the review, and moves the lead on',()=>{
 const a=environment();a.login();a.click({page:'leads'});
 assert.match(a.html(),/data-sales-action="submit-lead" data-sales-type="lead" data-sales-id="L101" data-card="1"/);
 a.click({salesAction:'submit-lead',salesType:'lead',salesId:'L101',card:'1'});assert.equal(a.overlay(),'','stays on the board');assert.equal(a.location.hash,'#leads');assert.match(a.html(),/lead-next-action is-loading" disabled aria-busy="true"><span class="sales-spinner" aria-hidden="true"><\/span>Processing submission…/);
 a.sync();assert.equal(a.run("getRecord('lead','L101').status"),'Submitted');assert.equal(a.overlay(),'');assert.equal(a.run("recordAction(getRecord('lead','L101'),'lead').label"),'Processing submission');
 a.review();a.sync();assert.equal(a.run("getRecord('lead','L101').status"),'Approved');assert.equal(a.overlay(),'');assert.match(a.element('toast').textContent,/Lead approved by vendor · Cedar Analytics · Approved\. Next: Log first contact\./);
 assert.equal(a.run("recordAction(getRecord('lead','L101'),'lead').action"),'first-contact');
 // A step that needs a dialog opens it from the card and comes back to the board.
 a.click({salesAction:'first-contact',salesType:'lead',salesId:'L101',card:'1'});assert.match(a.overlay(),/sales-activity-form/);
 a.submit('sales-activity-form',{type:'Call',outcome:'Connected',note:'Intro call with the sponsor.'});assert.equal(a.overlay(),'');assert.equal(a.location.hash,'#leads');
 a.click({salesAction:'qualify',salesType:'lead',salesId:'L101',card:'1'});assert.match(a.overlay(),/sales-qualify-form/);a.click({salesAction:'open',salesType:'lead',salesId:'L101'});assert.equal(a.overlay(),'','Cancel closes the dialog');
});
