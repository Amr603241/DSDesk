/**
 * DSDesk WebRTC Manager
 * Handles peer-to-peer connection, screen sharing, and data channels
 */

class WebRTCManager {
  constructor() {
    this.peerConnection = null;
    this.dataChannel = null;
    this.localStream = null;
    this.remoteStream = null;
    this.handlers = {};

    // High-performance ICE & Bundle policy
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ],
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    // Candidate handling queue
    this.iceQueue = [];
    this.isRemoteDescriptionSet = false;
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
      // Use unordered mode to prevent Head-of-Line blocking (stuttering)
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

  // ── Media Streaming (Atomic Fix) ──
  async startScreenShare() {
    try {
      console.log('[RTC] Atomic: Fetching screen sources');
      const sources = await window.dsdesk.getScreenSources();
      const primaryScreen = sources.find(s => s.id.startsWith('screen:')) || sources[0];
      
      if (!primaryScreen) throw new Error('No screen sources found');
      console.log(`[RTC] Atomic: Capturing source: ${primaryScreen.name} (${primaryScreen.id})`);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          cursor: 'always', 
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: primaryScreen.id,
            minWidth: 1280,
            maxWidth: 1920, 
            minHeight: 720,
            maxHeight: 1080,
            maxFrameRate: 30 // Balanced 30fps for remote control
          }
        }
      });

      this.localStream = stream;

      stream.getTracks().forEach(track => {
        if (track.kind === 'video') {
            track.contentHint = 'motion';
        }
        this.peerConnection.addTrack(track, stream);
      });

      // Turbo Mode: Enforce encoder parameters for instantaneous high bitrate
      setTimeout(() => {
          const senders = this.peerConnection.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
              const params = videoSender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              // Optimized: 6Mbps is the safe ceiling for low-jitter HD
              params.encodings[0].maxBitrate = 6000000; 
              params.encodings[0].degradationPreference = 'maintain-framerate';
              videoSender.setParameters(params).catch(e => console.warn('[RTC] Turbo Params failed:', e));
          }
      }, 500);

      // Update preferences after adding track
      this._setupCodecPreferences();

      return stream;
    } catch (err) {
      console.error('Failed to get screen stream via Atomic method:', err);
      // Fallback to standard getDisplayMedia if Direct Capture fails
      console.log('[RTC] Atomic: Falling back to getDisplayMedia');
      return this._fallbackScreenShare();
    }
  }

  async _fallbackScreenShare() {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false
      });
      this.localStream = stream;
      stream.getTracks().forEach(track => {
          if (track.kind === 'video') track.contentHint = 'motion';
          this.peerConnection.addTrack(track, stream);
      });
      return stream;
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
