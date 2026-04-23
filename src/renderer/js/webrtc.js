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
    
    // PRO MAX ICE Servers - شامل كل الخوادم
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:meetany.net:3478' }
      ],
      bundlePolicy: 'max-compat',
      rtcpMuxPolicy: 'negotiate',
      iceCandidatePoolSize: 20
    };

    this.iceQueue = [];
    this.isRemoteDescriptionSet = false;
    
    // Quality Presets -TeamViewer/AnyDesk/RustDesk Style
    this.qualityPresets = {
      // AnyDesk Style - التوازن
      'balanced': { width: 1280, height: 720, bitrate: 2000000, maxBitrate: 4000000, fps: 30 },
      // RustDesk Style - السرعة
      'fast': { width: 1280, height: 720, bitrate: 4000000, maxBitrate: 6000000, fps: 60 },
      // TeamViewer Style - الجودة
      'quality': { width: 1920, height: 1080, bitrate: 8000000, maxBitrate: 15000000, fps: 60 },
      // High Quality - عالي الجودة
      'high': { width: 1920, height: 1080, bitrate: 15000000, maxBitrate: 25000000, fps: 60 },
      // Ultra HD - 4K-like
      'ultra': { width: 1920, height: 1080, bitrate: 25000000, maxBitrate: 40000000, fps: 60 },
      // 4K Support
      '4k': { width: 3840, height: 2160, bitrate: 40000000, maxBitrate: 60000000, fps: 60 }
    };
    
    this.currentQuality = this.qualityPresets.ultra;
  }

  // Quality Presets - TeamViewer/AnyDesk/RustDesk Style
  setQualityPreset(preset = 'ultra') {
    const p = this.qualityPresets[preset] || this.qualityPresets.ultra;
    this.qualityMode = preset;
    this.fps = p.fps;
    this.resolution = { width: p.width, height: p.height };
    this.bitrate = p.bitrate;
    this.maxBitrate = p.maxBitrate;
    this.currentQuality = p;
    console.log(`[PRO MAX] Quality: ${preset} - ${p.width}x${p.height} @ ${p.fps}fps, ${p.maxBitrate/1000000}Mbps`);
    return p;
  }

  // Legacy compatibility
  setQuality(quality = 'high', fps = 60) {
    this.setQualityPreset(quality);
    this.fps = Math.min(fps, 120);
  }

  async initializeConnection(isOfferer = false, mode = 'viewer') {
    const logInternal = (msg) => {
        if (window.logDebugToApp) window.logDebugToApp(`[INTERNAL] ${msg}`);
        console.log(`[RTC] ${msg}`);
    };

    logInternal('Step 1: New RTCPeerConnection instance');
    this.peerConnection = new RTCPeerConnection(this.config);

    // Modern Unified Plan: Explicitly add transceivers instead of legacy constraints
    if (mode === 'viewer') {
        logInternal('Step 2: Adding recvonly transceiver (Viewer)');
        this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
    } else {
        logInternal('Step 2: Host mode - Transceiver will be handled by addTrack');
    }

    logInternal('Step 3: Setting up codec preferences (H.264)');
    this._setupCodecPreferences();

    logInternal('Step 4: Hooking ICE candidate events');
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const desc = event.candidate.candidate;
        // Optimization: Still log IPv6 but allow them to pass for local connectivity
        if (desc.includes(':') && !desc.includes('[')) {
            logInternal(`[ICE] IPv6 Candidate allowed: ${desc.substring(0, 40)}...`);
        } else {
            logInternal(`[ICE] IPv4 Candidate allowed: ${desc.substring(0, 40)}...`);
        }
        this.emit('ice-candidate', event.candidate);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
        logInternal(`[ICE STATE] ${this.peerConnection.iceConnectionState}`);
        this.emit('ice-state-change', this.peerConnection.iceConnectionState);
    };

    this.peerConnection.onconnectionstatechange = () => {
        logInternal(`[CONN STATE] ${this.peerConnection.connectionState}`);
        if (this.peerConnection.connectionState === 'connected') {
            logInternal(`[SUCCESS] Peer-to-Peer Tunnel OPENED`);
        } else if (this.peerConnection.connectionState === 'failed') {
            logInternal(`[RADICAL] Connection FAILED. Attempting automatic recovery...`);
            this._attemptIceRestart();
        }
    };

    // Track remote stream
    this.peerConnection.ontrack = (event) => {
      logInternal('[P2P] Remote track received');
      
      // Ensure we have a valid stream object
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        logInternal('[P2P] Received track without stream, creating new MediaStream');
        if (!this.remoteStream) this.remoteStream = new MediaStream();
        this.remoteStream.addTrack(event.track);
      }
      
      this.emit('remote-stream', this.remoteStream);
    };

    // Data channel setup
    if (isOfferer) {
      // AnyDesk-Elite: Use unordered/unreliable mode for zero-latency inputs
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
    const logInt = (msg) => { if (window.logDebugToApp) window.logDebugToApp(`[CODEC] ${msg}`); };
    try {
        logInt('Checking RTCRtpSender capabilities...');
        if (!RTCRtpSender || !RTCRtpSender.getCapabilities) {
            logInt('RTCRtpSender.getCapabilities NOT supported');
            return;
        }

        const capabilities = RTCRtpSender.getCapabilities('video');
        if (!capabilities || !capabilities.codecs) {
            logInt('No video capabilities found');
            return;
        }

        logInt(`Found ${capabilities.codecs.length} codecs. Prioritizing H.264...`);
        const sortedCodecs = capabilities.codecs.sort((a, b) => {
            const aIsH264 = a.mimeType.toLowerCase().includes('h264');
            const bIsH264 = b.mimeType.toLowerCase().includes('h264');
            if (aIsH264 && !bIsH264) return -1;
            if (!aIsH264 && bIsH264) return 1;
            return 0;
        });

        const transceivers = this.peerConnection.getTransceivers ? this.peerConnection.getTransceivers() : [];
        logInt(`Active transceivers: ${transceivers.length}`);
        
        if (transceivers.length === 0) {
            logInt('Empty transceivers list - skipping assignment');
            return;
        }

        transceivers.forEach((transceiver, idx) => {
            logInt(`Applying prefs to transceiver #${idx}...`);
            try {
                transceiver.setCodecPreferences(sortedCodecs);
            } catch (e) {
                logInt(`Transceiver #${idx} error: ${e.message}`);
            }
        });
        logInt('Codec preferences updated successfully');
    } catch (e) {
        logInt(`FATAL CODEC ERROR: ${e.message}`);
    }
  }

  _setupDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.onopen = () => {
      this.emit('datachannel-open');
    };
    this.dataChannel.onclose = () => console.log('[!] Data channel closed');
    this.dataChannel.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.emit('control-data', data);
    };
  }

