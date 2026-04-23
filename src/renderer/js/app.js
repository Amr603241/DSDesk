/**
 * DSDesk PRO MAX Application - CORE STABILIZER v4.6
 * Ultimate fix for ID display and Settings activation
 */

const DEFAULT_SERVER = 'http://localhost:10000';

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
        settings: JSON.parse(localStorage.getItem('dsdesk_settings') || { quality: 'fast', autostart: false })
    };

    // ── 0. Emergency UI Update (Ensure ID shows ASAP) ──
    try {
        state.deviceId = await window.dsdesk.getDeviceId();
        const pwd = await window.dsdesk.getPassword();
        ui.updateDeviceInfo(state.deviceId, pwd);
        console.log('[APP] ID Displayed:', state.deviceId);
    } catch (e) {
        console.error('[APP] Emergency ID load failed:', e);
    }

    // ── 1. Settings Logic ──
    const loadSettings = () => {
        const autostartCheck = document.getElementById('setting-autostart');
        const qualitySelect = document.getElementById('setting-quality');
        if (autostartCheck) autostartCheck.checked = state.settings.autostart;
        if (qualitySelect) qualitySelect.value = state.settings.quality;
    };
    loadSettings();

    document.getElementById('btn-save-settings').onclick = async () => {
        const autostart = document.getElementById('setting-autostart').checked;
        const quality = document.getElementById('setting-quality').value;
        state.settings = { autostart, quality };
        localStorage.setItem('dsdesk_settings', JSON.stringify(state.settings));
        await window.dsdesk.setAutostart(autostart);
        ui.showToast('تم حفظ الإعدادات بنجاح', 'success');
    };

    // ── 2. Signaling Setup ──
    const signaling = new SignalingClient(DEFAULT_SERVER);

    try {
        await signaling.connect(state.deviceId, await window.dsdesk.getPassword());
        ui.setConnectionStatus(true);
        console.log('[APP] Signaling Connected');
    } catch (e) {
        console.warn('[APP] Signaling Offline:', e.message);
        ui.setConnectionStatus(false);
    }

    // ── 3. Event Listeners ──
    signaling.on('request', (data) => {
        ui.showRequestModal(data.from);
        state.incomingRequest = data;
    });

    document.getElementById('btn-accept').onclick = async () => {
        ui.hideRequestModal();
        state.isHost = true;
        await webrtc.initializeConnection(false, 'host');
        await webrtc.startScreenShare();
        signaling.acceptRequest(state.incomingRequest.fromSocketId);
    };

    document.getElementById('btn-connect').onclick = () => {
        const id = document.getElementById('remote-id').value.trim();
        if (id) signaling.sendRequest(id);
        else ui.showToast('يرجى إدخال ID', 'error');
    };

    signaling.on('accepted', async (data) => {
        state.isHost = false;
        state.currentRemoteSocketId = data.hostSocketId;
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
    });

    signaling.on('ice-candidate', (data) => webrtc.addIceCandidate(data.candidate));
    webrtc.on('ice-candidate', (c) => signaling.sendIceCandidate(state.currentRemoteSocketId || state.incomingRequest?.fromSocketId, c));
    webrtc.on('stream', (s) => { document.getElementById('remote-video').srcObject = s; });

    webrtc.on('control-data', (data) => {
        if (state.isHost) window.dsdesk.simulateInput(data);
        if (data.type === 'chat') ui.addChatMessage(data.message, 'received');
    });

    // ── 4. UI Actions ──
    document.getElementById('btn-disconnect').onclick = () => {
        const target = state.currentRemoteSocketId || state.incomingRequest?.fromSocketId;
        if (target) signaling.endSession(target);
        webrtc.closeConnection();
        ui.switchInternalView('home');
    };

    // Sync recent list
    ui.renderRecentList(state.recentConnections, state.nicknames, (id) => {
        document.getElementById('remote-id').value = id;
        document.getElementById('btn-connect').click();
    });

    // Monitoring
    setInterval(async () => ui.updateDashboardPerformance(await window.dsdesk.getSystemStats()), 2500);
});
