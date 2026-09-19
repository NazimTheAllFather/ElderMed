// pcm-processor.js
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.buffer = [];
      this.targetSampleRate = 16000;
    }
  
    process(inputs) {
      const input = inputs[0];
      if (!input || !input[0]) return true;
  
      const inputChannel = input[0]; // Mono channel Float32Array
      const sampleRateRatio = sampleRate / this.targetSampleRate;
      const newLength = Math.floor(inputChannel.length / sampleRateRatio);
  
      // 1. Resample Float32 array down to 16kHz
      const resampled = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const originIndex = Math.floor(i * sampleRateRatio);
        resampled[i] = inputChannel[originIndex];
      }
  
      // 2. Convert Float32 (-1.0 to 1.0) to 16-bit PCM (Int16)
      const pcm16 = new Int16Array(resampled.length);
      for (let i = 0; i < resampled.length; i++) {
        const s = Math.max(-1, Math.min(1, resampled[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
  
      // 3. Post binary array buffer back to the main thread
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
      return true;
    }
  }
  
  registerProcessor('pcm-processor', PCMProcessor);