/* Deal details from a partner's own words. A simulated AI extractor that runs entirely on this device
   (pattern-based, nothing is sent anywhere). It returns the same shape a real AI service would, so it
   can be replaced by one later without changing the registration screens. */
(function(root){
'use strict';
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTH=new RegExp('\\b('+MONTHS.map(m=>m.slice(0,3)+'(?:'+m.slice(3)+')?').join('|')+')\\b\\.?','i');
const REGIONS=[['North America',/\b(north america|usa?|u\.s\.a?|united states|canada|american?|new york|california|texas|chicago|boston|toronto|vancouver|seattle|austin)\b/i],['Europe',/\b(europe|european|eu|uk|u\.k\.|united kingdom|britain|england|germany|france|spain|italy|netherlands|ireland|sweden|london|berlin|paris|madrid|amsterdam|dublin|emea)\b/i],['Asia Pacific',/\b(apac|asia|asia pacific|australia|new zealand|singapore|india|japan|korea|hong kong|sydney|melbourne|tokyo|bangalore|mumbai)\b/i],['Other',/\b(latin america|latam|brazil|argentina|chile|colombia|africa|middle east|uae|dubai|saudi|nigeria|kenya|egypt)\b/i]];
const PRODUCTS=[['Sales Cloud',/\bsales cloud\b/i,/\b(sales (team|reps?|pipeline|process|forecast\w*)|pipeline|reps|crm for sales|account executives|quotas?)\b/i],['Service Cloud',/\bservice cloud\b/i,/\b(support|service desk|help ?desk|contact cent(er|re)|agents|cases|tickets|customer service|field service)\b/i],['Platform',/\b(salesforce )?platform\b/i,/\b(custom apps?|app builder|integration|portal|automation|workflow apps?)\b/i]];
const TITLE=/\b(chief [a-z]+ officer|ceo|cfo|coo|cto|cio|cmo|cro|(?:senior |sr\.? )?vp(?: of)? [a-z&]+(?: [a-z&]+)?|vice president(?: of)? [a-z&]+(?: [a-z&]+)?|head of [a-z&]+(?: [a-z&]+)?|(?:senior )?director(?: of)? [a-z&]+(?: [a-z&]+)?|[a-z]+ manager|procurement lead|it lead|founder|owner)\b/i;
const NEED=/\b(needs?|want(s|ed)?|looking (for|to)|replac\w+|struggl\w+|problem|pain|goal|so (that )?they can|to help|improv\w+|consolidat\w+|automat\w+|manage|track\w*|move (off|away)|migrat\w+|moderni[sz]\w+|unify|centrali[sz]\w+)\b/i;
const STOP=new Set(['The','They','We','Our','Their','It','He','She','This','That','Contact','Customer','Company','Budget','Decision','Signing','Deal','About','Around','Approximately','Sales','Service','Platform','Cloud','Q1','Q2','Q3','Q4','North','South','Europe','Asia','America','I','Mr','Ms','Mrs','Dr','VP','CEO','CFO','CTO','COO','CIO','Head','Director','Manager','Next','End','Phone','Email','Need','Needs','Wants','Looking',...MONTHS.map(m=>m[0].toUpperCase()+m.slice(1))]);
const SUFFIX=/^(inc|llc|ltd|limited|corp|corporation|co|group|gmbh|plc|pty|systems|labs|technologies|solutions|logistics|health|healthcare|clinics?|retail|foods|hotels|bank|insurance|manufacturing|energy|media|analytics|software|partners|holdings|industries|services|consulting|networks|motors|airlines|university|college|school)$/i;
const pad=n=>String(n).padStart(2,'0'),iso=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
const endOfMonth=(y,m)=>new Date(Date.UTC(y,m+1,0));
const title=s=>s.replace(/\b[a-z]/g,c=>c.toUpperCase()).replace(/\b(Of|And|For|The)\b/g,w=>w.toLowerCase()).replace(/\bVp\b/,'VP').replace(/\b(Ceo|Cfo|Coo|Cto|Cio|Cmo|Cro|It)\b/g,x=>x.toUpperCase());
// Keywords match in any case while names keep their capital-letter shape: ci('contact') → [Cc]ontact.
const ci=words=>words.split('|').map(w=>'['+w[0].toUpperCase()+w[0]+']'+w.slice(1)).join('|');

function amount(text){
 const found=[];const re=/(?:(?:\$|usd\s?|us\$)\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|mm|million|thousand|bn|billion)?\b|\b(\d[\d,]*(?:\.\d+)?)\s?(k|m|mm|million|thousand)\b(?:\s?(?:usd|dollars))?|\b(\d[\d,]*(?:\.\d+)?)\s?(?:usd|dollars)\b)/gi;
 for(const m of text.matchAll(re)){
  const raw=m[1]||m[3]||m[5],unit=(m[2]||m[4]||'').toLowerCase();let value=Number(String(raw).replace(/,/g,''));
  if(!Number.isFinite(value))continue;
  if(['k','thousand'].includes(unit))value*=1e3;else if(['m','mm','million'].includes(unit))value*=1e6;else if(['bn','billion'].includes(unit))value*=1e9;
  const before=text.slice(Math.max(0,m.index-40),m.index).toLowerCase();
  found.push({value:Math.round(value),text:m[0].trim(),weight:/(budget|worth|value|deal|about|around|approx|roughly|total|spend|contract|price|quote|for)\W*$/.test(before)||/(budget|worth|valued)/.test(before)?2:1});
 }
 if(!found.length)return null;
 return found.sort((a,b)=>b.weight-a.weight||b.value-a.value)[0];
}
function closeDate(text,today){
 const now=new Date(today+'T12:00:00Z'),y=now.getUTCFullYear(),future=d=>d>=now?d:new Date(Date.UTC(d.getUTCFullYear()+1,d.getUTCMonth(),d.getUTCDate()));
 let m=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);if(m)return {date:`${m[1]}-${m[2]}-${m[3]}`,text:m[0]};
 m=text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);if(m)return {date:`${m[3]}-${pad(m[1])}-${pad(m[2])}`,text:m[0],note:'read as month/day/year'};
 m=text.match(/\b(?:end of|by the end of|late) (?:the )?(this|next) quarter\b/i)||text.match(/\b(this|next) quarter\b/i);
 if(m){const q=Math.floor(now.getUTCMonth()/3)+(m[1].toLowerCase()==='next'?1:0);return {date:iso(endOfMonth(y+Math.floor(q/4),(q%4)*3+2)),text:m[0]};}
 m=text.match(/\bq([1-4])(?:\s*(?:of\s*)?(20\d{2}))?\b/i);
 if(m){let year=Number(m[2])||y;const end=endOfMonth(year,Number(m[1])*3-1);if(!m[2]&&end<now)year++;return {date:iso(endOfMonth(year,Number(m[1])*3-1)),text:m[0],note:'end of the quarter'};}
 m=text.match(/\b(?:end of|by|before|in|during|late) (?:the )?year\b|\byear[- ]end\b/i);if(m)return {date:`${y}-12-31`,text:m[0]};
 m=text.match(/\b(?:in|within)\s+(\d+|a|one|two|three|four|six)\s+(day|week|month)s?\b/i);
 if(m){const n={a:1,one:1,two:2,three:3,four:4,six:6}[m[1].toLowerCase()]||Number(m[1]),d=new Date(now);if(/day/i.test(m[2]))d.setUTCDate(d.getUTCDate()+n);else if(/week/i.test(m[2]))d.setUTCDate(d.getUTCDate()+7*n);else d.setUTCMonth(d.getUTCMonth()+n);return {date:iso(d),text:m[0]};}
 m=text.match(/\bnext month\b/i);if(m)return {date:iso(endOfMonth(y,now.getUTCMonth()+1)),text:m[0],note:'end of next month'};
 const month=text.match(new RegExp('(?:\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?)?'+MONTH.source+'(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s+(20\\d{2}))?','i'));
 if(month){
  const index=MONTHS.findIndex(name=>name.startsWith(month[2].toLowerCase().slice(0,3))),day=Number(month[1]||month[3]),year=Number(month[4])||y;
  const date=day?new Date(Date.UTC(year,index,day)):endOfMonth(year,index);
  return {date:iso(month[4]?date:future(date)),text:month[0].trim(),note:day?'':'end of the month'};
 }
 return null;
}
function contactName(text,email){
 const name='([A-Z][a-z]+(?:[-\\s][A-Z][a-z]+){1,2})',titled=new RegExp('^'+TITLE.source,'i');
 for(const re of [new RegExp('\\b(?:'+ci('contact|champion|sponsor|decision maker|buyer')+')\\s*(?:is|:|-)?\\s*'+name),new RegExp('\\b(?:'+ci('spoke|met|talked|speaking|meeting')+')\\s+(?:with|to)\\s+'+name),new RegExp(name+'\\s+(?:\\(|<)?[\\w.+-]+@')]){
  const m=text.match(re);if(m&&!STOP.has(m[1].split(/\s/)[0]))return {value:m[1].trim()};
 }
 // "Dana Lee (VP Sales" or "Dana Lee, Head of Service": a capitalised name followed by a job title.
 for(const m of text.matchAll(new RegExp(name+'\\s*(?:\\(|,)\\s*(?:the\\s+)?','g')))if(!STOP.has(m[1].split(/\s/)[0])&&titled.test(text.slice(m.index+m[0].length)))return {value:m[1].trim()};
 if(email){const local=email.split('@')[0];if(/^[a-z]+[._][a-z]+$/i.test(local))return {value:title(local.replace(/[._]/g,' ')),note:'from the email address'};}
 return null;
}
function company(text,contact,email){
 const caps="((?:[A-Z][A-Za-z0-9&'.-]*)(?:\\s+(?:[A-Z][A-Za-z0-9&'.-]*|of|and|&)){0,3})";
 const candidates=[];
 for(const [re,weight]of [[new RegExp('\\b(?:'+ci('customer|company|account|client|prospect')+')\\s*(?:is|:|-)\\s*'+caps),6],[new RegExp('\\b(?:at)\\s+'+caps),4],[new RegExp('\\b(?:from)\\s+'+caps),3],[new RegExp('\\b(?:with|for)\\s+'+caps),2],[new RegExp(caps+"(?:'s)?\\s+(?:wants?|needs?|is looking|are looking|would like|plans?|is planning|is replacing|is moving|has|signed|agreed)"),4]])
  for(const m of text.matchAll(new RegExp(re.source,'g'))){
   let words=m[1].trim().split(/\s+/);const stop=words.findIndex(w=>/[.,;:]$/.test(w));if(stop>=0)words=words.slice(0,stop+1);words=words.map(w=>w.replace(/[.,;:]+$/,''));while(words.length&&STOP.has(words[0]))words.shift();while(words.length&&/^(of|and|&)$/i.test(words.at(-1)))words.pop();
   const value=words.join(' ').replace(/[.,]$/,'');if(!value||value.length<3||contact&&contact.includes(value)||PRODUCTS.some(([p])=>p===value)||MONTH.test(value)&&value.split(' ').length===1)continue;
   candidates.push({value,weight:weight+(SUFFIX.test(words.at(-1))?2:0)+(words.length>1?1:0)});
  }
 if(candidates.length)return {value:candidates.sort((a,b)=>b.weight-a.weight)[0].value};
 if(email){const domain=email.split('@')[1].split('.')[0];if(!/^(gmail|outlook|yahoo|hotmail|icloud|example)$/.test(domain))return {value:title(domain.replace(/[-_]/g,' ')),note:'from the email domain'};}
 return null;
}
function need(text,removals){
 const sentences=text.replace(/\s+/g,' ').split(/(?<=[.!?;])\s+/).map(s=>s.trim()).filter(Boolean);
 const picked=sentences.filter(s=>NEED.test(s)&&!/^(contact|budget|email|phone)\b/i.test(s)).slice(0,2);
 let value=(picked.length?picked:sentences).join(' ').replace(/\([^)]*@[^)]*\)/g,'');for(const part of removals)if(part)value=value.replace(new RegExp('(?:\\b(?:about|around|roughly|approximately|approx\\.?|worth|valued at|budget of)\\s+|~\\s*)?'+part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'').replace(/\(\s*\)/g,'');
 value=value.replace(/\s{2,}/g,' ').replace(/\s+([,.])/g,'$1').replace(/,(?:\s*,)+/g,',').replace(/,\./g,'.').trim();
 return value.length>=10?{value:value.length>400?value.slice(0,397)+'…':value}:null;
}
// Returns {fields, sources, notes, missing}. Locked values (from a qualified lead) are kept as they are.
function extract(text,context={}){
 const raw=String(text||'').trim(),today=context.today||new Date().toISOString().slice(0,10),locked=context.locked||{},fields={},notes=[];
 const set=(field,result,label)=>{if(!result||locked[field]!==undefined&&locked[field]!=='')return;fields[field]=result.value;if(label)notes.push(label);};
 const email=raw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.replace(/[.,]$/,'');
 if(email)set('email',{value:email.toLowerCase()});
 const person=contactName(raw,email);set('contact',person,person?.note?'Contact name taken '+person.note+'.':'');
 const role=raw.match(new RegExp('(?:\\(|,\\s*(?:the\\s+)?|\\bis\\s+(?:the\\s+|our\\s+)?)'+TITLE.source,'i'));if(role)set('jobTitle',{value:title(role[1])});
 const org=company(raw,fields.contact||locked.contact,email);set('company',org,org?.note?'Customer taken '+org.note+'.':'');
 const region=REGIONS.find(([,re])=>re.test(raw));if(region)set('region',{value:region[0]},'Region set to '+region[0]+' from “'+raw.match(region[1])[0]+'”.');
 const product=PRODUCTS.find(([,named])=>named.test(raw))||PRODUCTS.find(([,,hint])=>hint.test(raw));if(product)set('product',{value:product[0]},product[1].test(raw)?'':'Product inferred as '+product[0]+' from “'+raw.match(product[2])[0]+'”.');
 const money=amount(raw);if(money)set('value',{value:money.value},'Estimated value read from “'+money.text+'”.');
 const close=closeDate(raw,today);if(close)set('expectedClose',{value:close.date},'Expected close read from “'+close.text+'”'+(close.note?' ('+close.note+')':'')+'.');
 const seats=raw.match(/\b(\d[\d,]*)\s+(?:(?:sales|software)\s+)?(reps|users|seats|agents|employees|people|licen[cs]es|technicians|locations|stores)\b/i);
 if(seats)set('quantity',{value:Number(seats[1].replace(/,/g,''))});
 const companyName=fields.company||locked.company,productName=fields.product||locked.product;
 if(companyName&&productName&&!locked.nameFromUser)fields.name=companyName+' · '+productName+(seats?' ('+seats[1]+' '+seats[2].toLowerCase()+')':'');
 set('need',need(raw,[email,money?.text]));
 const wanted=['company','contact','email','region','product','value','expectedClose','need'];
 const missing=wanted.filter(field=>(fields[field]??locked[field])===undefined||(fields[field]??locked[field])==='');
 return {fields,notes,missing,engine:'simulated'};
}
const api={extract};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DealAssist=api;
})(typeof globalThis!=='undefined'?globalThis:this);
