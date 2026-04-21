/**
 * DSDesk Application Orchestrator
 * Optimized Edition - No Redundancy, High Stability
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. Initialization & State ──
    const ui = new UIManager();
    const serverUrl = 'https://dsdesk.onrender.com';
    const signaling = new SignalingClient(serverUrl);
    const webrtc = new WebRTCManager();

    let state = {
        deviceId: '',
        password: '',
        passwordEnabled: true,
        isHost: false,
        currentRemoteSocketId: null,
        currentRemoteDeviceId: null,
        lastClipboard: '',
        statsInterval: null,
        clipboardInterval: null,
        receivingFiles: {},
        // AnyDesk-Elite: Address Book
        recentConnections: JSON.parse(localStorage.getItem('dsdesk_recent') || '[]'),
        deviceNicknames: JSON.parse(localStorage.getItem('dsdesk_nicknames') || '{}'),
        permissions: {
            allowMouse: true,
            allowKeyboard: true,
            allowClipboard: true,
            allowFiles: true
        }
    };

    // ── 2. Diagnostic Logging ──
    const debugContent = document.getElementById('debug-content');
    const logDebug = (msg, level = 'info') => {
        if (!debugContent) return;
        const time = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.className = `log-line ${level}`;
        line.style.color = level === 'error' ? '#ff4d4d' : level === 'warn' ? '#ffcc00' : '#00f2fe';
        line.textContent = `[${time}] ${msg}`;
        debugContent.appendChild(line);
        debugContent.scrollTop = debugContent.scrollHeight;
        console.log(`[${level.toUpperCase()}] ${msg}`);
    };
    window.logDebugToApp = logDebug;

    logDebug('DSDesk Core Engine Initializing...');

    // ── 3. App Startup Sequence ──
    try {
        state.deviceId = await window.dsdesk.getDeviceId();
        state.password = await window.dsdesk.getPassword();
        state.passwordEnabled = await window.dsdesk.getPasswordEnabled();
        const isInstalled = await window.dsdesk.getInstallStatus();

        ui.updateDeviceInfo(state.deviceId, state.password);
        ui.setPasswordEnabled(state.passwordEnabled);
        
        if (isInstalled) {
            document.getElementById('install-banner')?.classList.add('hidden');
            document.getElementById('badge-installed')?.classList.remove('hidden');
        }

        const isAdmin = await window.dsdesk.isAdmin();
        if (!isAdmin) {
            ui.showToast('تنبيه: يرجى تشغيل البرنامج كمسؤول للتحكم الكامل.', 'warning');
        }

        // Connection Sequence
        ui.showToast('جاري الاتصال بالسيرفر العالمي...', 'info');
        let connected = false;
        for (let i = 1; i <= 3 && !connected; i++) {
            logDebug(`Handshake attempt ${i}/3...`);
            try {
                await signaling.ping(); // Wakeup call
                await signaling.connect();
                connected = true;
            } catch (err) {
                if (i === 3) throw err;
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        signaling.register(state.deviceId, state.password, state.passwordEnabled);
        ui.setConnectionStatus(true, 'متصل');
        logDebug('Device Online & Registered.');

        // Initialize Address Book UI
        refreshAddressBook();

        // Initialize display info
        const stats = await window.dsdesk.getSystemStats();
        document.getElementById('device-hostname').innerText = stats.hostname;
        document.getElementById('device-os-info').innerText = stats.osName;

    } catch (err) {
        logDebug(`Initialization Failed: ${err.message}`, 'error');
        ui.showToast('فشل الاتصال بالسيرفر. تأكد من جودة الإنترنت.', 'error');
        ui.setConnectionStatus(false, 'خطأ في الاتصال');
    }

    // ── 4. Signaling Event Handlers ──

    signaling.on('connection-request', async ({ from, fromSocketId }) => {
        const trusted = await window.dsdesk.getTrustedDevices();
        
        const accept = (shouldTrust, permissions = null) => {
            state.isHost = true;
            state.currentRemoteSocketId = fromSocketId;
            state.currentRemoteDeviceId = from;
            
            if (permissions) {
                state.permissions = permissions;
                logDebug(`Session started with custom permissions: ${Object.keys(permissions).filter(k => permissions[k]).join(', ')}`);
            }

            if (shouldTrust) window.dsdesk.addTrustedDevice(from);
            signaling.acceptConnection(fromSocketId);
            ui.showToast(`تم قبول الاتصال من ${from}`, 'success');
        };

        if (trusted.includes(from)) {
            accept(false);
        } else {
            ui.showRequestModal(from, accept, () => signaling.rejectConnection(fromSocketId));
        }
    });

    signaling.on('connection-accepted', async ({ hostSocketId, hostDeviceId }) => {
        logDebug(`Connection accepted by ${hostDeviceId}`);
        state.isHost = false;
        state.currentRemoteSocketId = hostSocketId;
        state.currentRemoteDeviceId = hostDeviceId;

        ui.switchView('session');
        ui.setConnectingOverlay(true, 'تجهيز الربط المباشر P2P...');

        try {
            await webrtc.initializeConnection(true, 'viewer');
            const offer = await webrtc.createOffer();
            signaling.sendOffer(hostSocketId, offer);
        } catch (err) {
            logDebug(`WebRTC Error: ${err.message}`, 'error');
            ui.showToast('فشل في إنشاء قناة الاتصال', 'error');
            endSession();
        }
    });

    signaling.on('offer', async ({ from, offer }) => {
        if (!state.isHost) return;
        state.currentRemoteSocketId = from;
        try {
            await webrtc.initializeConnection(false, 'host');
            ui.setConnectingOverlay(true, 'بدء بث الشاشة...');
            await webrtc.startScreenShare();
            const answer = await webrtc.handleOffer(offer);
            signaling.sendAnswer(from, answer);
        } catch (err) {
            logDebug(`Offer Error: ${err.message}`, 'error');
        }
    });

    signaling.on('answer', async ({ answer }) => {
        try {
            await webrtc.handleAnswer(answer);
        } catch (err) {
            logDebug(`Answer Error: ${err.message}`, 'error');
        }
    });

    signaling.on('ice-candidate', async ({ candidate }) => {
        await webrtc.addIceCandidate(candidate);
    });

    signaling.on('session-ended', ({ message }) => {
        ui.showToast(message || 'انتهت الجلسة', 'info');
        endSession();
    });

    signaling.on('connection-rejected', ({ message }) => {
        ui.showToast(message || 'تم رفض الاتصال', 'error');
        resetConnectButton();
    });

    // ── 5. WebRTC Event Handlers ──

    webrtc.on('ice-candidate', (candidate) => {
        if (state.currentRemoteSocketId) {
            signaling.sendIceCandidate(state.currentRemoteSocketId, candidate);
        }
    });

    webrtc.on('ice-state-change', (state) => {
        logDebug(`ICE State: ${state}`);
        if (state === 'connected' || state === 'completed') {
            ui.setConnectingOverlay(false);
            ui.showToast('تم الاتصال بنجاح', 'success');
        } else if (state === 'failed') {
            ui.showToast('فشل ربط المسار ICE', 'error');
            endSession();
        }
    });

    webrtc.on('ice-restart-offer', (offer) => {
        if (state.currentRemoteSocketId) {
            signaling.sendOffer(state.currentRemoteSocketId, offer);
        }
    });

    webrtc.on('remote-stream', (stream) => {
        ui.displayRemoteVideo(stream);
        ui.setConnectingOverlay(false);
    });

    webrtc.on('datachannel-open', () => {
        logDebug('Data Channel Active');
        startBackgroundTasks();
    });

    webrtc.on('control-data', async (data) => {
        switch (data.type) {
            case 'input':
            case 'mousemove':
            case 'mousedown':
            case 'mouseup':
            case 'wheel':
            case 'keydown':
            case 'keyup':
                if (state.isHost) {
                    // Permission Check: Mouse/Keyboard Sentinel
                    const isMouse = ['mousemove', 'mousedown', 'mouseup', 'wheel'].includes(data.type);
                    const isKeyboard = ['keydown', 'keyup'].includes(data.type);
                    
                    if (isMouse && !state.permissions.allowMouse) return;
                    if (isKeyboard && !state.permissions.allowKeyboard) return;

                    window.dsdesk.simulateInput(data);
                }
                break;
            case 'sys-stats':
                updateSessionStats(data.cpu, data.ram);
                break;
            case 'clipboard-sync':
                if (state.isHost && !state.permissions.allowClipboard) return;
                state.lastClipboard = data.text;
                await window.dsdesk.writeClipboard(data.text);
                break;
            case 'file-meta':
                handleFileMeta(data);
                break;
            case 'file-chunk':
                handleFileChunk(data);
                break;
            case 'get-monitors':
                if (state.isHost) {
                    const sources = await window.dsdesk.getScreenSources();
                    webrtc.sendControlData({ type: 'monitor-list', sources });
                }
                break;
            case 'monitor-list':
                showMonitorPicker(data.sources);
                break;
            case 'switch-monitor':
                if (state.isHost) handleMonitorSwitch(data.id);
                break;
            case 'get-tasks':
                if (state.isHost) {
                    const tasks = await window.dsdesk.getProcessList();
                    webrtc.sendControlData({ type: 'task-list', tasks });
                }
                break;
            case 'task-list':
                renderTaskList(data.tasks);
                break;
            case 'kill-task':
                if (state.isHost) await window.dsdesk.killProcess(data.pid);
                break;
            case 'terminal-start':
                if (state.isHost) {
                    window.dsdesk.startShell();
                    window.dsdesk.onShellData((text) => webrtc.sendControlData({ type: 'terminal-data', text }));
                }
                break;
            case 'terminal-input':
                if (state.isHost) window.dsdesk.sendShellInput(data.text);
                break;
            case 'terminal-data':
                appendTerminalOutput(data.text);
                break;
            case 'sys-reboot': if (state.isHost) window.dsdesk.reboot(); break;
            case 'sys-lock': if (state.isHost) window.dsdesk.lock(); break;
            case 'sys-shutdown': if (state.isHost) window.dsdesk.shutdown(); break;
        }
    });

    // ── 6. UI Interaction Handlers ──

    const connectForm = document.getElementById('connect-form');
    const remoteIdInput = document.getElementById('remote-id');
    const connectBtn = document.getElementById('btn-connect');

    remoteIdInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^0-9-]/g, '');
        if (val.length > 13) val = val.substring(0, 13);
        e.target.value = val;
        connectBtn.disabled = val.replace(/\D/g, '').length < 9;
    });

    connectForm.onsubmit = (e) => {
        e.preventDefault();
        const targetId = remoteIdInput.value.replace(/\D/g, '');
        const targetPwd = document.getElementById('remote-password')?.value || '';
        
        if (targetId === state.deviceId.replace(/\D/g, '')) {
            return ui.showToast('لا يمكنك الاتصال بنفس الجهاز', 'warn');
        }

        ui.elements.btnConnect.disabled = true;
        document.getElementById('btn-connect-content').classList.add('hidden');
        document.getElementById('btn-connect-loader').classList.remove('hidden');
        
        saveToRecent(targetId);
        signaling.requestConnection(targetId, targetPwd);

        // Timeout safeguard
        state.connTimeout = setTimeout(() => {
            if (connectBtn.disabled) {
                ui.showToast('انتهت مهلة الاتصال', 'error');
                resetConnectButton();
            }
        }, 15000);
    };

    // ── Address Book Logic ──
    function saveToRecent(id) {
        if (!state.recentConnections.includes(id)) {
            state.recentConnections.unshift(id);
            if (state.recentConnections.length > 10) state.recentConnections.pop();
            localStorage.setItem('dsdesk_recent', JSON.stringify(state.recentConnections));
        }
        refreshAddressBook();
    }

    function refreshAddressBook() {
        ui.renderRecent(state.recentConnections, state.deviceNicknames);
        
        // Add listeners to rendered items
        document.querySelectorAll('.btn-quick-connect').forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute('data-id');
                remoteIdInput.value = id;
                connectForm.dispatchEvent(new Event('submit'));
            };
        });

        document.querySelectorAll('.btn-rename-device').forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute('data-id');
                const oldNick = state.deviceNicknames[id] || `جهاز ${id}`;
                const newNick = prompt('أدخل الاسم الجديد للجهاز:', oldNick);
                if (newNick !== null) {
                    state.deviceNicknames[id] = newNick;
                    localStorage.setItem('dsdesk_nicknames', JSON.stringify(state.deviceNicknames));
                    refreshAddressBook();
                }
            };
        });
    }

    function resetConnectButton() {
        if (state.connTimeout) clearTimeout(state.connTimeout);
        ui.elements.btnConnect.disabled = false;
        document.getElementById('btn-connect-content').classList.remove('hidden');
        document.getElementById('btn-connect-loader').classList.add('hidden');
    }

    // Window Controls
    document.getElementById('btn-disconnect').onclick = () => endSession();
    
    function endSession() {
        logDebug('Ending session...');
        if (state.currentRemoteSocketId) signaling.endSession(state.currentRemoteSocketId);
        webrtc.close();
        stopBackgroundTasks();
        state.isHost = false;
        state.currentRemoteSocketId = null;
        state.currentRemoteDeviceId = null;
        ui.switchView('home');
        ui.setConnectingOverlay(false);
        resetConnectButton();
        if (document.getElementById('remote-video')) document.getElementById('remote-video').srcObject = null;
    }

    // ── 7. Background Tasks ──

    function startBackgroundTasks() {
        stopBackgroundTasks();
        
        // Clipboard Sync (Bidirectional)
        state.clipboardInterval = setInterval(async () => {
            const currentClip = await window.dsdesk.readClipboard();
            if (currentClip && currentClip !== state.lastClipboard) {
                state.lastClipboard = currentClip;
                webrtc.sendControlData({ type: 'clipboard-sync', text: currentClip });
            }
        }, 1500);

        // Stats (Host only)
        if (state.isHost) {
            state.statsInterval = setInterval(async () => {
                const stats = await window.dsdesk.getSystemStats();
                webrtc.sendControlData({ type: 'sys-stats', cpu: stats.cpuLoad, ram: stats.ramUsage });
            }, 3000);
        }
    }

    function stopBackgroundTasks() {
        if (state.statsInterval) clearInterval(state.statsInterval);
        if (state.clipboardInterval) clearInterval(state.clipboardInterval);
        state.statsInterval = null;
        state.clipboardInterval = null;
    }

    function updateSessionStats(cpu, ram) {
        const cpuEl = document.getElementById('stat-cpu');
        const ramEl = document.getElementById('stat-ram');
        if (cpuEl) cpuEl.querySelector('span').innerText = `CPU: ${cpu}%`;
        if (ramEl) ramEl.querySelector('span').innerText = `RAM: ${ram}%`;
    }

    // ── 8. Feature Modules (File, Terminal, etc.) ──

    // File Transfer
    const dropZone = document.getElementById('drop-zone');
    dropZone.ondrop = (e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        files.forEach(sendFile);
    };
    dropZone.dragover = (e) => e.preventDefault();

    async function sendFile(file) {
        const transferId = Math.random().toString(36).substr(2, 9);
        webrtc.sendControlData({ type: 'file-meta', name: file.name, size: file.size, transferId });
        
        const chunkSize = 64 * 1024;
        let offset = 0;
        const reader = new FileReader();

        reader.onload = (e) => {
            webrtc.sendControlData({ type: 'file-chunk', transferId, data: e.target.result });
            offset += e.target.result.byteLength;
            if (offset < file.size) readNext();
        };

        const readNext = () => reader.readAsDataURL(file.slice(offset, offset + chunkSize));
        readNext();
    }

    function handleFileMeta(meta) {
        state.receivingFiles[meta.transferId] = { name: meta.name, size: meta.size, chunks: [], received: 0 };
        ui.showToast(`استقبال ملف: ${meta.name}`, 'info');
    }

    function handleFileChunk(chunk) {
        const file = state.receivingFiles[chunk.transferId];
        if (!file) return;
        file.chunks.push(chunk.data);
        file.received += (chunk.data.length * 0.75);
        if (file.received >= file.size) assembleAndDownload(chunk.transferId);
    }

    function assembleAndDownload(id) {
        const file = state.receivingFiles[id];
        const blobs = file.chunks.map(data => {
            const byteString = atob(data.split(',')[1]);
            const ia = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            return new Blob([ia]);
        });
        const url = URL.createObjectURL(new Blob(blobs));
        const a = document.createElement('a');
        a.href = url; a.download = file.name; a.click();
        delete state.receivingFiles[id];
        ui.showToast(`اكتمل التحميل: ${file.name}`, 'success');
    }

    // Terminal & Tasks Management
    function appendTerminalOutput(text) {
        const out = document.getElementById('terminal-output');
        if (out) { out.textContent += text; out.scrollTop = out.scrollHeight; }
    }

    document.getElementById('terminal-input').onkeydown = (e) => {
        if (e.key === 'Enter') {
            webrtc.sendControlData({ type: 'terminal-input', text: e.target.value + '\n' });
            e.target.value = '';
        }
    };

    // ── 9. Secondary Buttons & Actions ──
    document.getElementById('btn-copy-id').onclick = () => {
        window.dsdesk.writeClipboard(state.deviceId);
        ui.showToast('تم النسخ', 'success');
    };

    document.getElementById('btn-refresh-pwd').onclick = async () => {
        state.password = await window.dsdesk.refreshPassword();
        ui.updateDeviceInfo(null, state.password);
        signaling.updatePassword(state.password, state.passwordEnabled);
    };

    document.getElementById('check-password-enabled').onchange = async (e) => {
        state.passwordEnabled = e.target.checked;
        await window.dsdesk.setPasswordEnabled(state.passwordEnabled);
        signaling.updatePassword(state.password, state.passwordEnabled);
    };

    // Chat
    document.getElementById('btn-send-chat').onclick = () => {
        const inp = document.getElementById('chat-input');
        if (inp.value.trim() && state.currentRemoteSocketId) {
            const time = signaling.sendChatMessage(state.currentRemoteSocketId, inp.value);
            ui.appendChatMessage(inp.value, time, true);
            inp.value = '';
        }
    };

    signaling.on('chat-message', (data) => ui.appendChatMessage(data.message, data.timestamp, false));

    // Shortcut: Ctrl+Shift+D for Diagnostics
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
            document.getElementById('debug-overlay')?.classList.toggle('hidden');
        }
    });

    // Remote Input Forwarding - Professional Optimization v1.9.0
    const remoteVideo = document.getElementById('remote-video');
    let lastMove = 0;
    
    // Performance Cache: Avoid getBoundingClientRect on every move
    let cachedRect = null;
    const updateVideoCache = () => {
        if (!remoteVideo) return;
        cachedRect = remoteVideo.getBoundingClientRect();
    };
    
    // Listen for resize to invalidate cache
    window.addEventListener('resize', updateVideoCache);
    const resizeObserver = new ResizeObserver(updateVideoCache);
    resizeObserver.observe(remoteVideo);

    const sendInput = (type, e) => {
        if (state.isHost || !state.currentRemoteSocketId) return;
        
        // 60 FPS Throttle (16ms) - Industry Standard
        if (type === 'mousemove') {
            const now = Date.now();
            if (now - lastMove < 16) return;
            lastMove = now;
        }

        if (!cachedRect) updateVideoCache();
        
        // --- High Precision "Letterbox" Mapping ---
        // Handles object-fit: contain black bars
        const containerW = cachedRect.width;
        const containerH = cachedRect.height;
        const videoW = remoteVideo.videoWidth || 1920;
        const videoH = remoteVideo.videoHeight || 1080;
        
        const containerRatio = containerW / containerH;
        const videoRatio = videoW / videoH;
        
        let actualW, actualH, offsetX, offsetY;
        
        if (containerRatio > videoRatio) {
            // Limited by height (bars on side)
            actualH = containerH;
            actualW = containerH * videoRatio;
            offsetX = (containerW - actualW) / 2;
            offsetY = 0;
        } else {
            // Limited by width (bars on top/bottom)
            actualW = containerW;
            actualH = containerW / videoRatio;
            offsetX = 0;
            offsetY = (containerH - actualH) / 2;
        }

        // Relative coordinates within the ACTUAL video area
        const relX = (e.clientX - cachedRect.left - offsetX) / actualW;
        const relY = (e.clientY - cachedRect.top - offsetY) / actualH;

        // Only send if within bounds
        if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) {
            webrtc.sendControlData({
                type: type,
                x: Math.round(relX * videoW),
                y: Math.round(relY * videoH),
                button: e.button,
                key: e.key,
                code: e.code,
                deltaY: e.deltaY
            });
        }
    };

    remoteVideo.addEventListener('mousemove', (e) => sendInput('mousemove', e));
    remoteVideo.addEventListener('mousedown', (e) => sendInput('mousedown', e));
    remoteVideo.addEventListener('mouseup', (e) => sendInput('mouseup', e));
    remoteVideo.addEventListener('wheel', (e) => { e.preventDefault(); sendInput('wheel', e); }, { passive: false });
    window.addEventListener('keydown', (e) => { if (ui.views.session.classList.contains('active')) sendInput('keydown', e); });
    window.addEventListener('keyup', (e) => { if (ui.views.session.classList.contains('active')) sendInput('keyup', e); });

    // --- Professional Tool Actions ---
    document.getElementById('btn-tasks-toggle').onclick = () => {
        if (state.currentRemoteSocketId) {
            webrtc.sendControlData({ type: 'shortcut', action: 'task-mgr' });
            ui.showToast('جاري فتح مدير المهام...', 'info');
        }
    };

    document.getElementById('btn-power-menu').onclick = () => {
        document.getElementById('power-modal').classList.remove('hidden');
    };

    document.getElementById('action-lock').onclick = () => {
        webrtc.sendControlData({ type: 'shortcut', action: 'lock' });
        document.getElementById('power-modal').classList.add('hidden');
    };

    document.getElementById('action-reboot').onclick = () => {
        if (confirm('هل أنت متأكد من إعادة تشغيل الجهاز البعيد؟')) {
            webrtc.sendControlData({ type: 'shortcut', action: 'reboot' });
        }
    };

    // System Monitor logic
    setInterval(() => {
        if (state.currentRemoteSocketId && ui.views.session.classList.contains('active')) {
            // In a real app, the host would push this, but let's simulate or trigger a request
            // webrtc.sendControlData({ type: 'request-stats' });
        }
    }, 2000);

});
