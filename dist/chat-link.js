// Ask PartnerAssistant: link to the natural-language assistant (the knowledge-base widget).
// Set CHAT_URL to the widget's link. Leave it empty to show the "not connected" note.
// Set OPEN_IN to 'panel' to show the widget inside the app, or 'tab' to open it in a new tab.
(function(){
 const CHAT_URL='';
 const OPEN_IN='panel';
 const LABEL='Ask PartnerAssistant';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const chatIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h7M8.5 14h4"/></svg>';
 function mount(){
  if(document.querySelector('.ask-pa'))return;
  const btn=document.createElement('button');btn.type='button';btn.className='ask-pa';btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls','ask-pa-panel');btn.innerHTML=chatIcon+'<span>'+esc(LABEL)+'</span>';btn.title=LABEL;
  const panel=document.createElement('section');panel.id='ask-pa-panel';panel.className='ask-pa-panel';panel.hidden=true;panel.setAttribute('aria-label',LABEL);
  const body=CHAT_URL?`<iframe src="${esc(CHAT_URL)}" title="${esc(LABEL)}" allow="clipboard-write; microphone"></iframe>`:`<div class="ask-pa-empty"><p><b>Ask anything about your leads, deals, and program in plain English.</b></p><p>The assistant isn't connected in this preview yet.</p><ul><li>Which leads are waiting for me?</li><li>Register a $50K deal with Chevron closing in March.</li><li>How much pipeline did we create this quarter?</li></ul></div>`;
  panel.innerHTML=`<header class="ask-pa-head"><b>${esc(LABEL)}</b>${CHAT_URL?`<a href="${esc(CHAT_URL)}" target="_blank" rel="noopener">Open in new tab</a>`:''}<button type="button" data-ask-close>Close</button></header>${body}`;
  const toggle=open=>{panel.hidden=!open;btn.setAttribute('aria-expanded',String(open));if(open)panel.querySelector('iframe,button')?.focus();};
  btn.onclick=()=>{if(CHAT_URL&&OPEN_IN==='tab'){window.open(CHAT_URL,'_blank','noopener');return;}toggle(panel.hidden);};
  panel.querySelector('[data-ask-close]').onclick=()=>{toggle(false);btn.focus();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){toggle(false);btn.focus();}});
  document.body.append(panel,btn);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
