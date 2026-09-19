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
    console.error("Offscreen creation failed:", err);
  }
}

chrome.action.onClicked.addListener(async () => {
  // Check if mic permission is already granted for extension origin
  const hasMic = await navigator.permissions.query({ name: 'microphone' });
  if (hasMic.state !== 'granted') {
    chrome.runtime.openOptionsPage();
  } else {
    await createOffscreen();
  }
});