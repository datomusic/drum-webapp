// @ts-nocheck
/**
 * Capture Processor
 *
 * Minimal AudioWorklet that forwards raw mono input samples to the main
 * thread. Used by the SampleRecorder component for live monitoring and
 * gapless recording capture.
 */
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      // Copy: the underlying buffer is reused by the audio engine
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
