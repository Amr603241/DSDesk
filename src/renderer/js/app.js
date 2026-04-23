/**
 * DSDesk PRO MAX Application - CORE ENGINE v4.2
 * Ultimate sidebar-based control logic
 */

const DEFAULT_SERVER = 'http://localhost:8080';

document.addEventListener('DOMContentLoaded', async () => {
    const ui = new UIManager();
    let webrtc = new WebRTCManager();
    let state = {
        deviceId: '',
        password: '',
        isHost: false,
        currentRemoteSocketId: null,
        recentConnections: JSON.parse(localStorage.getItem('dsdesk_recent') || '[]'),
        nicknames: JSON.parse(localStorage.getItem('dsdesk_nicknames') || {}),
        settings: JSON.parse(localStorage.getItem('dsdesk_settings') || '{}')
    };

    const serverUrl = state.settings.server || DEFAULT_SERVER;
    const signaling = new SignalingClient(serverUrl);

    state.deviceId = await window.dsdesk.getDeviceId();
    state.password = await window.dsdesk.getPassword();
    ui.updateDeviceInfo(state.deviceId, state.password);

    // ── SIGNALING ──

    signaling.on('connect', () => ui.setConnectionStatus(true));
    signaling.on('disconnect', () => ui.setConnectionStatus(false));

    // Host Flow: Handle Incoming Connection Request
    signaling.on('request-session', (data) => {
        ui.showRequestModal(data.fromId);
        state.incomingRequest = data;
    });

    document.getElementById('btn-accept').onclick = async () => {
        ui.hideRequestModal();
        ui.showToast('جاري بدء مشاركة الشاشة...', 'info');
        state.isHost = true;
        
        await webrtc.initializeConnection(false, 'host');
        await webrtc.startScreenShare();
        
        signaling.acceptRequest(state.incomingRequest.fromSocketId, state.deviceId);
    };

    document.getElementById('btn-reject').onclick = () => {
        ui.hideRequestModal();
        signaling.rejectRequest(state.incomingRequest.fromSocketId);
    };

    // Viewer Flow: Start Connection
    document.getElementById('btn-connect').onclick = () => {
        const remoteId = document.getElementById('remote-id').value.trim();
        if (!remoteId) return ui.showToast('يرجى إدخال ID', 'error');
        ui.showToast('جاري البحث عن الجهاز...', 'info');
        signaling.sendRequest(remoteId);
    };

    signaling.on('accepted', async (data) => {
        state.isHost = false;
        state.currentRemoteSocketId = data.socketId;
        ui.showToast('تم القبول. جاري ربط الفيديو...', 'success');
        
        await webrtc.initializeConnection(true, 'viewer');
        const offer = await webrtc.createOffer();
        signaling.sendOffer(data.socketId, offer);
    });

    // WebRTC Handlers
    signaling.on('offer', async (data) => {
        state.currentRemoteSocketId = data.fromSocketId;
        if (!webrtc.peerConnection) await webrtc.initializeConnection(false, 'host');
        const answer = await webrtc.handleOffer(data.offer);
        signaling.sendAnswer(data.fromSocketId, answer);
    });

    signaling.on('answer', async (data) => {
        await webrtc.handleAnswer(data.answer);
        ui.switchView('session');
        state.statsInterval = setInterval(() => ui.updateStats(webrtc.getStats()), 2000);
    });

    signaling.on('ice-candidate', (data) => {
        webrtc.handleCandidate(data.candidate);
    });

    webrtc.on('ice-candidate', (candidate) => {
        const target = state.currentRemoteSocketId || state.incomingRequest?.fromSocketId;
        if (target) signaling.sendIceCandidate(target, candidate);
    });

    webrtc.on('stream', (stream) => {
        const video = document.getElementById('remote-video');
        if (video) video.srcObject = stream;
    });

    webrtc.on('control-data', (data) => {
        if (state.isHost) window.dsdesk.simulateInput(data);
    });

    // ── UTILS ──
    document.getElementById('btn-disconnect').onclick = () => {
        const target = state.currentRemoteSocketId || state.incomingRequest?.fromSocketId;
        if (target) signaling.endSession(target);
        webrtc.closeConnection();
        clearInterval(state.statsInterval);
        ui.switchView('home');
        ui.showToast('انتهت الجلسة', 'info');
    };

    setInterval(async () => {
        const stats = await window.dsdesk.getSystemStats();
        ui.updateDashboardPerformance(stats);
    }, 2500);
});
