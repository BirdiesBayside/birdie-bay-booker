// Thin wrapper around obs-websocket (v5 protocol) for start/stop recording.
// Requires OBS Studio 28+ with obs-websocket 5 enabled (Tools > WebSocket Server Settings).
// Password stored in bay_devices.obs_ws_password (fetched by main.js at init).

const WebSocket = require('ws');
const crypto = require('crypto');

class OBSController {
  constructor({ url = 'ws://127.0.0.1:4455', password = '' } = {}) {
    this.url = url;
    this.password = password;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
    this.identified = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) { return reject(e); }
      const timeout = setTimeout(() => reject(new Error('OBS connect timeout')), 5000);
      this.ws.on('open', () => { clearTimeout(timeout); });
      this.ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
      this.ws.on('message', (raw) => this._onMessage(raw, resolve, reject));
      this.ws.on('close', () => { this.identified = false; this.ws = null; });
    });
  }

  _onMessage(raw, resolveIdent, rejectIdent) {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    // Hello -> Identify
    if (msg.op === 0) {
      const auth = msg.d.authentication;
      let authString;
      if (auth && this.password) {
        const secret = crypto.createHash('sha256').update(this.password + auth.salt).digest('base64');
        authString = crypto.createHash('sha256').update(secret + auth.challenge).digest('base64');
      }
      this.ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication: authString } }));
      return;
    }
    // Identified
    if (msg.op === 2) { this.identified = true; if (resolveIdent) resolveIdent(); return; }
    // RequestResponse
    if (msg.op === 7) {
      const p = this.pending.get(msg.d.requestId);
      if (!p) return;
      this.pending.delete(msg.d.requestId);
      if (msg.d.requestStatus?.result) p.resolve(msg.d.responseData || {});
      else p.reject(new Error(msg.d.requestStatus?.comment || 'OBS request failed'));
    }
  }

  request(requestType, requestData = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.identified) return reject(new Error('OBS not connected'));
      const requestId = `req_${++this.msgId}`;
      this.pending.set(requestId, { resolve, reject });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => {
        if (this.pending.has(requestId)) { this.pending.delete(requestId); reject(new Error(`OBS ${requestType} timeout`)); }
      }, 8000);
    });
  }

  async startRecording() { return this.request('StartRecord'); }
  async stopRecording() {
    // Returns { outputPath }
    return this.request('StopRecord');
  }
  async getStatus() { return this.request('GetRecordStatus'); }

  disconnect() { try { this.ws?.close(); } catch { /* noop */ } this.ws = null; this.identified = false; }
}

module.exports = { OBSController };
