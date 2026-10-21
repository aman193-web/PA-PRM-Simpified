/* Browser-local user directory. No invitations or production authorization are provisioned. */
(function(root){
'use strict';
const roles={'partner-manager':'Partner Manager','partner-account-manager':'Partner Account Manager'};
const permissions={leads:'Manage leads',deals:'Register and track deals',reviews:'Review registrations',distribution:'Assign leads',users:'Manage users and permissions'};
const defaults=role=>role==='partner-account-manager'?Object.keys(permissions):['leads','deals'];
function initialize(state){
 if(!state.userDirectory)state.userDirectory={sequence:2,users:[{id:'U1',name:'Riley Chen',email:'riley.chen@vendor.example',role:'partner-account-manager',partnerId:null,permissions:defaults('partner-account-manager'),active:true,owner:true},{id:'U2',name:state.user?.name||'Alex Morgan',email:state.user?.email||'alex.morgan@acmepartners.example',role:'partner-manager',partnerId:'partner-acme',permissions:defaults('partner-manager'),active:true}],history:[]};
 return state.userDirectory;
}
function saveUser(state,values,actor='Riley Chen'){
 const dir=initialize(state),old=values.id?dir.users.find(u=>u.id===values.id):null;
 if(values.id&&!old)throw Error('This user is no longer available.');
 const name=String(values.name||'').trim(),email=String(values.email||'').trim().toLowerCase(),role=values.role;
 if(name.length<2)throw Error('Enter a full name.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid email address.');
 if(dir.users.some(u=>u.id!==old?.id&&u.email.toLowerCase()===email))throw Error('A user with this email already exists.');
 if(!roles[role])throw Error('Choose a valid role.');
 const allowed=defaults(role),selected=values.permissions||[];
 if(!Array.isArray(selected)||selected.some(p=>!allowed.includes(p)))throw Error('These permissions are not available for this role.');
 if(!selected.length)throw Error('Select at least one permission.');
 const partnerId=role==='partner-manager'?values.partnerId:null;
 if(role==='partner-manager'&&!['partner-acme','another-partner','partner-cobalt'].includes(partnerId))throw Error('Choose a partner organization.');
 const active=values.active!==false;
 if(old?.owner&&(role!=='partner-account-manager'||!active||Object.keys(permissions).some(p=>!selected.includes(p))))throw Error('The workspace owner must retain active account manager access and all permissions.');
 const user={id:old?.id||'U'+(++dir.sequence),name,email,role,partnerId,permissions:[...selected],active,owner:old?.owner||false};
 if(old)Object.assign(old,user);else dir.users.push(user);
 dir.history.unshift({time:new Date().toISOString(),actor,userId:user.id,detail:(old?'Updated ':'Added ')+name+' · '+roles[role]+' · '+(active?'Active':'Inactive')});
 return user;
}
const api={roles,permissions,defaults,initialize,saveUser};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.UserAccess=api;
})(typeof globalThis!=='undefined'?globalThis:this);
