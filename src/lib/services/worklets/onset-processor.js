/* AudioWorkletProcessor: onset-triggered capture with optional pre-roll.
   Captures exactly preRollMs + captureMs samples after trigger.
*/
class DCBlocker {
  constructor(cutHz, sr) {
    const twoPi = 2 * Math.PI;
    this.R = Math.exp(-twoPi * (cutHz / sr));
    this.x1 = 0;
    this.y1 = 0;
  }
  process(x) {
    const y = x - this.x1 + this.R * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

registerProcessor('onset-detector', class extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cfg = {
      threshold: 0.15,
      preRoll: 0,
      holdSamples: 1,
      capLen: Math.round(48000),
      hpHz: 80
    };
    this.dc = new DCBlocker(this.cfg.hpHz, sampleRate);

    this.ring = new Float32Array(this.cfg.preRoll);
    this.ringIdx = 0;

    this.above = 0;
    this.capturing = false;

    this.buf = new Float32Array(this.cfg.preRoll + this.cfg.capLen);
    this.writeIdx = 0;

    this.port.onmessage = (e) => {
      const c = e.data || {};
      this.cfg.threshold = typeof c.threshold === 'number' ? c.threshold : this.cfg.threshold;
      const pre = Math.max(0, Math.round(((c.preRollMs ?? 0) * sampleRate) / 1000));
      const holdUs = (typeof c.holdUs === 'number')
        ? c.holdUs
        : (typeof c.holdMs === 'number' ? c.holdMs * 1000 : 500);
      const hold = Math.max(1, Math.round((holdUs * sampleRate) / 1_000_000));
      const cap = Math.max(1, Math.round(((c.captureMs ?? 1000) * sampleRate) / 1000));
      const hp = typeof c.highpassHz === 'number' ? c.highpassHz : this.cfg.hpHz;

      this.cfg.preRoll = pre;
      this.cfg.holdSamples = hold;
      this.cfg.capLen = cap;
      this.cfg.hpHz = hp;

      this.dc = new DCBlocker(this.cfg.hpHz, sampleRate);
      this.ring = new Float32Array(this.cfg.preRoll);
      this.ringIdx = 0;
      this.above = 0;
      this.capturing = false;
      this.buf = new Float32Array(this.cfg.preRoll + this.cfg.capLen);
      this.writeIdx = 0;
    };
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;

    for (let i = 0; i < ch.length; i++) {
      const s = this.dc.process(ch[i]);

      if (this.ring.length > 0) {
        this.ring[this.ringIdx] = s;
        this.ringIdx = (this.ringIdx + 1) % this.ring.length;
      }

      if (!this.capturing) {
        if (Math.abs(s) >= this.cfg.threshold) {
          this.above++;
          if (this.above >= this.cfg.holdSamples) {
            // Trigger: copy preroll into buffer oldest->newest
            const pre = this.ring.length;
            if (pre > 0) {
              for (let k = 0; k < pre; k++) {
                const idx = (this.ringIdx + k) % pre;
                this.buf[k] = this.ring[idx];
              }
            }
            this.writeIdx = pre;
            this.capturing = true;
            this.port.postMessage({ type: 'trigger' });
          }
        } else {
          this.above = 0;
        }
      }

      if (this.capturing) {
        if (this.writeIdx < this.buf.length) {
          this.buf[this.writeIdx++] = s;
          if (this.writeIdx >= this.buf.length) {
            // Done: transfer the buffer
            this.port.postMessage({ type: 'data', sampleRate, samples: this.buf }, [this.buf.buffer]);
            return false; // stop processor
          }
        }
      }
    }

    return true;
  }
});
