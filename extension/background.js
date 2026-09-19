const allowedActions = new Set(['GET_FIELDS', 'SET_FIELD']);
const OFFSCREEN_PATH = 'offscreen.html';

async function hasOffscreen() {
  if (!chrome.runtime.getContexts) return false;
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
  });
  return contexts.length > 0;
}

async function createOffscreen() {
  if (!chrome.offscreen) return;
  if (await hasOffscreen()) return;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Voice AI processing'
    });
  } catch (err) {
    console.error('Offscreen creation failed:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ELDERMED_MIC_GRANTED') {
    createOffscreen();
    return;
  }
  if (message?.type !== 'ELDERMED_TOOL_REQUEST') return;
  (async () => {
    const fail = (code, error) => ({requestId: message.requestId, success:false, code, error});
    if (sender.id !== chrome.runtime.id) return fail('UNAUTHORIZED','Unrecognized sender.');
    let tabId = message.tabId;
    if (!Number.isInteger(tabId)) {
      ({eldermedTabId: tabId} = await chrome.storage.local.get('eldermedTabId'));
    }
    if (!allowedActions.has(message.action) || !Number.isInteger(tabId)) return fail('INVALID_REQUEST','Provide a supported action and target tabId.');
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    if (!['http:','https:'].includes(url.protocol) || !['localhost','127.0.0.1'].includes(url.hostname)) return fail('UNSUPPORTED_PAGE','This prototype supports the local demo only.');
    await chrome.scripting.executeScript({target:{tabId},files:['field-map.js','content.js']});
    return await chrome.tabs.sendMessage(tabId, {...message,tabId,type:'ELDERMED_FORM_ACTION'}, {frameId:0});
  })().then(sendResponse).catch(error=>sendResponse({requestId:message.requestId,success:false,code:'DELIVERY_FAILED',error:error.message}));
  return true;
});
