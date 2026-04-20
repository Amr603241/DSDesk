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

    // Enhanced STUN servers and WebRTC optimizations
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.anydesk.com:3478' },
        { urls: 'stun:stun.ekiga.net' },
        { urls: 'stun:stun.ideasip.com' },
        { urls: 'stun:stun.schlund.de' },
        { urls: 'stun:stun.voiparound.com' },
        { urls: 'stun:stun.voipbuster.com' },
        { urls: 'stun:stun.voipstunt.com' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle'
    };
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
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate) {
    if (this.peerConnection) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
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
