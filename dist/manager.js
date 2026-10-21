/* Partner Account Manager portal: the vendor side of the partner program. It reads and writes the same
   browser-local Salesforce simulation the partners work in, so partner submissions arrive here
   instantly (storage events) and decisions made here reach partners the same way. */
(function(){
'use strict';
const KEY='minute-v1',SESSION='prm-manager-session',MANAGER={name:'Riley Chen',title:'Partner Account Manager',initials:'RC'};
const W=SalesWorkflow,PAGES={overview:'Overview',queue:'Lead reviews',registrations:'Deal registrations',distribution:'Lead distribution',leads:'All partner leads',opportunities:'Opportunities',partners:'Partners',users:'Users & permissions'};
const SOURCES=['Vendor webinar','Vendor website enquiry','Vendor campaign','Trade show','Customer referral to vendor'];
// Vendor-side partner directory: program tier, partner type, territory, and annual sourced-pipeline target.
const PROFILES={
 'partner-acme':{tier:'Gold',type:'Reseller',region:'North America',joined:'2023-03-14',code:'PRT-1001',contact:'Alex Morgan',email:'alex.morgan@acmepartners.example',sellers:6,target:1500000,benefit:'25% resale margin'},
 'another-partner':{tier:'Platinum',type:'Systems integrator',region:'Europe',joined:'2021-09-01',code:'PRT-1002',contact:'Hannah Weiss',email:'hannah.weiss@northbridge.example',sellers:14,target:2000000,benefit:'30% resale margin'},
 'partner-cobalt':{tier:'Silver',type:'Managed service provider',region:'Asia Pacific',joined:'2024-06-10',code:'PRT-1003',contact:'Kenji Watanabe',email:'kenji.watanabe@cobaltsystems.example',sellers:3,target:800000,benefit:'20% resale margin'}};
const OPEN=['Discovery','Proposal','Negotiation'],OPP_STAGES=[...OPEN,'Won','Lost'];
const icons={overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',review:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',assign:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',leads:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',partners:'<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-5h6v5M9 11h.01M15 11h.01"/>',opportunity:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',team:'<path d="M4 21V4h11v17M15 10h5v11M8 8h3M8 12h3M8 16h3M2 21h20"/>',security:'<path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-4"/>',arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',check:'<path d="M5 12l4 4L19 6"/>',warn:'<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',cross:'<path d="M18 6 6 18M6 6l12 12"/>',clock:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3M18 5l2-2"/>',plus:'<path d="M12 5v14M5 12h14"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',logout:'<path d="M9 4H4v16h5M10 12h11M17 8l4 4-4 4"/>',book:'<path d="M12 5v16M3 3c4 0 7 0 9 2 2-2 5-2 9-2v16c-5 0-7 0-9 2-2-2-4-2-9-2z"/>',phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',meeting:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',award:'<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.check}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v||0);
const short=v=>{v=Number(v)||0;return v>=1e6?'$'+(v/1e6).toFixed(2).replace(/\.?0+$/,'')+'M':v>=1e3?'$'+Math.round(v/1e3)+'K':'$'+v;};
const date=v=>v?new Date(v.length===10?v+'T12:00:00Z':v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
const time=v=>v?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
function ago(v){if(!v)return '—';const minutes=Math.max(0,Math.round((Date.now()-Date.parse(v))/6e4));return minutes<1?'just now':minutes<60?minutes+' min ago':minutes<1440?Math.round(minutes/60)+' h ago':Math.round(minutes/1440)+' d ago';}
const initials=n=>String(n||'').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
const sum=(list,value=o=>o.value)=>list.reduce((total,o)=>total+(Number(value(o))||0),0),wonValue=o=>Number(o.wonAmount)||Number(o.value)||0;

let state=load(),page='overview',detailId=null,linkedLead=null,linkedReg=null,signedIn=sessionFlag(),navOpen=false,toastTimer=0,snapshot={},unseen=0;
let leadFilter={partner:'all',group:'all'},oppFilter={partner:'all',stage:'all'};
function sessionFlag(){try{return sessionStorage.getItem(SESSION)==='1';}catch{return false;}}
function load(){let saved=null;try{saved=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}const s=saved||{company:{},user:{},settings:{},activity:[],crm:{name:'Salesforce',connected:false,lastSync:'Never synced'}};W.initialize(s,{migrate:!!saved});localStorage.setItem(KEY,JSON.stringify(s));return s;}
function save(){localStorage.setItem(KEY,JSON.stringify(state));}
// Read the latest shared data before each change, so nothing a partner just did is overwritten.
function adopt(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.sales)state=saved;}catch{}}
const mgr=()=>W.manage(state,{save,reviewer:MANAGER.name});
function act(change,message){adopt();try{const result=change(mgr());takeSnapshot();if(message)toast(message);return result;}catch(error){const area=document.getElementById('mgr-form-error');if(area)area.textContent=error.message;else toast(error.message);return null;}}
function toast(message){clearTimeout(toastTimer);const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');toastTimer=setTimeout(()=>el.classList.remove('show'),5000);}

// ---- Shared components ----
const LABELS={Submitted:'Awaiting review',Assigned:'Awaiting acceptance','Pending review':'Awaiting review'};
function pill(stage){const tone=['Qualified','Converted','Approved','Won'].includes(stage)?'':['Rejected','Declined','Closed','Lost'].includes(stage)?'red':['Submitted','Needs information','Assigned','Pending review'].includes(stage)?'amber':stage==='Withdrawn'?'neutral':'blue';return `<span class="badge pill ${tone}"><i></i>${esc(LABELS[stage]||W.leadLabel(stage))}</span>`;}
function logo(name){const tones=['sage','lavender','sand','blue','rose'],n=[...String(name)].reduce((a,c)=>a+c.charCodeAt(0),0);return `<span class="company-logo ${tones[n%5]}">${esc(String(name).slice(0,1).toUpperCase())}</span>`;}
const partnerLogo=(id,size='')=>`<span class="mgr-plogo ${esc((PROFILES[id]?.tier||'').toLowerCase())} ${size}">${esc(initials(mgr().partnerName(id)))}</span>`;
const tier=t=>t?`<span class="mgr-tier ${esc(t.toLowerCase())}">${icon('award')}${esc(t)}</span>`:'';
const progress=pct=>`<span class="mgr-progress" role="img" aria-label="${pct}%"><i style="width:${Math.max(2,Math.min(100,pct))}%"></i></span>`;
const companyCell=r=>`<div class="company-cell">${logo(r.company)}<span><b>${esc(r.company)}</b><small>${esc(r.contact)}</small></span></div>`;
const dealCell=d=>`<div class="company-cell">${logo(d.company)}<span><b>${esc(d.company)}</b><small>${esc(d.name||d.product)}</small></span></div>`;
const partnerLink=id=>`<button class="mgr-partner-link" data-open-partner="${esc(id)}">${esc(mgr().partnerName(id))}</button>`;
const heading=(title,sub,actions='')=>`<div class="page-heading"><div><h1>${title}</h1><p class="subtitle">${sub}</p></div><div class="heading-actions">${actions}</div></div>`;
const emptyRow=(cols,text)=>`<tr><td colspan="${cols}" class="empty">${text}</td></tr>`;
const table=(head,rows,empty)=>`<div class="table-responsive table-wrap"><table class="table table-vcenter data-table"><thead><tr>${head.map(h=>`<th${h.startsWith('#')?' class="numeric"':''}>${h.replace(/^#/,'')}</th>`).join('')}</tr></thead><tbody>${rows.join('')||emptyRow(head.length,empty)}</tbody></table></div>`;
const panel=(title,sub,body,extra='',cls='')=>`<section class="card mgr-panel ${cls}"><header class="card-header"><div><h3 class="card-title">${title}</h3>${sub?`<p class="panel-sub">${sub}</p>`:''}</div>${extra}</header>${body}</section>`;
const assignButton=(label='Assign a lead',partnerId='')=>`<button class="btn btn-primary" data-action="assign" ${partnerId?`data-assign-to="${esc(partnerId)}"`:''}>${icon('plus')}${label}</button>`;
function checkPills(checks){const [dup,...rest]=checks.items,pills=[`<span class="pill ${dup.ok?(dup.warn?'amber':''):'red'}"><i></i>${dup.ok?(dup.warn?'Similar records':'No duplicates'):'Duplicate'}</span>`];for(const item of rest)if(!item.ok)pills.push(`<span class="pill ${item.id==='territory'?'red':'amber'}"><i></i>${{territory:'Outside territory',contact:'Contact incomplete',need:'Thin details',consent:'No permission'}[item.id]}</span>`);return `<div class="lead-card-chips mgr-pills">${pills.join('')}</div>`;}
function regPills(checks){const by=Object.fromEntries(checks.items.map(i=>[i.id,i])),c=by.conflict,pills=[`<span class="pill ${c.ok?(c.warn?'amber':''):'red'}"><i></i>${c.ok?(c.warn?'Links open opportunity':'No conflicts'):'Conflict'}</span>`];if(!by.evidence.ok)pills.push('<span class="pill amber"><i></i>No evidence</span>');if(!by.territory.ok)pills.push('<span class="pill red"><i></i>Outside territory</span>');if(by.size.warn)pills.push('<span class="pill amber"><i></i>Large deal</span>');if(!by.close.ok)pills.push('<span class="pill amber"><i></i>No close date</span>');return `<div class="lead-card-chips mgr-pills">${pills.join('')}</div>`;}

// ---- Program metrics ----
function partnerStats(m,id){
 const leads=m.leads().filter(r=>r.partnerId===id),opps=m.opportunities().filter(o=>o.partnerId===id),open=opps.filter(o=>OPEN.includes(o.stage)),won=opps.filter(o=>o.stage==='Won'),lost=opps.filter(o=>o.stage==='Lost');
 const answered=leads.filter(r=>r.origin==='crm'&&r.status!=='Assigned'),accepted=answered.filter(r=>r.status!=='Declined').length,pipeline=sum(open),wonTotal=sum(won,wonValue),target=PROFILES[id]?.target||0;
 return {leads,opps,open,won,pipeline,wonTotal,active:leads.filter(r=>['Approved','Accepted','Working','Qualified'].includes(m.stage(r))).length,
  winRate:won.length+lost.length?Math.round(won.length*100/(won.length+lost.length)):null,acceptance:answered.length?Math.round(accepted*100/answered.length):null,
  pending:m.queue().filter(r=>r.partnerId===id).length+m.registrationQueue().filter(d=>d.partnerId===id).length,attainment:target?Math.round((pipeline+wonTotal)*100/target):0,target};
}
// Everything waiting on the partner account manager: registrations to decide first (oldest first), then response-time breaches.
// Everything waiting on the partner account manager, in the order to do it: registrations oldest first,
// then response-time breaches. Each item carries its check result and the decision to offer.
function attention(m){
 const summary=c=>{const failed=c.items.filter(x=>!x.ok),warned=c.items.filter(x=>x.ok&&x.warn);return failed.length?{check:failed[0].label,tone:c.recommendation==='Reject'?'bad':'warn',rec:c.recommendation}:warned.length?{check:'Passed · '+warned[0].label,tone:'warn',rec:c.recommendation}:{check:'All '+c.items.length+' checks passed',tone:'ok',rec:c.recommendation};};
 const decisions=[...m.queue().map(r=>({kind:'Lead registration',type:'lead',key:'lead:'+r.crmId,r,when:r.submittedAt||r.updatedAt,...summary(m.checks(r.crmId))})),...m.registrationQueue().map(d=>({kind:'Deal registration',type:'reg',key:'reg:'+d.crmId,r:d,when:d.submittedAt||d.updatedAt,...summary(m.registrationChecks(d.crmId))}))].sort((a,b)=>String(a.when).localeCompare(String(b.when)));
 const sla=[];for(const r of m.leads().filter(r=>r.origin==='crm')){const stage=m.stage(r),due=m.deadline(r);
  if(stage==='Declined'||stage==='Assigned'&&due?.overdue)sla.push({kind:stage==='Declined'?'Declined by partner':'Not accepted in 48 h',type:'sla',key:'sla:'+r.crmId,sla:true,reassign:true,r,when:r.assignedAt,check:stage==='Declined'?'Declined · '+(r.declineReason||r.reviewReason||'no reason given'):'No response within the 48-hour window',tone:'bad'});
  else if(stage==='Accepted'&&due?.overdue)sla.push({kind:'First contact overdue',type:'sla',key:'sla:'+r.crmId,sla:true,r,when:r.acceptedAt,check:'First contact was due '+date(due.due),tone:'bad'});}
 return [...decisions,...sla];
}
// Decisions and assignments you made today, read from the vendor log.
function doneToday(m){const today=new Date().toISOString().slice(0,10);let n=0;for(const r of [...m.leads(),...m.registrations()])for(const h of r.vendorLog||[])if(h.actor===MANAGER.name&&String(h.time).slice(0,10)===today)n++;return n;}
const nextFocus=items=>items.find(i=>!ov.skip.has(i.key))||items[0]||null;
// The decision to offer for an item: approve when every check passed, otherwise reject or return; reassign for breaches.
function actionButtons(i,hero){
 const primary=hero?'btn mgr-btn-light':'btn btn-sm btn-primary',secondary=hero?'btn mgr-btn-ghost':'btn btn-sm btn-outline btn-secondary',id=i.r.crmId,open=i.type==='reg'?`data-open-reg="${id}"`:`data-open="${id}"`;
 if(i.sla)return i.reassign?`<button class="${primary}" data-reassign="${id}">${icon('assign')}Reassign</button><button class="${secondary}" ${open}>View</button>`:`<button class="${primary}" ${open}>View lead</button>`;
 const main=i.rec==='Approve'?`<button class="${primary} mgr-quick" data-quick="${i.type}:${id}">${icon('check')}Approve</button>`:i.rec==='Reject'?`<button class="${primary}" data-quick-reject="${i.type}:${id}">${icon('cross')}Reject</button>`:`<button class="${primary}" data-quick-return="${id}">Return for info</button>`;
 return main+`<button class="${secondary}" ${open}>Review</button>`;
}
const checkChip=i=>`<span class="mgr-rec ${i.tone}">${icon(i.tone==='ok'?'check':i.tone==='bad'?'cross':'warn')}<span>${esc(i.check)}</span></span>`;
const itemMeta=(m,i)=>`${esc(m.partnerName(i.r.partnerId))} · ${short(i.r.value)}${i.r.product&&i.r.product!=='Not sure yet'?' · '+esc(i.r.product):''} · ${ago(i.when)}`;
// Recent partner and manager activity across the program, newest first.
function feed(m,limit=8){
 const events=[],name=id=>`<b>${esc(m.partnerName(id))}</b>`;
 for(const r of m.leads()){const company=`<b>${esc(r.company)}</b>`,open=`data-open="${r.crmId}"`;
  if(r.origin==='partner'&&r.submittedAt)events.push({time:r.submittedAt,icon:'leads',text:`${name(r.partnerId)} registered lead ${company}`,open});
  if(r.origin==='crm'&&r.acceptedAt)events.push({time:r.acceptedAt,icon:'assign',text:`${name(r.partnerId)} accepted ${company}`,open});
  for(const a of r.activities||[])if(a.time&&['Call','Email','Meeting'].includes(a.type))events.push({time:a.time,icon:{Call:'phone',Email:'mail',Meeting:'meeting'}[a.type],text:`${name(r.partnerId)} logged a ${a.type.toLowerCase()} with ${company}`,open});
  for(const h of r.vendorLog||[])events.push({time:h.time,icon:'review',text:`${esc(h.actor)}: ${esc(h.title.toLowerCase())} · ${company}`,open});}
 for(const d of m.registrations()){const company=`<b>${esc(d.company)}</b>`,open=`data-open-reg="${d.crmId}"`;
  if(d.submittedAt)events.push({time:d.submittedAt,icon:'book',text:`${name(d.partnerId)} submitted a deal registration for ${company}`,open});
  for(const h of d.vendorLog||[])events.push({time:h.time,icon:'review',text:`${esc(h.actor)}: ${esc(h.title.toLowerCase())} · ${company}`,open});
  if(d.approvedAt&&!(d.vendorLog||[]).length)events.push({time:d.approvedAt,icon:'opportunity',text:`CRM opportunity opened for ${company} · ${name(d.partnerId)}`,open});}
 return events.sort((a,b)=>String(b.time).localeCompare(String(a.time))).slice(0,limit);
}
const feedList=list=>list.length?`<ul class="mgr-feed">${list.map(e=>`<li><span class="mgr-feed-icon">${icon(e.icon)}</span><button ${e.open}><span>${e.text}</span><time>${ago(e.time)}</time></button></li>`).join('')}</ul>`:'<p class="empty">No partner activity yet.</p>';

// ---- Pages ----
// ---- Overview: the partner account manager's premium dashboard ----
// Month-end reporting snapshots for the 11 months before this one, in $K (simulated history).
// The current month is always computed live from Salesforce, so every decision shows up at once.
const HISTORY={
 'another-partner':{pipeline:[180,205,230,220,265,300,320,350,385,405,430],won:[30,0,55,70,0,85,40,110,0,65,95]},
 'partner-acme':{pipeline:[90,110,125,140,160,170,185,210,230,215,205],won:[0,45,0,60,35,0,80,0,55,0,70]},
 'partner-cobalt':{pipeline:[0,0,0,15,25,40,55,70,85,105,125],won:[0,0,0,0,0,20,0,0,25,0,0]}};
const SERIES_COLORS={'another-partner':'#0969da','partner-acme':'#f0a04b','partner-cobalt':'#8ecdf8'},FALLBACK_COLORS=['#5b7aa6','#b3c7e6','#2f9e6e'];
const MIX_COLORS=['#0b4f9e','#0969da','#5aa2ee','#a9cff8','#d5e7fb'];
const MIX_DIMS={stage:['Stage',o=>o.stage,OPEN],region:['Territory',o=>o.region||'Other',['North America','Europe','Asia Pacific','Other']],product:['Product',o=>o.product||'Other',['Sales Cloud','Service Cloud','Platform']]};
let ov={metric:'pipeline',range:12,hidden:new Set(),mix:'stage',inbox:'all',board:'pipeline',skip:new Set()},entrance=true,trendModel=null,mixModel=[],seenEvents=null;
const f1=v=>Math.round(v*10)/10;
const reducedMotion=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// A rounded axis maximum whose quarter ticks are round numbers too.
function niceMax(v){const e=Math.pow(10,Math.floor(Math.log10(v))),f=v/e;return [1,1.2,1.6,2,2.4,3,4,5,6,8,10].find(s=>f<=s)*e;}
function monthSpan(n=12){const now=new Date(),out=[];for(let i=n-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);out.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('en-US',{month:'short'}),long:d.toLocaleDateString('en-US',{month:'long',year:'numeric'})});}return out;}
// Pipeline (month-end open value) and revenue (closed won in the month) per partner for the last 12 months.
function programData(m){
 const span=monthSpan(12),current=span[11].key,opps=m.opportunities();
 const series=m.partners().map((p,i)=>{
  const h=HISTORY[p.id],mine=opps.filter(o=>o.partnerId===p.id);
  const pipeline=[...(h?h.pipeline.map(v=>v*1000):Array(11).fill(0)),sum(mine.filter(o=>OPEN.includes(o.stage)))];
  const won=[...(h?h.won.map(v=>v*1000):Array(11).fill(0)),0];
  for(const o of mine.filter(o=>o.stage==='Won')){const k=String(o.closeDate||'').slice(0,7)||current;if(k<span[0].key)continue;const at=span.findIndex(s=>s.key===k);won[at<0?11:at]+=wonValue(o);}
  return {id:p.id,name:p.name,color:SERIES_COLORS[p.id]||FALLBACK_COLORS[i%FALLBACK_COLORS.length],pipeline,won};
 });
 const total=key=>span.map((_,i)=>series.reduce((a,s)=>a+s[key][i],0));
 return {span,series,pipeline:total('pipeline'),won:total('won')};
}
// Monotone cubic curve through points: smooth, and never overshoots the data.
function smooth(pts){
 const n=pts.length;if(!n)return '';if(n===1)return `M${f1(pts[0][0])},${f1(pts[0][1])}`;
 const m=[],t=[];for(let i=0;i<n-1;i++)m[i]=(pts[i+1][1]-pts[i][1])/(pts[i+1][0]-pts[i][0]);
 t[0]=m[0];t[n-1]=m[n-2];for(let i=1;i<n-1;i++)t[i]=m[i-1]*m[i]<=0?0:(m[i-1]+m[i])/2;
 for(let i=0;i<n-1;i++){if(!m[i]){t[i]=t[i+1]=0;continue;}const a=t[i]/m[i],b=t[i+1]/m[i],s=a*a+b*b;if(s>9){const k=3/Math.sqrt(s);t[i]=k*a*m[i];t[i+1]=k*b*m[i];}}
 let d=`M${f1(pts[0][0])},${f1(pts[0][1])}`;
 for(let i=0;i<n-1;i++){const h=(pts[i+1][0]-pts[i][0])/3;d+=`C${f1(pts[i][0]+h)},${f1(pts[i][1]+h*t[i])} ${f1(pts[i+1][0]-h)},${f1(pts[i+1][1]-h*t[i+1])} ${f1(pts[i+1][0])},${f1(pts[i+1][1])}`;}
 return d;
}
function spark(values,{w=120,h=36,color='#0969da',id='s',dot=false,label=''}={}){
 const max=Math.max(...values,1),min=Math.min(...values,0),pad=4,n=values.length,pts=values.map((v,i)=>[pad+i*(w-pad*2)/Math.max(1,n-1),h-pad-(v-min)/((max-min)||1)*(h-pad*2)]),line=smooth(pts),last=pts.at(-1);
 return `<svg class="mgr-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><defs><linearGradient id="sg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".34"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path class="mgr-spark-area" d="${line}L${f1(last[0])},${h}L${f1(pts[0][0])},${h}Z" fill="url(#sg-${id})"/><path class="mgr-draw mgr-spark-line" d="${line}" pathLength="1" stroke="${color}"/>${dot?`<circle class="mgr-spark-halo" cx="${f1(last[0])}" cy="${f1(last[1])}" r="4" fill="${color}"/><circle cx="${f1(last[0])}" cy="${f1(last[1])}" r="4" fill="#fff" stroke="${color}" stroke-width="2.5"/>`:''}</svg>`;
}
function ring(pct,{size=56,stroke=6,label=''}={}){
 const r=(size-stroke)/2,c=size/2,C=2*Math.PI*r,len=Math.max(0,Math.min(100,pct))/100*C;
 return `<svg class="mgr-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="width:${size}px;height:${size}px" role="img" aria-label="${esc(label||Math.round(pct)+'%')}"><circle class="mgr-ring-track" cx="${c}" cy="${c}" r="${f1(r)}" stroke-width="${stroke}"/><circle class="mgr-ring-value" cx="${c}" cy="${c}" r="${f1(r)}" stroke-width="${stroke}" transform="rotate(-90 ${c} ${c})" style="stroke-dasharray:${f1(len)} ${f1(C)}${len<.5?';opacity:0':''}"/></svg>`;
}
const seg=(attr,options,current)=>`<div class="mgr-seg" role="group">${options.map(([value,label,count])=>`<button data-${attr}="${esc(value)}" class="${String(value)===String(current)?'active':''}" aria-pressed="${String(value)===String(current)}">${label}${count===undefined?'':`<span>${count}</span>`}</button>`).join('')}</div>`;
const panelHead=(kicker,title,controls='',extra='')=>`<header class="mgr-panel-head"><div><span class="mgr-kicker">${kicker}</span><h3 class="card-title">${title}</h3>${extra}</div>${controls?`<div class="mgr-controls">${controls}</div>`:''}</header>`;
function slaStats(m){
 let on=0,late=0;
 for(const r of m.leads().filter(r=>r.origin==='crm')){const stage=m.stage(r),due=m.deadline(r);if(stage==='Declined')continue;
  if(['Assigned','Accepted'].includes(stage)&&due?.overdue||r.acceptedAt&&r.assignedAt&&Date.parse(r.acceptedAt)-Date.parse(r.assignedAt)>48*36e5)late++;else on++;}
 return {on,late,pct:on+late?Math.round(on*100/(on+late)):100};
}
function funnelSteps(m){
 const leads=m.leads(),st=r=>m.stage(r),is=(r,list)=>list.includes(st(r)),approved=new Set(m.registrations().filter(d=>d.registration==='Approved'&&d.leadId).map(d=>d.leadId));
 return [['Registered or assigned',leads.length,'all'],['Approved or accepted',leads.filter(r=>is(r,['Approved','Accepted','Working','Qualified','Converted'])||st(r)==='Closed'&&(r.approvedAt||r.acceptedAt)).length,'active'],['Customer contacted',leads.filter(r=>is(r,['Working','Qualified','Converted'])).length,'active'],['Qualified with BANT',leads.filter(r=>is(r,['Qualified','Converted'])).length,'active'],['Registered as deals',leads.filter(r=>is(r,['Converted'])).length,'converted'],['Deals approved',leads.filter(r=>is(r,['Converted'])&&approved.has(r.id)).length,'converted']];
}

