(() => {
  if (globalThis.__eldermedFormToolsLoaded) return;
  globalThis.__eldermedFormToolsLoaded = true;
  const controls = key => [...document.querySelectorAll('input,select,textarea')].filter(el=>el.name===key && !['hidden','submit','image','button','password','file'].includes(el.type));
  const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const pageMatches = () => !!document.querySelector('input#dateOfBirth') && !!document.querySelector('input#addressLine1_org');
  function describe(field) {
    const els=controls(field.key), el=els[0];
    return {...field,available:!!el,visible:els.some(visible),disabled:!el || els.every(e=>e.disabled||e.readOnly),options:el?.tagName==='SELECT'?[...el.options].map(o=>({value:o.value,label:o.textContent.trim(),disabled:o.disabled})):field.options};
  }
  const waitForPage = () => new Promise(resolve=>setTimeout(resolve,100));
  async function handle(request) {
    const result={requestId:request.requestId};
    const fail=(code,error)=>({...result,success:false,code,error});
    if (!pageMatches()) return fail('WRONG_PAGE','Open the About You demo page first.');
    if (request.action==='GET_FIELDS') return {...result,success:true,fields:globalThis.ELDERMED_FIELDS.map(describe)};
    if (request.action!=='SET_FIELD') return fail('UNSUPPORTED_ACTION','Unknown action.');
    const field=globalThis.ELDERMED_FIELDS.find(f=>f.key===request.field);
    if (!field) return fail('UNKNOWN_FIELD','Field is not in the supported About You map.');
    if (typeof request.value!=='string') return fail('INVALID_VALUE','Provide the field value as a string.');
    const els=controls(field.key), el=els[0];
    if (!el) return fail('FIELD_NOT_FOUND','Field does not exist on this page.');
    if (!visible(el)) return fail('FIELD_HIDDEN','Answer the controlling question before filling this field.');
    if (el.disabled||el.readOnly) return fail('FIELD_DISABLED','This field is disabled or read-only.');
    let target=el;
    if (el.type==='radio') {
      target=els.find(e=>e.value===request.value);
      if (!target) return fail('INVALID_OPTION','Choose an exact available option value.');
      if (target.disabled||!visible(target)) return fail('OPTION_UNAVAILABLE','The requested option is unavailable.');
      if (!target.checked) target.click();
    } else if (el.tagName==='SELECT') {
      const option=[...el.options].find(o=>o.value===request.value);
      if (!option||option.disabled||option.parentElement?.disabled) return fail('INVALID_OPTION','Choose an exact available dropdown value.');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,request.value);
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    } else {
      if(el.maxLength>=0&&request.value.length>el.maxLength) return fail('VALUE_TOO_LONG','Value exceeds the field length limit.');
      if(field.key==='dateOfBirth') {
        const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(request.value);
        if(!m) return fail('INVALID_DATE','Use mm/dd/yyyy.');
        const d=new Date(+m[3],+m[1]-1,+m[2]);
        if(d.getFullYear()!==+m[3]||d.getMonth()!==+m[1]-1||d.getDate()!==+m[2]) return fail('INVALID_DATE','That calendar date is invalid.');
      }
      const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(el,request.value);
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    }
    await waitForPage();
    if(!target.isConnected || (el.type==='radio'?!target.checked:el.value!==request.value)) return fail('VERIFICATION_FAILED','The page did not retain the requested answer.');
    if(el.type!=='radio'&&!el.checkValidity()) return fail('VALIDATION_FAILED','The page reports an invalid value.');
    target.scrollIntoView({block:'center',behavior:'smooth'});
    return {...result,success:true,field:request.field,value:request.value};
  }
  let queue=Promise.resolve();
  chrome.runtime.onMessage.addListener((request,sender,sendResponse)=>{
    if(request?.type!=='ELDERMED_FORM_ACTION'||sender.id!==chrome.runtime.id) return;
    queue=queue.then(()=>handle(request)).catch(()=>({requestId:request.requestId,success:false,code:'ACTION_FAILED',error:'Could not complete the form action.'}));
    queue.then(sendResponse);return true;
  });
})();
