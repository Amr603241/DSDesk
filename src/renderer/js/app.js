/**
 * DSDesk PRO MAX Application - ULTIMATE Core
 * Handles all background features, settings, and remote logic
 */

const DEFAULT_SERVER = 'http://localhost:8080';

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. Initialization ──
    const ui = new UIManager();
    let webrtc;
    try {
        webrtc = new WebRTCManager();
    } catch (e) {
        console.error('[RTC] Init failed:', e);
    }

    let state = {
        deviceId: '',
        password: '',
        passwordEnabled: true,
        currentRemoteSocketId: null,
        recentConnections: JSON.parse(localStorage.getItem('dsdesk_recent') || '[]'),
        nicknames: JSON.parse(localStorage.getItem('dsdesk_nicknames') || {}),
        settings: JSON.parse(localStorage.getItem('dsdesk_settings') || '{}')
    };

    // Apply saved server or default
    const serverUrl = state.settings.server || DEFAULT_SERVER;
    const signaling = new SignalingClient(serverUrl);
    ui.setConnectionStatus(false, 'جاري الاتصال بالخادم...', serverUrl);

    // ── 2. Startup Tasks ──
    state.deviceId = await window.dsdesk.getDeviceId();
    state.password = await window.dsdesk.getPassword();
    state.passwordEnabled = await window.dsdesk.getPasswordEnabled();
    const hostname = await window.dsdesk.getHostname?.() || 'DSDESK-HOST';
    
    document.getElementById('device-hostname').textContent = hostname;
    ui.updateDeviceInfo(state.deviceId, state.password);
    ui.renderRecentList(state.recentConnections, state.nicknames, (id) => {
        document.getElementById('remote-id').value = id;
        document.getElementById('btn-connect').click();
    });

    // ── 3. Connection Handlers ──
    document.getElementById('btn-connect').onclick = () => {
        const remoteId = document.getElementById('remote-id').value.trim().replace(/\s/g, '');
        if (!remoteId) return ui.showToast('يرجى إدخال معرّف صحيح', 'error');
        if (remoteId === state.deviceId) return ui.showToast('لا يمكن الاتصال بنفس الجهاز', 'warning');

        ui.showConnecting('جاري البحث عن الجهاز...');
        signaling.sendRequest(remoteId);
    };

    signaling.on('accepted', async (data) => {
        ui.showConnecting('تم القبول. جاري ربط الفيديو...');
        state.currentRemoteSocketId = data.socketId;
        
        // Update Recent
        if (!state.recentConnections.includes(data.deviceId)) {
            state.recentConnections.unshift(data.deviceId);
            state.recentConnections = state.recentConnections.slice(0, 10);
            localStorage.setItem('dsdesk_recent', JSON.stringify(state.recentConnections));
        }

        try {
            await webrtc.createOffer(data.socketId, signaling);
            ui.switchView('session');
            ui.hideConnecting();
            ui.showToast('تم الاتصال بنجاح', 'success');

            // Stats Loop
            state.statsInterval = setInterval(() => {
                ui.updateStats(webrtc.getStats());
            }, 2000);
        } catch (e) {
            ui.hideConnecting();
            ui.showToast('فشل إنشاء القناة الآمنة', 'error');
        }
    });

    signaling.on('rejected', () => {
        ui.hideConnecting();
        ui.showToast('تم رفض الاتصال من الطرف الآخر', 'error');
    });

    signaling.on('disconnect', () => {
        ui.showToast('فقد الاتصال بالخادم', 'error');
        ui.setConnectionStatus(false, 'غير متصل', serverUrl);
    });

    signaling.on('connect', () => {
        ui.setConnectionStatus(true, 'الشبكة الذكية نشطة', serverUrl);
    });

    // ── 4. UI Actions & Modals ──
    const endSession = () => {
        if (state.currentRemoteSocketId) signaling.endSession(state.currentRemoteSocketId);
        webrtc.closeConnection();
        clearInterval(state.statsInterval);
        ui.switchView('home');
        ui.showToast('تم إنهاء الجلسة', 'info');
    };

    document.getElementById('btn-disconnect').onclick = endSession;

    // Settings Modal
    document.getElementById('btn-settings-home').onclick = () => {
        // Load settings into inputs
        document.getElementById('setting-device-name').value = state.settings.nickname || hostname;
        document.getElementById('setting-server').value = state.settings.server || DEFAULT_SERVER;
        document.getElementById('setting-fps').value = state.settings.fps || 60;
        document.getElementById('setting-bitrate').value = state.settings.bitrate || 15;
        document.getElementById('setting-autostart').checked = state.settings.autostart || false;
        
        // Sync range text labels manually for init
        document.getElementById('val-fps').textContent = document.getElementById('setting-fps').value;
        document.getElementById('val-bitrate').textContent = document.getElementById('setting-bitrate').value;

        document.getElementById('settings-modal').classList.add('active');
    };

    document.getElementById('btn-close-settings').onclick = () => document.getElementById('settings-modal').classList.remove('active');
    
    document.getElementById('btn-save-settings').onclick = async () => {
        const newSettings = {
            nickname: document.getElementById('setting-device-name').value,
            server: document.getElementById('setting-server').value,
            fps: parseInt(document.getElementById('setting-fps').value),
            bitrate: parseInt(document.getElementById('setting-bitrate').value),
            autostart: document.getElementById('setting-autostart').checked,
            quality: document.querySelector('.preset-btn.active')?.dataset.preset || 'balanced'
        };
        
        localStorage.setItem('dsdesk_settings', JSON.stringify(newSettings));
        state.settings = newSettings;
        
        // Apply System Settings
        window.dsdesk.setAutostart?.(newSettings.autostart);
        
        ui.showToast('تم حفظ الإعدادات بنجاح', 'success');
        document.getElementById('settings-modal').classList.remove('active');
        
        // Reload if server changed
        if (newSettings.server !== serverUrl) {
            ui.showToast('جاري إعادة التشغيل لتطبيق تغييرات السيرفر...', 'info');
            setTimeout(() => window.location.reload(), 1500);
        }
    };

    // Terminal
    document.getElementById('btn-terminal-toggle').onclick = () => {
        document.getElementById('terminal-modal').classList.add('active');
    };

    // ── 5. System Monitoring (Dashboard) ──
    setInterval(async () => {
        const stats = await window.dsdesk.getSystemStats();
        ui.updateDashboardPerformance(stats);
    }, 2500);

    // AI Optimize button
    document.getElementById('btn-ai-optimize')?.addEventListener('click', () => {
        ui.showToast('تفعيل وضع الضغط العالي (Low Latency Mode)...', 'success');
        webrtc.setQualityPreset('fast');
        document.getElementById('ai-panel').style.display = 'none';
    });

    logDebug('DSDesk Ultimate v4.1 - Systems Online');
});

function logDebug(msg) { console.log(`[CORE] ${msg}`); }