function heroSection(m,d,items,done){
 const now=new Date(),hour=now.getHours(),hello=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening',quarter='Q'+(Math.floor(now.getMonth()/3)+1)+' '+now.getFullYear();
 const current=d.pipeline[11],prev=d.pipeline[10],delta=prev?Math.round((current-prev)*100/prev):0,mood=delta>=5?'growing':delta<=-5?'cooling':'holding steady',partners=m.partners().length;
 return `<section class="mgr-hero mgr-in" style="--i:0"><div class="mgr-hero-copy"><span class="mgr-hero-tag">PARTNER PROGRAM · ${quarter}</span><h1>${hello}, ${MANAGER.name.split(' ')[0]}.</h1><p class="mgr-hero-lede">Partner pipeline is <em>${mood}</em>${delta?`, ${delta>0?'up':'down'} ${Math.abs(delta)}% this month`:''}.</p>${focusCard(m,nextFocus(items),items,done)}</div>
 <div class="mgr-hero-metric"><div class="mgr-hero-metric-top"><span>Partner-sourced pipeline</span>${prev?`<span class="mgr-delta ${delta>=0?'up':'down'}">${delta>=0?'▲':'▼'} ${Math.abs(delta)}% vs ${d.span[10].label}</span>`:''}</div><strong data-count="${current}" data-fmt="short" data-key="pipeline">${short(current)}</strong><small>Open opportunities across ${partners} partners · updates live</small>${spark(d.pipeline,{w:360,h:92,color:'#79b8ff',id:'hero',dot:true,label:'Partner-sourced pipeline over the last 12 months'})}<div class="mgr-hero-axis"><span>${d.span[0].label}</span><span>${d.span[11].label}</span></div></div></section>`;
}
// Up next: the one decision to make now, with its buttons right here.
function focusCard(m,i,items,done){
 const total=done+items.length,pct=total?Math.round(done*100/total):100;
 const progress=!total?'':`<div class="mgr-focus-progress"><span>${done} done today</span><span class="mgr-focus-bar" aria-hidden="true"><i style="width:${pct}%"></i></span><span>${items.length} to go</span></div>`;
 if(!i)return `<div class="mgr-focus is-clear"><span class="mgr-focus-tag">ALL CLEAR</span><b class="mgr-focus-title">No decisions waiting.</b><small class="mgr-focus-meta">New partner registrations appear here the moment they’re submitted.</small><div class="mgr-focus-actions"><button class="btn mgr-btn-light" data-action="assign">${icon('plus')}Assign a lead</button></div>${progress}</div>`;
 return `<div class="mgr-focus" data-focus="${esc(i.key)}"><div class="mgr-focus-top"><span class="mgr-focus-tag">UP NEXT · ${items.indexOf(i)+1} OF ${items.length}</span><span class="mgr-focus-kind ${i.sla?'late':''}">${esc(i.kind)}</span></div><div class="mgr-focus-main">${logo(i.r.company)}<div><b class="mgr-focus-title">${esc(i.r.company)}</b><small class="mgr-focus-meta">${itemMeta(m,i)}</small></div></div>${checkChip(i)}<div class="mgr-focus-actions">${actionButtons(i,true)}${items.length>1?`<button class="mgr-focus-skip" data-ov-skip="${esc(i.key)}">Skip ›</button>`:''}</div>${progress}</div>`;
}
function kpiSection(m,d){
 const active=m.leads().filter(r=>['Approved','Accepted','Working','Qualified'].includes(m.stage(r))),mine=active.filter(r=>r.origin!=='crm').length;
 const opps=m.opportunities(),won=opps.filter(o=>o.stage==='Won').length,lost=opps.filter(o=>o.stage==='Lost').length,rate=won+lost?Math.round(won*100/(won+lost)):0;
 const won12=d.won.reduce((a,v)=>a+v,0),best=d.won.reduce((b,v,i)=>v>d.won[b]?i:b,0),steps=funnelSteps(m),total=steps[0][1],conv=total?Math.round(steps[4][1]*100/total):0,sla=slaStats(m);
 const tile=(i,attrs,cls,ic,label,value,viz,foot)=>`<button class="card mgr-kpi2 mgr-in ${cls}" style="--i:${i}" ${attrs}><span class="mgr-kpi-head"><span class="mgr-kpi-icon">${icon(ic)}</span>${label}</span><span class="mgr-kpi-row">${value}${viz}</span><span class="mgr-kpi-foot">${foot}</span></button>`;
 const ringWrap=(pct,label)=>`<span class="mgr-ring-wrap">${ring(pct,{size:58,stroke:6,label})}<span>${pct}%</span></span>`;
 return `<section class="mgr-ov-kpis">
 ${tile(3,'data-page="leads"','','leads','Leads in progress',`<strong data-count="${active.length}" data-key="active">${active.length}</strong>`,`<span class="mgr-split-bar" aria-hidden="true"><i style="--w:${active.length?mine*100/active.length:0}%"></i><i style="--w:${active.length?(active.length-mine)*100/active.length:0}%"></i></span>`,`<span><i class="mgr-key lead"></i>${mine} registered</span><span><i class="mgr-key deal"></i>${active.length-mine} assigned</span>`)}
 ${tile(4,'data-page="opportunities"','','trophy','Revenue won · 12 months',`<strong data-count="${won12}" data-fmt="short" data-key="won">${short(won12)}</strong>`,ringWrap(rate,'Win rate '+rate+'%'),`<span>Win rate ${rate}%</span><span>Best month ${d.span[best].label}</span>`)}
 ${tile(5,'data-funnel="converted"','','opportunity','Lead-to-deal conversion',`<strong data-count="${conv}" data-fmt="pct" data-key="conversion">${conv}%</strong>`,`<span class="mgr-mini-cols" aria-hidden="true">${steps.map(([,n],i)=>`<i style="--h:${Math.max(8,total?n*100/total:0)}%;--i:${i}"></i>`).join('')}</span>`,`<span>${steps[4][1]} of ${total} leads registered as deals</span>`)}
 ${tile(6,'data-page="distribution"',sla.late?'warn':'ok','clock','Response time',`<strong data-count="${sla.pct}" data-fmt="pct" data-key="sla">${sla.pct}%</strong>`,ringWrap(sla.pct,'Responses within the window: '+sla.pct+'%'),`<span>${sla.late?sla.late+' assignment'+(sla.late===1?'':'s')+' need'+(sla.late===1?'s':'')+' you':'Every partner within the response window'}</span>`)}
 </section>`;
}
function trendInner(d){
 // Phones get a narrower canvas so axis labels stay readable once the chart scales to fit.
 const narrow=(window.innerWidth||1440)<640,n=ov.range,metric=ov.metric,span=d.span.slice(-n),visible=d.series.filter(s=>!ov.hidden.has(s.id)),W=narrow?380:720,H=narrow?250:268,L=narrow?46:54,R=narrow?8:14,T=16,B=30,pw=W-L-R,ph=H-T-B;
 const vals=visible.map(s=>s[metric].slice(-n)),totals=span.map((_,i)=>vals.reduce((a,v)=>a+v[i],0)),max=niceMax(Math.max(...totals,1)),y=v=>T+ph-v/max*ph;
 const colW=pw/n,px=metric==='won'?i=>L+colW*i+colW/2:i=>L+(n<2?pw/2:i*pw/(n-1)),cum=Array(n).fill(0),tops=vals.map(v=>v.map((value,i)=>cum[i]+=value));
 let body='';
 if(metric==='pipeline'){
  body=`<defs>${visible.map((s,si)=>`<linearGradient id="tg-${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".5"/><stop offset="1" stop-color="${s.color}" stop-opacity=".08"/></linearGradient>`).join('')}</defs>`;
  body+=visible.map((s,si)=>{const top=tops[si].map((v,i)=>[px(i),y(v)]),base=(si?tops[si-1]:Array(n).fill(0)).map((v,i)=>[px(i),y(v)]);return `<path class="mgr-area" style="--d:${si*120}ms" d="${smooth(top)}L${smooth([...base].reverse()).slice(1)}Z" fill="url(#tg-${si})"/>`;}).join('');
  body+=visible.map((s,si)=>`<path class="mgr-draw mgr-line" style="--d:${si*120}ms" d="${smooth(tops[si].map((v,i)=>[px(i),y(v)]))}" pathLength="1" stroke="${s.color}"/>`).join('');
 }else{
  const bw=Math.min(30,colW*.56);
  body=span.map((_,i)=>{let acc=0;return `<g class="mgr-bar-col" data-col="${i}" style="--d:${i*40}ms">${visible.map((s,si)=>{const v=vals[si][i];if(!v)return '';const y0=y(acc),y1=y(acc+v);acc+=v;return `<rect x="${f1(px(i)-bw/2)}" y="${f1(y1)}" width="${f1(bw)}" height="${f1(Math.max(1.5,y0-y1-1.5))}" rx="3" fill="${s.color}"/>`;}).join('')}</g>`;}).join('');
 }
 const grid=[0,.25,.5,.75,1].map(t=>`<g class="mgr-grid-line"><line x1="${L}" x2="${W-R}" y1="${f1(y(max*t))}" y2="${f1(y(max*t))}"/><text x="${L-10}" y="${f1(y(max*t)+4)}" text-anchor="end">${t?short(max*t):'$0'}</text></g>`).join('');
 const labels=span.map((s,i)=>(n-1-i)%(n>6?2:1)?'':`<text x="${f1(px(i))}" y="${H-8}" text-anchor="middle" class="${i===n-1?'now':''}">${s.label}</text>`).join('');
 const hover=metric==='pipeline'?`<line class="mgr-guide" x1="0" x2="0" y1="${T}" y2="${T+ph}"/>${visible.map((s,si)=>`<circle class="mgr-hdot" data-s="${si}" r="4.5" cx="${L}" cy="${T+ph}" stroke="${s.color}"/>`).join('')}`:'';
 trendModel={W,n,metric,span,px,y,tops,totals,rows:visible.map((s,si)=>({name:s.name,color:s.color,values:vals[si]})).reverse()};
 const now=totals[n-1],prev=totals[n-2]||0,delta=prev?Math.round((now-prev)*100/prev):null;
 return `${panelHead(metric==='pipeline'?'SOURCED PIPELINE':'REVENUE WON',metric==='pipeline'?'Open pipeline by partner':'Closed-won revenue by month',seg('trend-metric',[['pipeline','Pipeline'],['won','Revenue']],metric)+seg('trend-range',[[6,'6M'],[12,'12M']],n),`<div class="mgr-trend-figure"><strong>${short(now)}</strong>${delta===null?'':`<span class="mgr-delta ${delta>=0?'up':'down'}">${delta>=0?'▲':'▼'} ${Math.abs(delta)}%</span>`}<small>${span[n-1].long}${prev?' · '+short(prev)+' in '+span[n-2].label:''}</small></div>`)}
 <div class="mgr-legend">${d.series.map(s=>{const off=ov.hidden.has(s.id);return `<button class="mgr-legend-item ${off?'off':''}" data-trend-partner="${s.id}" aria-pressed="${!off}" title="${off?'Show':'Hide'} ${esc(s.name)}"><i style="background:${s.color}"></i>${esc(s.name)}<b>${short(s[metric].at(-1))}</b></button>`;}).join('')}</div>
 <div class="mgr-plot" id="mgr-trend-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric==='pipeline'?'Open pipeline':'Closed-won revenue'} by partner, ${span[0].long} to ${span[n-1].long}. ${span[n-1].label}: ${short(now)}.">${grid}${body}${labels}${hover}</svg><div class="mgr-tip" hidden></div></div>`;
}
function mixInner(m){
 const open=m.opportunities().filter(o=>OPEN.includes(o.stage)),[dimLabel,key,order]=MIX_DIMS[ov.mix],total=sum(open);
 const keys=[...order,...new Set(open.map(key).filter(k=>!order.includes(k)))],groups=keys.map(k=>({k,list:open.filter(o=>key(o)===k)})).filter(g=>g.list.length).map((g,i)=>({...g,value:sum(g.list),color:MIX_COLORS[i%MIX_COLORS.length]}));
 const size=176,stroke=22,r=(size-stroke)/2,c=size/2,C=2*Math.PI*r,gap=groups.length>1?3:0;let offset=0;
 mixModel=groups.map(g=>({label:g.k,value:g.value,pct:total?Math.round(g.value*100/total):0}));
 const go=g=>ov.mix==='stage'?`data-opp-go="${esc(g.k)}"`:'data-page="opportunities"';
 const arcs=groups.map((g,i)=>{const len=total?g.value/total*C:0,arc=`<circle class="mgr-seg-arc" data-seg="${i}" ${go(g)} cx="${c}" cy="${c}" r="${f1(r)}" stroke="${g.color}" stroke-width="${stroke}" transform="rotate(-90 ${c} ${c})" style="--d:${i*140}ms;stroke-dasharray:${f1(Math.max(.5,len-gap))} ${f1(C)};stroke-dashoffset:${f1(-offset)}"><title>${esc(g.k)} · ${short(g.value)}</title></circle>`;offset+=len;return arc;}).join('');
 return `${panelHead('PIPELINE MIX','Where the open pipeline sits',seg('mix',[['stage','Stage'],['region','Territory'],['product','Product']],ov.mix))}
 ${groups.length?`<div class="mgr-mix-body" id="mgr-mix-chart"><div class="mgr-donut"><svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Open pipeline by ${dimLabel.toLowerCase()}: ${groups.map(g=>g.k+' '+short(g.value)).join(', ')}"><circle class="mgr-donut-track" cx="${c}" cy="${c}" r="${f1(r)}" stroke-width="${stroke}"/>${arcs}</svg><div class="mgr-donut-center"><strong data-default="${short(total)}">${short(total)}</strong><span data-default="Open pipeline · ${open.length} opportunities">Open pipeline · ${open.length} opportunities</span></div></div>
 <ul class="mgr-mix-legend">${groups.map((g,i)=>`<li><button data-seg="${i}" ${go(g)}><i style="background:${g.color}"></i><span>${esc(g.k)}<small>${g.list.length} opportunit${g.list.length===1?'y':'ies'}</small></span><b>${short(g.value)}</b><em>${mixModel[i].pct}%</em></button></li>`).join('')}</ul></div>`:`<div class="mgr-clear">${icon('opportunity')}<b>No open opportunities yet.</b><span>Approved deal registrations appear here.</span></div>`}`;
}
function inboxInner(m){
 const items=attention(m),is={all:()=>true,lead:i=>i.type==='lead',deal:i=>i.type==='reg',risk:i=>!!i.sla},shown=items.filter(is[ov.inbox]),auto=m.reviewMode()==='auto',focus=nextFocus(items);
 return `${panelHead('APPROVALS','Decision queue',seg('inbox',[['all','All',items.length],['lead','Leads',items.filter(is.lead).length],['deal','Deals',items.filter(is.deal).length],['risk','At risk',items.filter(is.risk).length]],ov.inbox),'<p class="panel-sub">Oldest first. Decide here, or open the record.</p>')}
 ${shown.length?`<ol class="mgr-inbox-list">${shown.slice(0,6).map((i,n)=>`<li class="mgr-inbox-row${focus&&i.key===focus.key?' is-focus':''}" style="--i:${n}"><span class="mgr-queue-rank">${items.indexOf(i)+1}</span>${logo(i.r.company)}<div class="mgr-attn-copy"><b>${esc(i.r.company)}</b><small>${itemMeta(m,i)}</small><span class="mgr-inbox-tags"><span class="mgr-attn-kind ${i.sla?'late':''}">${esc(i.kind)}</span>${checkChip(i)}</span></div><div class="mgr-inbox-actions">${actionButtons(i,false)}</div></li>`).join('')}</ol>${shown.length>6?`<p class="mgr-panel-foot">${shown.length-6} more waiting · <button class="text-link" data-page="queue">Open lead reviews</button></p>`:''}`:`<div class="mgr-clear">${icon('check')}<b>${ov.inbox==='all'?'You’re all caught up.':'Nothing here right now.'}</b><span>New partner registrations appear here the moment they’re submitted.</span></div>`}
 <footer class="mgr-inbox-foot"><span><i class="${auto?'auto':''}"></i>Approval mode · ${auto?'Automatic by program rules':'Manual review'}</span><button class="text-link" data-page="queue">Lead reviews ${icon('arrow')}</button></footer>`;
}
// Your day: progress through the queue, what's waiting where, and the controls you reach for most.
function todayInner(m,items,done){
 const total=done+items.length,pct=total?Math.round(done*100/total):100,auto=m.reviewMode()==='auto',leads=m.queue().length,regs=m.registrationQueue().length,risk=items.filter(i=>i.sla).length,assigned=m.leads().filter(r=>r.origin==='crm'&&m.stage(r)==='Assigned').length;
 const row=(label,value,page,tone)=>`<li><button data-page="${page}"><span>${label}</span><b class="${value?tone:''}">${value}</b>${icon('arrow')}</button></li>`;
 return `${panelHead('TODAY','Your day')}
 <div class="mgr-today-ring"><span class="mgr-ring-wrap">${ring(pct,{size:92,stroke:9,label:done+' of '+total+' done today'})}<span><b>${done}</b><small>of ${total}</small></span></span><div><b>${items.length?items.length+' to go':'All done'}</b><small>${done} action${done===1?'':'s'} completed today</small></div></div>
 <ul class="mgr-today-list">${row('Lead registrations',leads,'queue','amber')}${row('Deal registrations',regs,'registrations','amber')}${row('Responses at risk',risk,'distribution','red')}${row('Awaiting partner acceptance',assigned,'distribution','')}</ul>
 <div class="mgr-today-mode"><span><b>Automatic review</b><small>${auto?'Program rules decide new registrations.':'Every registration waits for you.'}</small></span><button class="toggle ${auto?'on':''}" data-action="mode" role="switch" aria-checked="${auto}" aria-label="Decide registrations automatically by program rules"><span></span></button></div>
 <footer class="mgr-today-foot"><button class="btn btn-primary" data-action="assign">${icon('plus')}Assign a lead</button></footer>`;
}
function funnelInner(m){
 const steps=funnelSteps(m),top=Math.max(1,steps[0][1]),overall=steps[0][1]?Math.round(steps[4][1]*100/steps[0][1]):0;
 return `${panelHead('CONVERSION','Lead-to-deal funnel','',`<p class="panel-sub">${overall}% of partner leads become deal registrations. Select a step to see its leads.</p>`)}
 <ol class="mgr-flow-steps">${steps.map(([label,n,group],i)=>`<li><button class="mgr-flow-step" data-funnel="${group}" style="--i:${i}"><span class="mgr-flow-bar"><i style="--h:${Math.max(6,n*100/top)}%"></i></span><b>${n}</b><span class="mgr-flow-label">${label}</span><small>${i?(steps[i-1][1]?Math.round(n*100/steps[i-1][1]):0)+'% of previous step':'All partner leads'}</small></button></li>`).join('')}</ol>`;
}
function boardInner(m,d){
 const metric=ov.board,rows=m.partners().map(p=>{const s=partnerStats(m,p.id),series=d.series.find(x=>x.id===p.id),won12=series?series.won.reduce((a,v)=>a+v,0):s.wonTotal;return {p,s,pr:PROFILES[p.id]||{},series,won12,value:metric==='won'?won12:metric==='rate'?(s.winRate??-1):s.pipeline};}).sort((a,b)=>b.value-a.value);
 const max=Math.max(1,...rows.map(r=>r.value)),shown=v=>metric==='rate'?(v<0?'—':v+'%'):short(v),target=sum(rows,r=>r.s.target),reached=sum(rows,r=>r.s.pipeline+r.s.wonTotal),pct=target?Math.round(reached*100/target):0;
 return `${panelHead('PARTNERS','Partner leaderboard',seg('board',[['pipeline','Pipeline'],['won','Revenue'],['rate','Win rate']],metric))}
 <ol class="mgr-board-list">${rows.map(({p,s,pr,series,value},i)=>`<li><button class="mgr-lb-row" data-open-partner="${p.id}" style="--i:${i}"><span class="mgr-rank ${i===0?'first':''}">${i+1}</span>${partnerLogo(p.id)}<span class="mgr-lb-name"><b>${esc(p.name)}</b><small>${tier(pr.tier)}${esc(pr.region||'')}</small></span><span class="mgr-lb-spark">${series?spark(series.pipeline.slice(-6),{w:100,h:32,color:series.color,id:'lb'+i,label:p.name+' pipeline, last 6 months'}):''}</span><span class="mgr-lb-metric"><span class="mgr-lb-track"><i style="--w:${Math.max(3,value<0?0:value*100/max)}%;background:${series?.color||'#0969da'}"></i></span><b>${shown(value)}</b><small>${s.active} active lead${s.active===1?'':'s'} · ${s.open.length} open opp${s.open.length===1?'':'s'}</small></span><span class="mgr-lb-target">${ring(s.attainment,{size:40,stroke:4,label:s.attainment+'% of annual target'})}<small>${s.attainment}%<em>of target</em></small></span>${icon('arrow')}</button></li>`).join('')}</ol>
 <footer class="mgr-board-foot"><div><span>Program sourced vs annual target</span><b>${short(reached)} <em>of ${short(target)}</em></b></div>${progress(pct)}<small>${pct}%</small></footer>`;
}
function liveInner(m){
 const list=feed(m,4),first=seenEvents===null;seenEvents=seenEvents||new Set();
 const items=list.map(e=>{const k=e.time+'|'+e.text,fresh=!first&&!seenEvents.has(k);seenEvents.add(k);return {...e,fresh};});
 return `${panelHead('ACTIVITY','Live partner activity',`<span class="mgr-live-pill"><i></i>LIVE</span>`)}
 ${items.length?`<ul class="mgr-feed">${items.map(e=>`<li class="${e.fresh?'fresh':''}"><span class="mgr-feed-icon">${icon(e.icon)}</span><button ${e.open}><span>${e.text}</span><time>${ago(e.time)}</time></button></li>`).join('')}</ul>`:'<p class="empty">No partner activity yet.</p>'}
 <footer class="mgr-live-foot"><button class="text-link" data-action="activity">View all activity ${icon('arrow')}</button></footer>`;
}
function overviewView(){
 const m=mgr(),d=programData(m),items=attention(m),done=doneToday(m);
 return `<div class="mgr-ov">${heroSection(m,d,items,done)}
 <div class="mgr-ov-grid"><section class="card mgr-panel mgr-in mgr-span-8" style="--i:1" id="mgr-inbox">${inboxInner(m)}</section><section class="card mgr-panel mgr-in mgr-span-4" style="--i:2" id="mgr-today">${todayInner(m,items,done)}</section></div>
 ${kpiSection(m,d)}
 <div class="mgr-ov-grid"><section class="card mgr-panel mgr-in mgr-span-8" style="--i:7" id="mgr-trend">${trendInner(d)}</section><section class="card mgr-panel mgr-in mgr-span-4" style="--i:8" id="mgr-mix">${mixInner(m)}</section></div>
 <div class="mgr-ov-grid"><section class="card mgr-panel mgr-in mgr-span-8" style="--i:9" id="mgr-board">${boardInner(m,d)}</section><section class="card mgr-panel mgr-in mgr-span-4" style="--i:10" id="mgr-live">${liveInner(m)}</section></div>
 <section class="card mgr-panel mgr-in mgr-funnel-card" style="--i:11" id="mgr-funnel">${funnelInner(m)}</section></div>`;
}
// Re-render one card in place, replaying its chart animation.
function swap(id,inner){const el=document.getElementById(id);if(!el)return;el.innerHTML=inner;el.classList?.remove('mgr-replay');void el.offsetWidth;el.classList?.add('mgr-replay');bindOverview();}
function bindOverview(){
 const plot=document.getElementById('mgr-trend-plot');plot?.addEventListener?.('pointermove',trendMove);plot?.addEventListener?.('pointerleave',trendLeave);
 const mix=document.getElementById('mgr-mix-chart');mix?.addEventListener?.('pointerover',mixOver);mix?.addEventListener?.('pointerout',mixOut);
}
function trendMove(e){
 const plot=e.currentTarget,svg=plot.querySelector('svg'),tip=plot.querySelector('.mgr-tip'),md=trendModel;if(!svg||!tip||!md)return;
 const box=svg.getBoundingClientRect(),vx=(e.clientX-box.left)/box.width*md.W;let i=0;
 for(let k=1;k<md.n;k++)if(Math.abs(md.px(k)-vx)<Math.abs(md.px(i)-vx))i=k;
 if(plot.dataset.at===String(i)&&!tip.hidden)return;plot.dataset.at=String(i);
 const gx=md.px(i);
 if(md.metric==='pipeline'){const guide=svg.querySelector('.mgr-guide');guide?.setAttribute('x1',gx);guide?.setAttribute('x2',gx);guide?.classList.add('on');svg.querySelectorAll('.mgr-hdot').forEach(dot=>{dot.setAttribute('cx',gx);dot.setAttribute('cy',md.y(md.tops[+dot.dataset.s][i]));dot.classList.add('on');});}
 else svg.querySelectorAll('.mgr-bar-col').forEach(col=>col.classList.toggle('dim',col.dataset.col!==String(i)));
 tip.innerHTML=`<b>${md.span[i].long}</b>${md.rows.map(r=>`<div><i style="background:${r.color}"></i><span>${esc(r.name)}</span><em>${short(r.values[i])}</em></div>`).join('')}<div class="mgr-tip-total"><span>Total</span><em>${short(md.totals[i])}</em></div>`;
 const left=gx/md.W*100;tip.style.left=left+'%';tip.classList.toggle('flip',left>60);tip.hidden=false;
}
function trendLeave(e){const plot=e.currentTarget,svg=plot.querySelector('svg'),tip=plot.querySelector('.mgr-tip');if(tip)tip.hidden=true;delete plot.dataset.at;svg?.querySelector('.mgr-guide')?.classList.remove('on');svg?.querySelectorAll('.mgr-hdot,.mgr-bar-col').forEach(el=>el.classList.remove('on','dim'));}
function mixOver(e){
 const hit=e.target.closest?.('[data-seg]'),chart=e.currentTarget;if(!hit)return;const info=mixModel[+hit.dataset.seg];if(!info)return;
 chart.classList.add('focus');chart.querySelectorAll('[data-seg]').forEach(el=>el.classList.toggle('hot',el.dataset.seg===hit.dataset.seg));
 const center=chart.querySelector('.mgr-donut-center');if(center){center.children[0].textContent=short(info.value);center.children[1].textContent=info.label+' · '+info.pct+'% of pipeline';}
}
function mixOut(e){const chart=e.currentTarget;if(chart.contains(e.relatedTarget))return;chart.classList.remove('focus');chart.querySelectorAll('.hot').forEach(el=>el.classList.remove('hot'));const center=chart.querySelector('.mgr-donut-center');if(center)for(const el of center.children)el.textContent=el.dataset.default;}
// Numbers count up when the overview opens, and count from old to new when live data changes them.
function readCounts(){const out={};for(const el of document.querySelectorAll?.('[data-key]')||[])out[el.dataset.key]=Number(el.dataset.count);return out;}
function animateCounts(before){
 if(typeof requestAnimationFrame!=='function'||reducedMotion())return;
 for(const el of document.querySelectorAll('[data-count]')){
  const to=Number(el.dataset.count),from=before?before[el.dataset.key]:0;if(before&&(from===undefined||from===to))continue;
  if(before)el.closest('.mgr-kpi2,.mgr-hero-metric')?.classList.add('mgr-bump');
  const fmt=el.dataset.fmt,draw=v=>{el.textContent=fmt==='short'?short(v):fmt==='pct'?Math.round(v)+'%':String(Math.round(v));},start=performance.now(),dur=before?700:1200;
  const step=now=>{const p=Math.min(1,(now-start)/dur);draw(from+(to-from)*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(step);};
  draw(from||0);requestAnimationFrame(step);
 }
}
function queueView(){
 const m=mgr(),queue=m.queue(),auto=m.reviewMode()==='auto',decided=m.leads().filter(r=>(r.vendorLog||[]).some(h=>/^(Registration|Returned)/.test(h.title))).sort((a,b)=>String(b.vendorLog.at(-1).time).localeCompare(String(a.vendorLog.at(-1).time))).slice(0,8);
 return `${heading('Lead reviews','Partner lead registrations waiting for your decision. Check for duplicates, territory, and missing details, then approve, return, or reject.')}
 <section class="card mgr-mode"><div><b>Approval mode · ${auto?'Automatic':'Manual review'}</b><p>${auto?'Registrations are decided by program rules: clean lead registrations are approved, thin ones are returned, duplicates and out-of-territory leads are rejected, and deal registrations without conflicts are approved.':'Every lead and deal registration waits for your decision.'}</p></div><label class="mgr-mode-control"><span>Decide automatically by program rules</span><button class="toggle ${auto?'on':''}" data-action="mode" role="switch" aria-checked="${auto}" aria-label="Decide registrations automatically by program rules"><span></span></button></label></section>
 ${panel('Waiting for review','Oldest first. Partners see your decision as soon as you make it.',table(['Company & contact','Partner','Submitted','#Estimated value','Checks',''],queue.map(r=>`<tr><td>${companyCell(r)}</td><td>${partnerLink(r.partnerId)}</td><td>${ago(r.submittedAt||r.updatedAt)}</td><td class="numeric amount">${money(r.value)}</td><td>${checkPills(m.checks(r.crmId))}</td><td><button class="text-link" data-open="${r.crmId}">Review ${icon('arrow')}</button></td></tr>`),'No registrations waiting. New partner submissions appear here instantly.'),'','pipeline-list')}
 ${panel('Recently decided','Your latest lead registration decisions.',table(['Company & contact','Partner','Decision','Decided',''],decided.map(r=>`<tr><td>${companyCell(r)}</td><td>${partnerLink(r.partnerId)}</td><td>${pill(r.status)}</td><td>${ago(r.vendorLog.at(-1).time)}</td><td><button class="text-link" data-open="${r.crmId}">View ${icon('arrow')}</button></td></tr>`),'Decisions you make appear here.'),'','pipeline-list section-gap')}`;
}
function registrationsView(){
 const m=mgr(),queue=m.registrationQueue(),decided=m.registrations().filter(d=>['Approved','Rejected','Withdrawn'].includes(d.registration)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,12);
 const row=(d,review)=>`<tr><td>${dealCell(d)}</td><td>${partnerLink(d.partnerId)}</td><td>${esc(d.product)}</td><td class="numeric amount">${money(d.value)}</td><td>${review?ago(d.submittedAt||d.updatedAt):pill(d.registration)}</td><td>${review?regPills(m.registrationChecks(d.crmId)):d.stage?pill(d.stage)+' <small class="tiny">'+esc(d.opportunityId)+'</small>':'—'}</td><td><button class="text-link" data-open-reg="${d.crmId}">${review?'Review':'View'} ${icon('arrow')}</button></td></tr>`;
 return `${heading('Deal registrations','Partners’ requests to register a specific opportunity. Approving protects the deal for 90 days and creates the CRM opportunity.')}
 ${panel('Waiting for review','Oldest first. Check conflicts and evidence before approving.',table(['Company & opportunity','Partner','Product','#Value','Submitted','Checks',''],queue.map(d=>row(d,true)),'No deal registrations waiting. New ones appear here instantly.'),'','pipeline-list')}
 ${panel('Recently decided','Approved registrations and their CRM opportunity stage.',table(['Company & opportunity','Partner','Product','#Value','Registration','CRM opportunity',''],decided.map(d=>row(d,false)),'No decisions yet.'),'','pipeline-list section-gap')}`;
}
function response(m,r){
 const stage=m.stage(r),due=m.deadline(r);
 if(stage==='Assigned')return due?.overdue?'<span class="mgr-late">Not accepted in 48 hours</span>':`Accept within ${due?.hoursLeft??48} h`;
 if(stage==='Accepted')return due?.overdue?'<span class="mgr-late">First contact overdue</span>':'Contact by '+date(due?.due);
 if(stage==='Declined')return 'Declined · '+esc(r.declineReason||r.reviewReason||'no reason');
 return {Working:'Customer contacted',Qualified:'Qualified (BANT)',Converted:'Converted to a deal',Closed:'Closed by partner'}[stage]||'—';
}
function distributionView(){
 const m=mgr(),rows=m.leads().filter(r=>r.origin==='crm').sort((a,b)=>String(b.assignedAt||b.createdAt).localeCompare(String(a.assignedAt||a.createdAt))),stage=r=>m.stage(r);
 const waiting=rows.filter(r=>stage(r)==='Assigned'),late=rows.filter(r=>stage(r)==='Declined'||['Assigned','Accepted'].includes(stage(r))&&m.deadline(r)?.overdue),working=rows.filter(r=>['Accepted','Working','Qualified','Converted'].includes(stage(r)));
 const mini=(label,value,note,tone='')=>`<div class="mgr-mini ${tone}"><span>${label}</span><b>${value}</b><small>${note}</small></div>`;
 return `${heading('Lead distribution','Send vendor leads to partners and make sure they respond: accept within 48 hours, then first contact within 3 days.',assignButton())}
 <section class="card mgr-minis">${mini('Awaiting acceptance',waiting.length,'48-hour window')}${mini('Need your action',late.length,late.length?'Declined or past a deadline':'Nothing overdue',late.length?'warn':'')}${mini('Accepted and in progress',working.length,'Being worked by partners')}</section>
 <section class="card pipeline-list">${table(['Company & contact','Partner','Status','Response','Assigned',''],rows.map(r=>{const s=stage(r),overdue=s==='Assigned'&&m.deadline(r)?.overdue;return `<tr><td>${companyCell(r)}</td><td>${partnerLink(r.partnerId)}</td><td>${pill(s)}</td><td>${response(m,r)}</td><td>${date(r.assignedAt||r.createdAt)}</td><td class="mgr-row-actions">${s==='Declined'||overdue?`<button class="text-link" data-reassign="${r.crmId}">Reassign</button>`:''}<button class="text-link" data-open="${r.crmId}">View ${icon('arrow')}</button></td></tr>`;}),'No assigned leads yet. Assign one to a partner to get started.')}</section>`;
}
const LEAD_GROUPS={all:['All',null],review:['Awaiting review',['Submitted','Needs information']],active:['In progress',['Assigned','Approved','Accepted','Working','Qualified']],converted:['Registered as deals',['Converted']],closed:['Closed',['Closed','Rejected','Declined']]};
const chips=(name,options,current)=>`<div class="mgr-chips" role="group">${options.map(([value,label,count])=>`<button class="mgr-chip ${value===current?'active':''}" data-${name}="${esc(value)}" aria-pressed="${value===current}">${esc(label)}${count===undefined?'':`<span>${count}</span>`}</button>`).join('')}</div>`;
function leadsView(){
 const m=mgr(),all=m.leads(),inGroup=(r,g)=>!LEAD_GROUPS[g][1]||LEAD_GROUPS[g][1].includes(m.stage(r)),byPartner=r=>leadFilter.partner==='all'||r.partnerId===leadFilter.partner;
 const rows=all.filter(r=>byPartner(r)&&inGroup(r,leadFilter.group)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 return `${heading('All partner leads','Every lead your partners registered or received, with its stage and qualification progress.',assignButton())}
 <div class="mgr-toolbar">${chips('lead-group',Object.entries(LEAD_GROUPS).map(([g,[label]])=>[g,label,all.filter(r=>byPartner(r)&&inGroup(r,g)).length]),leadFilter.group)}${chips('lead-partner',[['all','All partners'],...m.partners().map(p=>[p.id,p.name])],leadFilter.partner)}</div>
 <section class="card pipeline-list">${table(['Company & contact','Partner','Origin','Stage','BANT','#Estimated value','Updated',''],rows.map(r=>`<tr><td>${companyCell(r)}</td><td>${partnerLink(r.partnerId)}</td><td>${r.origin==='crm'?'Assigned by vendor':'Registered by partner'}</td><td>${pill(m.stage(r))}</td><td>${W.bant(r).count}/4</td><td class="numeric amount">${money(r.value)}</td><td>${ago(r.updatedAt)}</td><td><button class="text-link" data-open="${r.crmId}">View ${icon('arrow')}</button></td></tr>`),'No leads match these filters.')}</section>`;
}
function opportunitiesView(){
 const m=mgr(),all=m.opportunities(),byPartner=o=>oppFilter.partner==='all'||o.partnerId===oppFilter.partner,scoped=all.filter(byPartner);
 const rows=scoped.filter(o=>oppFilter.stage==='all'||o.stage===oppFilter.stage).sort((a,b)=>OPP_STAGES.indexOf(a.stage)-OPP_STAGES.indexOf(b.stage)||(Number(b.value)||0)-(Number(a.value)||0));
 const segment=stage=>{const list=scoped.filter(o=>o.stage===stage);return `<button class="mgr-stage ${stage.toLowerCase()} ${oppFilter.stage===stage?'active':''}" data-opp-stage="${stage}" aria-pressed="${oppFilter.stage===stage}"><span>${stage}</span><b>${short(stage==='Won'?sum(list,wonValue):sum(list))}</b><small>${list.length} opportunit${list.length===1?'y':'ies'}</small></button>`;};
 return `${heading('Opportunities','CRM opportunities created from approved deal registrations, across every partner. Partners keep the stage current.')}
 <section class="mgr-stages">${OPP_STAGES.map(segment).join('')}</section>
 <div class="mgr-toolbar">${chips('opp-stage',[['all','All stages',scoped.length],...OPP_STAGES.map(s=>[s,s])],oppFilter.stage)}${chips('opp-partner',[['all','All partners'],...m.partners().map(p=>[p.id,p.name])],oppFilter.partner)}</div>
 <section class="card pipeline-list">${table(['Company & opportunity','Partner','Product','Stage','#Value','Expected close','Protected until',''],rows.map(o=>`<tr><td>${dealCell(o)}</td><td>${partnerLink(o.partnerId)}</td><td>${esc(o.product||'—')}</td><td>${pill(o.stage)}</td><td class="numeric amount">${money(o.stage==='Won'?wonValue(o):o.value)}</td><td>${date(o.closeDate||o.expectedClose)}</td><td>${date(o.protectedUntil)}</td><td><button class="text-link" data-open-opp="${esc(o.id)}">View ${icon('arrow')}</button></td></tr>`),'No opportunities match these filters.')}</section>`;
}
function partnersView(){
 const m=mgr(),list=m.partners().map(p=>({p,s:partnerStats(m,p.id),pr:PROFILES[p.id]||{}})),tiers=['Platinum','Gold','Silver'].map(t=>[t,list.filter(x=>x.pr.tier===t).length]).filter(([,n])=>n);
 return `${heading('Partners','Your partner program: tiers, territories, and how each partner is performing.',assignButton())}
 <section class="card mgr-minis">${[['Active partners',list.length,tiers.map(([t,n])=>n+' '+t).join(' · ')],['Program pipeline',short(sum(list,x=>x.s.pipeline)),'Open opportunities from partners'],['Closed won',short(sum(list,x=>x.s.wonTotal)),'Partner-sourced revenue'],['Waiting on you',sum(list,x=>x.s.pending),'Registrations to decide']].map(([label,value,note])=>`<div class="mgr-mini"><span>${label}</span><b>${value}</b><small>${esc(note)}</small></div>`).join('')}</section>
 <section class="mgr-partner-grid">${list.map(({p,s,pr})=>`<article class="card mgr-partner-card"><header>${partnerLogo(p.id,'lg')}<div><h3>${esc(p.name)}</h3><p>${esc(pr.type||'Partner')} · ${esc(pr.region||'—')}</p></div>${tier(pr.tier)}</header>
 <dl class="mgr-metrics"><div><dt>Open pipeline</dt><dd>${short(s.pipeline)}</dd></div><div><dt>Closed won</dt><dd>${short(s.wonTotal)}</dd></div><div><dt>Active leads</dt><dd>${s.active}</dd></div><div><dt>Win rate</dt><dd>${s.winRate===null?'—':s.winRate+'%'}</dd></div></dl>
 <div class="mgr-target"><div><span>Sourced vs annual target</span><b>${s.attainment}%</b></div>${progress(s.attainment)}<small>${short(s.pipeline+s.wonTotal)} of ${short(s.target)}</small></div>
 <footer><span class="mgr-contact"><span class="avatar">${esc(initials(pr.contact))}</span><span><b>${esc(pr.contact||'—')}</b><small>${esc(pr.email||'')}</small></span></span>${s.pending?`<span class="pill amber"><i></i>${s.pending} waiting on you</span>`:''}</footer>
 <div class="mgr-card-actions"><button class="btn btn-sm btn-outline btn-secondary" data-action="assign" data-assign-to="${p.id}">Assign a lead</button><button class="btn btn-sm btn-primary" data-open-partner="${p.id}">View partner</button></div></article>`).join('')}</section>`;
}
const views={overview:overviewView,queue:queueView,registrations:registrationsView,distribution:distributionView,leads:leadsView,opportunities:opportunitiesView,partners:partnersView,users:usersView};


// Account manager user directory. Saved locally, alongside the existing simulated CRM.
function usersView(){
 const directory=UserAccess.initialize(state);save();
 return heading('Users & permissions','Manage roles and access settings for your local partner program.',`<button class="btn btn-primary" data-action="add-user">${icon('plus')}Add user</button>`)+`<section class="card"><div class="table-responsive"><table class="table table-vcenter"><thead><tr><th>User</th><th>Role / scope</th><th>Permissions</th><th>Status</th><th></th></tr></thead><tbody>${directory.users.map(u=>`<tr><td><b>${esc(u.name)}</b>${u.owner?' <span class="pill neutral">You · Owner</span>':''}<div class="tiny">${esc(u.email)}</div></td><td>${UserAccess.roles[u.role]}<div class="tiny">${u.partnerId?esc(W.PARTNERS.find(p=>p.id===u.partnerId)?.name||u.partnerId):'Partner program'}</div></td><td><div class="user-permission-tags">${u.permissions.map(p=>`<span class="pill neutral">${UserAccess.permissions[p]}</span>`).join('')}</div></td><td><span class="pill ${u.active?'':'neutral'}">${u.active?'Active':'Inactive'}</span></td><td><button class="btn btn-sm btn-outline" data-action="edit-user" data-user-id="${u.id}">Edit access</button></td></tr>`).join('')}</tbody></table></div></section><p class="tiny section-note">Local user directory · Settings are saved on this device. No invitation email or live account access is created.</p>${directory.history.length?`<section class="card form-panel"><h3>Access history</h3>${directory.history.slice(0,8).map(h=>`<p>${esc(h.detail)}<br><span class="tiny">${esc(h.actor)} · ${time(h.time)}</span></p>`).join('')}</section>`:''}`;
}
function userForm(id){
 adopt();const u=UserAccess.initialize(state).users.find(user=>user.id===id)||{name:'',email:'',role:'partner-manager',partnerId:'partner-acme',permissions:UserAccess.defaults('partner-manager'),active:true};
 const permissionFields=role=>UserAccess.defaults(role).map(p=>`<label class="user-permission-option"><input type="checkbox" name="permission_${p}" ${u.permissions.includes(p)?'checked':''}><span>${UserAccess.permissions[p]}</span></label>`).join('');
 modal(id?'Edit user access':'Add user','Choose a role, partner organization, and permissions. Changes stay in this local preview.',field('Full name','name',u.name)+field('Email','email',u.email,'email')+select('Role','role',Object.entries(UserAccess.roles),u.role)+`<div id="user-scope">${select('Partner organization','partnerId',W.PARTNERS.map(p=>[p.id,p.name]),u.partnerId)}</div><fieldset class="user-permission-fields"><legend>Permissions</legend><div id="user-permissions">${permissionFields(u.role)}</div></fieldset>`+select('Status','status',[['active','Active'],['inactive','Inactive']],u.active?'active':'inactive')+actions(id?'Save changes':'Add user'),v=>{
  try{adopt();UserAccess.saveUser(state,{...v,id,active:v.status==='active',permissions:Object.keys(UserAccess.permissions).filter(p=>v['permission_'+p])});save();closeOverlay();render();toast(id?'User access updated.':'User added to the local directory.');}catch(error){document.getElementById('mgr-form-error').textContent=error.message;}
 });
 const role=document.getElementById('mgr-form').querySelector('[name="role"]'),scope=document.getElementById('user-scope');scope.hidden=u.role!=='partner-manager';
 role.onchange=()=>{scope.hidden=role.value!=='partner-manager';document.getElementById('user-permissions').innerHTML=UserAccess.defaults(role.value).map(p=>`<label class="user-permission-option"><input type="checkbox" name="permission_${p}" checked><span>${UserAccess.permissions[p]}</span></label>`).join('');};
}

// ---- Shell ----
function sidebar(){
 const m=mgr(),counts={queue:m.queue().length,registrations:m.registrationQueue().length},nav=(id,ic)=>`<button data-page="${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}><span class="nav-icon">${icon(ic)}</span><span class="nav-text">${PAGES[id]}</span>${counts[id]?`<span class="nav-badge" aria-label="${counts[id]} waiting">${counts[id]}</span>`:''}</button>`;
 const group=(label,items)=>`<div class="nav-group">${label?`<div class="nav-label">${label}</div>`:''}<nav class="nav">${items}</nav></div>`;
 return `<aside class="sidebar${navOpen?' open':''}" aria-label="Manager navigation"><div class="sidebar-header"><span class="brand"><span class="brand-mark"><i></i><i></i><i></i></span>PRM<span>.</span></span><button class="sidebar-close" data-action="menu" aria-label="Close navigation">×</button></div><div class="workspace"><span class="company-icon">VP</span><span class="workspace-copy"><b>Vendor partner team</b><span class="workspace-label">Partner Account Manager workspace</span></span></div><div class="sidebar-scroll">${group('',nav('overview','overview'))}${group('APPROVALS',nav('queue','review')+nav('registrations','book'))}${group('LEADS & PIPELINE',nav('distribution','assign')+nav('leads','leads')+nav('opportunities','opportunity'))}${group('PROGRAM',nav('partners','partners')+nav('users','security'))}</div><div class="side-bottom"><button class="profile" data-action="signout" title="Sign out"><span class="avatar">${MANAGER.initials}</span><span class="profile-copy"><b>${MANAGER.name}</b><span class="tiny">${MANAGER.title} · Sign out</span></span>${icon('logout')}</button></div></aside>`;
}
function render(){
 const app=document.getElementById('app');
 // Partner Account Managers sign in on the shared sign-in screen, then come back here.
 if(!signedIn){app.innerHTML='<main class="mgr-redirect" aria-live="polite">Opening sign-in…</main>';location.href='index.html#manager';return;}
 if(!views[page])page='overview';
 history.replaceState(null,'','#'+page);
 const overview=page==='overview',enter=overview&&entrance,before=overview&&!enter?readCounts():null;entrance=false;
 app.innerHTML=`<div class="mobile-shade${navOpen?' show':''}" data-action="menu"></div>${sidebar()}<div class="main"><header class="topbar"><div class="breadcrumb"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Open navigation">${icon('menu')}</button><span class="breadcrumb-home">${icon('team')} Partner Account Manager</span><span class="breadcrumb-divider">/</span><span>${PAGES[page]}</span></div><div class="top-actions"><span class="mgr-live" title="Partner submissions and updates arrive here instantly."><i></i>Live sync</span><button class="search-trigger" data-action="search" aria-label="Search the program">${icon('search')}<span>Search</span><kbd>⌘ K</kbd></button><button class="icon-btn" data-action="activity" aria-label="Partner activity${unseen?', '+unseen+' new':''}">${icon('bell')}${unseen?'<i class="dot"></i>':''}</button><span class="avatar top-avatar" title="${MANAGER.name}">${MANAGER.initials}</span></div></header><main class="content ${overview?(enter?'mgr-enter':''):'fade-in'}">${views[page]()}<footer class="footer-note"><span>${icon('security')}Vendor workspace · Local Salesforce simulation</span><span>Partners see your decisions instantly.</span></footer></main></div>`;
 if(overview){bindOverview();animateCounts(enter?null:before);}
}

// ---- Drawers ----
function drawer(kind,badge,id,body,footer=''){
 document.getElementById('app').inert=true;
 document.getElementById('overlay').innerHTML=`<div class="drawer-backdrop"><section class="app-dialog lead-drawer" role="dialog" aria-modal="true" aria-labelledby="mgr-drawer-title"><header class="lead-drawer-top"><div><span class="drawer-kind">${kind}</span>${badge}</div><div><span class="lead-record-id">${esc(id)}</span><button class="close" data-action="close" aria-label="Close ${kind.toLowerCase()}">×</button></div></header><div class="lead-drawer-body">${body}</div><footer class="lead-drawer-footer"><span>${icon('security')}Vendor Salesforce (simulated) · ${esc(id)}</span>${footer}</footer></section></div>`;
 setTimeout(()=>document.querySelector('.lead-drawer .close')?.focus(),30);
}
const recordRows=(title,rows)=>`<section class="crm-record-section"><header class="crm-record-heading"><h3>${title}</h3></header><div class="crm-record-table">${rows.map(([label,value])=>`<div class="crm-record-row"><div class="crm-record-readonly"><span class="crm-record-label">${label}</span><span class="crm-record-value">${esc(value||'Not added')}</span><span></span></div></div>`).join('')}</div></section>`;
const routeStrip=items=>`<div class="sales-route-strip">${items.map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join('')}</div>`;
const decisionLog=log=>log.length?`<details class="lead-history" open><summary>Your decisions <span>${log.length}</span></summary><ol>${log.map(h=>`<li><span class="history-dot"></span><div><strong>${esc(h.title)}</strong><p>${esc(h.detail)}</p><time>${time(h.time)} · ${esc(h.actor)}</time></div></li>`).join('')}</ol></details>`:'';
const checkList=(title,items)=>{const marks={ok:'check',warn:'warn',fail:'cross'};return `<h3>${title}</h3><ul>${items.map(item=>{const mark=item.ok?(item.warn?'warn':'ok'):'fail';return `<li><span class="mgr-check-icon ${mark}">${icon(marks[mark])}</span>${esc(item.label)}</li>`;}).join('')}</ul>`;};
function decisionPanel(m,r){
 const checks=m.checks(r.crmId),why={Approve:'Every check passed. Approving protects this customer for the partner for 90 days.','Return for information':'Some details are missing or thin. Return it with a note so the partner can fix it and resubmit.',Reject:checks.blocking.length?'This customer is already registered with an active lead or opportunity.':'This customer is outside the program territory.'}[checks.recommendation];
 const matches=checks.matches.map(x=>`<li><span><b>${esc(x.company)}</b> · ${x.kind} · ${esc(m.partnerName(x.partnerId))}</span><small>${esc(x.match)} · ${esc(LABELS[x.stage]||W.leadLabel(x.stage))}${x.active?'':' (inactive)'}</small></li>`).join('');
 return `<section class="sales-next-panel"><div><span class="eyebrow">YOUR DECISION</span><h3>Recommended: ${checks.recommendation}</h3><p>${why}</p></div><button class="btn btn-primary" data-decide="approve">Approve registration</button><button class="btn btn-outline btn-secondary" data-decide="return">Return for information</button><button class="btn btn-outline btn-secondary" data-decide="reject">Reject</button></section>
 <section class="mgr-checks">${checkList('Registration checks',checks.items)}${matches?`<div class="mgr-matches"><span>MATCHING RECORDS IN SALESFORCE</span><ul>${matches}</ul></div>`:''}</section>`;
}
function statusPanel(m,r){
 const stage=m.stage(r),due=m.deadline(r),name=esc(m.partnerName(r.partnerId));
 const text={Approved:`Approved and protected for ${name} until ${date(r.protectedUntil)}. The partner now contacts the customer.`,'Needs information':`Returned to ${name}: “${esc(r.reviewReason)}” It comes back here when they resubmit.`,Rejected:'Rejected · '+esc(r.reviewReason),Assigned:due?.overdue?`${name} didn’t accept within 48 hours. Reassign it to another partner, or give them more time.`:`Waiting for ${name} to accept. ${due?.hoursLeft??48} hours left in the response window.`,Accepted:`${name} accepted the lead. First contact is due by ${date(due?.due)}.`,Working:`${name} has contacted the customer and is qualifying the lead (BANT ${W.bant(r).count} of 4).`,Qualified:`${name} qualified the lead. Next they register the deal.`,Converted:`${name} registered this lead as a deal.`,Declined:`${name} declined: ${esc(r.reviewReason||r.declineReason||'no reason given')}. Reassign it to another partner.`,Closed:`${name} closed this lead · ${esc(r.reviewReason||r.closeReason||'')}`}[stage]||'';
 const action=stage==='Declined'||stage==='Assigned'&&due?.overdue?`<button class="btn btn-primary" data-reassign="${r.crmId}">Reassign lead</button>`:'';
 return `<section class="sales-next-panel"><div><span class="eyebrow">STATUS</span><h3>${esc(LABELS[stage]||W.leadLabel(stage))}</h3><p>${text}</p></div>${action}</section>`;
}
function openLead(id){
 const m=mgr();let r;try{r=m.get(id);}catch(error){closeOverlay();return toast(error.message);}
 detailId=id;
 const stage=m.stage(r),b=W.bant(r),activities=[...(r.activities||[])].reverse();
 drawer('Lead',pill(stage),r.crmId,`<div class="lead-detail-title"><h2 id="mgr-drawer-title">${esc(r.company)}</h2><p>${esc(r.contact)}</p><span>${esc(r.email)}</span></div>
 ${routeStrip([['PARTNER',partnerLink(r.partnerId)],['ORIGIN',r.origin==='crm'?'Assigned by vendor':'Registered by partner · '+esc(r.source)],[r.origin==='crm'?'ASSIGNED':'SUBMITTED',time(r.origin==='crm'?r.assignedAt:r.submittedAt||r.createdAt)]])}
 ${stage==='Submitted'?decisionPanel(m,r):statusPanel(m,r)}
 ${['Approved','Accepted','Working','Qualified','Converted'].includes(stage)?`<section class="lead-bant"><div class="drawer-section-heading"><h3>Qualification · BANT <span>${b.count} of 4 confirmed by the partner</span></h3></div><div class="lead-bant-grid">${[['B · BUDGET',b.budget,r.budgetConfirmed?money(r.value)+' confirmed':'Not confirmed'],['A · AUTHORITY',b.authority,r.decisionMaker||'Not identified'],['N · NEED',b.need,r.needConfirmed?'Confirmed':'Not confirmed'],['T · TIMELINE',b.timeline,r.timeline&&r.timeline!=='Not sure yet'?r.timeline:'Not set']].map(([label,met,value])=>`<div class="${met?'met':''}"><span>${met?icon('check'):'<i></i>'}${label}</span><b>${esc(value)}</b></div>`).join('')}</div></section>`:''}
 ${recordRows('CUSTOMER RECORD',[['Contact',r.contact+(r.jobTitle?' · '+r.jobTitle:'')],['Email',r.email],['Phone',r.phone],['Product interest',r.product],['Estimated value',money(r.value)],['Customer need',r.need],['Region',r.region],['Industry',r.industry],['Purchase timeline',r.timeline],['Lead source',r.source]])}
 <section class="sales-activity-section"><div class="drawer-section-heading"><h3>Partner activity</h3></div>${activities.length?`<ul class="sales-activities">${activities.map(a=>`<li><span class="task-symbol">${icon({Call:'phone',Email:'mail',Meeting:'meeting','Follow-up':'clock'}[a.type]||'book')}</span><div><strong>${esc(a.type)}${a.outcome?' · '+esc(a.outcome):''}</strong><p>${esc(a.note)}</p><time>${time(a.time)}</time></div></li>`).join('')}</ul>`:'<p class="subtitle">No calls, emails, or meetings logged by the partner yet.</p>'}</section>
 ${decisionLog([...(r.vendorLog||[])].reverse())}`);
}
function openRegistration(id){
 const m=mgr();let d;try{d=m.registration(id);}catch(error){closeOverlay();return toast(error.message);}
 detailId='reg:'+id;
 const activities=[...(d.activities||[])].reverse();let status;
 if(['Submitted','Pending review'].includes(d.registration)){const checks=m.registrationChecks(id);status=`<section class="sales-next-panel"><div><span class="eyebrow">YOUR DECISION</span><h3>Recommended: ${checks.recommendation}</h3><p>${checks.recommendation==='Approve'?'No conflicts and the evidence is in place. Approving creates the CRM opportunity at Discovery and protects the deal for 90 days.':'At least one check failed. Reject with a reason; the partner can revise and resubmit.'}</p></div><button class="btn btn-primary" data-decide-reg="approve">Approve registration</button><button class="btn btn-outline btn-secondary" data-decide-reg="reject">Reject</button></section><section class="mgr-checks">${checkList('Registration checks',checks.items)}${checks.conflicts.length?`<div class="mgr-matches"><span>CONFLICTING RECORDS</span><ul>${checks.conflicts.map(c=>`<li><span><b>${esc(c.company)}</b> · ${esc(c.product)} · ${c.kind} · ${esc(m.partnerName(c.partnerId))}</span><small>${esc(c.stage)}</small></li>`).join('')}</ul></div>`:''}</section>`;}
 else status=`<section class="sales-next-panel"><div><span class="eyebrow">STATUS</span><h3>${esc(d.registration)}</h3><p>${d.registration==='Approved'?`CRM opportunity ${esc(d.opportunityId)} is at ${esc(d.stage)}. Protected for ${esc(m.partnerName(d.partnerId))} until ${date(d.protectedUntil)}.`:esc(d.reason||d.withdrawReason||'')}</p></div>${d.opportunityId?`<button class="btn btn-outline btn-secondary" data-open-opp="${esc(d.opportunityId)}">View opportunity</button>`:''}</section>`;
 drawer('Deal registration',pill(d.registration),d.crmId,`<div class="lead-detail-title"><h2 id="mgr-drawer-title">${esc(d.company)}</h2><p>${esc(d.name||'')}</p><span>${esc(d.product)} · ${money(d.value)} · close ${date(d.expectedClose)}</span></div>
 ${routeStrip([['PARTNER',partnerLink(d.partnerId)],['LEAD',d.leadId?esc(d.leadId)+' · qualified':'Direct registration'],['SUBMITTED',time(d.submittedAt||d.updatedAt)]])}
 ${status}
 ${recordRows('REGISTRATION DETAILS',[['Opportunity',d.name],['Product',d.product],['Estimated value',money(d.value)],['Expected close',date(d.expectedClose)],['Customer need',d.need],['Contact',d.contact],['Email',d.email],['Region',d.region]])}
 ${activities.length?`<section class="sales-activity-section"><div class="drawer-section-heading"><h3>Partner activity</h3></div><ul class="sales-activities">${activities.map(a=>`<li><span class="task-symbol">${icon('book')}</span><div><strong>${esc(a.type)}</strong><p>${esc(a.note)}</p><time>${time(a.time)}</time></div></li>`).join('')}</ul></section>`:''}
 ${decisionLog([...(d.vendorLog||[])].reverse())}`);
}
function openOpportunity(id){
 const m=mgr();let o;try{o=m.opportunity(id);}catch(error){closeOverlay();return toast(error.message);}
 detailId='opp:'+id;
 const reg=o.registrationId?m.registrations().find(d=>d.crmId===o.registrationId):null,stage=o.stage,closed=['Won','Lost'].includes(stage);
 const text=stage==='Won'?`Won for ${money(wonValue(o))}${o.closeDate?' on '+date(o.closeDate):''}.`:stage==='Lost'?`Lost · ${esc(o.lostReason||'')}${o.outcomeReason?' · '+esc(o.outcomeReason):''}`:`Open at ${esc(stage)}. The partner updates the stage as the deal moves.`;
 drawer('Opportunity',pill(stage),o.id,`<div class="lead-detail-title"><h2 id="mgr-drawer-title">${esc(o.company)}</h2><p>${esc(o.name||o.product||'')}</p><span>${esc(o.product||'')} · ${money(stage==='Won'?wonValue(o):o.value)} · ${closed?'closed':'expected close'} ${date(o.closeDate||o.expectedClose)}</span></div>
 ${routeStrip([['PARTNER',partnerLink(o.partnerId)],['DEAL REGISTRATION',reg?esc(reg.crmId)+' · '+esc(reg.registration):'Created in Salesforce'],['PROTECTED UNTIL',date(o.protectedUntil)]])}
 <section class="sales-next-panel"><div><span class="eyebrow">STAGE</span><h3>${esc(stage)}</h3><p>${text}</p></div>${reg?`<button class="btn btn-outline btn-secondary" data-open-reg="${esc(reg.crmId)}">View deal registration</button>`:''}</section>
 <ol class="lead-stage-tracker mgr-opp-tracker">${['Discovery','Proposal','Negotiation',stage==='Lost'?'Lost':'Won'].map((s,i,all)=>{const at=all.indexOf(stage),done=i<at||closed&&i===at;return `<li class="${done?'complete':i===at?'current':''}"><span>${done?icon('check'):i+1}</span>${s}</li>`;}).join('')}</ol>
 ${recordRows('OPPORTUNITY DETAILS',[['Opportunity',o.name],['Product',o.product],['Estimated value',money(o.value)],['Expected close',date(o.expectedClose)],['Contact',o.contact],['Email',o.email],['Region',o.region]])}`);
}
function openPartner(id){
 const m=mgr(),p=m.partners().find(x=>x.id===id);if(!p){closeOverlay();return toast('This partner is no longer in the program.');}
 detailId='partner:'+id;
 const pr=PROFILES[id]||{},s=partnerStats(m,id),metric=(label,value,note)=>`<div><span>${label}</span><b>${value}</b><small>${note}</small></div>`;
 drawer('Partner',tier(pr.tier),pr.code||id,`<div class="lead-detail-title mgr-partner-title">${partnerLogo(id,'lg')}<div><h2 id="mgr-drawer-title">${esc(p.name)}</h2><p>${esc(pr.type||'Partner')} · ${esc(pr.region||'')}</p><span>Partner since ${date(pr.joined)} · ${esc(pr.benefit||'')}</span></div></div>
 ${routeStrip([['PRIMARY CONTACT',esc(pr.contact||'—')+'<small>'+esc(pr.email||'')+'</small>'],['CERTIFIED SELLERS',esc(pr.sellers??'—')],['WAITING ON YOU',s.pending?s.pending+' registration'+(s.pending===1?'':'s'):'Nothing']])}
 <section class="mgr-drawer-metrics">${metric('Open pipeline',short(s.pipeline),s.open.length+' open')}${metric('Closed won',short(s.wonTotal),s.won.length+' won')}${metric('Win rate',s.winRate===null?'—':s.winRate+'%','Won vs lost')}${metric('Lead acceptance',s.acceptance===null?'—':s.acceptance+'%','Vendor leads accepted')}</section>
 <section class="mgr-target mgr-drawer-target"><div><span>Sourced pipeline vs annual target</span><b>${s.attainment}%</b></div>${progress(s.attainment)}<small>${short(s.pipeline+s.wonTotal)} of ${short(s.target)}</small></section>
 <section class="sales-activity-section"><div class="drawer-section-heading"><h3>Leads <span class="tiny">${s.leads.length}</span></h3></div>${s.leads.length?`<ul class="mgr-mini-list">${s.leads.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(r=>`<li><button data-open="${r.crmId}">${logo(r.company)}<span><b>${esc(r.company)}</b><small>${r.origin==='crm'?'Assigned by vendor':'Registered by partner'} · ${short(r.value)}</small></span>${pill(m.stage(r))}</button></li>`).join('')}</ul>`:'<p class="subtitle">No leads yet.</p>'}</section>
 <section class="sales-activity-section"><div class="drawer-section-heading"><h3>Opportunities <span class="tiny">${s.opps.length}</span></h3></div>${s.opps.length?`<ul class="mgr-mini-list">${s.opps.map(o=>`<li><button data-open-opp="${esc(o.id)}">${logo(o.company)}<span><b>${esc(o.company)}</b><small>${esc(o.product||'')} · ${short(o.stage==='Won'?wonValue(o):o.value)}</small></span>${pill(o.stage)}</button></li>`).join('')}</ul>`:'<p class="subtitle">No opportunities yet.</p>'}</section>`,`<button class="btn btn-primary btn-sm" data-action="assign" data-assign-to="${id}">${icon('plus')}Assign a lead</button>`);
}
function closeOverlay(){document.getElementById('overlay').innerHTML='';document.getElementById('app').inert=false;detailId=null;}
function reopen(){const [kind,id]=String(detailId).split(/:(.*)/);if(kind==='reg')openRegistration(id);else if(kind==='opp')openOpportunity(id);else if(kind==='partner')openPartner(id);else if(detailId)openLead(detailId);}

// ---- Forms and dialogs ----
let fieldId=0;
const field=(label,name,value='',type='text',required=true)=>{const id='m-'+name+'-'+(++fieldId);return `<div class="field"><label class="form-label" for="${id}">${label}</label><input class="form-control" id="${id}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}></div>`;};
const select=(label,name,options,value)=>{const id='m-'+name+'-'+(++fieldId);return `<div class="field"><label class="form-label" for="${id}">${label}</label><select class="form-select" id="${id}" name="${name}">${options.map(o=>{const [v,text]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${v===value?'selected':''}>${esc(text)}</option>`;}).join('')}</select></div>`;};
const area=(label,name,value='',placeholder='')=>{const id='m-'+name+'-'+(++fieldId);return `<div class="field"><label class="form-label" for="${id}">${label}</label><textarea class="form-control" id="${id}" name="${name}" rows="3" placeholder="${esc(placeholder)}">${esc(value)}</textarea></div>`;};
function dialog(title,sub,body,wide=false){
 document.getElementById('app').inert=true;
 document.getElementById('overlay').innerHTML=`<div class="dialog-backdrop"><section class="app-dialog ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${title}</h2><button class="close" data-action="close" aria-label="Close dialog">×</button></div><p class="modal-sub">${sub}</p>${body}</section></div>`;
}
function modal(title,sub,body,onSubmit,wide=false){
 dialog(title,sub,`<form id="mgr-form">${body}<p id="mgr-form-error" class="field-error" role="alert"></p></form>`,wide);
 const form=document.getElementById('mgr-form');form.onsubmit=e=>{e.preventDefault();onSubmit(Object.fromEntries(new FormData(e.target)));};
 setTimeout(()=>form.querySelector('input,select,textarea')?.focus(),30);
}
const actions=(label,back)=>`<div class="sales-form-actions"><button type="button" class="btn btn-outline btn-secondary" ${back?`data-open="${back}"`:'data-action="close"'}>Cancel</button><button class="btn btn-primary" type="submit">${label}</button></div>`;
function returnForm(id){
 const m=mgr(),r=m.get(id),checks=m.checks(id),hint=checks.items.find(i=>i.id==='need'&&!i.ok)?'Please describe the customer’s need in more detail: what problem they want to solve, and why now.':checks.items.find(i=>i.id==='contact'&&!i.ok)?'Please add the customer contact’s full name and a valid work email.':'';
 modal('Return for information',esc(r.company)+' · The partner fixes the details and resubmits. Tell them exactly what to add.',area('Message to the partner','message',hint,'What should the partner add or correct?')+actions('Return to partner',id),v=>{if(act(m2=>m2.returnLead(id,v.message),'Returned to '+m.partnerName(r.partnerId)+'. They’ll see your note right away.')){closeOverlay();render();}});
}
function rejectForm(id){
 const m=mgr(),r=m.get(id),checks=m.checks(id),reason=checks.blocking.length?'Duplicate':!checks.items[1].ok?'Outside territory':'Not a fit for the program';
 modal('Reject registration',esc(r.company)+' · Rejected registrations close for the partner. Choose the reason they’ll see.',select('Reason','reason',W.REJECT_REASONS,reason)+field('Note to the partner (required for Other)','note','','text',false)+actions('Reject registration',id),v=>{if(act(m2=>m2.reject(id,v.reason,v.note),'Rejected · '+r.company+'.')){closeOverlay();render();}});
}
function rejectRegistrationForm(id){
 const m=mgr(),d=m.registration(id),checks=m.registrationChecks(id),reason=checks.conflicts.length?'Conflicts with an existing registration':d.region==='Other'?'Outside territory':'Not enough customer evidence';
 modal('Reject registration',esc(d.company)+' · The partner sees your reason and can revise and resubmit.',select('Reason','reason',W.REG_REJECT_REASONS,reason)+field('Note to the partner (required for Other)','note','','text',false)+`<div class="sales-form-actions"><button type="button" class="btn btn-outline btn-secondary" data-open-reg="${id}">Cancel</button><button class="btn btn-primary" type="submit">Reject registration</button></div>`,v=>{if(act(m2=>m2.rejectRegistration(id,v.reason,v.note),'Rejected · '+d.company+'. The partner can revise it.')){closeOverlay();render();}});
}
function assignForm(partnerId='partner-acme'){
 modal('Assign a lead','Send a vendor lead to a partner. They have 48 hours to accept, then 3 days to make first contact.',`${select('Partner','partnerId',W.PARTNERS.map(p=>[p.id,p.name+(PROFILES[p.id]?' · '+PROFILES[p.id].tier+' · '+PROFILES[p.id].region:'')]),partnerId)}<div class="form-row">${field('Customer company','company')}${select('Customer region','region',W.REGIONS,PROFILES[partnerId]?.region||'North America')}</div><div class="form-row">${field('Contact name','contact')}${field('Customer email','email','','email')}</div><div class="form-row">${select('Product interest','product',W.LEAD_PRODUCTS,'Not sure yet')}${field('Estimated value ($)','value','','number')}</div>${select('Lead source','source',SOURCES,SOURCES[0])}${area('Customer need','need','','What does the customer want to solve?')}${actions('Assign to partner')}`,v=>{const r=act(m=>m.assign(v),'Assigned to '+W.PARTNERS.find(p=>p.id===v.partnerId)?.name+'. They have 48 hours to accept.');if(r){closeOverlay();page='distribution';render();}},true);
}
function reassignForm(id){
 const m=mgr(),r=m.get(id),others=W.PARTNERS.filter(p=>p.id!==r.partnerId);
 modal('Reassign lead',esc(r.company)+' · Currently with '+esc(m.partnerName(r.partnerId))+'. The new partner gets a fresh 48-hour window.',select('New partner','partnerId',others.map(p=>[p.id,p.name]),others[0]?.id)+actions('Reassign lead',id),v=>{if(act(m2=>m2.reassign(id,v.partnerId),'Reassigned to '+m.partnerName(v.partnerId)+'.')){closeOverlay();render();}});
}
function searchDialog(){
 dialog('Search','Partners, leads, deal registrations, and opportunities across your program.',`<input class="form-control" id="mgr-search" placeholder="Company, partner, contact, or record ID…" aria-label="Search the program" autocomplete="off"><div id="mgr-search-results" class="search-results"></div>`);
 const input=document.getElementById('mgr-search'),update=q=>{
  const m=mgr(),needle=String(q||'').trim().toLowerCase(),hit=(...values)=>values.join(' ').toLowerCase().includes(needle),result=(attr,ic,title,sub)=>`<button class="result" ${attr}>${icon(ic)}<span>${esc(title)}</span><small>${esc(sub)}</small></button>`;
  const found=needle?[...m.partners().filter(p=>hit(p.name,PROFILES[p.id]?.contact)).map(p=>result(`data-open-partner="${p.id}"`,'partners',p.name,'Partner · '+(PROFILES[p.id]?.tier||''))),...m.leads().filter(r=>hit(r.company,r.contact,r.email,r.crmId,m.partnerName(r.partnerId))).map(r=>result(`data-open="${r.crmId}"`,'leads',r.company,'Lead · '+(LABELS[m.stage(r)]||W.leadLabel(m.stage(r)))+' · '+m.partnerName(r.partnerId))),...m.registrations().filter(d=>hit(d.company,d.name,d.crmId,m.partnerName(d.partnerId))).map(d=>result(`data-open-reg="${d.crmId}"`,'book',d.company,'Deal registration · '+(LABELS[d.registration]||d.registration)+' · '+m.partnerName(d.partnerId))),...m.opportunities().filter(o=>hit(o.company,o.name,o.id,m.partnerName(o.partnerId))).map(o=>result(`data-open-opp="${esc(o.id)}"`,'opportunity',o.company,'Opportunity · '+o.stage+' · '+m.partnerName(o.partnerId)))]:[];
  document.getElementById('mgr-search-results').innerHTML=needle?found.slice(0,12).join('')||'<p class="empty">No matches.</p>':'<p class="empty">Start typing to search.</p>';
 };
 input.oninput=e=>update(e.target.value);update('');setTimeout(()=>input.focus?.(),30);
}
function activityDialog(){unseen=0;dialog('Partner activity','The latest from partners and your team, newest first.',feedList(feed(mgr(),15)));render();}

