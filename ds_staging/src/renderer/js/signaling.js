/**
 * DSDesk Signaling Client
 * Handles communication with the Socket.io signaling server
 */

class SignalingClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl || 'http://127.0.0.1:8080';
    this.socket = null;
    this.deviceId = null;
    this.password = null;
    this.handlers = {};
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        reconnectionAttempts: 5,
        timeout: 10000
      });

      this.socket.on('connect', () => {
        console.log('[✓] Connected to signaling server');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[✗] Signaling connection error:', error);
        reject(error);
      });

      // Register built-in event listeners
      this._setupEventListeners();
    });
  }

  _setupEventListeners() {
    this.socket.on('registered', (data) => this.emit('registered', data));
    this.socket.on('connection-request', (data) => this.emit('connection-request', data));
    this.socket.on('connection-accepted', (data) => this.emit('connection-accepted', data));
    this.socket.on('connection-rejected', (data) => this.emit('connection-rejected', data));
    this.socket.on('connection-error', (data) => this.emit('connection-error', data));

    // WebRTC signaling
    this.socket.on('offer', (data) => this.emit('offer', data));
    this.socket.on('answer', (data) => this.emit('answer', data));
    this.socket.on('ice-candidate', (data) => this.emit('ice-candidate', data));

    // Chat and session
    this.socket.on('chat-message', (data) => this.emit('chat-message', data));
    this.socket.on('session-ended', (data) => this.emit('session-ended', data));
  }

  // ── Registration ──
  register(deviceId, password, passwordEnabled) {
    this.deviceId = deviceId;
    this.password = password;
    this.socket.emit('register', { deviceId, password, passwordEnabled });
  }

  updatePassword(password, passwordEnabled) {
    this.password = password;
    this.socket.emit('update-password', { password, passwordEnabled });
  }

  // ── Connection ──
  requestConnection(targetId, password) {
    this.socket.emit('connect-to', { targetId, password });
  }

  acceptConnection(targetSocketId) {
    this.socket.emit('accept-connection', { targetSocketId });
  }

  rejectConnection(targetSocketId) {
    this.socket.emit('reject-connection', { targetSocketId });
  }

  // ── Signaling ──
  sendOffer(target, offer) {
    this.socket.emit('offer', { target, offer });
  }

  sendAnswer(target, answer) {
    this.socket.emit('answer', { target, answer });
  }

  sendIceCandidate(target, candidate) {
    this.socket.emit('ice-candidate', { target, candidate });
  }

  // ── Chat ──
  sendChatMessage(target, message) {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.socket.emit('chat-message', { target, message, timestamp });
    return timestamp;
  }

  endSession(target) {
    this.socket.emit('end-session', { target });
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

window.SignalingClient = SignalingClient;
