console.log("Voice AI Offscreen initialized.");

async function initVoiceEngine() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Microphone stream active:", stream.active);
  } catch (err) {
    console.error("Microphone access failed:", err);
  }
}

initVoiceEngine();
