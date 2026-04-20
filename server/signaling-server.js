const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store registered devices: deviceId -> { socketId, password }
const devices = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    connectedDevices: devices.size,
    uptime: process.uptime()
  });
});

io.on('connection', (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);

  // ── Register device ──
  socket.on('register', ({ deviceId, password, passwordEnabled }) => {
    devices.set(deviceId, {
      socketId: socket.id,
      password: password,
      passwordEnabled: passwordEnabled !== false // Default to true
    });
    socket.deviceId = deviceId;
    console.log(`[✓] Device registered: ${deviceId} (Pwd: ${passwordEnabled !== false ? 'Yes' : 'No'})`);
    socket.emit('registered', { deviceId, success: true });
  });

  // ── Update password settings ──
  socket.on('update-password', ({ password, passwordEnabled }) => {
    if (socket.deviceId && devices.has(socket.deviceId)) {
      const device = devices.get(socket.deviceId);
      if (password !== undefined) device.password = password;
      if (passwordEnabled !== undefined) device.passwordEnabled = passwordEnabled;
      console.log(`[~] Password updated for: ${socket.deviceId}`);
    }
  });

  // ── Connection request from client to host ──
  socket.on('connect-to', ({ targetId, password }) => {
    const target = devices.get(targetId);

    if (!target) {
      socket.emit('connection-error', {
        message: 'الجهاز غير متصل أو المعرّف غير صحيح',
        code: 'NOT_FOUND'
      });
      return;
    }

    if (target.passwordEnabled && !password) {
      socket.emit('connection-error', {
        message: 'هذا الجهاز محمي بكلمة مرور',
        code: 'NEED_PASSWORD'
      });
      return;
    }

    if (target.passwordEnabled && target.password !== password) {
      socket.emit('connection-error', {
        message: 'كلمة المرور غير صحيحة',
        code: 'WRONG_PASSWORD'
      });
      return;
    }

    // Notify the host about incoming connection
    io.to(target.socketId).emit('connection-request', {
      from: socket.deviceId,
      fromSocketId: socket.id
    });

    console.log(`[→] Connection request: ${socket.deviceId} → ${targetId}`);
  });

  // ── Host accepts connection ──
  socket.on('accept-connection', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('connection-accepted', {
      hostSocketId: socket.id,
      hostDeviceId: socket.deviceId
    });
    console.log(`[✓] Connection accepted by: ${socket.deviceId}`);
  });

  // ── Host rejects connection ──
  socket.on('reject-connection', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('connection-rejected', {
      message: 'تم رفض الاتصال من قبل المستخدم'
    });
    console.log(`[✗] Connection rejected by: ${socket.deviceId}`);
  });

  // ── WebRTC Signaling: SDP Offer ──
  socket.on('offer', ({ target, offer }) => {
    io.to(target).emit('offer', {
      from: socket.id,
      offer: offer
    });
  });

  // ── WebRTC Signaling: SDP Answer ──
  socket.on('answer', ({ target, answer }) => {
    io.to(target).emit('answer', {
      from: socket.id,
      answer: answer
    });
  });

  // ── WebRTC Signaling: ICE Candidate ──
  socket.on('ice-candidate', ({ target, candidate }) => {
    io.to(target).emit('ice-candidate', {
      from: socket.id,
      candidate: candidate
    });
  });

  // ── Chat message relay ──
  socket.on('chat-message', ({ target, message, timestamp }) => {
    io.to(target).emit('chat-message', {
      from: socket.id,
      message: message,
      timestamp: timestamp
    });
  });

  // ── Session end ──
  socket.on('end-session', ({ target }) => {
    io.to(target).emit('session-ended', {
      from: socket.id,
      message: 'تم إنهاء الجلسة'
    });
    console.log(`[✗] Session ended by: ${socket.deviceId}`);
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    if (socket.deviceId) {
      devices.delete(socket.deviceId);
      console.log(`[-] Device unregistered: ${socket.deviceId}`);
    }
    console.log(`[-] Client disconnected: ${socket.id}`);
  });
});

// ── Start Server ──
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     DSDesk Signaling Server v1.0.0       ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  🌐 Running on port: ${PORT}               ║`);
  console.log(`║  📡 Status: http://localhost:${PORT}        ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
