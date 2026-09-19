document.getElementById('grant-mic').addEventListener('click', async () => {
  const status = document.getElementById('status');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop tracks immediately after permission is saved by the browser origin
    stream.getTracks().forEach(track => track.stop());
    status.innerText = "Microphone access granted! You can close this tab.";
    status.style.color = "green";
    chrome.runtime.sendMessage({ type: 'ELDERMED_MIC_GRANTED' });
  } catch (err) {
    status.innerText = "Permission denied: " + err.message;
    status.style.color = "red";
  }
});
