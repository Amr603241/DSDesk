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

    // High-performance curated STUN servers for faster gathering
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.services.mozilla.com' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle'
    };

    // Candidate handling queue
    this.iceQueue = [];
    this.isRemoteDescriptionSet = false;
  }

  async initializeConnection(isOfferer = false) {
    this.peerConnection = new RTCPeerConnection(this.config);

    // Track ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit('ice-candidate', event.candidate);
      }
    };

    // Track remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('[✓] Remote track received');
      this.remoteStream = event.streams[0];
      this.emit('remote-stream', this.remoteStream);
    };

    // Data channel setup
    if (isOfferer) {
      this._setupDataChannel(this.peerConnection.createDataChannel('control-channel'));
    } else {
      this.peerConnection.ondatachannel = (event) => {
        this._setupDataChannel(event.channel);
      };
    }

    this.peerConnection.onconnectionstatechange = () => {
      console.log(`[!] Connection state: ${this.peerConnection.connectionState}`);
      this.emit('connection-state', this.peerConnection.connectionState);
    };
  }

  _setupDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.onopen = () => {
      console.log('[✓] Data channel opened');
      this.emit('datachannel-open');
    };
    this.dataChannel.onclose = () => console.log('[!] Data channel closed');
    this.dataChannel.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.emit('control-data', data);
    };
  }

  // ── Media Streaming ──
  async startScreenShare() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false
      });

      this.localStream = stream;

      stream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, stream);
      });

      return stream;
    } catch (err) {
      console.error('Failed to get screen stream:', err);
      throw err;
    }
  }

  // ── Connection Logic ──
  async createOffer() {
    let offer = await this.peerConnection.createOffer();
    offer = { type: 'offer', sdp: this._mungSDP(offer.sdp) };
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    this.isRemoteDescriptionSet = true;
    await this._processIceQueue();
    let answer = await this.peerConnection.createAnswer();
    answer = { type: 'answer', sdp: this._mungSDP(answer.sdp) };
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  // Optimize SDP for faster initial connection and stable bitrate
  _mungSDP(sdp) {
    // Set max video bitrate to 2500kbps initially for stability
    const bitrate = 2500;
    if (sdp.indexOf('b=AS:') === -1) {
      sdp = sdp.replace(/m=video(.*)\r\n/g, `m=video$1\r\nb=AS:${bitrate}\r\n`);
    } else {
      sdp = sdp.replace(/b=AS:.*\r\n/g, `b=AS:${bitrate}\r\n`);
    }
    return sdp;
  }

  async handleAnswer(answer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    this.isRemoteDescriptionSet = true;
    await this._processIceQueue();
  }

  async addIceCandidate(candidate) {
    if (!this.peerConnection) return;

    if (!this.isRemoteDescriptionSet) {
      console.log('[!] Queueing ICE candidate (waiting for remote description)');
      this.iceQueue.push(candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding ICE candidate:', e);
    }
  }

  async _processIceQueue() {
    console.log(`[!] Processing ${this.iceQueue.length} queued candidates`);
    while (this.iceQueue.length > 0) {
      const candidate = this.iceQueue.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
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
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    this.peerConnection = null;
    this.dataChannel = null;
    this.localStream = null;
    this.remoteStream = null;
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
