/**
 * DSDesk PRO MAX Application - CORE STABILIZER v4.5
 * Fixed Port, Fixed Socket.io, Fixed Initialization
 */

const DEFAULT_SERVER = 'http://localhost:10000'; // Changed to 10000 based on user server logs

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[APP] Starting DSDesk Pro Max...');
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

    // ── 1. Load Device Info (CRITICAL: Must work even if offline) ──
    try {
        state.deviceId = await window.dsdesk.getDeviceId();
        const pwd = await window.dsdesk.getPassword();
        console.log('[APP] Device Info Loaded:', state.deviceId);
        ui.updateDeviceInfo(state.deviceId, pwd);
        ui.renderRecentList(state.recentConnections, state.nicknames, (id) => {
            document.getElementById('remote-id').value = id;
            document.getElementById('btn-connect').click();
        });
    } catch (e) {
        console.error('[APP] Failed to load device info:', e);
    }

    // ── 2. Signaling Setup ──
    const serverUrl = state.settings.server || DEFAULT_SERVER;
    const signaling = new SignalingClient(serverUrl);

    try {
        console.log('[APP] Connecting to signaling server:', serverUrl);
        await signaling.connect(state.deviceId, await window.dsdesk.getPassword());
        ui.setConnectionStatus(true);
        console.log('[APP] Signaling Connected');
    } catch (e) {
        console.warn('[APP] Signaling Connection Failed (Offline Mode):', e.message);
        ui.setConnectionStatus(false);
        ui.showToast('تعذر الاتصال بالسيرفر - يعمل في وضع الأوفلاين', 'info');
    }

    // ── 3. Event Listeners ──
    signaling.on('request', (data) => {
        ui.showRequestModal(data.from);
        state.incomingRequest = data;
    });

    document.getElementById('btn-accept').onclick = async () => {
        ui.hideRequestModal();
        ui.showToast('جاري بدء المشاركة...', 'info');
        state.isHost = true;
        await webrtc.initializeConnection(false, 'host');
        await webrtc.startScreenShare();
        signaling.acceptRequest(state.incomingRequest.fromSocketId);
    };

    document.getElementById('btn-reject').onclick = () => {
        ui.hideRequestModal();
        signaling.rejectRequest(state.incomingRequest.fromSocketId);
    };

    document.getElementById('btn-connect').onclick = () => {
        const id = document.getElementById('remote-id').value.trim();
        if (!id) return ui.showToast('يرجى إدخال ID', 'error');
        ui.showToast('جاري البحث...', 'info');
        signaling.sendRequest(id);
    };

    signaling.on('accepted', async (data) => {
        state.isHost = false;
        state.currentRemoteSocketId = data.hostSocketId;
        ui.showToast('تم القبول. جاري الربط...', 'success');
        await webrtc.initializeConnection(true, 'viewer');
        signaling.sendOffer(data.hostSocketId, await webrtc.createOffer());
    });

    signaling.on('offer', async (data) => {
        state.currentRemoteSocketId = data.from;
        if (!webrtc.peerConnection) await webrtc.initializeConnection(false, 'host');
        signaling.sendAnswer(data.from, await webrtc.handleOffer(data.offer));
    });

    signaling.on('answer', async (data) => {
        await webrtc.handleAnswer(data.answer);
        ui.switchView('session');
        state.statsInterval = setInterval(() => ui.updateStats(webrtc.getStats()), 2000);
    });

    signaling.on('ice-candidate', (data) => webrtc.addIceCandidate(data.candidate));
    webrtc.on('ice-candidate', (c) => signaling.sendIceCandidate(state.currentRemoteSocketId || state.incomingRequest?.fromSocketId, c));
    webrtc.on('stream', (s) => { document.getElementById('remote-video').srcObject = s; });

    webrtc.on('control-data', (data) => {
        if (state.isHost) window.dsdesk.simulateInput(data);
        if (data.type === 'chat') ui.addChatMessage(data.message, 'received');
    });

    // ── 4. UI Actions ──
    document.getElementById('btn-chat-send').onclick = () => {
        const input = document.getElementById('chat-input');
        if (input.value.trim()) {
            webrtc.sendControlData({ type: 'chat', message: input.value });
            ui.addChatMessage(input.value, 'sent');
            input.value = '';
        }
    };

    document.getElementById('btn-disconnect').onclick = () => {
        const target = state.currentRemoteSocketId || state.incomingRequest?.fromSocketId;
        if (target) signaling.endSession(target);
        webrtc.closeConnection();
        if (state.statsInterval) clearInterval(state.statsInterval);
        ui.switchInternalView('home');
        const termOut = document.getElementById('terminal-output');
        if (termOut) termOut.innerHTML = '';
        ui.showToast('انتهت الجلسة', 'info');
    };

    // Performance Monitoring
    setInterval(async () => ui.updateDashboardPerformance(await window.dsdesk.getSystemStats()), 2500);
});