// ── Media Streaming (PRO MAX ULTRA) ──
  async startScreenShare() {
    try {
      console.log('[PRO MAX] Starting Ultra Screen Capture...');
      
      // Auto-detect best source
      const sources = await window.dsdesk.getScreenSources();
      const primaryScreen = sources.find(s => s.id.startsWith('screen:')) || sources[0];
      
      if (!primaryScreen) throw new Error('No screen sources found');
      console.log(`[PRO MAX] Capturing: ${primaryScreen.name}`);

      const q = this.currentQuality || this.qualityPresets.ultra;
      
      // ULTRA Mode:Maximum quality with hardware acceleration
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          logicalSurface: 'primary',
          width: { ideal: q.width, max: q.width },
          height: { ideal: q.height, max: q.height },
          frameRate: { ideal: q.fps, max: q.fps },
          // Hardware acceleration
          facingMode: 'display',
          // Low latency mode
          latencyHint: 'low'
        }
      });

      this.localStream = stream;

      // Apply quality settings to each track
      stream.getVideoTracks().forEach(track => {
        // Motion preset for smooth video
        track.contentHint = 'motion';
        
        // Apply max constraints
        track.applyConstraints({
          width: { ideal: q.width, max: q.width },
          height: { ideal: q.height, max: q.height },
          frameRate: { ideal: q.fps, max: q.fps }
        }).catch(() => {});
        
        // Set encoder to high quality
        const settings = track.getSettings();
        if (settings.width) {
          console.log(`[PRO MAX] Capture: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);
        }
      });

      // Add track to peer connection
      stream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, stream);
      });

      // ULTRA Bitrate: Set maximum bitrate for best quality
      setTimeout(() => {
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          const params = videoSender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          
          // Maximum bitrate for ultra quality
          params.encodings[0].maxBitrate = q.maxBitrate;
          params.encodings[0].minBitrate = q.bitrate;
          params.encodings[0].scaleResolutionDownBy = 1;
          params.encodings[0].degradationPreference = 'maintain-framerate';
          params.encodings[0].maxFramerate = q.fps;
          
          videoSender.setParameters(params).catch(e => console.warn('[PRO MAX] Bitrate:', e.message));
          console.log(`[PRO MAX] Bitrate set: ${q.maxBitrate/1000000}Mbps`);
        }
      }, 200);

      // Setup codec preferences
      this._setupCodecPreferences();

      return stream;
    } catch (err) {
      console.error('[PRO MAX] Screen capture failed:', err);
      return this._fallbackScreenShare();
    }
  }

  // Fallback
  async _fallbackScreenShare() {
    const q = this.currentQuality || this.qualityPresets.ultra;
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          width: { ideal: q.width },
          height: { ideal: q.height },
          frameRate: { ideal: q.fps }
        },
        audio: false
      });
      
      this.localStream = stream;
      
      stream.getVideoTracks().forEach(track => {
        track.contentHint = 'motion';
        this.peerConnection.addTrack(track, stream);
      });
      
      // Apply bitrate
      setTimeout(() => this._applyBitrate(), 200);
      
      return stream;
    } catch (err) {
      console.error('[PRO MAX] Fallback failed:', err);
      throw err;
    }
  }

  _applyBitrate() {
    const senders = this.peerConnection?.getSenders();
    const videoSender = senders?.find(s => s.track?.kind === 'video');
    if (videoSender) {
      const params = videoSender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].maxBitrate = this.maxBitrate;
      params.encodings[0].degradationPreference = 'maintain-framerate';
      videoSender.setParameters(params).catch(() => {});
    }
  }

  // SDP Optimization for MAX quality
  _mungSDP(sdp) {
    const q = this.currentQuality || this.qualityPresets.ultra;
    const bitrateKbps = Math.round(q.maxBitrate / 1000);
    const lineEnding = sdp.includes('\r\n') ? '\r\n' : '\n';
    
    // Ultra bitrate settings
    sdp = sdp.replace(/a=fmtp:(\d+) (.*)/g, `a=fmtp:$1 $2;x-google-start-bitrate=${bitrateKbps};x-google-max-bitrate=${bitrateKbps};x-google-min-bitrate=${Math.round(q.bitrate/1000)};packet-time-calc=0`);
    
    // Bandwidth
    if (sdp.indexOf('b=AS:') === -1) {
      sdp = sdp.replace(/m=video(.*?)(?=\n|$)/g, `m=video$1${lineEnding}b=AS:${bitrateKbps}`);
    } else {
      sdp = sdp.replace(/b=AS:.*(?=\n|$)/g, `b=AS:${bitrateKbps}`);
    }
    
    // Bundle all channels
    sdp = sdp.replace('a=group:BUNDLE video', 'a=group:BUNDLE video data');
    
    // VP9/AV1 priority for better compression
    if (sdp.includes('VP9') || sdp.includes('AV1')) {
      console.log('[PRO MAX] Using VP9/AV1 codec');
    }
    
    return sdp;
  }
      });

      this.localStream = stream;

      stream.getTracks().forEach(track => {
        if (track.kind === 'video') {
            track.contentHint = 'motion';
            track.applyConstraints({
              width: { ideal: q.width },
              height: { ideal: q.height },
              frameRate: { ideal: this.fps }
            }).catch(() => {});
        }
        this.peerConnection.addTrack(track, stream);
      });

      // PRO MODE: Set bitrate parameters for instant high quality
      setTimeout(() => {
          const senders = this.peerConnection.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
              const params = videoSender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              params.encodings[0].maxBitrate = q.maxBitrate;
              params.encodings[0].scaleResolutionDownBy = 1;
              params.encodings[0].degradationPreference = 'maintain-framerate';
              videoSender.setParameters(params).catch(e => console.warn('[RTC] PRO Bitrate failed:', e.message));
          }
      }, 300);

      this._setupCodecPreferences();

      return stream;
    } catch (err) {
      console.error('[RTC] PRO: Screen capture failed, using fallback:', err);
      return this._fallbackScreenShare();
    }
  }

  async _fallbackScreenShare() {
      try {
        const constraints = {
          video: {
            cursor: 'always',
            displaySurface: 'monitor',
            logicalSurface: 'primary',
            width: { ideal: this.currentQuality?.width || 1920 },
            height: { ideal: this.currentQuality?.height || 1080 }
          },
          audio: false
        };
        
        const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
        this.localStream = stream;
        stream.getTracks().forEach(track => {
            if (track.kind === 'video') {
                track.contentHint = 'motion';
            }
            this.peerConnection.addTrack(track, stream);
        });
        
        // Apply bitrate after track is added
        setTimeout(() => this._applyBitrate(), 200);
        
        return stream;
      } catch (err) {
        console.error('[RTC] Fallback failed:', err);
        throw err;
      }
  }

  _applyBitrate() {
    const senders = this.peerConnection?.getSenders();
    const videoSender = senders?.find(s => s.track?.kind === 'video');
    if (videoSender) {
      const params = videoSender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].maxBitrate = this.currentQuality?.maxBitrate || 8000000;
      params.encodings[0].degradationPreference = 'maintain-framerate';
      videoSender.setParameters(params).catch(() => {});
    }
  }

  // ── Connection Logic ──
  async createOffer() {
    console.log('[RTC] Creating offer (Modern Unified)');
    const offer = await this.peerConnection.createOffer();
    console.log('[RTC] Setting local description (Offer)');
    offer.sdp = this._mungSDP(offer.sdp);
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer) {
    console.log('[RTC] Handling offer');
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    this.isRemoteDescriptionSet = true;
    await this._processIceQueue();
    console.log('[RTC] Creating answer');
    const answer = await this.peerConnection.createAnswer();
    answer.sdp = this._mungSDP(answer.sdp);
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  // Optimize SDP for faster initial connection and stable bitrate (Turbo Mode)
  _mungSDP(sdp) {
    const bitrate = 6000; // Balanced 6Mbps
    const lineEnding = sdp.includes('\r\n') ? '\r\n' : '\n';
    
    // Force immediate high bitrate ramp-up (Chromium extension)
    if (sdp.includes('VP8') || sdp.includes('H264')) {
        sdp = sdp.replace(/a=fmtp:(.*) (.*)/g, 'a=fmtp:$1 $2;x-google-start-bitrate=4000;x-google-max-bitrate=8000;x-google-min-bitrate=1000');
    }

    if (sdp.indexOf('b=AS:') === -1) {
      sdp = sdp.replace(/m=video(.*?)(?=\n|$)/g, `m=video$1${lineEnding}b=AS:${bitrate}`);
    } else {
      sdp = sdp.replace(/b=AS:.*(?=\n|$)/g, `b=AS:${bitrate}`);
    }
    
    // Radical: Ensure transport-cc is prioritized for bandwidth estimation
    sdp = sdp.replace('a=group:BUNDLE video', 'a=group:BUNDLE video data');
    
    return sdp;
  }

  async handleAnswer(answer) {
    console.log('[RTC] Handling answer');
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    this.isRemoteDescriptionSet = true;
    console.log('[RTC] Remote description SET (Answer)');
    await this._processIceQueue();
  }
  async addIceCandidate(candidate) {
    if (!this.peerConnection) return;

    if (!this.isRemoteDescriptionSet) {
      console.log('[RTC] Queueing candidate (Wait for Desc)');
      this.iceQueue.push(candidate);
      return;
    }

    try {
      console.log(`[RTC] Applying remote candidate: ${candidate.candidate ? candidate.candidate.substring(0, 30) : 'null'}...`);
      // Steel Path: Ensure candidate is valid before adding
      if (!candidate.candidate) return;
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('[RTC] Candidate application postponed or failed:', e.message);
    }
  }

  async _attemptIceRestart() {
    try {
        if (!this.peerConnection) return;
        console.log('[RTC] Radical: Initializing ICE Restart sequence...');
        const offer = await this.peerConnection.createOffer({ iceRestart: true });
        await this.peerConnection.setLocalDescription(offer);
        this.emit('ice-restart-offer', offer);
    } catch (e) {
        console.error('[RTC] Radical: ICE Restart initiation failed:', e);
    }
  }

  async _processIceQueue() {
    console.log(`[!] Steel Path: Processing ${this.iceQueue.length} queued candidates`);
    // Add a tiny delay to ensure RemoteDescription is fully "settled" in the engine
    await new Promise(resolve => setTimeout(resolve, 100));
    
    while (this.iceQueue.length > 0) {
      const candidate = this.iceQueue.shift();
      try {
        if (candidate && candidate.candidate) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        console.error('Error adding queued ICE candidate:', e);
      }
    }
  }

  // ── Data Transmission ──
  sendControlData(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  close() {
    console.log('[RTC] Closing peer connection and cleaning up resources...');
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
          track.stop();
          console.log(`[RTC] Local track stopped: ${track.kind}`);
      });
    }
    if (this.remoteStream) {
        this.remoteStream.getTracks().forEach(track => track.stop());
    }
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
    console.log('[RTC] Cleanup complete.');
  }

  // ── Event Bus ──
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