// ---- Live updates from partners ----
function takeSnapshot(){const m=mgr();snapshot=Object.fromEntries([...m.leads().map(r=>[r.crmId,m.stage(r)]),...m.registrations().map(d=>[d.crmId,d.registration+'|'+(d.stage||'')])]);}
function announce(){
 const m=mgr(),messages=[];
 for(const r of m.leads()){const before=snapshot[r.crmId],now=m.stage(r),name=m.partnerName(r.partnerId);if(before===now)continue;
  if(now==='Submitted')messages.push((before==='Needs information'?'Resubmitted by ':'New registration from ')+name+' · '+r.company);
  else if(before&&now==='Accepted')messages.push(name+' accepted '+r.company);
  else if(before&&now==='Declined')messages.push(name+' declined '+r.company);
  else if(before&&now==='Working')messages.push(name+' contacted '+r.company);
  else if(before&&now==='Qualified')messages.push(name+' qualified '+r.company);
  else if(before&&now==='Converted')messages.push(name+' converted '+r.company+' to a deal');}
 for(const d of m.registrations()){const before=snapshot[d.crmId],now=d.registration+'|'+(d.stage||''),name=m.partnerName(d.partnerId);if(before===now)continue;
  if(['Submitted','Pending review'].includes(d.registration))messages.push('New deal registration from '+name+' · '+d.company);
  else if(before&&d.registration==='Withdrawn')messages.push(name+' withdrew the registration for '+d.company);
  else if(before&&d.stage&&before.split('|')[1]!==d.stage)messages.push(name+' moved '+d.company+' to '+d.stage);}
 takeSnapshot();if(messages.length){unseen+=messages.length;toast(messages.at(-1));}
}
window.addEventListener('storage',e=>{
 if(e.key!==KEY||!e.newValue)return;
 try{const fresh=JSON.parse(e.newValue);if(!fresh?.sales)return;state=fresh;}catch{return;}
 if(!signedIn)return;announce();
 if(document.querySelector('.dialog-backdrop'))return;
 render();if(detailId)reopen();
});

