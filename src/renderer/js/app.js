/**
 * DSDesk PRO MAX Application - PRO ELITE Core
 * Version 4.1.0 - Ultimate Remote Desktop
 */

const SERVER_CONFIG = {
    primary: 'http://localhost:8080',
    cloud: 'https://dsdesk.onrender.com',
    timeout: 10000
};

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. Initialization ──
    const ui = new UIManager();
    let savedServer = localStorage.getItem('dsdesk_server');
    let serverUrl = savedServer || SERVER_CONFIG.primary;
    
    let webrtc;
    try {
        webrtc = new WebRTCManager();
    } catch (e) {
        console.error('[CRITICAL] WebRTCManager failed:', e);
    }
    
    const signaling = new SignalingClient(serverUrl);
    
    let state = {
        deviceId: '',
        password: '',
        passwordEnabled: true,
        isHost: false,
        currentRemoteSocketId: null,
        recentConnections: JSON.parse(localStorage.getItem('dsdesk_recent') || '[]'),
        nicknames: JSON.parse(localStorage.getItem('dsdesk_nicknames') || '{}')
    };

    // ── 2. Load Core Data ──
    state.deviceId = await window.dsdesk.getDeviceId();
    state.password = await window.dsdesk.getPassword();
    state.passwordEnabled = await window.dsdesk.getPasswordEnabled();
    
    ui.updateDeviceInfo(state.deviceId, state.password);
    ui.renderRecentList(state.recentConnections, state.nicknames, (id) => {
        document.getElementById('remote-id').value = id;
        document.getElementById('btn-connect').click();
    });

    // ── 3. Connection Logic ──
    document.getElementById('btn-connect').onclick = async () => {
        const remoteId = document.getElementById('remote-id').value.trim().replace(/\s/g, '');
        if (!remoteId) return ui.showToast('يرجى إدخال معرّف صحيح', 'error');
        if (remoteId === state.deviceId) return ui.showToast('لا يمكنك الاتصال بجهازك نفسه', 'warning');

        ui.showConnecting('جاري البحث عن الجهاز البعيد...');
        signaling.sendRequest(remoteId);
    };

    signaling.on('request-sent', () => ui.showConnecting('بانتظار قبول الطرف الآخر...'));
    signaling.on('rejected', () => {
        ui.hideConnecting();
        ui.showToast('تم رفض طلب الاتصال', 'error');
    });

    signaling.on('accepted', async (data) => {
        ui.showConnecting('تم القبول. جاري إنشاء نفق P2P...');
        state.currentRemoteSocketId = data.socketId;
        
        // Save to recent
        if (!state.recentConnections.includes(data.deviceId)) {
            state.recentConnections.unshift(data.deviceId);
            state.recentConnections = state.recentConnections.slice(0, 10);
            localStorage.setItem('dsdesk_recent', JSON.stringify(state.recentConnections));
            ui.renderRecentList(state.recentConnections, state.nicknames, () => {});
        }

        try {
            const stream = await webrtc.createOffer(data.socketId, signaling);
            ui.switchView('session');
            ui.hideConnecting();
            ui.showToast('تم الاتصال بنجاح', 'success');
            
            // Start stats monitoring
            state.statsInterval = setInterval(() => {
                const stats = webrtc.getStats();
                ui.updateStats(stats);
            }, 2000);

        } catch (err) {
            ui.hideConnecting();
            ui.showToast('فشل إنشاء اتصال WebRTC', 'error');
        }
    });

    // ── 4. Remote Control & Tools ──
    const endSession = () => {
        if (state.currentRemoteSocketId) signaling.endSession(state.currentRemoteSocketId);
        webrtc.closeConnection();
        clearInterval(state.statsInterval);
        ui.switchView('home');
        ui.showToast('انتهت الجلسة', 'info');
    };

    document.getElementById('btn-disconnect').onclick = endSession;

    // Tools Toggles
    const togglePanel = (id) => {
        const panel = document.getElementById(id);
        if (panel) panel.classList.toggle('active');
    };

    document.getElementById('btn-chat-toggle').onclick = () => togglePanel('chat-panel');
    document.getElementById('btn-files-toggle').onclick = () => {
        const modal = document.getElementById('files-modal');
        if (modal) modal.classList.add('active');
    };
    document.getElementById('btn-tasks-toggle').onclick = () => {
        ui.showToast('جاري استدعاء مدير المهام البعيد...', 'info');
        webrtc.sendControlData({ type: 'shortcut', action: 'task-mgr' });
    };

    // AI Optimization
    document.getElementById('btn-ai-optimize')?.addEventListener('click', () => {
        ui.showToast('تفعيل نمط الأداء الفائق...', 'success');
        webrtc.setQualityPreset('fast');
        document.getElementById('ai-panel').style.display = 'none';
    });

    // ── 5. Input Handling ──
    const remoteVideo = document.getElementById('remote-video');
    remoteVideo.addEventListener('mousemove', (e) => {
        if (state.isHost) return;
        const rect = remoteVideo.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        webrtc.sendControlData({ type: 'mousemove', x: x * 1920, y: y * 1080 });
    });
    
    remoteVideo.addEventListener('mousedown', (e) => webrtc.sendControlData({ type: 'mousedown', button: e.button }));
    remoteVideo.addEventListener('mouseup', (e) => webrtc.sendControlData({ type: 'mouseup', button: e.button }));
    
    window.addEventListener('keydown', (e) => {
        if (ui.views.session.classList.contains('active')) {
            webrtc.sendControlData({ type: 'keydown', key: e.key, code: e.code });
        }
    });

    // ── 6. UI Polish ──
    document.getElementById('btn-settings-home').onclick = () => {
        document.getElementById('settings-modal').classList.add('active');
    };

    // Refresh ID/Password
    document.getElementById('btn-refresh-pwd').onclick = async () => {
        const newPwd = await window.dsdesk.refreshPassword();
        ui.updateDeviceInfo(state.deviceId, newPwd);
        ui.showToast('تم تحديث كلمة المرور', 'success');
    };

    logDebug('DSDesk PRO ELITE Engine Active');
});

function logDebug(msg) {
    console.log(`[CORE] ${msg}`);
}
