const button = document.getElementById("grant-mic");
const status = document.getElementById("status");

button?.addEventListener("click", async () => {
  if (!status) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    status.textContent = "Microphone access granted. You can close this tab.";
    status.style.color = "#146c43";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Permission denied";
    status.textContent = `Permission denied: ${message}`;
    status.style.color = "#9b2c2c";
  }
});
