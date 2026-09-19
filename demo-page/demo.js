'use strict';
const form = document.querySelector('#form1');
const byId = id => document.getElementById(id);
function notify(message){const box=byId('demo-status');box.textContent=message;box.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>box.hidden=true,6000);}
function show(id, visible){const el=byId(id);if(el)el.style.display=visible?'':'none';}
function refresh(){
 const incarcerated=byId('incarceratedIndividual')?.value==='y';
 const incarcerationType=byId('incarcerationType');
 if(incarcerationType){
  incarcerationType.disabled=!incarcerated;
  if(!incarcerated)incarcerationType.value='SEL';
 }
 const facility=document.querySelector('input[name="ltcAddrSw"]:checked')?.value==='Y';
 show('LTCStateBlock',facility);show('ltcCountyBlock',facility&&byId('ltcAddrState')?.value==='VA');
 show('readAppNoticesSection',document.querySelector('input[name="readAppNotices"]:checked')?.value==='Y');
 const needsHelp=document.querySelector('input[name="eldermedNeedsHelp"]:checked')?.value==='yes';
 show('eldermedHelpDetailBlock',needsHelp);
}
form?.addEventListener('submit',e=>{e.preventDefault();notify('Demo only. No application has been submitted.');});
document.addEventListener('change',refresh);
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-demo-action]');
 if(button){
  const action=button.dataset.demoAction.toLowerCase();
  if(action.includes('save')){
   const data=[...document.querySelectorAll('input,select,textarea')].map(el=>({id:el.id,value:el.value,checked:el.checked}));
   try{sessionStorage.setItem('eldermed-demo',JSON.stringify(data));notify('Demo saved in this browser tab. You can reload to resume.');}catch{notify('Browser storage unavailable. Keep this tab open.');}
  }else if(action.includes('next')){notify('About You demo complete. This prototype contains one page; nothing was submitted.');}
  else{notify('You are on the first page of this demo.');window.scrollTo({top:0,behavior:'smooth'});}
 }
 const link=e.target.closest('a[href="#"]');
 if(link){e.preventDefault();if(link.textContent.trim()==='Print')window.print();else notify('This link belongs to the original portal. This demo stays on About You.');}
});
try{const saved=JSON.parse(sessionStorage.getItem('eldermed-demo')||'null');if(Array.isArray(saved))for(const record of saved){const el=document.querySelector('input[id="'+CSS.escape(record.id)+'"],select[id="'+CSS.escape(record.id)+'"],textarea[id="'+CSS.escape(record.id)+'"]');if(el&&!el.disabled){el.value=record.value;if(el.type==='radio'||el.type==='checkbox')el.checked=record.checked;}}}catch{}
refresh();
