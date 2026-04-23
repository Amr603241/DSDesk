/**
 * DSDesk PRO MAX Application - CORE REPAIR v4.4
 * Fixed all signaling mismatches and initialization sequences
 */

const DEFAULT_SERVER = 'http://localhost:8080';

document.addEventListener('DOMContentLoaded', async () => {
    const ui = new UIManager();
    const webrtc = new WebRTCManager();
    let state = {
        deviceId: '',
        isHost: false,
        currentRemoteSocketId: null,
        recentConnections: JSON.parse(localStorage.getItem('dsdesk_recent') || '[]'),
        nicknames: JSON.parse(localStorage.getItem('dsdesk_nicknames') || {}),
        settings: JSON.parse(localStorage.getItem('dsdesk_settings') || '{}')
    };

    const serverUrl = state.settings.server || DEFAULT_SERVER;
    const signaling = new SignalingClient(serverUrl);

    // ── 1. App Startup ──
    try {
        state.deviceId = await window.dsdesk.getDeviceId();
        const pwd = await window.dsdesk.getPassword();
        ui.updateDeviceInfo(state.deviceId, pwd);
        ui.renderRecentList(state.recentConnections, state.nicknames, (id) => {
            document.getElementById('remote-id').value = id;
            document.getElementById('btn-connect').click();
        });

        await signaling.connect(state.deviceId, pwd);
        ui.setConnectionStatus(true);
    } catch (e) {
        console.error('[CRITICAL] Startup failed:', e);
        ui.showToast('فشل الاتصال بسيرفر الإشارات', 'error');
    }

    // ── 2. Incoming Request Handling ──
    signaling.on('request', (data) => {
        ui.showRequestModal(data.from);
        state.incomingRequest = data;
    });

    document.getElementById('btn-accept').onclick = async () => {
        ui.hideRequestModal();
        ui.showToast('جاري بدء مشاركة الشاشة...', 'info');
        state.isHost = true;
        
        await webrtc.initializeConnection(false, 'host');
        await webrtc.startScreenShare();
        
        signaling.acceptRequest(state.incomingRequest.fromSocketId);
    };

    document.getElementById('btn-reject').onclick = () => {
        ui.hideRequestModal();
        signaling.rejectRequest(state.incomingRequest.fromSocketId);
    };

    // ── 3. Outgoing Connection Flow ──
    document.getElementById('btn-connect').onclick = () => {
        const id = document.getElementById('remote-id').value.trim();
        if (!id) return ui.showToast('يرجى إدخال ID', 'error');
        ui.showToast('جاري البحث عن الجهاز...', 'info');
        signaling.sendRequest(id);
    };

    signaling.on('accepted', async (data) => {
        state.isHost = false;
        state.currentRemoteSocketId = data.hostSocketId;
        ui.showToast('تم القبول. جاري ربط الفيديو...', 'success');
        
        await webrtc.initializeConnection(true, 'viewer');
        const offer = await webrtc.createOffer();
        signaling.sendOffer(data.hostSocketId, offer);
    });

    signaling.on('rejected', () => {
        ui.showToast('تم رفض الاتصال من الطرف الآخر', 'error');
    });

    // ── 4. WebRTC Signaling ──
    signaling.on('offer', async (data) => {
        state.currentRemoteSocketId = data.from;
        if (!webrtc.peerConnection) await webrtc.initializeConnection(false, 'host');
        const answer = await webrtc.handleOffer(data.offer);
        signaling.sendAnswer(data.from, answer);
    });

    signaling.on('answer', async (data) => {
        await webrtc.handleAnswer(data.answer);
        ui.switchView('session');
        state.statsInterval = setInterval(() => ui.updateStats(webrtc.getStats()), 2000);
    });

    signaling.on('ice-candidate', (data) => {
        webrtc.addIceCandidate(data.candidate);
    });

    webrtc.on('ice-candidate', (c) => {
        const target = state.currentRemoteSocketId || state.incomingRequest?.fromSocketId;
        if (target) signaling.sendIceCandidate(target, c);
    });

    webrtc.on('stream', (stream) => {
        const video = document.getElementById('remote-video');
        if (video) video.srcObject = stream;
    });

    webrtc.on('control-data', (data) => {
        if (state.isHost) window.dsdesk.simulateInput(data);
        if (data.type === 'chat') ui.addChatMessage(data.message, 'received');
    });

    // ── 5. Features ──
    document.getElementById('btn-chat-send').onclick = () => {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (text) {
            webrtc.sendControlData({ type: 'chat', message: text });
            ui.addChatMessage(text, 'sent');
            input.value = '';
        }
    };

    document.getElementById('btn-disconnect').onclick = () => {
        const target = state.currentRemoteSocketId || state.incomingRequest?.fromSocketId;
        if (target) signaling.endSession(target);
        webrtc.closeConnection();
        clearInterval(state.statsInterval);
        ui.switchView('home');
        ui.showToast('انتهت الجلسة', 'info');
    };

    // System Monitoring
    setInterval(async () => {
        const stats = await window.dsdesk.getSystemStats();
        ui.updateDashboardPerformance(stats);
    }, 2500);
});
