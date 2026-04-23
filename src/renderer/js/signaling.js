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

  async ping() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s for Render cold start
      const response = await fetch(this.serverUrl, { mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeoutId);
      return true;
    } catch (e) {
      console.warn('[!] Server Ping failed (might be waking up):', e.message);
      return false;
    }
  }

connect() {
    return new Promise((resolve, reject) => {
      // Prevent duplicate connections
      if (this.socket?.connected) {
        console.log('[!] Already connected');
        resolve();
        return;
      }
      
      this.socket = io(this.serverUrl, {
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 8000,
        timeout: 15000,
        transports: ['websocket', 'polling'],
        forceNew: true
      });

      this.socket.on('connect', () => {
        console.log('[✓] Connected to:', this.serverUrl);
        if (this.deviceId) {
          this.register(this.deviceId, this.password, this.passwordEnabled !== false);
        }
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[✗] Error:', error.message);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.warn('[!] Disconnected:', reason);
      });

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