// ---- Events ----
function route(){const [name,id]=location.hash.slice(1).split('/');linkedLead=linkedReg=null;if(name==='review'&&id){linkedLead=id;page='queue';}else if(name==='registration'&&id){linkedReg=id;page='registrations';}else if(views[name])page=name;}
function openLinked(){if(linkedReg)openRegistration(linkedReg);else if(linkedLead)openLead(linkedLead);}
const FILTERS={leadGroup:v=>leadFilter.group=v,leadPartner:v=>leadFilter.partner=v,oppStage:v=>oppFilter.stage=oppFilter.stage===v&&v!=='all'?'all':v,oppPartner:v=>oppFilter.partner=v};
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action],[data-page],[data-open],[data-open-reg],[data-open-opp],[data-open-partner],[data-decide],[data-decide-reg],[data-reassign],[data-lead-group],[data-lead-partner],[data-opp-stage],[data-opp-partner],[data-trend-metric],[data-trend-range],[data-trend-partner],[data-mix],[data-inbox],[data-board],[data-opp-go],[data-funnel],[data-quick],[data-ov-skip],[data-quick-reject],[data-quick-return]');if(!el)return;
 const data=el.dataset;
 for(const [key,set] of Object.entries(FILTERS))if(data[key]){set(data[key]);return render();}
 // Overview controls re-render just their card.
 if(data.trendMetric||data.trendRange||data.trendPartner){
  if(data.trendMetric)ov.metric=data.trendMetric;if(data.trendRange)ov.range=Number(data.trendRange);
  if(data.trendPartner){const id=data.trendPartner;if(ov.hidden.has(id))ov.hidden.delete(id);else if(ov.hidden.size<mgr().partners().length-1)ov.hidden.add(id);else return toast('Keep at least one partner on the chart.');}
  return swap('mgr-trend',trendInner(programData(mgr())));
 }
 if(data.ovSkip){ov.skip.add(data.ovSkip);return render();}
 if(data.quickReject){const [kind,id]=data.quickReject.split(/:(.*)/);adopt();return kind==='lead'?rejectForm(id):rejectRegistrationForm(id);}
 if(data.quickReturn){adopt();return returnForm(data.quickReturn);}
 if(data.mix){ov.mix=data.mix;return swap('mgr-mix',mixInner(mgr()));}
 if(data.inbox){ov.inbox=data.inbox;return swap('mgr-inbox',inboxInner(mgr()));}
 if(data.board){ov.board=data.board;const m=mgr();return swap('mgr-board',boardInner(m,programData(m)));}
 if(data.oppGo){oppFilter={partner:'all',stage:data.oppGo};page='opportunities';closeOverlay();render();window.scrollTo(0,0);return;}
 if(data.funnel){leadFilter={partner:'all',group:data.funnel};page='leads';closeOverlay();render();window.scrollTo(0,0);return;}
 if(data.quick){const [kind,id]=data.quick.split(/:(.*)/),lead=kind==='lead';adopt();let company='';try{company=lead?mgr().get(id).company:mgr().registration(id).company;}catch{}if(act(m=>lead?m.approve(id):m.approveRegistration(id),'')){const next=nextFocus(attention(mgr()));toast((lead?'Approved · '+company+'. The partner can start working it.':'Approved · CRM opportunity created for '+company+'.')+(next?' Next up: '+next.r.company+' · '+next.kind.toLowerCase()+'.':' The queue is clear.'));render();}return;}
 if(data.openReg){adopt();return openRegistration(data.openReg);}
 if(data.openOpp){adopt();return openOpportunity(data.openOpp);}
 if(data.openPartner){adopt();return openPartner(data.openPartner);}
 if(data.decideReg){const id=detailId.slice(4);if(data.decideReg==='approve'){const d=act(m=>m.approveRegistration(id),'Approved · CRM opportunity created for '+mgr().registration(id).company+'.');if(d){closeOverlay();render();}}else rejectRegistrationForm(id);return;}
 if(data.page){entrance=data.page==='overview'&&page!=='overview';page=data.page;navOpen=false;closeOverlay();render();window.scrollTo(0,0);return;}
 if(data.open){adopt();return openLead(data.open);}
 if(data.reassign)return reassignForm(data.reassign);
 if(data.decide){const id=detailId;if(data.decide==='approve'){const r=act(m=>m.approve(id),'Approved · '+mgr().get(id).company+'. The partner can start working it.');if(r){closeOverlay();render();}}else if(data.decide==='return')returnForm(id);else rejectForm(id);return;}
 const action=data.action;
 if(action==='add-user')return userForm();
 if(action==='edit-user')return userForm(data.userId);
 // Signing out returns to the first screen, where either portal can be chosen.
 if(action==='signout'){signedIn=false;try{sessionStorage.removeItem(SESSION);}catch{}closeOverlay();render();location.href='index.html';return;}
 if(action==='close')return closeOverlay();
 if(action==='assign')return assignForm(data.assignTo||undefined);
 if(action==='search')return searchDialog();
 if(action==='activity')return activityDialog();
 if(action==='mode'){const auto=mgr().reviewMode()!=='auto';act(m=>m.setReviewMode(auto?'auto':'manual'),auto?'Automatic review is on. Partner registrations are decided by program rules on their next sync.':'Manual review is on. New registrations wait for you.');return render();}
 if(action==='menu'){navOpen=!navOpen;return render();}
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&document.getElementById('overlay').innerHTML){closeOverlay();return;}
 if(signedIn&&(e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault?.();searchDialog();}
});
window.addEventListener('hashchange',()=>{route();if(signedIn){render();if(linkedReg||linkedLead)openLinked();}});
route();takeSnapshot();render();if(signedIn)openLinked();
})();
