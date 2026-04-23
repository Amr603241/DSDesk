/**
 * DSDesk PRO MAX - Ultimate Remote Desktop
 * All-in-One: TeamViewer + AnyDesk + RustDesk Features
 * OPTIMIZED FOR SPEED & QUALITY
 */

class WebRTCManager {
  constructor() {
    this.peerConnection = null;
    this.dataChannel = null;
    this.localStream = null;
    this.remoteStream = null;
    this.handlers = {};
    
    // PRO MAX Quality Settings
    this.qualityMode = 'ultra';
    this.fps = 60;
    this.resolution = { width: 1920, height: 1080 };
    this.bitrate = 15000000; // 15 Mbps default
    this.maxBitrate = 30000000; // 30 Mbps max
    
    // PRO MAX ICE Servers
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:meetany.net:3478' }
      ],
      bundlePolicy: 'max-compat',
      rtcpMuxPolicy: 'negotiate',
      iceCandidatePoolSize: 20
    };

    this.iceQueue = [];
    this.isRemoteDescriptionSet = false;
    
    this.qualityPresets = {
      'balanced': { width: 1280, height: 720, bitrate: 2000000, maxBitrate: 4000000, fps: 30 },
      'fast': { width: 1280, height: 720, bitrate: 4000000, maxBitrate: 6000000, fps: 60 },
      'quality': { width: 1920, height: 1080, bitrate: 8000000, maxBitrate: 15000000, fps: 60 },
      'high': { width: 1920, height: 1080, bitrate: 15000000, maxBitrate: 25000000, fps: 60 },
      'ultra': { width: 1920, height: 1080, bitrate: 25000000, maxBitrate: 40000000, fps: 60 },
      '4k': { width: 3840, height: 2160, bitrate: 40000000, maxBitrate: 60000000, fps: 60 }
    };
    
    this.currentQuality = this.qualityPresets.ultra;
  }

  setQualityPreset(preset = 'ultra') {
    const p = this.qualityPresets[preset] || this.qualityPresets.ultra;
    this.qualityMode = preset;
    this.fps = p.fps;
    this.resolution = { width: p.width, height: p.height };
    this.bitrate = p.bitrate;
    this.maxBitrate = p.maxBitrate;
    this.currentQuality = p;
    console.log(`[PRO MAX] Quality: ${preset} - ${p.width}x${p.height} @ ${p.fps}fps`);
    return p;
  }

  setQuality(quality = 'high', fps = 60) {
    this.setQualityPreset(quality);
    this.fps = Math.min(fps, 120);
  }

  async initializeConnection(isOfferer = false, mode = 'viewer') {
    const logInternal = (msg) => {
        if (window.logDebugToApp) window.logDebugToApp(`[INTERNAL] ${msg}`);
        console.log(`[RTC] ${msg}`);
    };

    this.peerConnection = new RTCPeerConnection(this.config);

    if (mode === 'viewer') {
        this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
    }

    this._setupCodecPreferences();

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit('ice-candidate', event.candidate);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
        logInternal(`[ICE STATE] ${this.peerConnection.iceConnectionState}`);
        this.emit('ice-state-change', this.peerConnection.iceConnectionState);
    };

    this.peerConnection.onconnectionstatechange = () => {
        logInternal(`[CONN STATE] ${this.peerConnection.connectionState}`);
        if (this.peerConnection.connectionState === 'failed') {
            this._attemptIceRestart();
        }
    };

    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream) this.remoteStream = new MediaStream();
        this.remoteStream.addTrack(event.track);
      }
      this.emit('remote-stream', this.remoteStream);
    };

    if (isOfferer) {
      this._setupDataChannel(this.peerConnection.createDataChannel('control-channel', {
          ordered: false,
          maxRetransmits: 0 
      }));
    } else {
      this.peerConnection.ondatachannel = (event) => {
        this._setupDataChannel(event.channel);
      };
    }
  }

  _setupCodecPreferences() {
    try {
        if (!RTCRtpSender || !RTCRtpSender.getCapabilities) return;
        const capabilities = RTCRtpSender.getCapabilities('video');
        if (!capabilities || !capabilities.codecs) return;

        const sortedCodecs = capabilities.codecs.sort((a, b) => {
            const aIsH264 = a.mimeType.toLowerCase().includes('h264');
            const bIsH264 = b.mimeType.toLowerCase().includes('h264');
            if (aIsH264 && !bIsH264) return -1;
            if (!aIsH264 && bIsH264) return 1;
            return 0;
        });

        const transceivers = this.peerConnection.getTransceivers ? this.peerConnection.getTransceivers() : [];
        transceivers.forEach((transceiver) => {
            try {
                transceiver.setCodecPreferences(sortedCodecs);
            } catch (e) {}
        });
    } catch (e) {
        console.error('Codec error:', e);
    }
  }

  _setupDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.onopen = () => this.emit('datachannel-open');
    this.dataChannel.onclose = () => console.log('[!] Data channel closed');
    this.dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('control-data', data);
      } catch (e) {}
    };
  }

  async startScreenShare() {
    try {
      const sources = await window.dsdesk.getScreenSources();
      const primaryScreen = sources.find(s => s.id.startsWith('screen:')) || sources[0];
      const q = this.currentQuality || this.qualityPresets.ultra;
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          width: { ideal: q.width, max: q.width },
          height: { ideal: q.height, max: q.height },
          frameRate: { ideal: q.fps, max: q.fps }
        }
      });

      this.localStream = stream;
      stream.getTracks().forEach(track => {
        if (track.kind === 'video') track.contentHint = 'motion';
        this.peerConnection.addTrack(track, stream);
      });

      setTimeout(() => this._applyBitrate(), 500);
      return stream;
    } catch (err) {
      return this._fallbackScreenShare();
    }
  }

  async _fallbackScreenShare() {
    try {
      const q = this.currentQuality || this.qualityPresets.ultra;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.fps } },
        audio: false
      });
      this.localStream = stream;
      stream.getTracks().forEach(track => this.peerConnection.addTrack(track, stream));
      setTimeout(() => this._applyBitrate(), 500);
      return stream;
    } catch (err) {
      throw err;
    }
  }

  _applyBitrate() {
    const senders = this.peerConnection?.getSenders();
    const videoSender = senders?.find(s => s.track?.kind === 'video');
    if (videoSender) {
      const params = videoSender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      const q = this.currentQuality || this.qualityPresets.ultra;
      params.encodings[0].maxBitrate = q.maxBitrate;
      params.encodings[0].degradationPreference = 'maintain-framerate';
      videoSender.setParameters(params).catch(() => {});
    }
  }

  _mungSDP(sdp) {
    const q = this.currentQuality || this.qualityPresets.ultra;
    const bitrateKbps = Math.round(q.maxBitrate / 1000);
    const lineEnding = sdp.includes('\r\n') ? '\r\n' : '\n';
    
    sdp = sdp.replace(/a=fmtp:(\d+) (.*)/g, `a=fmtp:$1 $2;x-google-start-bitrate=${bitrateKbps};x-google-max-bitrate=${bitrateKbps};x-google-min-bitrate=${Math.round(q.bitrate/1000)}`);
    
    if (sdp.indexOf('b=AS:') === -1) {
      sdp = sdp.replace(/m=video(.*?)(?=\n|$)/g, `m=video$1${lineEnding}b=AS:${bitrateKbps}`);
    } else {
      sdp = sdp.replace(/b=AS:.*(?=\n|$)/g, `b=AS:${bitrateKbps}`);
    }
    return sdp;
  }

  async createOffer() {
    const offer = await this.peerConnection.createOffer();
    offer.sdp = this._mungSDP(offer.sdp);
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    this.isRemoteDescriptionSet = true;
    await this._processIceQueue();
    const answer = await this.peerConnection.createAnswer();
    answer.sdp = this._mungSDP(answer.sdp);
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    this.isRemoteDescriptionSet = true;
    await this._processIceQueue();
  }

  async addIceCandidate(candidate) {
    if (!this.peerConnection) return;
    if (!this.isRemoteDescriptionSet) {
      this.iceQueue.push(candidate);
      return;
    }
    try {
      if (!candidate.candidate) return;
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {}
  }

  async _attemptIceRestart() {
    try {
        if (!this.peerConnection) return;
        const offer = await this.peerConnection.createOffer({ iceRestart: true });
        await this.peerConnection.setLocalDescription(offer);
        this.emit('ice-restart-offer', offer);
    } catch (e) {}
  }

  async _processIceQueue() {
    await new Promise(resolve => setTimeout(resolve, 100));
    while (this.iceQueue.length > 0) {
      const candidate = this.iceQueue.shift();
      try {
        if (candidate && candidate.candidate) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {}
    }
  }

  sendControlData(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  close() {
    if (this.localStream) this.localStream.getTracks().forEach(track => track.stop());
    if (this.remoteStream) this.remoteStream.getTracks().forEach(track => track.stop());
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.ondatachannel = null;
    }
    this.peerConnection = null;
    this.dataChannel = null;
    this.localStream = null;
    this.remoteStream = null;
  }

  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  emit(event, data) {
    if (this.handlers[event]) {
      this.handlers[event].forEach(handler => handler(data));
    }
  }
}

window.WebRTCManager = WebRTCManager;
