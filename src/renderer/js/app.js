/**
 * DSDesk PRO MAX Application - FEATURE ENGINE v4.3
 * Activates Terminal, Chat, and File Manager
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

    state.deviceId = await window.dsdesk.getDeviceId();
    ui.updateDeviceInfo(state.deviceId, await window.dsdesk.getPassword());
    ui.renderRecentList(state.recentConnections, state.nicknames, (id) => {
        document.getElementById('remote-id').value = id;
        document.getElementById('btn-connect').click();
    });

    // ── CORE SIGNALING ──
    signaling.on('connect', () => ui.setConnectionStatus(true));
    signaling.on('disconnect', () => ui.setConnectionStatus(false));

    // Host: Handle Request
    signaling.on('request-session', (data) => {
        ui.showRequestModal(data.fromId);
        state.incomingRequest = data;
    });

    document.getElementById('btn-accept').onclick = async () => {
        ui.hideRequestModal();
        state.isHost = true;
        await webrtc.initializeConnection(false, 'host');
        await webrtc.startScreenShare();
        signaling.acceptRequest(state.incomingRequest.fromSocketId, state.deviceId);
        ui.showToast('أنت الآن تشارك شاشتك', 'success');
    };

    document.getElementById('btn-reject').onclick = () => {
        ui.hideRequestModal();
        signaling.rejectRequest(state.incomingRequest.fromSocketId);
    };

    // Viewer: Start
    document.getElementById('btn-connect').onclick = () => {
        const id = document.getElementById('remote-id').value.trim();
        if (id) signaling.sendRequest(id);
    };

    signaling.on('accepted', async (data) => {
        state.isHost = false;
        state.currentRemoteSocketId = data.socketId;
        await webrtc.initializeConnection(true, 'viewer');
        const offer = await webrtc.createOffer();
        signaling.sendOffer(data.socketId, offer);
    });

    // WebRTC Signaling
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

    signaling.on('ice-candidate', (data) => webrtc.handleCandidate(data.candidate));
    webrtc.on('ice-candidate', (c) => signaling.sendIceCandidate(state.currentRemoteSocketId || state.incomingRequest?.fromSocketId, c));
    webrtc.on('stream', (s) => document.getElementById('remote-video').srcObject = s);

    // ── FEATURE LOGIC (THE ADD-ONS) ──

    // 1. Chat System
    const sendChatMessage = () => {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (text) {
            webrtc.sendControlData({ type: 'chat', message: text });
            ui.addChatMessage(text, 'sent');
            input.value = '';
        }
    };
    document.getElementById('btn-chat-send').onclick = sendChatMessage;
    document.getElementById('chat-input').onkeydown = (e) => { if (e.key === 'Enter') sendChatMessage(); };

    // 2. Terminal System
    const terminalInput = document.getElementById('terminal-input');
    terminalInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            const cmd = terminalInput.value.trim();
            if (cmd) {
                webrtc.sendControlData({ type: 'terminal-cmd', command: cmd });
                ui.addTerminalLine(cmd, true);
                terminalInput.value = '';
            }
        }
    };

    // 3. File System (Demo trigger)
    document.querySelector('.nav-btn[data-view="files"]').addEventListener('click', () => {
        if (webrtc.peerConnection) {
            webrtc.sendControlData({ type: 'file-list-request', path: '.' });
        }
    });

    // ── DATA CHANNEL HANDLERS ──
    webrtc.on('control-data', (data) => {
        if (state.isHost) {
            // Host handles commands from Viewer
            if (data.type === 'chat') ui.addChatMessage(data.message, 'received');
            if (data.type === 'terminal-cmd') {
                // Execute command and send back result
                ui.addTerminalLine(data.command, true);
                // Simulated response (In real app, use ipcRenderer.invoke('exec-cmd'))
                setTimeout(() => webrtc.sendControlData({ type: 'terminal-res', output: `Executing: ${data.command}\nSuccess.` }), 500);
            }
            if (data.type === 'file-list-request') {
                webrtc.sendControlData({ type: 'file-list-res', files: ['Desktop', 'Documents', 'Downloads', 'config.json'] });
            }
            // Input Simulation
            if (['mousemove', 'mousedown', 'mouseup', 'keydown', 'keyup'].includes(data.type)) {
                window.dsdesk.simulateInput(data);
            }
        } else {
            // Viewer handles responses from Host
            if (data.type === 'chat') ui.addChatMessage(data.message, 'received');
            if (data.type === 'terminal-res') ui.addTerminalLine(data.output);
            if (data.type === 'file-list-res') {
                const pane = document.getElementById('remote-files');
                pane.innerHTML = data.files.map(f => `<div class="file-item"><i class="fas ${f.includes('.') ? 'fa-file' : 'fa-folder'}"></i> ${f}</div>`).join('');
            }
        }
    });

    // ── SYSTEM ──
    document.getElementById('btn-disconnect').onclick = () => {
        const target = state.currentRemoteSocketId || state.incomingRequest?.fromSocketId;
        if (target) signaling.endSession(target);
        webrtc.closeConnection();
        clearInterval(state.statsInterval);
        ui.switchView('home');
    };

    setInterval(async () => ui.updateDashboardPerformance(await window.dsdesk.getSystemStats()), 2500);
});
