/* Local Salesforce simulator. Canonical CRM records, durable outbox, partner-scoped access. */
(function(root){
'use strict';
const copy=v=>JSON.parse(JSON.stringify(v));
const LEAD_STAGES=['Draft','Submitted','Needs information','Rejected','Approved','Assigned','Accepted','Working','Qualified','Declined','Closed'];
const REG_STAGES=['Draft','Submitted','Pending review','Approved','Rejected','Expired','Withdrawn'];
const OPP_STAGES=['Discovery','Proposal','Negotiation','Won','Lost'];
const CLOSE_REASONS=['No budget','No decision maker access','Not interested','No response','Bad timing','Chose a competitor','Duplicate','Other'];
const LEGACY_CLOSE_REASONS=['Customer not interested','Bought elsewhere'];
const DECLINE_REASONS=['Outside our territory','No capacity right now','Not our specialty','Existing relationship conflict','Other'];
const LOST_REASONS=['Price','Competitor','No budget','No decision','Timing','Other'];
const QUALIFIED_FIELDS=['company','email','region','value','need'];
const PRODUCTS=['Sales Cloud','Service Cloud','Platform'];
const REGIONS=['North America','Europe','Asia Pacific','Other'];
const clean=v=>String(v??'').trim();
const LEAD_PRODUCTS=['Not sure yet',...PRODUCTS];
const INDUSTRIES=['Technology','Healthcare','Financial services','Manufacturing','Retail','Logistics','Education','Public sector','Other'];
const COMPANY_SIZES=['1–50','51–200','201–1,000','1,001–5,000','5,000+'];
const TIMELINES=['0–3 months','3–6 months','6–12 months','12+ months','Not sure yet'];
const RATINGS=['Hot','Warm','Cold'];
const LEAD_SOURCES=['Partner referral','Existing customer','Event','Website enquiry','Outbound prospecting','Other'];
const CONTACT_TYPES=['Call','Email','Meeting'];
const CONTACT_OUTCOMES=['Connected','Left a message','No response'];
// Program rules: vendor leads are accepted within 48 hours and contacted within 3 days; approved registrations are protected for 90 days.
const ACCEPT_HOURS=48,CONTACT_DAYS=3,PROTECTION_DAYS=90;
const LEAD_LABELS={Submitted:'Pending approval',Assigned:'New assignment',Converted:'Deal registered'};
const leadLabel=status=>LEAD_LABELS[status]||status;
const LEAD_DEFAULTS={phone:'',website:'',industry:'',employees:'',product:'Not sure yet',rating:'Warm',timeline:'Not sure yet',decisionMaker:'',budgetConfirmed:false,needConfirmed:false};
const addDays=(iso,days)=>new Date(Date.parse(iso)+days*864e5).toISOString();
// BANT: budget, authority (decision maker), need, and a purchase timeline within 12 months.
function bant(r){const checks={budget:r.budgetConfirmed===true&&Number(r.value)>0,authority:clean(r.decisionMaker).length>=3,need:r.needConfirmed===true&&clean(r.need).length>=10,timeline:TIMELINES.slice(0,3).includes(r.timeline)};return {...checks,count:Object.values(checks).filter(Boolean).length};}
// Vendor side: partner organizations and the decisions a partner account manager can make.
const PARTNERS=[{id:'partner-acme',name:'Acme Partners'},{id:'another-partner',name:'Northbridge Consulting'},{id:'partner-cobalt',name:'Cobalt Systems'}];
const REJECT_REASONS=['Duplicate','Outside territory','Not a fit for the program','Other'];
const REJECT_TEXT={Duplicate:'This customer is already registered in vendor Salesforce. If this is a separate opportunity, contact your partner account manager.','Outside territory':'This customer is outside your program territory. Contact your partner account manager about other options.','Not a fit for the program':'This opportunity isn’t a fit for the partner program.',Other:''};
function deadlineFor(r,nowIso){
 const now=Date.parse(nowIso),span=(due,kind)=>{const left=due-now;return {kind,due:new Date(due).toISOString(),overdue:left<0,hoursLeft:Math.max(0,Math.ceil(left/36e5)),daysLeft:Math.max(0,Math.floor(left/864e5))};};
 if(r.origin==='crm'&&r.status==='Assigned'&&r.assignedAt)return span(Date.parse(r.assignedAt)+ACCEPT_HOURS*36e5,'accept');
 if(r.origin==='crm'&&r.status==='Accepted'&&r.acceptedAt)return span(Date.parse(r.acceptedAt)+CONTACT_DAYS*864e5,'contact');
 if(r.protectedUntil&&['Approved','Working','Qualified'].includes(r.status))return span(Date.parse(r.protectedUntil+'T23:59:59Z'),'protection');
 return null;
}
// Registration checks across every partner's records. An exact, active match blocks approval;
// similar names, shared email domains, and a partner's own open opportunity are flagged for judgement.
function leadChecks(crm,remote){
 const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]/g,''),company=norm(remote.company),domain=clean(remote.email).toLowerCase().split('@')[1]||'',generic=['gmail.com','outlook.com','yahoo.com','hotmail.com','icloud.com'];
 const similar=other=>{const name=norm(other.company);return name===company?'Same company':name.length>=5&&company.length>=5&&(name.includes(company)||company.includes(name))?'Similar name':domain&&!generic.includes(domain)&&clean(other.email).toLowerCase().endsWith('@'+domain)?'Same email domain':'';};
 const matches=[];
 for(const l of Object.values(crm.leads))if(l.crmId!==remote.crmId){const match=similar(l);if(match)matches.push({kind:'Lead',id:l.crmId,company:l.company,partnerId:l.partnerId,stage:l.status,match,active:!['Closed','Rejected','Declined'].includes(l.status)});}
 for(const o of Object.values(crm.opportunities)){const match=similar(o);if(match)matches.push({kind:'Opportunity',id:o.id,company:o.company,partnerId:o.partnerId,stage:o.stage,match,active:!['Won','Lost'].includes(o.stage)});}
 const blocking=matches.filter(m=>m.match==='Same company'&&m.active&&(m.kind==='Lead'||m.partnerId!==remote.partnerId)),flagged=matches.some(m=>m.active&&!blocking.includes(m));
 const contact=!!clean(remote.contact)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(remote.email||''),need=clean(remote.need).length>=20;
 const items=[
  {id:'duplicate',ok:!blocking.length,warn:!blocking.length&&flagged,label:blocking.length?'Already registered in Salesforce':flagged?'Similar records found — check before approving':'No duplicate records'},
  {id:'territory',ok:remote.region!=='Other',label:remote.region!=='Other'?'In program territory · '+remote.region:'Outside program territory'},
  {id:'contact',ok:contact,label:contact?'Contact name and email complete':'Contact name or email missing'},
  {id:'need',ok:need,label:need?'Customer need described':'Customer need is too thin (under 20 characters)'},
  {id:'consent',ok:remote.consent===true,label:remote.consent===true?'Permission to share confirmed':'No permission to share customer details'}];
 return {items,matches,blocking,recommendation:!items[1].ok||blocking.length?'Reject':items.every(i=>i.ok)?'Approve':'Return for information'};
}
const REG_REJECT_REASONS=['Conflicts with an existing registration','Outside territory','Not enough customer evidence','Customer not eligible','Other'];
const REG_REJECT_TEXT={'Conflicts with an existing registration':'An active registration already covers this customer and product.','Outside territory':'This customer is outside your program territory.','Not enough customer evidence':'Add evidence of the customer’s need and buying intent, then revise and resubmit.','Customer not eligible':'This customer isn’t eligible for partner deal registration.',Other:''};
// Approving a deal registration creates the CRM opportunity, or links the partner's own open one, and protects the deal for 90 days.
function approveRegistration(crm,remote,now,nextOpportunityId,note=''){
 const conflict=Object.values(crm.opportunities).find(o=>key(o.company,o.product)===key(remote.company,remote.product)&&!['Won','Lost'].includes(o.stage));
 if(conflict&&(conflict.partnerId!==remote.partnerId||conflict.registrationId&&conflict.registrationId!==remote.crmId)){Object.assign(remote,{registration:'Rejected',rejectReason:'Conflicts with an existing registration',reason:'An active registration already covers this customer and product. Ask the vendor to resolve the conflict.'});return false;}
 Object.assign(remote,{registration:'Approved',reason:'Eligibility and duplicate checks passed.'+(clean(note)?' Note from your partner account manager: '+clean(note):''),approvedAt:now,updatedAt:now,protectedUntil:addDays(now,PROTECTION_DAYS).slice(0,10),opportunityId:conflict?.id||nextOpportunityId(),stage:conflict?.stage||'Discovery'});
 if(conflict){remote.value=conflict.value??remote.value;remote.expectedClose=conflict.expectedClose||remote.expectedClose;}
 crm.opportunities[remote.opportunityId]={...copy(remote),id:remote.opportunityId,registrationId:remote.crmId};
 return true;
}
// What a partner account manager checks before approving a deal registration.
function registrationChecks(crm,d){
 const lead=d.leadId?Object.values(crm.leads).find(l=>l.id===d.leadId):null,same=x=>key(x.company,x.product)===key(d.company,d.product),usd='$'+Number(d.value||0).toLocaleString('en-US');
 const conflicts=[...Object.values(crm.registrations).filter(x=>x.crmId!==d.crmId&&!['Rejected','Withdrawn'].includes(x.registration)&&same(x)).map(x=>({kind:'Deal registration',company:x.company,product:x.product,partnerId:x.partnerId,stage:x.registration})),...Object.values(crm.opportunities).filter(o=>!['Won','Lost'].includes(o.stage)&&same(o)&&(o.partnerId!==d.partnerId||o.registrationId&&o.registrationId!==d.crmId)).map(o=>({kind:'CRM opportunity',company:o.company,product:o.product,partnerId:o.partnerId,stage:o.stage}))];
 const linkable=Object.values(crm.opportunities).find(o=>!['Won','Lost'].includes(o.stage)&&same(o)&&o.partnerId===d.partnerId&&!o.registrationId);
 const items=[
  {id:'evidence',ok:lead?lead.status==='Qualified':d.confirmedNeed===true,label:lead?(lead.status==='Qualified'?'From qualified lead '+lead.id+' · BANT '+bant(lead).count+' of 4':'Linked lead '+lead.id+' is not qualified'):d.confirmedNeed===true?'Direct registration · partner confirmed the customer need':'Customer need not confirmed'},
  {id:'conflict',ok:!conflicts.length,warn:!conflicts.length&&!!linkable,label:conflicts.length?'Conflicts with an existing registration or opportunity':linkable?'Links the partner’s existing open opportunity '+linkable.id:'No conflicting registrations or opportunities'},
  {id:'territory',ok:d.region!=='Other',label:d.region!=='Other'?'In program territory · '+d.region:'Outside program territory'},
  {id:'size',ok:true,warn:Number(d.value)>=250000,label:Number(d.value)>=250000?'Large deal ('+usd+') · check commercial terms':'Standard deal size ('+usd+')'},
  {id:'close',ok:validDate(d.expectedClose),label:validDate(d.expectedClose)?'Expected close '+d.expectedClose:'No valid expected close date'}];
 return {items,conflicts,linkable,recommendation:items.some(i=>!i.ok)?'Reject':'Approve'};
}
function approveLead(remote,now,note=''){Object.assign(remote,{status:'Approved',approvedAt:now,updatedAt:now,protectedUntil:addDays(now,PROTECTION_DAYS).slice(0,10),reviewReason:'Approved. No other partner has registered this customer, so it is yours to pursue for '+PROTECTION_DAYS+' days.'+(clean(note)?' Note from your partner account manager: '+clean(note):'')});}
function rejectLead(remote,reason,note=''){Object.assign(remote,{status:'Rejected',rejectReason:reason,closedFrom:'Submitted',reviewReason:[REJECT_TEXT[reason],clean(note)].filter(Boolean).join(' ')});}
function bantMissing(r){const checks=bant(r);return [['budget','budget'],['authority','the decision maker'],['need','the customer need'],['timeline','a purchase timeline within 12 months']].filter(([k])=>!checks[k]).map(([,label])=>label);}
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const key=(company,product)=>clean(company).toLowerCase().replace(/[^a-z0-9]/g,'')+'|'+product;
class WorkflowError extends Error { constructor(message,code='VALIDATION'){super(message);this.code=code;} }
function compactSamples(state){
 const s=state.sales;if(s.compactSamplesVersion===1)return;
 const linked=s.deals.find(d=>d.id==='D101');
 const candidates=['L107',...(!linked||linked.sample&&linked.history.length===1?['L106']:[])];
 const retired=s.leads.filter(r=>candidates.includes(r.id)&&r.sample&&r.history.length===1);
 const retireDeal=retired.some(r=>r.id==='L106')&&linked;
 s.retiredSamples=[...retired,...(retireDeal?[linked]:[])];
 s.leads=s.leads.filter(r=>!retired.includes(r));
 for(const r of retired)if(r.crmId)delete s.crm.leads[r.crmId];
 if(retireDeal){s.deals=s.deals.filter(r=>r!==linked);delete s.crm.registrations[linked.crmId];delete s.crm.opportunities[linked.opportunityId];}
 s.crm.jobs=s.crm.jobs.filter(j=>s.crm.leads[j.crmId]||s.crm.registrations[j.crmId]);
 s.compactSamplesVersion=1;
}
// Restore the Submitted example once for browsers that previously retired it.
function restoreSubmittedSample(state){
 const s=state.sales;if(s.submittedSampleVersion===1)return;
 const sample=(s.retiredSamples||[]).find(r=>r.id==='L102'&&r.sample&&r.status==='Submitted'&&r.partnerId===s.partnerId);
 if(sample&&!s.leads.some(r=>r.id===sample.id)&&!s.leads.some(r=>r.partnerId===s.partnerId&&r.origin==='partner'&&r.status==='Submitted')){
  s.leads.push(copy(sample));s.crm.leads[sample.crmId]=copy(sample);
  s.retiredSamples=s.retiredSamples.filter(r=>r!==sample);
  if(!s.crm.jobs.some(j=>j.kind==='qualify'&&j.crmId===sample.crmId))s.crm.jobs.push({kind:'qualify',crmId:sample.crmId,due:s.crm.tick+1});
 }
 s.submittedSampleVersion=1;
}
// Populate New once, preserving existing partner drafts and later workflow progress.
function addNewSamples(state){
 const s=state.sales;if(s.newSamplesVersion===1)return;
 let count=s.leads.filter(r=>r.partnerId===s.partnerId&&r.origin==='partner'&&r.status==='Draft').length;
 const now=new Date().toISOString(),examples=[['L108','Solstice Data','Maya Patel',62000],['L109','Lumen Works','Daniel Park',48000]];
 for(const [id,company,contact,value]of examples){
  if(count>=2)break;if(s.leads.some(r=>r.id===id))continue;
  s.leads.push({id,partnerId:s.partnerId,company,contact,email:contact.toLowerCase().replace(/\s+/g,'.')+'@'+company.toLowerCase().replace(/\s+/g,'')+'.example',jobTitle:'Director, Operations',...LEAD_DEFAULTS,origin:'partner',status:'Draft',value,source:'Partner referral',receivedFrom:'Partner referral',region:'North America',need:'Bring regional customer data and sales reporting into one shared workspace.',consent:true,createdAt:now,updatedAt:now,crmId:null,nextStep:'',activities:[],history:[{time:now,title:'Lead created',detail:'Customer details are ready to review and submit.',actor:'Partner'}],sync:{status:'local'},sample:true});count++;
 }
 s.newSamplesVersion=1;
}
// Replace retired demo-company references in saved records without resetting their journey.
function replaceRetiredCompany(state){
 const retired=/\bred[\s-]*blink(?:[\s-]*technolog(?:y|ies))?\b/i,affected=new Set();
 const matches=value=>typeof (value.company||value.name)==='string'&&retired.test(value.company||value.name);
 function collect(value){if(!value||typeof value!=='object')return;if(matches(value)&&value.id)affected.add(value.id);for(const item of Object.values(value))if(item&&typeof item==='object')collect(item);}
 function replace(value,inherited=false){
  if(!value||typeof value!=='object')return;
  const related=inherited||matches(value)||affected.has(value.id)||affected.has(value.recordId);
  if(related){
   if(Object.hasOwn(value,'contact'))value.contact='Jordan Ellis';
   if(Object.hasOwn(value,'email'))value.email='jordan.ellis@willowbrook.example';
   if(Object.hasOwn(value,'jobTitle'))value.jobTitle='Director, Operations';
  }
  for(const [field,item]of Object.entries(value)){
   if(/^(?:id|.*Id)$/.test(field))continue;
   if(typeof item==='string')value[field]=item.replace(/\b(?:www\.)?redblink[a-z0-9-]*\.[a-z.]+\b/gi,'willowbrook.example').replace(/\bred[\s-]*blink(?:[\s-]*technolog(?:y|ies))?\b/gi,'Willowbrook Systems');
   else replace(item,related);
  }
 }
 collect(state);replace(state);
}
// Move saved leads to the partner-qualified flow once. Every record and its history is kept.
function upgradeLeadFlow(state){
 const s=state.sales;if(s.leadFlowVersion===1)return;
 const now=new Date().toISOString(),records=[...s.leads,...Object.values(s.crm.leads),...(s.retiredSamples||[]).filter(r=>r.origin)];
 for(const r of records){
  if(['Contacted','Qualification requested'].includes(r.status)||r.origin==='crm'&&r.status==='Needs information')r.status='Working';
  if(r.status==='Disqualified')Object.assign(r,{status:'Rejected',rejectReason:'Outside territory',closedFrom:'Submitted'});
  if(r.origin==='crm'&&!r.assignedAt)r.assignedAt=r.createdAt||now;
  if(r.status==='Working'&&!r.workingAt)r.workingAt=r.updatedAt||now;
  if(r.status==='Qualified'&&!r.sample&&!r.decisionMaker)r.legacyQualified=true;
 }
 // Partners now qualify with BANT, so queued vendor qualification requests are retired.
 for(const op of s.outbox)if(op.type==='lead'&&op.action==='qualify'&&['pending','failed'].includes(op.state)){op.state='cancelled';const r=s.leads.find(l=>l.id===op.recordId);if(r?.sync.operationId===op.id){r.sync={status:r.crmId?'synced':'local'};r.history.push({time:now,title:'Qualification request retired',detail:'You now qualify leads yourself with the BANT checklist. Open the lead and select Qualify lead.',actor:'System'});}}
 s.crm.jobs=s.crm.jobs.filter(j=>j.kind==='registration'||s.crm.leads[j.crmId]?.status==='Submitted');
 const demo={L101:{product:'Sales Cloud',industry:'Technology',employees:'201–1,000',timeline:'3–6 months'},L102:{product:'Platform',industry:'Logistics',employees:'1,001–5,000',timeline:'3–6 months'},L103:{product:'Sales Cloud',industry:'Healthcare',employees:'1,001–5,000',rating:'Hot',timeline:'0–3 months',decisionMaker:'Olivia Grant · Director, Technology',budgetConfirmed:true,needConfirmed:true},L104:{product:'Service Cloud',industry:'Logistics',employees:'201–1,000'},L105:{product:'Sales Cloud',industry:'Logistics',employees:'1,001–5,000',rating:'Hot',budgetConfirmed:true,needConfirmed:true},L108:{product:'Platform',industry:'Technology',employees:'51–200'},L109:{product:'Sales Cloud',industry:'Retail',employees:'51–200',rating:'Cold'}};
 for(const r of records)if(r.sample&&demo[r.id])for(const [field,value]of Object.entries(demo[r.id]))if(r[field]===undefined||r[field]===''||r[field]===false||field==='rating'&&r[field]==='Warm'||field==='product'&&r[field]==='Not sure yet')r[field]=value;
 // One approved example so the partner path can be followed end to end.
 if(!s.leads.some(r=>r.id==='L110')&&!(s.retiredSamples||[]).some(r=>r.id==='L110')){
  const approvedAt=addDays(now,-1),sample={id:'L110',partnerId:s.partnerId,company:'Kestrel Robotics',contact:'Priya Nair',email:'priya.nair@kestrelrobotics.example',jobTitle:'VP, Operations',...LEAD_DEFAULTS,phone:'+1 415 555 0142',website:'kestrelrobotics.example',industry:'Manufacturing',employees:'201–1,000',product:'Service Cloud',rating:'Hot',timeline:'3–6 months',origin:'partner',status:'Approved',value:120000,source:'Event',receivedFrom:'Event',region:'North America',need:'Unify field-service scheduling and customer support cases across three plants.',consent:true,createdAt:addDays(now,-3),updatedAt:approvedAt,approvedAt,protectedUntil:addDays(approvedAt,PROTECTION_DAYS).slice(0,10),reviewReason:'Approved. No other partner has registered this customer, so it is yours to pursue for '+PROTECTION_DAYS+' days.',crmId:'00Q-L110',nextStep:'',activities:[],history:[{time:addDays(now,-3),title:'Lead created',detail:'Met the operations team at a regional manufacturing event.',actor:'Partner'},{time:addDays(now,-2),title:'Submitted for vendor approval',detail:'Customer details and sharing permission sent to vendor Salesforce.',actor:'Partner'},{time:approvedAt,title:'Lead approved by vendor',detail:'No conflicting registration found. Protected for '+PROTECTION_DAYS+' days.',actor:'Salesforce (simulated)'}],sync:{status:'synced'},sample:true};
  s.leads.push(sample);s.crm.leads[sample.crmId]=copy(sample);
 }
 s.leadFlowVersion=1;
}
// Every lead carries the same optional fields, so later edits only send real changes.
function normalizeLeads(state){const s=state.sales;for(const r of [...s.leads,...Object.values(s.crm.leads)])for(const [field,value]of Object.entries(LEAD_DEFAULTS))if(!Object.hasOwn(r,field))r[field]=value;}
// The rest of the partner program as the vendor sees it: records of the other partners, added once.
// Partner portals never show them, because every partner view is scoped to the signed-in partner.
function addVendorDemo(state){
 const crm=state.sales.crm;if(crm.vendorDemo)return;crm.vendorDemo=1;
 const at=days=>new Date(Date.now()-days*864e5).toISOString(),on=days=>at(-days).slice(0,10);
 const hidden=crm.leads['00Q-private'];
 if(hidden?.company==='Private customer')Object.assign(hidden,{company:'Larkspur Clinics',contact:'Noah Fischer',email:'noah.fischer@larkspurclinics.example',jobTitle:'Head of Operations',region:'Europe',product:'Service Cloud',value:120000,source:'Vendor webinar',status:'Working',assignedAt:at(9),acceptedAt:at(8),createdAt:at(9),updatedAt:at(3),need:'Bring patient enquiries from six clinics into one service workspace.',activities:[{id:'A-LC1',type:'Meeting',outcome:'Connected',note:'Discovery workshop with the operations team.',time:at(3),synced:true}]});
 const lead=(id,partnerId,company,contact,origin,status,value,product,region,days,extra={})=>{
  const email=contact.toLowerCase().replace(/[^a-z ]/g,'').replace(/\s+/g,'.')+'@'+company.toLowerCase().replace(/[^a-z]/g,'')+'.example';
  const r={id,crmId:'00Q-'+id,partnerId,company,contact,email,jobTitle:'Director, Operations',...LEAD_DEFAULTS,product,origin,status,value,region,source:origin==='crm'?'Vendor campaign':'Partner referral',receivedFrom:origin==='crm'?'Vendor · Salesforce':'Partner referral',need:'Replace disconnected customer processes with one shared workspace.',consent:true,createdAt:at(days),updatedAt:at(Math.max(0,days-6)),activities:[],history:[],...extra};
  if(origin==='partner'&&status!=='Submitted'){r.submittedAt=at(days);r.approvedAt=at(days-1);r.protectedUntil=on(90-days+1);}
  if(origin==='crm'){r.assignedAt=at(days);if(status!=='Assigned')r.acceptedAt=at(days-1);}
  crm.leads[r.crmId]=r;return r;
 };
 const qualified={budgetConfirmed:true,needConfirmed:true,decisionMaker:'Chief Operating Officer',timeline:'3–6 months'};
 const call=(id,days,note)=>({id,type:'Call',outcome:'Connected',note,time:at(days),synced:true});
 const deal=(id,partnerId,l,company,contact,name,product,value,stage,days,extra={})=>{
  const email=l?.email||contact.toLowerCase().replace(/[^a-z ]/g,'').replace(/\s+/g,'.')+'@'+company.toLowerCase().replace(/[^a-z]/g,'')+'.example';
  const d={id,crmId:'REG-'+id,partnerId,leadId:l?.id||null,company,contact,email,region:l?.region||'Europe',name,product,value,expectedClose:on(45),need:l?.need||'Standardize the sales process across regional teams.',consent:true,confirmedNeed:true,registration:'Approved',stage,opportunityId:'006-'+id,submittedAt:at(days),approvedAt:at(days-1),protectedUntil:on(90-days+1),reason:'Eligibility and duplicate checks passed.',createdAt:at(days),updatedAt:at(Math.max(0,days-8)),activities:[],history:[],...extra};
  if(l)l.dealId=id;
  crm.registrations[d.crmId]=d;crm.opportunities[d.opportunityId]={...copy(d),id:d.opportunityId,registrationId:d.crmId};return d;
 };
 // Northbridge Consulting: a large systems integrator in Europe.
 lead('N201','another-partner','Harrow Aviation','Sofia Romano','partner','Working',210000,'Sales Cloud','Europe',14,{activities:[call('A-N1',4,'Mapped their sales regions and current tools.')]});
 lead('N202','another-partner','Granite Peak Bank','Lukas Meyer','partner','Qualified',340000,'Platform','Europe',21,{...qualified,activities:[call('A-N2',9,'Budget confirmed with the COO.')]});
 const tide=lead('N204','another-partner','Tidewater Ports','James Whelan','partner','Qualified',260000,'Service Cloud','Europe',34,{...qualified});
 lead('N205','another-partner','Silverline Insurance','Amelia Hart','partner','Closed',150000,'Sales Cloud','Europe',40,{closeReason:'Chose a competitor',closedAt:at(12)});
 deal('N301','another-partner',tide,'Tidewater Ports','James Whelan','Port operations service desk','Service Cloud',260000,'Negotiation',24);
 deal('N302','another-partner',null,'Aurora Dental Group','Elena Rossi','Clinic network rollout','Sales Cloud',185000,'Won',62,{wonAmount:180000,closeDate:at(18).slice(0,10)});
 const conflict=crm.opportunities['006-conflict'];if(conflict&&!conflict.value)Object.assign(conflict,{value:230000,expectedClose:on(38),name:'Evergreen Systems · Sales Cloud',region:'Europe'});
 // Cobalt Systems: a newer managed service provider in Asia Pacific.
 lead('C201','partner-cobalt','Vantage Robotics','Mei Tanaka','crm','Accepted',95000,'Platform','Asia Pacific',1);
 lead('C202','partner-cobalt','Lumen Biotech','Arjun Mehta','partner','Approved',130000,'Service Cloud','Asia Pacific',3);
 const blue=lead('C203','partner-cobalt','Bluefin Shipping','Grace Ho','partner','Qualified',150000,'Sales Cloud','Asia Pacific',30,{...qualified});
 deal('C301','partner-cobalt',blue,'Bluefin Shipping','Grace Ho','Fleet sales pipeline','Sales Cloud',150000,'Proposal',19);
 deal('C302','partner-cobalt',null,'Quarry Point Builders','Daniel Lim','Project sales workspace','Platform',70000,'Lost',55,{region:'Asia Pacific',lostReason:'No budget',outcomeReason:'Budget moved to the next fiscal year.'});
}
// Automatic review (program rules) is the default, so a partner's submission gets its decision in a few seconds.
// Set once: a partner account manager who switches to manual review keeps that choice.
function defaultAutoReview(state){const crm=state.sales.crm;if(crm.autoReviewDefault)return;crm.autoReviewDefault=1;crm.reviewMode='auto';}
// Registrations from other partners that wait for the partner account manager (they were flagged or arrived
// before automatic review), so the manager's decision queue has real work. Added once.
function addVendorQueueDemo(state){
 const crm=state.sales.crm;if(crm.vendorQueueDemo)return;crm.vendorQueueDemo=1;
 const at=days=>new Date(Date.now()-days*864e5).toISOString(),on=days=>at(-days).slice(0,10);
 const email=(contact,company)=>contact.toLowerCase().replace(/[^a-z ]/g,'').replace(/\s+/g,'.')+'@'+company.toLowerCase().replace(/[^a-z]/g,'')+'.example';
 const lead=(id,partnerId,company,contact,origin,status,value,product,region,days,extra={})=>{const r={id,crmId:'00Q-'+id,partnerId,company,contact,email:email(contact,company),jobTitle:'Head of Operations',...LEAD_DEFAULTS,product,origin,status,value,region,source:origin==='crm'?'Vendor campaign':'Partner referral',receivedFrom:origin==='crm'?'Vendor · Salesforce':'Partner referral',need:'Bring sales and service teams onto one shared customer workspace.',consent:true,createdAt:at(days),updatedAt:at(days),activities:[],history:[],...extra};if(origin==='partner')r.submittedAt=at(days);else r.assignedAt=at(days);crm.leads[r.crmId]=r;return r;};
 // Lead registrations waiting for a decision: one clean, one with too little detail.
 lead('N206','another-partner','Fjord Analytics','Ingrid Holm','partner','Submitted',120000,'Sales Cloud','Europe',.3);
 lead('C204','partner-cobalt','Orbit Retail Group','Wei Chen','partner','Submitted',64000,'Service Cloud','Asia Pacific',.6,{need:'Needs a CRM'});
 // A vendor lead Cobalt hasn't accepted within 48 hours.
 lead('C205','partner-cobalt','Marlow Energy','Tom Becker','crm','Assigned',88000,'Platform','Asia Pacific',3);
 // Deal registrations waiting for a decision: a large one from a qualified lead, and one outside the territory.
 const bank=crm.leads['00Q-N202'],deal=(id,partnerId,l,company,contact,name,product,value,region,days)=>{const d={id,crmId:'REG-'+id,partnerId,leadId:l?.id||null,company,contact,email:l?.email||email(contact,company),region,name,product,value,expectedClose:on(60),need:l?.need||'Replace spreadsheets with one sales pipeline across branches.',consent:true,confirmedNeed:true,registration:'Pending review',stage:null,opportunityId:null,reason:'Waiting for your partner account manager to review this registration.',submittedAt:at(days),createdAt:at(days),updatedAt:at(days),activities:[],history:[]};if(l)l.dealId=id;crm.registrations[d.crmId]=d;return d;};
 if(bank)deal('N303','another-partner',bank,bank.company,bank.contact,'Branch network rollout',bank.product,bank.value,bank.region,.15);
 deal('C303','partner-cobalt',null,'Kowloon Freight','Ada Lau','Freight sales workspace','Sales Cloud',92000,'Other',.45);
}
// Qualified leads ready to register as deals, so the partner always has this step to try. Added once.
function addQualifiedSamples(state){
 const s=state.sales;if(s.qualifiedDemo)return;s.qualifiedDemo=1;
 const now=new Date().toISOString();
 for(const [id,company,contact,title,product,value,industry,need,timeline,days] of [
  ['L111','Brightwater Hotels','Nina Alvarez','VP, Guest Experience','Service Cloud',145000,'Hospitality','Route guest requests from 14 hotels into one service desk with clear ownership.','0–3 months',9],
  ['L112','Copperline Utilities','Marcus Hale','Director, Commercial Sales','Sales Cloud',210000,'Energy','Give the commercial sales team one pipeline and forecast instead of regional spreadsheets.','3–6 months',12]]){
  if(s.leads.some(r=>r.id===id))continue;
  const approvedAt=addDays(now,-days+1),contacted=addDays(now,-days+3),r={id,partnerId:s.partnerId,company,contact,email:contact.toLowerCase().replace(/\s+/g,'.')+'@'+company.toLowerCase().replace(/[^a-z]/g,'')+'.example',jobTitle:title,...LEAD_DEFAULTS,industry,product,rating:'Hot',timeline,origin:'partner',status:'Qualified',value,source:'Partner referral',receivedFrom:'Partner referral',region:'North America',need,consent:true,budgetConfirmed:true,needConfirmed:true,decisionMaker:contact+' · '+title,createdAt:addDays(now,-days),updatedAt:addDays(now,-1),submittedAt:addDays(now,-days),approvedAt,protectedUntil:addDays(approvedAt,PROTECTION_DAYS).slice(0,10),reviewReason:'Approved. No other partner has registered this customer, so it is yours to pursue for '+PROTECTION_DAYS+' days.',crmId:'00Q-'+id,nextStep:'',activities:[{id:'A-'+id,type:'Meeting',outcome:'Connected',note:'Discovery meeting: confirmed budget, decision maker, and timeline.',time:contacted,synced:true}],history:[{time:addDays(now,-days),title:'Lead created',detail:'Introduced by a partner referral.',actor:'Partner'},{time:approvedAt,title:'Lead approved by vendor',detail:'No conflicting registration found. Protected for '+PROTECTION_DAYS+' days.',actor:'Salesforce (simulated)'},{time:addDays(now,-1),title:'Lead qualified',detail:'Budget, authority, need, and timeline confirmed (BANT 4 of 4).',actor:'Partner'}],sync:{status:'synced'},sample:true};
  s.leads.push(r);s.crm.leads[r.crmId]=copy(r);
 }
}
// Add two fresh CRM assignments once, preserving progress in existing workspaces.
function addAssignedSamples(state){
 const s=state.sales;if(s.assignedSamplesVersion)return;
 const now=new Date().toISOString();
 for(const [id,company,contact,product,value,vendor,source,need] of [
  ['L114','Alder Health','Sofia Bennett','Service Cloud',72000,'NexaCloud','Vendor website enquiry','Connect patient support teams across six clinics with one shared service workspace.'],
  ['L115','Riverton Digital','Daniel Park','Sales Cloud',96000,'Vertex Software','Vendor event','Replace separate sales spreadsheets with a shared pipeline and reliable forecasting.']]){
  const crmId='00Q-'+id;
  if(s.leads.some(r=>r.id===id)||s.crm.leads[crmId]||(s.retiredSamples||[]).some(r=>r.id===id))continue;
  const r={id,crmId,partnerId:s.partnerId,company,contact,email:contact.toLowerCase().replace(/\s+/g,'.')+'@'+company.toLowerCase().replace(/[^a-z]/g,'')+'.example',jobTitle:'Director, Operations',...LEAD_DEFAULTS,product,origin:'crm',status:'Assigned',value,vendorCompany:vendor,source,receivedFrom:'Vendor · '+vendor,region:'North America',need,consent:true,createdAt:now,updatedAt:now,assignedAt:now,nextStep:'Accept this lead, then contact the customer.',activities:[],history:[{time:now,title:'Assigned by vendor',detail:vendor+' assigned this '+source.toLowerCase()+' to your partner organization.',actor:'Salesforce (simulated)'}],sync:{status:'synced'},sample:true};
  s.leads.push(r);s.crm.leads[crmId]=copy(r);
  s.notifications.push({id:'N-'+id,partnerId:s.partnerId,type:'lead',recordId:id,title:'New CRM lead assigned',detail:company+' is ready for you to accept.',time:now,read:false});
 }
 s.assignedSamplesVersion=1;
}
// Demo convenience: submitting drafts moves them on within seconds, so when no drafts are left,
// add two example customers that haven't been used yet, ready to submit.
function refillDrafts(state){
 const s=state.sales;if(s.leads.some(r=>r.partnerId===s.partnerId&&r.origin==='partner'&&r.status==='Draft'))return;
 const drafts=()=>s.leads.filter(r=>r.partnerId===s.partnerId&&r.origin==='partner'&&r.status==='Draft').length,now=new Date().toISOString();
 const pool=[['L121','Pinewood Studios','Clara Moss',54000,'Platform'],['L122','Halden Foods','Owen Price',76000,'Sales Cloud'],['L123','Ridgeway Clinics','Sara Kim',91000,'Service Cloud'],['L124','Seabright Labs','Leo Grant',67000,'Sales Cloud'],['L125','Norland Freight','Ivy Brooks',83000,'Platform'],['L126','Tamarack Retail','Ben Cole',58000,'Service Cloud']];
 for(const [id,company,contact,value,product] of pool){
  if(drafts()>=2)break;if(s.leads.some(r=>r.id===id)||s.crm.leads['00Q-'+id])continue;
  s.leads.push({id,partnerId:s.partnerId,company,contact,email:contact.toLowerCase().replace(/\s+/g,'.')+'@'+company.toLowerCase().replace(/[^a-z]/g,'')+'.example',jobTitle:'Director, Operations',...LEAD_DEFAULTS,product,origin:'partner',status:'Draft',value,source:'Partner referral',receivedFrom:'Partner referral',region:'North America',need:'Bring regional customer data and sales reporting into one shared workspace.',consent:true,createdAt:now,updatedAt:now,crmId:null,nextStep:'',activities:[],history:[{time:now,title:'Lead created',detail:'Introduced by Partner referral',actor:'Partner'}],sync:{status:'local'},sample:true});
 }
}
function initialize(state,{migrate=false}={}){
 replaceRetiredCompany(state);
 if(state.sales?.version===1){compactSamples(state);restoreSubmittedSample(state);addNewSamples(state);upgradeLeadFlow(state);normalizeLeads(state);addVendorDemo(state);addVendorQueueDemo(state);addQualifiedSamples(state);addAssignedSamples(state);refillDrafts(state);defaultAutoReview(state);return;}
 const now=new Date().toISOString();
 const old=copy({leads:state.leads||[],deals:state.deals||[],activity:state.activity||[]});
 state.sales={version:1,partnerId:'partner-acme',sequence:1000,leads:[],deals:[],outbox:[],notifications:[],lastSync:null,failNext:false,crm:{leads:{},registrations:{},opportunities:{},processed:{},jobs:[],tick:0,reviewMode:'auto'}};
 if(migrate){state.sales.legacyArchive=old;}
 const s=state.sales;
 function lead(id,company,contact,origin,status,value,source){
  const r={id,partnerId:s.partnerId,company,contact,email:contact.toLowerCase().replace(/\s+/g,'.')+'@'+company.toLowerCase().replace(/\s+/g,'')+'.example',jobTitle:'Director, Technology',origin,status,value,source,receivedFrom:origin==='crm'?'Vendor · Salesforce':source,region:'North America',need:'Replace disconnected sales processes with a shared customer workspace.',consent:true,createdAt:now,updatedAt:now,crmId:status==='Draft'?null:'00Q-'+id,nextStep:'',activities:[],history:[{time:now,title:origin==='crm'?'Assigned by vendor':'Lead created',detail:origin==='crm'?'Salesforce assigned this lead to your partner organization.':'Introduced by '+source,actor:origin==='crm'?'Salesforce (simulated)':'Partner'}],sync:{status:status==='Draft'?'local':'synced'},sample:true};
  s.leads.push(r);if(r.crmId)s.crm.leads[r.crmId]=copy(r);return r;
 }
 const a=lead('L101','Cedar Analytics','Ethan Brooks','partner','Draft',85000,'Brightwave referral');
 const b=lead('L102','Meridian Logistics','Grace Liu','partner','Submitted',150000,'Partner website');
 const c=lead('L103','Beacon Medical','Olivia Grant','partner','Qualified',240000,'Customer referral');
 const d=lead('L104','Harbor Systems','Ava Chen','crm','Assigned',68000,'Vendor inbound campaign');
 const e=lead('L105','Helios Freight','Marcus Lee','crm','Working',180000,'Vendor product enquiry');
 e.activities.push({id:'A100',type:'Call',note:'Discussed deployment needs and confirmed the customer is interested.',time:now,synced:true});s.crm.leads[e.crmId]=copy(e);
 const f=lead('L106','Spruce Retail','Emma Lawson','crm','Qualified',165000,'Vendor webinar');
 const g=lead('L107','Oakwell Health','Isaac Patel','partner','Needs information',92000,'Partner event');
 g.need='Explore CRM';g.reviewReason='Please describe the customer need in at least 20 characters and confirm the estimated value.';s.crm.leads[g.crmId]=copy(g);
 s.crm.jobs.push({kind:'qualify',crmId:b.crmId,due:1});
 function deal(id,l,registration,stage,value,product='Sales Cloud'){
  const r={id,partnerId:s.partnerId,leadId:l?.id||null,company:l?.company||'Atlas Manufacturing',contact:l?.contact||'Michael Bennett',email:l?.email||'michael@atlas.example',region:'North America',name:(l?.company||'Atlas Manufacturing')+' rollout',product,value,expectedClose:'2026-12-20',need:l?.need||'Modernize the sales workflow across five regional offices.',consent:true,confirmedNeed:true,registration,stage:registration==='Approved'?stage:null,crmId:'REG-'+id,opportunityId:registration==='Approved'?'006-'+id:null,createdAt:now,updatedAt:now,activities:[],history:[{time:now,title:'Registration '+registration.toLowerCase(),detail:registration==='Approved'?'Registration approved; linked to a Salesforce opportunity.':'Awaiting vendor review of this registration.',actor:'Salesforce (simulated)'}],sync:{status:'synced'},sample:true};
  if(l){l.dealId=id;s.crm.leads[l.crmId]=copy(l);}
  s.deals.push(r);s.crm.registrations[r.crmId]=copy(r);
  if(r.opportunityId)s.crm.opportunities[r.opportunityId]=copy({...r,id:r.opportunityId,registrationId:r.crmId});
  return r;
 }
 deal('D101',f,'Approved','Discovery',165000);
 const review=deal('D102',null,'Pending review',null,310000);s.crm.jobs.push({kind:'registration',crmId:review.crmId,due:1});
 const proposal=deal('D103',null,'Approved','Proposal',125000,'Service Cloud');proposal.company='Summit Networks';proposal.name='Service rollout';s.crm.registrations[proposal.crmId]=copy(proposal);s.crm.opportunities[proposal.opportunityId]=copy({...proposal,id:proposal.opportunityId,registrationId:proposal.crmId});
 const won=deal('D104',null,'Approved','Won',280000,'Platform');won.company='Ember Energy';won.name='Platform deployment';s.crm.registrations[won.crmId]=copy(won);s.crm.opportunities[won.opportunityId]=copy({...won,id:won.opportunityId,registrationId:won.crmId});
 const lost=deal('D105',null,'Approved','Lost',95000,'Service Cloud');lost.company='Pinecrest Media';lost.name='Service transformation';lost.outcomeReason='Customer deferred the project.';s.crm.registrations[lost.crmId]=copy(lost);s.crm.opportunities[lost.opportunityId]=copy({...lost,id:lost.opportunityId,registrationId:lost.crmId});
 const privateLead={...copy(d),id:'private-lead',crmId:'00Q-private',company:'Private customer',partnerId:'another-partner'};s.crm.leads[privateLead.crmId]=privateLead;
 s.crm.opportunities['006-conflict']={id:'006-conflict',company:'Evergreen Systems',product:'Sales Cloud',partnerId:'another-partner',stage:'Negotiation'};
 s.crm.opportunities['006-linkable']={id:'006-linkable',company:'Northstar Services',product:'Sales Cloud',partnerId:s.partnerId,stage:'Discovery',value:75000,expectedClose:'2026-12-20'};
 if(migrate)old.leads.filter(l=>!l.isSample).forEach((l,i)=>{
  const imported={...copy(a),id:'L-import-'+i,company:l.company||'Imported lead',contact:l.contact||'',email:l.email||'',jobTitle:l.jobTitle||'',source:l.source||'Previous portal',receivedFrom:l.receivedFrom||l.source||'Previous portal',value:Number(l.value)||0,need:l.opportunity||l.nextStep||'',consent:false,status:'Draft',crmId:null,sample:false,legacyStatus:l.status,legacyHistory:l.history||[],history:[{time:now,title:'Imported draft',detail:'Previous preview data preserved. Confirm customer details before submitting to Salesforce.',actor:'System'}]};s.leads.push(imported);
 });
 compactSamples(state);restoreSubmittedSample(state);addNewSamples(state);upgradeLeadFlow(state);normalizeLeads(state);
 s.notifications.push({id:'N100',partnerId:s.partnerId,type:'lead',recordId:d.id,title:'New CRM lead assigned',detail:'Harbor Systems is ready for you to accept.',time:now,read:false});
 addVendorDemo(state);addVendorQueueDemo(state);addQualifiedSamples(state);addAssignedSamples(state);refillDrafts(state);defaultAutoReview(state);
}
// Browser reload restores seeded demo journeys, leaving independently created records intact.
function resetSamples(state){
 const fresh={};initialize(fresh);
 const s=state.sales,base=fresh.sales;
 const leadIds=new Set([...s.leads,...base.leads].filter(r=>r.sample).map(r=>r.id));
 const affected=r=>r.sample||leadIds.has(r.leadId);
 const dealIds=new Set([...s.deals,...base.deals].filter(affected).map(r=>r.id));
 const resetIds=new Set([...leadIds,...dealIds]);
 const crmIds=new Set([...s.leads,...s.deals].filter(r=>resetIds.has(r.id)).flatMap(r=>[r.crmId,r.opportunityId]).filter(Boolean));
 for(const collection of ['leads','registrations','opportunities']){
  for(const [id,r]of Object.entries(s.crm[collection]))if(resetIds.has(r.id)||leadIds.has(r.leadId)||crmIds.has(id)||crmIds.has(r.registrationId))delete s.crm[collection][id];
  for(const [id,r]of Object.entries(base.crm[collection]))if(resetIds.has(r.id)||base.deals.some(d=>d.sample&&d.opportunityId===id))s.crm[collection][id]=copy(r);
 }
 s.leads=[...s.leads.filter(r=>!leadIds.has(r.id)),...copy(base.leads.filter(r=>r.sample))];
 s.deals=[...s.deals.filter(r=>!dealIds.has(r.id)),...copy(base.deals.filter(r=>r.sample))];
 s.outbox=s.outbox.filter(o=>!resetIds.has(o.recordId));
 s.crm.jobs=s.crm.jobs.filter(j=>!crmIds.has(j.crmId));
 s.crm.jobs.push(...copy(base.crm.jobs.filter(j=>Object.values(base.crm.leads).some(r=>r.sample&&r.crmId===j.crmId)||base.deals.some(r=>r.sample&&r.crmId===j.crmId))).map(j=>({...j,due:s.crm.tick+1})));
 s.notifications=s.notifications.filter(n=>!resetIds.has(n.recordId));
 s.notifications.push(...copy(base.notifications.filter(n=>resetIds.has(n.recordId))));
}
function create(state,options={}){
 const s=state.sales,crm=s.crm,clock=options.now||(()=>new Date().toISOString()),persist=options.save||(()=>{}),auth=options.authorized||(()=>true);
 function session(){if(!auth())throw new WorkflowError('Sign in and complete setup first.','AUTH');}
 function rows(type){return type==='lead'?s.leads:type==='deal'?s.deals:[];}
 function visible(r){return r.partnerId===s.partnerId;}
 function accessible(type,r){const remote=r.crmId&&(type==='lead'?crm.leads[r.crmId]:crm.registrations[r.crmId]);const opp=r.opportunityId&&crm.opportunities[r.opportunityId];return visible(r)&&(!remote||visible(remote))&&(!opp||visible(opp));}
 function list(type){session();return rows(type).filter(r=>accessible(type,r));}
 function get(type,id){session();const r=rows(type).find(r=>r.id===id&&accessible(type,r));if(!r)throw new WorkflowError('This record is not available to your partner account.','ACCESS');return r;}
 function uid(prefix){s.sequence++;return prefix+s.sequence;}
 function history(r,title,detail,actor='Partner'){r.history.push({time:clock(),title,detail,actor});r.updatedAt=clock();}
 function notify(type,r,title,detail){s.notifications.unshift({id:uid('N'),partnerId:s.partnerId,type,recordId:r.id,title,detail,time:clock(),read:false});}
 function busy(r){if(['pending','syncing','failed'].includes(r.sync.status))throw new WorkflowError('Finish or retry the pending Salesforce update first.','PENDING');}
 function base(v){return {company:clean(v.company),contact:clean(v.contact),email:clean(v.email).toLowerCase(),jobTitle:clean(v.jobTitle),value:Number(v.value)||0,region:clean(v.region)||'North America',need:clean(v.need),consent:v.consent===true||v.consent==='on',source:clean(v.source)||'Partner referral'};}
 function leadFields(v){return {...base(v),phone:clean(v.phone),website:clean(v.website),industry:INDUSTRIES.includes(v.industry)?v.industry:'',employees:COMPANY_SIZES.includes(v.employees)?v.employees:'',product:LEAD_PRODUCTS.includes(v.product)?v.product:'Not sure yet',rating:RATINGS.includes(v.rating)?v.rating:'Warm',timeline:TIMELINES.includes(v.timeline)?v.timeline:'Not sure yet',decisionMaker:clean(v.decisionMaker),budgetConfirmed:v.budgetConfirmed===true||v.budgetConfirmed==='on',needConfirmed:v.needConfirmed===true||v.needConfirmed==='on'};}
 function validate(v,deal=false){
  const errors=[];
  if(!v.company)errors.push('Company is required.');if(!v.contact)errors.push('Contact name is required.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email||''))errors.push('Enter a valid customer email.');
  if(!Number.isFinite(v.value)||v.value<=0||v.value>1000000000)errors.push('Estimated value must be between 1 and 1,000,000,000.');
  if(!v.need||v.need.length<10)errors.push('Describe the customer need in at least 10 characters.');
  if(!REGIONS.includes(v.region))errors.push('Select a customer region.');
  if(!v.consent)errors.push('Confirm permission to share the customer information with the vendor.');
  if(v.phone&&!/^\+?[\d\s().-]{7,20}$/.test(v.phone))errors.push('Enter a valid phone number, or leave it blank.');
  if(v.website&&!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v.website))errors.push('Enter a valid website such as example.com, or leave it blank.');
  if(deal){
   if(v.quantity!==undefined&&v.quantity!==''&&v.quantity!==null&&(!Number.isSafeInteger(Number(v.quantity))||Number(v.quantity)<1||Number(v.quantity)>1000000))errors.push('Quantity must be a whole number between 1 and 1,000,000.');
   if(!v.name)errors.push('Opportunity name is required.');if(!PRODUCTS.includes(v.product))errors.push('Select a supported product.');
   if(!validDate(v.expectedClose)||v.expectedClose<clock().slice(0,10))errors.push('Choose an expected close date today or later.');
   if(!v.confirmedNeed)errors.push('Confirm that you have discussed the customer need.');
  }
  if(errors.length)throw new WorkflowError(errors.join(' '));
 }
 function canonical(type,r){const remote=type==='lead'?crm.leads[r.crmId]:crm.registrations[r.crmId];if(remote&&!visible(remote))throw new WorkflowError('Salesforce no longer authorizes this record for your account.','ACCESS');return remote;}
 function activeDeal(r){const local=s.leads.find(l=>l.id===r.id),id=local?.dealId||r.dealId;return s.deals.find(d=>(d.id===id||d.leadId===r.id)&&(!['Rejected','Withdrawn'].includes(d.registration)||(d.crmId&&crm.registrations[d.crmId]&&!['Rejected','Withdrawn'].includes(crm.registrations[d.crmId].registration))));}
 function closeAllowed(r){return (r.origin==='partner'?['Submitted','Needs information','Approved','Working','Qualified']:['Accepted','Working','Qualified']).includes(r.status)&&!activeDeal(r);}
 function leadStage(r){const d=activeDeal(r);return d&&d.registration!=='Draft'&&!['Closed','Rejected','Declined'].includes(r.status)?'Converted':r.status;}
 // The next deadline or protection window that applies to a lead, measured on the workflow clock.
 function leadDeadline(r){return deadlineFor(r,clock());}
 function forwardStages(r){return r.registration==='Approved'&&r.opportunityId&&['Discovery','Proposal','Negotiation'].includes(r.stage)?[r.stage,...OPP_STAGES.slice(OPP_STAGES.indexOf(r.stage)+1)]:[];}
 function permissions(type,id){const r=get(type,id),blocked=['pending','syncing','failed'].includes(r.sync.status),linked=type==='lead'&&!!activeDeal(r),leadEditable=!['Assigned','Declined','Disqualified','Rejected','Closed'].includes(r.status)&&!linked,editable=type==='lead'?leadEditable:['Draft','Rejected'].includes(r.registration),activity=type==='lead'?!['Draft','Assigned','Declined','Disqualified','Rejected','Closed'].includes(r.status)&&!linked:r.registration==='Approved';return {editable:editable&&!blocked,lockedFields:!editable?['company','contact','email','jobTitle','region','value','need','consent','source']:type==='lead'&&r.status==='Qualified'?QUALIFIED_FIELDS.slice():type==='deal'&&r.leadId?['company','contact','email']:[],canDeleteDraft:!blocked&&r.sync.status==='local'&&!r.crmId&&(type==='lead'?r.status==='Draft':r.registration==='Draft'),canClose:!blocked&&type==='lead'&&closeAllowed(r),canWithdraw:!blocked&&type==='deal'&&!!r.crmId&&['Submitted','Pending review','Rejected','Draft'].includes(r.registration),canActivity:!blocked&&activity,canQualify:!blocked&&type==='lead'&&r.status==='Working'&&!linked,canBant:!blocked&&type==='lead'&&['Approved','Accepted','Working'].includes(r.status)&&!linked,canDecline:!blocked&&type==='lead'&&r.origin==='crm'&&r.status==='Assigned',allowedStages:blocked?[]:forwardStages(r)};}
 function ensureEditable(type,r,changes){if(type==='lead'){
  if(activeDeal(r))throw new WorkflowError('This lead is read-only because it has an active linked deal. Update the linked deal instead.');
  if(['Assigned','Declined','Disqualified','Rejected','Closed'].includes(r.status))throw new WorkflowError('Accept an assigned lead before proposing changes. Closed, declined, and rejected leads cannot be edited.');
  if(r.status==='Qualified'&&QUALIFIED_FIELDS.some(field=>Object.hasOwn(changes,field)&&changes[field]!==r[field]))throw new WorkflowError('Qualified lead identity is locked. Company, email, region, estimated value, and customer need cannot be changed. Contact name and job title remain editable.');
 }else if(!['Draft','Rejected'].includes(r.registration))throw new WorkflowError('Submitted registrations are read-only. Add activity or update the opportunity instead.');}
 function ensureActivity(type,r){if(type==='lead'&&(['Draft','Assigned','Declined','Disqualified','Rejected','Closed'].includes(r.status)||activeDeal(r)))throw new WorkflowError('Submit your lead or accept the assignment before adding activity. Closed leads and leads with an active deal are read-only.');if(type==='deal'&&r.registration!=='Approved')throw new WorkflowError('An approved registration is required before updating opportunity activity.');}
 function changesFor(type,r,v={}){const data=type==='lead'?leadFields({...r,...v}):base({...r,...v});if(type==='deal')Object.assign(data,{name:clean(v.name??r.name),quantity:v.quantity===undefined?r.quantity:(v.quantity===''||v.quantity===null?null:Number(v.quantity)),product:v.product||r.product,expectedClose:v.expectedClose||r.expectedClose,confirmedNeed:v.confirmedNeed===undefined?r.confirmedNeed:v.confirmedNeed===true||v.confirmedNeed==='on'});if(type==='deal'&&r.leadId){const lead=get('lead',r.leadId);for(const field of ['company','contact','email'])data[field]=lead[field];}if(type==='lead'&&r.crmId)data.source=r.source;return Object.fromEntries(Object.entries(data).filter(([key,value])=>r[key]!==value));}
 function checkBaseline(op,remote){if(op.baseline&&Object.keys(op.baseline).some(key=>JSON.stringify(remote[key])!==JSON.stringify(op.baseline[key])))throw new WorkflowError('These customer details changed in Salesforce. Discard this update to load the latest values, then edit again.','CONFLICT');}
 function enqueue(type,r,action,payload={}){
  busy(r);canonical(type,r);const baseline=['edit','resubmit','qualify'].includes(action)?Object.fromEntries(Object.keys(payload).map(key=>[key,r[key]])):action==='stage'?{stage:r.stage,value:r.value,expectedClose:r.expectedClose}:null;const op={id:uid('OP'),type,recordId:r.id,partnerId:s.partnerId,action,payload:copy(payload),baseline,state:'pending',attempts:0,createdAt:clock()};
  s.outbox.push(op);r.sync={status:'pending',operationId:op.id};history(r,'Update queued',operationLabel(action));persist();return r;
 }
 function operationLabel(action){return {submitLead:'Submit lead for vendor approval',edit:'Save customer updates to Salesforce',accept:'Accept CRM assignment',decline:'Decline CRM assignment',qualify:'Mark lead qualified (BANT)',activity:'Sync customer activity',complete:'Complete follow-up',register:'Validate deal registration',stage:'Update Salesforce opportunity stage',deleteDraft:'Delete local draft',close:'Close lead',withdraw:'Withdraw registration',resubmit:'Update and resubmit lead'}[action]||action;}
 function createLead(v){session();const data=leadFields(v);if(!data.company)throw new WorkflowError('Company is required to save a draft.');const r={id:uid('L'),partnerId:s.partnerId,origin:'partner',status:'Draft',receivedFrom:data.source,...data,crmId:null,activities:[],history:[],createdAt:clock(),updatedAt:clock(),sync:{status:'local'}};history(r,'Draft created','Not submitted. Complete the details, then submit to the vendor.');s.leads.unshift(r);persist();return r;}
 function edit(type,id,v){const r=get(type,id);busy(r);const changes=changesFor(type,r,v);ensureEditable(type,r,changes);const data={...r,...changes};
  if(!data.company)throw new WorkflowError('Company is required.');
  if(r.sync.status==='local'||(type==='deal'&&r.registration==='Rejected')){Object.assign(r,changes);if(type==='deal'){r.registration='Draft';r.reason='';r.sync={status:'local'};}history(r,'Draft updated','Changes saved on this device.');persist();return r;}
  validate(data);if(!Object.keys(changes).length)return r;return enqueue(type,r,'edit',changes);
 }
 function deleteDraft(type,id){const r=get(type,id);if(!permissions(type,id).canDeleteDraft)throw new WorkflowError('Only a never-submitted local draft can be deleted.');enqueue(type,r,'deleteDraft');const op=s.outbox.find(o=>o.id===r.sync.operationId);op.attempts++;op.result=apply(op);op.state='done';op.error='';persist();return op.result;}
 function closeLead(id,reason,note){const r=get('lead',id);if(!closeAllowed(r))throw new WorkflowError('This lead cannot be closed in its current status or while it has an active linked deal.');if(!CLOSE_REASONS.includes(reason))throw new WorkflowError('Select a reason to close this lead.');if(clean(note).length<5)throw new WorkflowError('Add a closing note of at least 5 characters.');return enqueue('lead',r,'close',{reason,note:clean(note)});}
 function withdrawDeal(id,note){const r=get('deal',id);if(!r.crmId||!['Submitted','Pending review','Rejected','Draft'].includes(r.registration))throw new WorkflowError('Only a submitted registration awaiting review or a rejected registration can be withdrawn.');if(clean(note).length<5)throw new WorkflowError('Add a withdrawal note of at least 5 characters.');return enqueue('deal',r,'withdraw',{note:clean(note)});}
 function resubmit(id,v={}){const r=get('lead',id);if(r.origin!=='partner'||r.status!=='Needs information')throw new WorkflowError('Only a lead needing information can be updated and resubmitted.');const changes=changesFor('lead',r,v);ensureEditable('lead',r,changes);validate({...r,...changes});return enqueue('lead',r,'resubmit',changes);}
 function submitLead(id){const r=get('lead',id);if(r.origin!=='partner'||!['Draft','Needs information'].includes(r.status))throw new WorkflowError('Only a draft or returned partner lead can be submitted.');validate(r);return enqueue('lead',r,'submitLead');}
 function accept(id){const r=get('lead',id);if(r.origin!=='crm'||r.status!=='Assigned')throw new WorkflowError('This lead is not awaiting acceptance.');return enqueue('lead',r,'accept');}
 function decline(id,reason,note=''){const r=get('lead',id);if(r.origin!=='crm'||r.status!=='Assigned')throw new WorkflowError('This lead is not awaiting acceptance.');if(!DECLINE_REASONS.includes(reason))throw new WorkflowError('Select a reason to decline this assignment.');if(reason==='Other'&&clean(note).length<5)throw new WorkflowError('Add a note of at least 5 characters to explain why you are declining.');return enqueue('lead',r,'decline',{reason,note:clean(note)});}
 // The partner qualifies after contact by confirming all four BANT items; the result syncs to Salesforce.
 function qualify(id,v={}){const r=get('lead',id);busy(r);if(r.status!=='Working')throw new WorkflowError(r.status==='Qualified'?'This lead is already qualified.':'Log a call, email, or meeting with the customer before qualifying this lead.');const changes=changesFor('lead',r,v),data={...r,...changes};ensureEditable('lead',r,changes);validate(data);const missing=bantMissing(data);if(missing.length)throw new WorkflowError('To qualify this lead, confirm '+missing.join(', ')+'.');return enqueue('lead',r,'qualify',changes);}
 function addActivity(type,id,v){const r=get(type,id);ensureActivity(type,r);
  if(!['Note',...CONTACT_TYPES,'Follow-up'].includes(v.type)||clean(v.note).length<3)throw new WorkflowError('Choose an activity and add a meaningful note.');
  if(v.outcome&&CONTACT_TYPES.includes(v.type)&&!CONTACT_OUTCOMES.includes(v.outcome))throw new WorkflowError('Choose how the conversation went.');
  if(v.type==='Follow-up'&&(!validDate(v.dueDate)||v.dueDate<clock().slice(0,10)))throw new WorkflowError('Choose a follow-up date today or later.');
  return enqueue(type,r,'activity',{id:uid('A'),type:v.type,note:clean(v.note),dueDate:v.type==='Follow-up'?v.dueDate:null,outcome:CONTACT_TYPES.includes(v.type)&&v.outcome?v.outcome:null,time:clock(),completed:false});
 }
 function completeActivity(type,id,activityId){const r=get(type,id);ensureActivity(type,r);const a=r.activities.find(a=>a.id===activityId);if(!a||a.type!=='Follow-up'||a.completed)throw new WorkflowError('This follow-up is not open.');return enqueue(type,r,'complete',{activityId});}
 function createDeal(v,leadId=null){session();let l=leadId?get('lead',leadId):null;if(l){busy(l);if(l.status!=='Qualified')throw new WorkflowError('Lead qualification is required before you convert this lead to a deal.');if(activeDeal(l))throw new WorkflowError('This lead already has a registration. Open the linked deal.','DUPLICATE');}
  const data=base({...l,...v});if(l)for(const field of ['company','contact','email'])data[field]=l[field];const r={id:uid('D'),partnerId:s.partnerId,...data,leadId:l?.id||null,name:clean(v.name),quantity:v.quantity===''||v.quantity==null?null:Number(v.quantity),product:v.product||'Sales Cloud',expectedClose:clean(v.expectedClose),confirmedNeed:v.confirmedNeed===true||v.confirmedNeed==='on',registration:'Draft',stage:null,crmId:null,opportunityId:null,activities:[],history:[],createdAt:clock(),updatedAt:clock(),sync:{status:'local'}};
  if(!r.company)throw new WorkflowError('Company is required to save a registration draft.');
  const duplicate=list('deal').find(d=>!['Rejected','Withdrawn'].includes(d.registration)&&key(d.company,d.product)===key(r.company,r.product));if(duplicate)throw new WorkflowError('You already have a registration for this customer and product. Open it in Deal Registrations.','DUPLICATE');
  history(r,'Registration draft created',l?'Linked to qualified lead '+l.id:'Direct registration. Qualification evidence must be confirmed before submission.');s.deals.unshift(r);if(l)l.dealId=r.id;persist();return r;
 }
 function submitDeal(id){const r=get('deal',id);if(r.registration!=='Draft')throw new WorkflowError('Only a draft can be submitted for registration.');validate(r,true);if(r.leadId&&get('lead',r.leadId).status!=='Qualified')throw new WorkflowError('The linked lead is not qualified.');
  if(list('deal').some(d=>d.id!==id&&!['Rejected','Withdrawn'].includes(d.registration)&&key(d.company,d.product)===key(r.company,r.product)))throw new WorkflowError('Another registration already exists for this customer and product.','DUPLICATE');
  return enqueue('deal',r,'register');
 }
 function stageValues(r,stage,reason,details={}){
  if(r.registration!=='Approved'||!r.opportunityId)throw new WorkflowError('Registration must be approved and linked to an opportunity.');
  if(!forwardStages(r).includes(stage))throw new WorkflowError('Choose a current or later opportunity stage. Closed opportunities cannot be changed.');
  const data={stage,reason:clean(reason)},today=clock().slice(0,10);
  if(['Won','Lost'].includes(stage)&&data.reason.length<5)throw new WorkflowError('Add an outcome note of at least 5 characters.');
  if(stage==='Won'){
   if(!Number.isFinite(Number(details.wonAmount))||Number(details.wonAmount)<=0)throw new WorkflowError('Enter the won amount greater than zero.');
   if(!validDate(details.closeDate)||details.closeDate>today)throw new WorkflowError('Choose an actual close date today or earlier.');
   data.wonAmount=Number(details.wonAmount);data.closeDate=details.closeDate;
  }else if(stage==='Lost'){
   if(!LOST_REASONS.includes(details.lostReason))throw new WorkflowError('Select a loss reason.');data.lostReason=details.lostReason;
  }else{
   if(Object.hasOwn(details,'value')){if(!Number.isFinite(Number(details.value))||Number(details.value)<=0)throw new WorkflowError('Estimated value must be greater than zero.');data.value=Number(details.value);}
   if(Object.hasOwn(details,'expectedClose')){if(!validDate(details.expectedClose)||details.expectedClose<today)throw new WorkflowError('Choose an expected close date today or later.');data.expectedClose=details.expectedClose;}
   if(stage===r.stage&&(!Object.hasOwn(data,'value')||data.value===r.value)&&(!Object.hasOwn(data,'expectedClose')||data.expectedClose===r.expectedClose))throw new WorkflowError('Change the estimated value or expected close date, or choose a later stage.');
  }
  return data;
 }
 function updateStage(id,stage,reason='',details={}){const r=get('deal',id);return enqueue('deal',r,'stage',stageValues(r,stage,reason,details));}
 function approved(remote){approveRegistration(crm,remote,clock(),()=>uid('006-'));}
 function apply(op){
  if(crm.processed[op.id])return copy(crm.processed[op.id]);
  const r=get(op.type,op.recordId);if(op.partnerId!==s.partnerId)throw new WorkflowError('Not authorized.','ACCESS');
  if(op.action==='deleteDraft'){
   if(r.crmId||(op.type==='lead'?r.status!=='Draft':r.registration!=='Draft'))throw new WorkflowError('Only a never-submitted local draft can be deleted.','CONFLICT');
   history(r,'Draft deleted','Never submitted to Salesforce.');
   if(op.type==='deal'&&r.leadId){const lead=s.leads.find(l=>l.id===r.leadId&&visible(l));if(lead?.dealId===r.id){delete lead.dealId;history(lead,'Registration draft removed','You can register this qualified lead again.');const remote=lead.crmId&&crm.leads[lead.crmId];if(remote?.dealId===r.id)delete remote.dealId;}}
   const result={deleted:true,id:r.id,type:op.type,deletedAt:clock(),history:copy(r.history)};rows(op.type).splice(rows(op.type).indexOf(r),1);crm.processed[op.id]=copy(result);return result;
  }
  let remote=canonical(op.type,r);if(!remote&& !['submitLead','register'].includes(op.action))throw new WorkflowError('Salesforce record was not found.','CRM');
  remote=copy(remote||r);
  if(op.type==='deal'&&remote.opportunityId){const opp=crm.opportunities[remote.opportunityId];if(!opp||!visible(opp))throw new WorkflowError('Opportunity is unavailable.','ACCESS');for(const field of ['stage','company','contact','email','value','expectedClose','activities','wonAmount','closeDate','lostReason','estimatedValue','updatedAt'])if(opp[field]!==undefined)remote[field]=copy(opp[field]);}
  if(op.action==='submitLead'){if(remote.origin!=='partner'||!['Draft','Needs information'].includes(remote.status))throw new WorkflowError('The lead status changed in Salesforce. Refresh before submitting.','CONFLICT');validate(r);remote={...copy(r),crmId:r.crmId||uid('00Q-'),status:'Submitted',reviewReason:'',submittedAt:clock()};crm.jobs.push({kind:'qualify',crmId:remote.crmId,due:crm.tick+1});}
  if(op.action==='accept'){if(remote.status!=='Assigned')throw new WorkflowError('The CRM assignment has changed. Refresh Salesforce.','CONFLICT');remote.status='Accepted';remote.acceptedAt=clock();}
  if(op.action==='decline'){if(remote.status!=='Assigned')throw new WorkflowError('The CRM assignment has changed.','CONFLICT');remote.status='Declined';remote.declineReason=op.payload.reason;remote.reviewReason=op.payload.reason+(op.payload.note?' · '+op.payload.note:'');remote.closedFrom='Assigned';}
  if(op.action==='edit'){ensureEditable(op.type,remote,op.payload);checkBaseline(op,remote);Object.assign(remote,op.payload);validate(remote);}
  if(op.action==='resubmit'){if(remote.status!=='Needs information')throw new WorkflowError('The lead status changed in Salesforce. Refresh before resubmitting.','CONFLICT');ensureEditable('lead',remote,op.payload);checkBaseline(op,remote);Object.assign(remote,op.payload);validate(remote);remote.status='Submitted';remote.reviewReason='';remote.submittedAt=clock();crm.jobs.push({kind:'qualify',crmId:remote.crmId,due:crm.tick+1});}
  if(op.action==='close'){if(!closeAllowed(remote))throw new WorkflowError('This lead can no longer be closed. Refresh its status or open the active linked deal.','CONFLICT');if(![...CLOSE_REASONS,...LEGACY_CLOSE_REASONS].includes(op.payload.reason)||clean(op.payload.note).length<5)throw new WorkflowError('Select a closing reason and add a note of at least 5 characters.');remote.closedFrom=remote.status;remote.status='Closed';remote.closeReason=op.payload.reason;remote.closeNote=op.payload.note;remote.reviewReason=op.payload.reason+' · '+op.payload.note;remote.closedAt=clock();}
  if(op.action==='withdraw'){if(remote.registration==='Approved')throw new WorkflowError('Registration was already approved. Close the opportunity as Lost instead.','CONFLICT');if(!['Submitted','Pending review','Rejected','Draft'].includes(remote.registration))throw new WorkflowError('This registration can no longer be withdrawn. Refresh its status.','CONFLICT');remote.registration='Withdrawn';remote.withdrawReason=op.payload.note;remote.reason=op.payload.note;remote.withdrawnAt=clock();}
  if(op.action==='qualify'){if(remote.status!=='Working')throw new WorkflowError('The lead status changed in Salesforce. Refresh before qualifying.','CONFLICT');ensureEditable('lead',remote,op.payload);checkBaseline(op,remote);Object.assign(remote,op.payload);validate(remote);const missing=bantMissing(remote);if(missing.length)throw new WorkflowError('To qualify this lead, confirm '+missing.join(', ')+'.');remote.status='Qualified';remote.qualifiedAt=clock();remote.reviewReason='';}
  if(op.action==='activity'){ensureActivity(op.type,remote);remote.activities.push({...op.payload,synced:true});if(op.type==='lead'&&['Approved','Accepted'].includes(remote.status)&&CONTACT_TYPES.includes(op.payload.type)){remote.status='Working';remote.workingAt=clock();}}
  if(op.action==='complete'){ensureActivity(op.type,remote);const a=remote.activities.find(a=>a.id===op.payload.activityId);if(!a)throw new WorkflowError('Follow-up no longer exists.','CONFLICT');a.completed=true;}
  if(op.action==='register'){
   if(!['Draft','Rejected'].includes(remote.registration))throw new WorkflowError('The registration status changed in Salesforce. Refresh before submitting.','CONFLICT');
   if(Object.values(crm.registrations).some(d=>d.crmId!==r.crmId&&!['Rejected','Withdrawn'].includes(d.registration)&&key(d.company,d.product)===key(r.company,r.product)))throw new WorkflowError('An active registration already covers this customer and product. Ask the vendor to resolve the conflict.','DUPLICATE');
   validate(r,true);if(r.leadId){const lead=get('lead',r.leadId),confirmed=canonical('lead',lead);if(confirmed?.status!=='Qualified')throw new WorkflowError('Salesforce has not confirmed qualification for the linked lead.','CONFLICT');}remote={...copy(r),crmId:r.crmId||uid('REG-'),registration:'Submitted',reason:'Received by vendor Salesforce. Validation and review are next.',rejectReason:'',submittedAt:clock(),reviewStartedAt:null};
   crm.jobs.push({kind:'registration',crmId:remote.crmId,due:crm.tick+1});
  }
  if(op.action==='stage'){
   const opp=crm.opportunities[remote.opportunityId];if(!opp||!visible(opp))throw new WorkflowError('Opportunity is unavailable.','ACCESS');
   if(op.baseline&&opp.stage!==op.baseline.stage)throw new WorkflowError('The opportunity stage changed in Salesforce. Refresh and try again.','CONFLICT');
   checkBaseline(op,remote);const data=stageValues(remote,op.payload.stage,op.payload.reason,op.payload);
   remote.stage=data.stage;remote.outcomeReason=data.reason;remote.closedAt=['Won','Lost'].includes(remote.stage)?clock():null;
   if(data.stage==='Won'){if(remote.estimatedValue===undefined)remote.estimatedValue=remote.value;remote.value=data.wonAmount;remote.wonAmount=data.wonAmount;remote.closeDate=data.closeDate;}
   else if(data.stage==='Lost')remote.lostReason=data.lostReason;
   else for(const field of ['value','expectedClose'])if(Object.hasOwn(data,field))remote[field]=data[field];
   for(const field of ['stage','value','expectedClose','outcomeReason','closedAt','wonAmount','closeDate','lostReason','estimatedValue'])if(remote[field]!==undefined)opp[field]=copy(remote[field]);
  }
  remote.updatedAt=clock();remote.sync={status:'synced',lastSynced:clock()};
  if(op.type==='lead')crm.leads[remote.crmId]=copy(remote);else {crm.registrations[remote.crmId]=copy(remote);if(remote.opportunityId&&crm.opportunities[remote.opportunityId])Object.assign(crm.opportunities[remote.opportunityId],{activities:copy(remote.activities),company:remote.company,contact:remote.contact,email:remote.email,updatedAt:remote.updatedAt});}
  crm.processed[op.id]=copy(remote);return remote;
 }
 function merge(type,r,remote,title){const histories=r.history,dealId=r.dealId;Object.assign(r,copy(remote));r.history=histories;if(dealId)r.dealId=dealId;r.sync={status:'synced',lastSynced:clock()};history(r,title,type==='lead'?'Lead status: '+leadLabel(r.status)+(!title.endsWith(' · complete')&&r.reviewReason&&['Approved','Needs information','Rejected'].includes(r.status)?' · '+r.reviewReason:''):'Registration: '+r.registration+(r.stage?' · Opportunity: '+r.stage:''),'Salesforce (simulated)');notify(type,r,title,r.company+' · '+(type==='lead'?leadLabel(r.status):r.registration+(r.stage?' · '+r.stage:'')));}
 // Vendor review of a partner lead registration: territory first, then duplicates, then enough detail.
 function reviewLead(remote){
  if(remote.region==='Other')return rejectLead(remote,'Outside territory');
  if(leadChecks(crm,remote).blocking.length)return rejectLead(remote,'Duplicate');
  if(clean(remote.need).length<20)return Object.assign(remote,{status:'Needs information',reviewReason:'Describe the customer’s need in more detail (at least 20 characters) so the vendor can confirm the opportunity.'});
  approveLead(remote,clock());
 }
 function vendorUpdates(){
  const jobs=crm.jobs.filter(j=>j.due<=crm.tick&&(crm.reviewMode==='auto'||j.kind==='registration'&&crm.registrations[j.crmId]?.registration==='Submitted'));crm.jobs=crm.jobs.filter(j=>!jobs.includes(j));
  for(const j of jobs){
   const remote=j.kind==='registration'?crm.registrations[j.crmId]:crm.leads[j.crmId];if(!remote)continue;
   if(remote.status==='Closed'||remote.registration==='Withdrawn')continue;
   if(j.kind!=='registration'){if(remote.status==='Submitted')reviewLead(remote);}
   else if(remote.registration==='Submitted'){remote.registration='Pending review';remote.reviewStartedAt=clock();remote.reason=remote.value>=250000?'Vendor review required for registrations of $250,000 or more.':'The vendor is checking eligibility, customer evidence, and duplicates.';remote.updatedAt=clock();crm.jobs.push({...j,due:crm.tick+1});}
   else if(remote.registration!=='Pending review')continue;
   else if(remote.region==='Other'){remote.registration='Rejected';remote.rejectReason='Outside territory';remote.reason='This customer territory is outside the current program. Correct the region or contact the vendor.';}else approved(remote);
   remote.updatedAt=clock();
  }
 }
 function pull(){
  for(const type of ['lead','deal']){
   const remotes=Object.values(type==='lead'?crm.leads:crm.registrations);
   for(const remote of remotes){if(!visible(remote))continue;let local=rows(type).find(r=>r.crmId===remote.crmId);if(!local){local=copy(remote);rows(type).push(local);notify(type,local,'New CRM '+(type==='lead'?'assignment':'registration'),local.company);continue;}
    if(['local','pending','syncing','failed'].includes(local.sync.status))continue;
    if(type==='deal'&&remote.opportunityId){const opp=crm.opportunities[remote.opportunityId];if(opp&&visible(opp)){for(const field of ['stage','value','expectedClose','outcomeReason','closedAt','company','contact','email','activities','wonAmount','closeDate','lostReason','estimatedValue','updatedAt'])if(opp[field]!==undefined)remote[field]=copy(opp[field]);}}
    const fields=type==='lead'?['status','company','contact','email','value','need','region','reviewReason','source','receivedFrom','jobTitle','activities','closeReason','closeNote','closedAt','phone','website','industry','employees','product','rating','timeline','decisionMaker','budgetConfirmed','needConfirmed','approvedAt','protectedUntil','assignedAt','acceptedAt','workingAt','qualifiedAt','closedFrom','rejectReason','declineReason']:['registration','stage','company','contact','email','value','reason','opportunityId','expectedClose','outcomeReason','closedAt','activities','withdrawReason','withdrawnAt','wonAmount','closeDate','lostReason','estimatedValue','protectedUntil','approvedAt','submittedAt','reviewStartedAt','rejectReason','quantity','product','name','need'];
    if(fields.some(k=>JSON.stringify(local[k])!==JSON.stringify(remote[k])))merge(type,local,remote,type==='lead'?(local.status!==remote.status&&{Approved:'Lead approved by vendor','Needs information':'Vendor needs more information',Rejected:'Lead rejected by vendor',Closed:'Lead closed in Salesforce'}[remote.status])||'Vendor lead update':'Salesforce deal update');
   }
   // Revoked assignments are hidden everywhere, including notifications and exports.
   for(const r of rows(type)){const remote=r.crmId&&(type==='lead'?crm.leads[r.crmId]:crm.registrations[r.crmId]);if(remote&&!visible(remote))r.partnerId=remote.partnerId;}
  }
 }
 function sync(){
  session();if(!state.crm.connected)throw new WorkflowError('Connect Salesforce before syncing.','OFFLINE');
  crm.tick++;
  const pending=s.outbox.filter(o=>o.partnerId===s.partnerId&&['pending','failed','syncing'].includes(o.state));
  if(s.failNext||options.isOnline?.()===false){const offline=options.isOnline?.()===false;s.failNext=false;for(const op of pending){op.state='failed';op.attempts++;op.error=offline?'You are offline. Reconnect to the internet, then retry this saved update.':'Simulated Salesforce connection failure. Retry to send this saved update.';const r=rows(op.type).find(r=>r.id===op.recordId&&visible(r));if(r){r.sync={status:'failed',operationId:op.id,error:op.error};history(r,'Sync failed',op.error,'System');}}s.lastError=offline?'You are offline. Your updates are saved. Retry when your connection returns.':'Salesforce is temporarily unavailable in this simulated run.';persist();return {ok:false,failed:pending.length||1,completed:0};}
  let completed=0,failed=0;
  for(const op of pending){op.attempts++;try{const r=get(op.type,op.recordId);const remote=apply(op);if(!remote.deleted)merge(op.type,r,remote,operationLabel(op.action)+' · complete');op.state='done';op.error='';delete op.errorCode;completed++;}catch(error){op.state='failed';op.error=error.message;op.errorCode=error.code;const r=rows(op.type).find(r=>r.id===op.recordId&&visible(r));if(r)r.sync={status:'failed',operationId:op.id,error:error.message};failed++;}}
  vendorUpdates();pull();s.lastSync=clock();state.crm.lastSync=clock();s.lastError=failed?'Some updates need attention.':'';persist();return {ok:failed===0,failed,completed};
 }
 function discard(type,id){const r=get(type,id);if(r.sync.status!=='failed')throw new WorkflowError('Only a failed update can be discarded.');const op=s.outbox.find(o=>o.id===r.sync.operationId);if(op)op.state='cancelled';r.sync={status:r.crmId?'synced':'local'};history(r,'Failed update discarded','The last confirmed CRM values were kept.');pull();persist();}
 function notifications(){session();return s.notifications.filter(n=>n.partnerId===s.partnerId&&rows(n.type).some(r=>r.id===n.recordId&&accessible(n.type,r)));}
 function readNotification(id){const n=notifications().find(n=>n.id===id);if(!n)throw new WorkflowError('Notification not available.','ACCESS');n.read=true;persist();return n;}
 function failNext(){session();s.failNext=true;persist();}
 return {list,get,permissions,createLead,edit,deleteDraft,closeLead,withdrawDeal,resubmit,submitLead,accept,decline,qualify,addActivity,completeActivity,createDeal,submitDeal,updateStage,sync,discard,notifications,readNotification,failNext,validate,leadStage,leadDeadline,bant,bantMissing};
}
// Partner Account Manager (vendor side). Works directly in the vendor CRM; partner portals pick up each change on their next sync.
function manage(state,options={}){
 const clock=options.now||(()=>new Date().toISOString()),persist=options.save||(()=>{}),reviewer=options.reviewer||'Partner Account Manager';
 const crm=()=>state.sales.crm,partnerName=id=>PARTNERS.find(p=>p.id===id)?.name||'Another partner';
 function lead(id){const r=crm().leads[id];if(!r)throw new WorkflowError('This lead is no longer in Salesforce.','ACCESS');return r;}
 function log(r,title,detail){(r.vendorLog||(r.vendorLog=[])).push({time:clock(),title,detail,actor:reviewer});r.updatedAt=clock();}
 // Every change bumps a revision so open partner portals know to sync.
 function commit(r){crm().managerRev=(crm().managerRev||0)+1;persist();return r;}
 function pendingRegistration(d){if(!['Submitted','Pending review'].includes(d.registration))throw new WorkflowError('This registration is no longer waiting for review.','CONFLICT');crm().jobs=crm().jobs.filter(j=>j.kind!=='registration'||j.crmId!==d.crmId);}
 function decide(id){const r=lead(id);if(r.status!=='Submitted')throw new WorkflowError('This registration is no longer waiting for review.','CONFLICT');crm().jobs=crm().jobs.filter(j=>j.kind==='registration'||j.crmId!==id);return r;}
 function stage(r){return !['Closed','Rejected','Declined'].includes(r.status)&&Object.values(crm().registrations).some(d=>d.leadId===r.id&&!['Rejected','Withdrawn'].includes(d.registration))?'Converted':r.status;}
 function checkAssignment(v){const errors=[];if(!clean(v.company))errors.push('Company is required.');if(!clean(v.contact))errors.push('Contact name is required.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(v.email)))errors.push('Enter a valid customer email.');if(!REGIONS.includes(v.region))errors.push('Select a customer region.');if(!(Number(v.value)>0))errors.push('Estimated value must be greater than zero.');if(clean(v.need).length<10)errors.push('Describe the customer need in at least 10 characters.');if(!PARTNERS.some(p=>p.id===v.partnerId))errors.push('Choose a partner.');if(errors.length)throw new WorkflowError(errors.join(' '));}
 return {
  partners:()=>PARTNERS.slice(),partnerName,stage,get:lead,
  leads:()=>Object.values(crm().leads),
  queue:()=>Object.values(crm().leads).filter(r=>r.status==='Submitted').sort((a,b)=>String(a.submittedAt||a.updatedAt).localeCompare(String(b.submittedAt||b.updatedAt))),
  checks:id=>leadChecks(crm(),lead(id)),
  deadline:r=>deadlineFor(r,clock()),
  reviewMode:()=>crm().reviewMode==='auto'?'auto':'manual',
  setReviewMode(mode){crm().reviewMode=mode==='auto'?'auto':'manual';return commit();},
  approve(id,note=''){const r=decide(id);approveLead(r,clock(),note);log(r,'Registration approved','Protected for '+partnerName(r.partnerId)+' until '+r.protectedUntil+'.');return commit(r);},
  returnLead(id,message){if(clean(message).length<10)throw new WorkflowError('Tell the partner what to add, in at least 10 characters.');const r=decide(id);Object.assign(r,{status:'Needs information',reviewReason:clean(message)});log(r,'Returned for more information',clean(message));return commit(r);},
  reject(id,reason,note=''){if(!REJECT_REASONS.includes(reason))throw new WorkflowError('Select a reason to reject this registration.');if(reason==='Other'&&clean(note).length<5)throw new WorkflowError('Add a note of at least 5 characters to explain the rejection.');const r=decide(id);rejectLead(r,reason,note);log(r,'Registration rejected',reason+(clean(note)?' · '+clean(note):''));return commit(r);},
  assign(v){
   checkAssignment(v);const seq=(crm().vendorSequence||500)+1,id='V'+seq,crmId='00Q-'+id,now=clock();crm().vendorSequence=seq;
   const r={id,partnerId:v.partnerId,company:clean(v.company),contact:clean(v.contact),email:clean(v.email).toLowerCase(),jobTitle:clean(v.jobTitle),...LEAD_DEFAULTS,product:LEAD_PRODUCTS.includes(v.product)?v.product:'Not sure yet',origin:'crm',status:'Assigned',value:Number(v.value),source:clean(v.source)||'Vendor marketing',receivedFrom:'Vendor · Salesforce',region:v.region,need:clean(v.need),consent:true,createdAt:now,updatedAt:now,assignedAt:now,crmId,nextStep:'',activities:[],history:[{time:now,title:'Assigned by vendor',detail:'Your partner account manager assigned this lead to your organization.',actor:reviewer}],sync:{status:'synced'}};
   crm().leads[crmId]=r;log(r,'Assigned to '+partnerName(v.partnerId),'Accept within '+ACCEPT_HOURS+' hours, then make first contact within '+CONTACT_DAYS+' days.');return commit(r);
  },
  registrations:()=>Object.values(crm().registrations),
  opportunities:()=>Object.values(crm().opportunities),
  opportunity:id=>{const o=crm().opportunities[id];if(!o)throw new WorkflowError('This opportunity is no longer in Salesforce.','ACCESS');return o;},
  registrationQueue:()=>Object.values(crm().registrations).filter(d=>['Submitted','Pending review'].includes(d.registration)).sort((a,b)=>String(a.submittedAt||a.updatedAt).localeCompare(String(b.submittedAt||b.updatedAt))),
  registration:id=>{const d=crm().registrations[id];if(!d)throw new WorkflowError('This deal registration is no longer in Salesforce.','ACCESS');return d;},
  registrationChecks(id){return registrationChecks(crm(),this.registration(id));},
  approveRegistration(id,note=''){const d=this.registration(id);pendingRegistration(d);const ok=approveRegistration(crm(),d,clock(),()=>{const seq=(crm().vendorSequence||500)+1;crm().vendorSequence=seq;return '006-V'+seq;},note);log(d,ok?'Registration approved':'Registration rejected',ok?'CRM opportunity '+d.opportunityId+' at '+d.stage+'. Protected until '+d.protectedUntil+'.':d.reason);d.updatedAt=clock();return commit(d);},
  rejectRegistration(id,reason,note=''){if(!REG_REJECT_REASONS.includes(reason))throw new WorkflowError('Select a reason to reject this registration.');if(reason==='Other'&&clean(note).length<5)throw new WorkflowError('Add a note of at least 5 characters to explain the rejection.');const d=this.registration(id);pendingRegistration(d);Object.assign(d,{registration:'Rejected',rejectReason:reason,reason:[REG_REJECT_TEXT[reason],clean(note)].filter(Boolean).join(' ')});log(d,'Registration rejected',reason+(clean(note)?' · '+clean(note):''));d.updatedAt=clock();return commit(d);},
  reassign(id,partnerId){const r=lead(id);if(r.origin!=='crm'||!['Assigned','Declined'].includes(r.status))throw new WorkflowError('Only an unaccepted or declined assignment can be reassigned.');if(!PARTNERS.some(p=>p.id===partnerId))throw new WorkflowError('Choose a partner.');const from=partnerName(r.partnerId);Object.assign(r,{partnerId,status:'Assigned',assignedAt:clock(),declineReason:'',reviewReason:'',closedFrom:null});log(r,'Reassigned',from+' → '+partnerName(partnerId));return commit(r);},
 };
}
const api={initialize,resetSamples,create,manage,PARTNERS,REJECT_REASONS,REG_REJECT_REASONS,leadChecks,registrationChecks,deadlineFor,LEAD_STAGES,REG_STAGES,OPP_STAGES,PRODUCTS,REGIONS,CLOSE_REASONS,LOST_REASONS,DECLINE_REASONS,LEAD_PRODUCTS,INDUSTRIES,COMPANY_SIZES,TIMELINES,RATINGS,LEAD_SOURCES,CONTACT_TYPES,CONTACT_OUTCOMES,ACCEPT_HOURS,CONTACT_DAYS,PROTECTION_DAYS,leadLabel,bant,WorkflowError};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SalesWorkflow=api;
})(typeof globalThis!=='undefined'?globalThis:this);
