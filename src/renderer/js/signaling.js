/**
 * DSDesk Signaling Client
 * Handles communication with the Socket.io signaling server
 */

class SignalingClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl || 'http://localhost:8080';
    this.socket = null;
    this.handlers = {};
  }

  connect(deviceId, password) {
    return new Promise((resolve, reject) => {
      if (typeof io === 'undefined') {
        return reject(new Error('Socket.io library not found'));
      }

      this.socket = io(this.serverUrl, { transports: ['websocket'] });

      this.socket.on('connect', () => {
        console.log('[SIG] Connected to server');
        this.socket.emit('register', { deviceId, password });
        resolve();
      });

      this.socket.on('connect_error', (err) => reject(err));

      // Clean Event Relay
      this.socket.on('connection-request', (data) => this.emit('request', data));
      this.socket.on('connection-accepted', (data) => this.emit('accepted', data));
      this.socket.on('connection-rejected', (data) => this.emit('rejected', data));
      this.socket.on('offer', (data) => this.emit('offer', data));
      this.socket.on('answer', (data) => this.emit('answer', data));
      this.socket.on('ice-candidate', (data) => this.emit('ice-candidate', data));
      this.socket.on('chat-message', (data) => this.emit('chat', data));
      this.socket.on('session-ended', (data) => this.emit('session-ended', data));
    });
  }

  sendRequest(targetId, password) {
    this.socket.emit('connect-to', { targetId, password });
  }

  acceptRequest(targetSocketId) {
    this.socket.emit('accept-connection', { targetSocketId });
  }

  rejectRequest(targetSocketId) {
    this.socket.emit('reject-connection', { targetSocketId });
  }

  sendOffer(target, offer) {
    this.socket.emit('offer', { target, offer });
  }

  sendAnswer(target, answer) {
    this.socket.emit('answer', { target, answer });
  }

  sendIceCandidate(target, candidate) {
    this.socket.emit('ice-candidate', { target, candidate });
  }

  sendChat(target, message) {
    this.socket.emit('chat-message', { target, message });
  }

  endSession(target) {
    this.socket.emit('end-session', { target });
  }

  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  emit(event, data) {
    if (this.handlers[event]) this.handlers[event].forEach(h => h(data));
  }
}

window.SignalingClient = SignalingClient;
