const test=require('node:test'),assert=require('node:assert/strict');
const DealAssist=require('../dist/deal-assist.js');
const today='2026-10-19',extract=(text,locked)=>DealAssist.extract(text,{today,locked});

test('a full description fills every registration field and says where values came from',()=>{
 const r=extract('Dana Lee (VP Sales, dana.lee@brightpath.example) at BrightPath Logistics wants Sales Cloud for 120 reps. Budget is about $180K and they plan to sign by March 31. They’re in Chicago and replacing spreadsheets for pipeline tracking.');
 assert.equal(r.engine,'simulated');assert.deepEqual(r.missing,[]);
 assert.deepEqual({...r.fields,need:undefined},{email:'dana.lee@brightpath.example',contact:'Dana Lee',jobTitle:'VP Sales',company:'BrightPath Logistics',region:'North America',product:'Sales Cloud',value:180000,quantity:120,expectedClose:'2027-03-31',name:'BrightPath Logistics · Sales Cloud (120 reps)',need:undefined});
 assert.match(r.fields.need,/replacing spreadsheets/);assert.doesNotMatch(r.fields.need,/\$180K|@/);
 assert.ok(r.notes.some(n=>/Chicago/.test(n)));assert.ok(r.notes.some(n=>/\$180K/.test(n)));
});

test('amounts and close dates are read in the ways partners write them',()=>{
 const value=text=>extract('Sales Cloud for Acme Corp, '+text).fields.value,close=text=>extract('Acme Corp wants Platform, $50K, '+text).fields.expectedClose;
 assert.equal(value('$1.2M total'),1200000);assert.equal(value('about 250k'),250000);assert.equal(value('$95,000'),95000);
 assert.equal(close('closing Q1 2027'),'2027-03-31');assert.equal(close('sign by the end of next quarter'),'2027-03-31');assert.equal(close('in 45 days'),'2026-12-03');assert.equal(close('by 2026-12-20'),'2026-12-20');assert.equal(close('by Dec 15'),'2026-12-15');
 assert.equal(extract('Orbit Health in London needs Platform').fields.region,'Europe');assert.equal(extract('Orbit Health wants help desk software for agents').fields.product,'Service Cloud');
});

test('missing details are listed and the need text drops amounts it already captured',()=>{
 const r=extract('They want Service Cloud for 60 agents, about $95K, and plan to sign by the end of next quarter.');
 assert.deepEqual(r.missing,['company','contact','email','region']);assert.equal(r.fields.need,'They want Service Cloud for 60 agents, and plan to sign by the end of next quarter.');
 assert.deepEqual(extract('hello').fields,{});
});

test('details from a qualified lead are kept and never replaced by the description',()=>{
 const locked={company:'Harbor Systems',contact:'Ava Chen',email:'ava@harbor.example',region:'Europe'};
 const r=extract('Bob Stone (bob@other.example) at Other Corp in Chicago wants Service Cloud for 60 agents, $95K, by Q1 2027.',locked);
 for(const field of Object.keys(locked))assert.equal(r.fields[field],undefined,field+' stays from the lead');
 assert.equal(r.fields.name,'Harbor Systems · Service Cloud (60 agents)');assert.equal(r.fields.value,95000);assert.deepEqual(r.missing,[]);
});
