/**
 * DSDesk Application Orchestrator
 * Coordinates Signaling, WebRTC, and UI
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Global Error Catcher
    window.onerror = function(msg, url, line) {
        if (window.logDebugToApp) window.logDebugToApp(`CRASH: ${msg} at ${line}`, 'error');
        return false;
    };

    const ui = new UIManager();

    // ── Diagnostics Initialization ──
    const debugContent = document.getElementById('debug-content');
    const logDebug = (msg, level = 'info') => {
        if (!debugContent) return;
        const time = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.style.color = level === 'error' ? '#ff4d4d' : level === 'warn' ? '#ffcc00' : '#00f2fe';
        line.textContent = `[${time}] ${msg}`;
        debugContent.appendChild(line);
        debugContent.scrollTop = debugContent.scrollHeight;
        console.log(`[DEBUG] ${msg}`);
    };
    window.logDebugToApp = logDebug;

    const logInitial = (msg) => logDebug(`[INIT] ${msg}`);
    logInitial('JS Core Engine Started');
    // GLOBAL PRODUCTION SERVER
    const DEFAULT_SERVER = 'https://dsdesk.onrender.com';
    logInitial('Configuring Signaling Path (GLOBAL)...');
    
    let savedServerUrl = DEFAULT_SERVER;
    const serverUrlInput = document.getElementById('server-url');
    if (serverUrlInput) {
        serverUrlInput.value = savedServerUrl;
        serverUrlInput.parentElement?.classList.add('hidden');
    }
    
    const signaling = new SignalingClient(savedServerUrl);
    let webrtc;
    try {
        webrtc = new WebRTCManager();
    } catch (rtcErr) {
        logInitial(`WebRTC Init Error: ${rtcErr.message}`);
    }

    let deviceId = '';
    let password = '';
    let passwordEnabled = true;
    let hostname = '';
    let osInfo = '';
    let currentRemoteSocketId = null;
    let currentRemoteDeviceId = null;
    let isHost = false;
    let lastClipboard = '';
    let statsInterval = null;
    let clipboardInterval = null;
    let receivingFiles = {};

    // ── App Initialization ──
    try {
        logDebug(`[PHASE 1] Connecting to Main Process...`);
        deviceId = await window.dsdesk.getDeviceId();
        password = await window.dsdesk.getPassword();
        passwordEnabled = await window.dsdesk.getPasswordEnabled();
        const isInstalled = await window.dsdesk.getInstallStatus();

        if (isInstalled) {
            document.getElementById('install-banner')?.classList.add('hidden');
            document.getElementById('badge-installed')?.classList.remove('hidden');
        } else {
            document.getElementById('install-banner')?.classList.remove('hidden');
            document.getElementById('badge-installed')?.classList.add('hidden');
        }
        
        logDebug(`[PHASE 2] Device Ready: ${deviceId}`);
        ui.updateDeviceInfo(deviceId, password);
        ui.setPasswordEnabled(passwordEnabled);
        
        ui.showToast('جاري الاتصال... [1/2]', 'info');
        
        // Critical: Check if Host is running as Admin (for remote control permissions)
        try {
            const isAdmin = await window.dsdesk.isAdmin();
            if (!isAdmin) {
                console.warn('[!] Not running as Admin. Input control will be restricted.');
                ui.showToast('تنبيه: يرجى تشغيل البرنامج كمسؤول (Administrator) لضمان دقة وبرمجية التحكم المطلقة.', 'warning');
            }
        } catch (e) {
            console.error('Admin check failed:', e);
        }

        logDebug(`[PHASE 3] Attempting connection to signaling...`);
        
        await signaling.connect();
        
        ui.showToast('جاري التسجيل... [2/2]', 'info');
        logDebug(`[PHASE 4] Connection established. Registering...`);
        
        signaling.register(deviceId, password, passwordEnabled);
        ui.setConnectionStatus(true, 'متصل');
        logDebug(`[SUCCESS] Device online.`);

        // Deferred stats initialization
        logDebug(`[STATS] Fetching system info...`);
        window.dsdesk.getSystemStats().then(stats => {
            hostname = stats.hostname;
            osInfo = stats.osName;
            document.getElementById('device-hostname').innerText = hostname;
            document.getElementById('device-os-info').innerText = osInfo;
            logDebug(`[STATS] System info updated`);
        });
    } catch (err) {
        logDebug(`[FATAL ERROR] Signaling phase failed: ${err.message}`, 'error');
        ui.showToast('عذراً: السيرفر لا يستجيب. تأكد من تشغيله.', 'error');
        ui.setConnectionStatus(false, 'خطأ في الربط');
    }

    // ── Signaling Events ──

    signaling.on('connection-request', async ({ from, fromSocketId }) => {
        const trusted = await window.dsdesk.getTrustedDevices();
        
        const accept = (shouldTrust) => {
            isHost = true;
            currentRemoteSocketId = fromSocketId;
            currentRemoteDeviceId = from;
            if (shouldTrust) window.dsdesk.addTrustedDevice(from);
            signaling.acceptConnection(fromSocketId);
            ui.showToast(`تم قبول الاتصال من ${from}`, 'success');
        };

        if (trusted.includes(from)) {
            ui.showToast(`دخول سريع: جاري قبول الاتصال التلقائي لـ ${from}`, 'info');
            accept(false);
        } else {
            ui.showRequestModal(from, (shouldTrust) => {
                accept(shouldTrust);
            }, () => {
                signaling.rejectConnection(fromSocketId);
            });
        }
    });

    // ── Connection Form Handling ──
    const remoteIdInput = document.getElementById('remote-id');
    const connectBtn = document.getElementById('btn-connect');

    remoteIdInput.addEventListener('input', (e) => {
        // Format input: 123 456 789 or 123 456 789-560
        let val = e.target.value.replace(/[^0-9-]/g, ''); // Allow digits and hyphen
        
        // Logical cap: 9 digits + optional hyphen + 3 digits
        if (val.length > 13) val = val.substring(0, 13);
        
        e.target.value = val;

        // Enable button if we have at least 9 digits (ignoring hyphen)
        const digitsOnly = val.replace(/\D/g, '');
        connectBtn.disabled = digitsOnly.length < 9;
    });

    ui.elements.connectForm.onsubmit = (e) => {
        e.preventDefault();
        const targetId = document.getElementById('remote-id').value.trim();
        const targetIdNumeric = targetId.replace(/\D/g, '');
        const myIdNumeric = (deviceId || '').replace(/\D/g, '');

        if (!targetId) return ui.showToast('الرجاء إدخال رقم الهوية', 'error');
        
        logDebug(`[CONNECT] Local: ${myIdNumeric} vs Target: ${targetIdNumeric}`);

        if (targetIdNumeric === myIdNumeric && myIdNumeric !== '') {
            logDebug(`[WARN] SELF-CONNECTION BLOCKED: ${targetId}`, 'warn');
            return ui.showToast('لا يمكنك الاتصال بهذا الجهاز (أنت تحاول الاتصال بنفسك). جرب الرقم الظاهر في النافذة الثانية.', 'warn');
        }

        console.log(`[APP] Initiating connection to: ${targetId}`);
        ui.setConnectingOverlay(true, 'تجهيز مسار الشبكة (Signaling)...');
        signaling.requestConnection(targetId, targetPwd);

        // Connection Timeout Safeguard
        const connectionTimeout = setTimeout(() => {
            if (ui.elements.connectingOverlay.classList.contains('active') || 
                !ui.elements.connectingOverlay.classList.contains('hidden')) {
                console.error('[APP] Connection Handshake TIMEOUT (15s)');
                ui.showToast('فشل الاتصال: انتهت مهلة الانتظار. تأكد من أن الطرف الآخر متصل.', 'error');
                ui.setConnectingOverlay(false);
            }
        }, 15000);

        signaling.on('connection-accepted', () => clearTimeout(connectionTimeout));
        signaling.on('connection-rejected', () => clearTimeout(connectionTimeout));
        signaling.on('connection-error', () => clearTimeout(connectionTimeout));
    };

    // ── Global Handlers ──

    // Clipboard Logic - Wire both buttons
    const handleCopyId = () => {
        const idElement = document.getElementById('device-id');
        const id = idElement?.textContent || '';
        if (id && id !== '--- --- ---') {
            const rawId = id.replace(/\s+/g, '');
            window.dsdesk.writeClipboard(rawId);
            ui.showToast(`تم نسخ المعرّف: ${rawId}`, 'success');
            logDebug(`[CLIPBOARD] ID copied to clipboard: ${rawId}`);
        } else {
            ui.showToast('المعرّف غير جاهز بعد', 'warn');
        }
    };

    const btnCopyId = document.getElementById('btn-copy-id');
    if (btnCopyId) btnCopyId.onclick = handleCopyId;

    const btnCopyIdTop = document.getElementById('btn-copy-id-top');
    if (btnCopyIdTop) btnCopyIdTop.onclick = handleCopyId;

    const btnCopyLogs = document.getElementById('btn-copy-logs');
    if (btnCopyLogs) {
        btnCopyLogs.onclick = () => {
            if (!debugContent) return ui.showToast('سجل التشخيص غير متوفر', 'error');
            const logs = debugContent.innerText || debugContent.textContent;
            window.dsdesk.writeClipboard(logs);
            ui.showToast('تم نسخ سجل التشخيص بنجاح', 'success');
            logDebug(`[CLIPBOARD] Logs copied to clipboard`);
        };
    }

    const btnShowDebug = document.getElementById('btn-show-debug');
    if (btnShowDebug) {
        btnShowDebug.onclick = () => {
            document.getElementById('debug-overlay').classList.toggle('hidden');
        };
    }

    const btnInstallNow = document.getElementById('btn-install-now');
    if (btnInstallNow) {
        btnInstallNow.onclick = async () => {
            ui.showToast('جاري بدء عملية التثبيت...', 'info');
            const result = await window.dsdesk.performInstall();
            if (result.success) {
                if (result.message === 'elevating') {
                    ui.showToast('يرجى الموافقة على طلب الصلاحيات لإكمال التثبيت', 'warn');
                } else {
                    ui.showToast('تم التثبيت بنجاح! جاري تشغيل النسخة المثبتة...', 'success');
                    setTimeout(() => window.close(), 2000);
                }
            } else {
                ui.showToast(`فشل التثبيت: ${result.error}`, 'error');
            }
        };
    }

    const btnCloseBanner = document.getElementById('btn-close-banner');
    if (btnCloseBanner) {
        btnCloseBanner.onclick = () => {
            document.getElementById('install-banner').classList.add('hidden');
        };
    }

    signaling.on('connection-accepted', async ({ hostSocketId, hostDeviceId }) => {
        logDebug(`Connection ACCEPTED by host: ${hostDeviceId}`);
        isHost = false;
        currentRemoteSocketId = hostSocketId;
        currentRemoteDeviceId = hostDeviceId;

        ui.showToast('تم قبول الاتصال، جاري التجهيز...', 'success');
        ui.setConnectingOverlay(true, 'تجهيز مسار الشبكة (Modern)...');
        ui.switchView('session');

        try {
            // Modern Unified: Start as viewer
            await webrtc.initializeConnection(true, 'viewer'); 
            logDebug('WebRTC initialized as Viewer (Unified Plan)');
            
            ui.setConnectingOverlay(true, 'فتح قناة البيانات المشفرة...');
            const offer = await webrtc.createOffer();
            logDebug('SDP Offer created successfully');
            
            signaling.sendOffer(hostSocketId, offer);
            logDebug('SDP Offer sent to host');
        } catch (err) {
            logDebug(`Handshake FAILED: ${err.message}`, 'error');
            ui.showToast('خطأ في بناء الاتصال: راجع سجل التشخيص', 'error');
        }
    });

    signaling.on('connection-rejected', ({ message }) => {
        ui.showToast(message, 'error');
        resetConnectionUI();
    });

    signaling.on('connection-error', ({ message }) => {
        ui.showToast(message, 'error');
        resetConnectionUI();
    });

    // ── WebRTC Signaling ──

    signaling.on('offer', async ({ from, offer }) => {
        logDebug(`RECEIVED Offer from: ${from}`);
        if (isHost) {
            currentRemoteSocketId = from;
            try {
                logDebug('[HOST] Starting WebRTC Initialization...');
                await webrtc.initializeConnection(false, 'host'); 
                logDebug('[HOST] WebRTC Initialized successfully');
                
                ui.setConnectingOverlay(true, 'تجهيز لقطة الشاشة (Atomic)...');
                logDebug('[HOST] Requesting screen source...');
                await webrtc.startScreenShare();
                logDebug('[HOST] Screen capture ACTIVE');
                
                ui.setConnectingOverlay(true, 'تأمين الاتصال المشفر (P2P)...');
                logDebug('[HOST] Processing remote offer...');
                const answer = await webrtc.handleOffer(offer);
                logDebug('[HOST] Answer created, sending to viewer');
                
                signaling.sendAnswer(from, answer);
                logDebug('[HOST] Handshake COMPLETE');
            } catch (err) {
                logDebug(`[HOST] FATAL HANDSHAKE ERROR: ${err.message}`, 'error');
                ui.showToast('فشل في بدء البث: راجع التشخيص', 'error');
            }
        } else {
            logDebug('[Viewer] Unexpected offer received while in viewer mode', 'warn');
        }
    });

    signaling.on('answer', async ({ from, answer }) => {
        logDebug(`RECEIVED Answer from socket: ${from.substring(0,6)}`);
        try {
            await webrtc.handleAnswer(answer);
            logDebug(`[P2P] Remote description set (Answer). Link Establishing...`);
        } catch (err) {
            logDebug(`[P2P ERROR] Failed to set answer: ${err.message}`, 'error');
        }
    });

    signaling.on('ice-candidate', async ({ from, candidate }) => {
        // logDebug(`RECEIVED ICE from: ${from.substring(0, 5)}...`);
        await webrtc.addIceCandidate(candidate);
    });

    // ── WebRTC Manager Events ──

    webrtc.on('ice-candidate', (candidate) => {
        if (currentRemoteSocketId) {
            console.log(`[APP] SENDING ICE Candidate to: ${currentRemoteSocketId}`);
            signaling.sendIceCandidate(currentRemoteSocketId, candidate);
        } else {
            console.warn('[APP] ICE Candidate gathered but currentRemoteSocketId is NULL!');
        }
    });

    webrtc.on('ice-state-change', (state) => {
        logDebug(`[P2P STATE] ${state}`);
        if (state === 'connected' || state === 'completed') {
            ui.showToast('تم الاتصال بنجاح!', 'success');
            ui.switchView('session');
            ui.setConnectingOverlay(false);
            logDebug(`[SUCCESS] Peer-to-Peer Link Active`);
        } else if (state === 'failed') {
            ui.showToast('فشل ربط المسار (ICE Failed)', 'error');
            ui.setConnectingOverlay(false);
        }
    });

    webrtc.on('remote-stream', (stream) => {
        ui.displayRemoteVideo(stream);
        ui.setConnectingOverlay(false);
        ui.showToast('متصل بنجاح (وضع التوربو)', 'success');
    });

    webrtc.on('datachannel-open', () => {
      ui.showToast('قناة البيانات مفتوحة - التحكم جاهز', 'info');
      startSessionTasks();
    });

    webrtc.on('control-data', async (data) => {
        if (data.type === 'input') {
            if (isHost) window.dsdesk.simulateInput(data);
        } else if (data.type === 'sys-stats') {
            updateStatsUI(data.cpu, data.ram);
        } else if (data.type === 'clipboard-sync') {
            lastClipboard = data.text;
            await window.dsdesk.writeClipboard(data.text);
            ui.showToast('تمت مزامنة الحافظة', 'info');
        } else if (data.type === 'file-meta') {
            handleFileMeta(data);
        } else if (data.type === 'file-chunk') {
            handleFileChunk(data);
        } else if (data.type === 'get-monitors') {
            const sources = await window.dsdesk.getScreenSources();
            webrtc.sendControlData({ type: 'monitor-list', sources });
        } else if (data.type === 'monitor-list') {
            showMonitorPicker(data.sources);
        } else if (data.type === 'switch-monitor') {
            handleMonitorSwitch(data.id);
        } else if (data.type === 'get-tasks') {
            const tasks = await window.dsdesk.getProcessList();
            webrtc.sendControlData({ type: 'task-list', tasks });
        } else if (data.type === 'task-list') {
            renderTaskList(data.tasks);
        } else if (data.type === 'kill-task') {
            if (isHost) await window.dsdesk.killProcess(data.pid);
        } else if (data.type === 'terminal-start') {
            if (isHost) {
                window.dsdesk.startShell();
                window.dsdesk.onShellData((text) => {
                    webrtc.sendControlData({ type: 'terminal-data', text });
                });
            }
        } else if (data.type === 'cursor-pos' || data.type === 'mousemove') {
            // Update virtual cursor position on the viewer side
            if (!isHost) {
                const vCursor = document.getElementById('virtual-cursor');
                if (vCursor && data.x !== undefined && data.y !== undefined) {
                    const rect = remoteVideo.getBoundingClientRect();
                    const videoWidth = remoteVideo.videoWidth;
                    const videoHeight = remoteVideo.videoHeight;
                    
                    if (videoWidth && videoHeight) {
                        const videoRatio = videoWidth / videoHeight;
                        const elementRatio = rect.width / rect.height;
                        let actualWidth, actualHeight, offsetX, offsetY;

                        if (elementRatio > videoRatio) {
                            actualHeight = rect.height;
                            actualWidth = actualHeight * videoRatio;
                            offsetX = (rect.width - actualWidth) / 2;
                            offsetY = 0;
                        } else {
                            actualWidth = rect.width;
                            actualHeight = actualWidth / videoRatio;
                            offsetX = 0;
                            offsetY = (rect.height - actualHeight) / 2;
                        }

                        const screenX = (data.x / videoWidth) * actualWidth + offsetX;
                        const screenY = (data.y / videoHeight) * actualHeight + offsetY;

                        vCursor.style.transform = `translate(${screenX}px, ${screenY}px)`;
                        vCursor.style.display = 'block';
                    }
                }
            }
        }
    });

    webrtc.on('connection-state', (state) => {
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        ui.showToast('انقطع الاتصال', 'error');
        endSession();
      }
    });

    // ── Input Handling (Client Side) ──

    const remoteVideo = document.getElementById('remote-video');

    let lastMoveTime = 0;
    const MOVE_THROTTLE = 30; // 33fps: Best balance for stability

    function sendRemoteInput(type, event) {
        if (isHost || !currentRemoteSocketId) return;

        // Throttle high-frequency events
        if (type === 'mousemove' || type === 'wheel') {
            const now = Date.now();
            if (now - lastMoveTime < MOVE_THROTTLE) return;
            lastMoveTime = now;
        }

        const rect = remoteVideo.getBoundingClientRect();
        const videoWidth = remoteVideo.videoWidth;
        const videoHeight = remoteVideo.videoHeight;

        if (!videoWidth || !videoHeight) return;

        // Calculate actual video dimensions and offsets within the element (object-fit: contain)
        const videoRatio = videoWidth / videoHeight;
        const elementRatio = rect.width / rect.height;

        let actualWidth, actualHeight, offsetX, offsetY;

        if (elementRatio > videoRatio) {
            // Height is the limiting factor (Black bars on left/right)
            actualHeight = rect.height;
            actualWidth = actualHeight * videoRatio;
            offsetX = (rect.width - actualWidth) / 2;
            offsetY = 0;
        } else {
            // Width is the limiting factor (Black bars on top/bottom)
            actualWidth = rect.width;
            actualHeight = actualWidth / videoRatio;
            offsetX = 0;
            offsetY = (rect.height - actualHeight) / 2;
        }

        // Relative coordinates within the actual video content
        const x = (event.clientX - rect.left - offsetX) * (videoWidth / actualWidth);
        const y = (event.clientY - rect.top - offsetY) * (videoHeight / actualHeight);

        // Bounds check (ensure we don't send coordinates from the black bars)
        if (x < 0 || x > videoWidth || y < 0 || y > videoHeight) return;

        const data = {
            type,
            x: Math.round(x), // Use integers to avoid float overhead
            y: Math.round(y),
            button: event.button,
            key: event.key,
            code: event.code,
            deltaY: event.deltaY
        };

        webrtc.sendControlData(data);
    }

    remoteVideo.addEventListener('mousemove', (e) => sendRemoteInput('mousemove', e));
    remoteVideo.addEventListener('mousedown', (e) => sendRemoteInput('mousedown', e));
    remoteVideo.addEventListener('mouseup', (e) => sendRemoteInput('mouseup', e));
    remoteVideo.addEventListener('dblclick', (e) => sendRemoteInput('dblclick', e));
    remoteVideo.addEventListener('wheel', (e) => {
        e.preventDefault();
        sendRemoteInput('wheel', e);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (!ui.views.session.classList.contains('active')) return;
        if (document.activeElement.id === 'chat-input') return;
        sendRemoteInput('keydown', e);
    });

    window.addEventListener('keyup', (e) => {
        if (!ui.views.session.classList.contains('active')) return;
        if (document.activeElement.id === 'chat-input') return;
        sendRemoteInput('keyup', e);
    });

    // ── Hidden Developer Shortcut (Ctrl+Shift+D) ──
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
            const debugOverlay = document.getElementById('debug-overlay');
            if (debugOverlay) {
                debugOverlay.classList.toggle('hidden');
                logDebug(`[UI] Diagnostic Console Toggled via Shortcut`);
            }
        }
    });

    // ── Session Controls ──

    document.getElementById('btn-disconnect').onclick = () => endSession();
    
    function endSession() {
        if (currentRemoteSocketId) {
            signaling.endSession(currentRemoteSocketId);
        }
        webrtc.close();
        ui.switchView('home');
        resetConnectionState();
        stopSessionTasks();
    }

    signaling.on('session-ended', ({ message }) => {
        ui.showToast(message, 'info');
        webrtc.close();
        ui.switchView('home');
        function resetConnectionState() {
        currentRemoteSocketId = null;
        currentRemoteDeviceId = null;
        if (statsInterval) clearInterval(statsInterval);
        if (clipboardInterval) clearInterval(clipboardInterval);
        statsInterval = null;
        clipboardInterval = null;
        ui.setConnectingOverlay(false);
    }

    function startSessionTasks() {
        logDebug(`[SESSION] Initializing Background Tasks...`);
        
        // 1. Clipboard Sync (Every 1.5 seconds)
        clipboardInterval = setInterval(async () => {
            const currentClip = await window.dsdesk.readClipboard();
            if (currentClip && currentClip !== lastClipboard) {
                lastClipboard = currentClip;
                webrtc.sendControlData({ type: 'clipboard-sync', text: currentClip });
                logDebug(`[CLIPBOARD] Local change sent to remote`);
            }
        }, 1500);

        // 2. Host Stats Reporting (Every 5 seconds)
        if (isHost) {
            logDebug(`[STATS] Host reporting active (5s interval)`);
            statsInterval = setInterval(async () => {
                const stats = await window.dsdesk.getSystemStats();
                webrtc.sendControlData({
                    type: 'sys-stats',
                    cpu: stats.cpuLoad,
                    ram: stats.ramUsage
                });
            }, 5000);
        }
    }
    ui.setConnectingOverlay(false);
    });

    function resetConnectionState() {
        currentRemoteSocketId = null;
        currentRemoteDeviceId = null;
        isHost = false;
        ui.setConnectingOverlay(false);
    }

    function resetConnectionUI() {
        // Reset states
        webrtc.isRemoteDescriptionSet = false;
        webrtc.iceQueue = [];
        
        ui.elements.btnConnect.disabled = false;
        document.getElementById('btn-connect-content').classList.remove('hidden');
        document.getElementById('btn-connect-loader').classList.add('hidden');
    }

    // ── Tasks & Stats ──

    function startSessionTasks() {
        logDebug(`[SESSION] Initializing Pro Background Tasks...`);
        
        // 1. Unified Clipboard Sync (Every 1.5s)
        clipboardInterval = setInterval(async () => {
            const currentClip = await window.dsdesk.readClipboard();
            if (currentClip && currentClip !== lastClipboard) {
                lastClipboard = currentClip;
                webrtc.sendControlData({ type: 'clipboard-sync', text: currentClip });
                logDebug(`[CLIPBOARD] Sync Sent`);
            }
        }, 1500);

        // 2. Host Pro Stats Reporting (Every 3s)
        if (isHost) {
            statsInterval = setInterval(async () => {
                try {
                    const info = await window.dsdesk.getSystemInfo();
                    webrtc.sendControlData({ type: 'system-stats', info });
                } catch (e) {
                    console.error('Stats fetch failed:', e);
                }
            }, 3000);
        }
    }

    function stopSessionTasks() {
        if (statsInterval) clearInterval(statsInterval);
        if (clipboardInterval) clearInterval(clipboardInterval);
        statsInterval = null;
        clipboardInterval = null;
        logDebug(`[SESSION] Tasks Cleaned.`);
    }

    function updateProDashboard(info) {
        if (!info) return;
        
        const osEl = document.getElementById('dash-os');
        const cpuEl = document.getElementById('dash-cpu');
        const ramBar = document.getElementById('dash-ram-bar');
        const ramText = document.getElementById('dash-ram-text');
        const uptimeEl = document.getElementById('dash-uptime');

        if (osEl) osEl.textContent = `${info.platform} ${info.arch}`;
        if (cpuEl) cpuEl.textContent = info.cpuModel.split('@')[0].trim();
        if (ramBar) ramBar.style.width = `${info.usedMemoryPercent}%`;
        if (ramText) ramText.textContent = `${info.usedMemoryPercent}% (${info.totalMemory - info.freeMemory}GB / ${info.totalMemory}GB)`;
        if (uptimeEl) uptimeEl.textContent = `${info.uptime} ساعة`;

        // Pulse effect on update
        const dash = document.getElementById('pro-dashboard');
        dash.style.borderColor = 'var(--pro-primary)';
        setTimeout(() => dash.style.borderColor = 'rgba(255, 255, 255, 0.1)', 500);
    }

    // ── File Transfer ──

    const dropZone = document.getElementById('drop-zone');
    const transferList = document.getElementById('transfer-list');

    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('hover'); };
    dropZone.ondragleave = () => dropZone.classList.remove('hover');
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('hover');
        const files = Array.from(e.dataTransfer.files);
        files.forEach(sendFile);
    };
    dropZone.onclick = () => document.getElementById('file-selector').click();
    document.getElementById('file-selector').onchange = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(sendFile);
    };

    async function sendFile(file) {
        const transferId = Math.random().toString(36).substr(2, 9);
        ui.showToast(`جاري إرسال ${file.name}...`, 'info');
        
        // Add to list
        const item = createTransferItem(file.name, transferId);
        transferList.appendChild(item);

        webrtc.sendControlData({ type: 'file-meta', name: file.name, size: file.size, transferId });

        const chunkSize = 64 * 1024;
        const reader = new FileReader();
        let offset = 0;

        reader.onload = (e) => {
            webrtc.sendControlData({ type: 'file-chunk', transferId, data: e.target.result });
            offset += e.target.result.byteLength;
            const progress = Math.round((offset / file.size) * 100);
            item.querySelector('.transfer-progress-bar').style.width = `${progress}%`;

            if (offset < file.size) {
                readNext();
            } else {
                ui.showToast(`اكتمل إرسال ${file.name}`, 'success');
            }
        };

        const readNext = () => {
            const slice = file.slice(offset, offset + chunkSize);
            reader.readAsDataURL(slice); // Sending as DataURL for simplicity over JSON
        };

        readNext();
    }

    function handleFileMeta(meta) {
        receivingFiles[meta.transferId] = {
            name: meta.name,
            size: meta.size,
            chunks: [],
            received: 0,
            item: createTransferItem(meta.name, meta.transferId, true)
        };
        transferList.appendChild(receivingFiles[meta.transferId].item);
    }

    function handleFileChunk(chunk) {
        const file = receivingFiles[chunk.transferId];
        if (!file) return;

        file.chunks.push(chunk.data);
        // DataURL size estimation (simplified)
        const bytes = (chunk.data.length * 0.75); 
        file.received += bytes;
        
        const progress = Math.min(100, Math.round((file.received / file.size) * 100));
        file.item.querySelector('.transfer-progress-bar').style.width = `${progress}%`;

        if (file.received >= file.size || progress >= 100) {
            assembleAndDownload(chunk.transferId);
        }
    }

    function assembleAndDownload(id) {
        const file = receivingFiles[id];
        // Convert data URLs back to blobs
        const blobs = file.chunks.map(data => {
            const parts = data.split(',');
            const byteString = atob(parts[1]);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            return new Blob([ab]);
        });
        
        const fullBlob = new Blob(blobs);
        const url = URL.createObjectURL(fullBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        
        ui.showToast(`اكتمل استقبال ${file.name}`, 'success');
        delete receivingFiles[id];
    }

    function createTransferItem(name, id, isIncoming = false) {
        const div = document.createElement('div');
        div.className = 'transfer-item';
        div.id = `transfer-${id}`;
        div.innerHTML = `
            <div class="transfer-info">
                <span class="transfer-name">${isIncoming ? '⬇' : '⬆'} ${name}</span>
            </div>
            <div class="transfer-progress-bg">
                <div class="transfer-progress-bar"></div>
            </div>
        `;
        return div;
    }

    // ── Pro Features Logic ──

    // Monitor Switching
    document.getElementById('btn-monitors-toggle').onclick = () => {
        if (!isHost) webrtc.sendControlData({ type: 'get-monitors' });
    };

    function showMonitorPicker(sources) {
        const grid = document.getElementById('monitor-grid');
        grid.innerHTML = '';
        sources.forEach(source => {
            const item = document.createElement('div');
            item.className = 'monitor-item';
            item.innerHTML = `
                <img src="${source.thumbnail}" alt="${source.name}">
                <span>${source.name}</span>
            `;
            item.onclick = () => {
                webrtc.sendControlData({ type: 'switch-monitor', id: source.id });
                document.getElementById('monitor-modal').classList.add('hidden');
            };
            grid.appendChild(item);
        });
        document.getElementById('monitor-modal').classList.remove('hidden');
    }

    async function handleMonitorSwitch(sourceId) {
        if (!isHost) return;
        ui.showToast('جاري تبديل الشاشة...', 'info');
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId
                    }
                }
            });
            
            const newTrack = stream.getVideoTracks()[0];
            const sender = webrtc.peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) await sender.replaceTrack(newTrack);
            
            ui.showToast('تم تبديل الشاشة بنجاح', 'success');
        } catch (err) {
            console.error('Monitor switch failed:', err);
            ui.showToast('فشل تبديل الشاشة', 'error');
        }
    }

    // Task Manager
    document.getElementById('btn-tasks-toggle').onclick = () => {
        const panel = document.getElementById('tasks-panel');
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            if (!isHost) webrtc.sendControlData({ type: 'get-tasks' });
        }
    };

    function renderTaskList(tasks) {
        const container = document.getElementById('task-list-container');
        container.innerHTML = '';
        tasks.forEach(task => {
            const item = document.createElement('div');
            item.className = 'process-item';
            item.innerHTML = `
                <div class="process-info">
                    <span class="process-name">${task.name}</span>
                    <span class="process-pid">PID: ${task.pid} | ${task.mem}</span>
                </div>
                <button class="btn btn-icon btn-kill" onclick="killRemoteTask('${task.pid}')">إغلاق</button>
            `;
            container.appendChild(item);
        });
    }

    window.killRemoteTask = (pid) => {
        webrtc.sendControlData({ type: 'kill-task', pid });
        ui.showToast(`طلب إغلاق العملية ${pid}`, 'info');
        // Refresh list after 1s
        setTimeout(() => webrtc.sendControlData({ type: 'get-tasks' }), 1000);
    };

    // Terminal
    const terminalInput = document.getElementById('terminal-input');
    const terminalOutput = document.getElementById('terminal-output');

    document.getElementById('btn-terminal-toggle').onclick = () => {
        const panel = document.getElementById('terminal-panel');
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            if (!isHost) webrtc.sendControlData({ type: 'terminal-start' });
        }
    };

    terminalInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            const text = terminalInput.value + '\n';
            webrtc.sendControlData({ type: 'terminal-input', text });
            terminalInput.value = '';
        }
    };

    function appendTerminalOutput(text) {
        terminalOutput.textContent += text;
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    // ── Chat ──

    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('btn-send-chat');
    const chatToggle = document.getElementById('btn-chat-toggle');
    const closeChatBtn = document.getElementById('btn-close-chat');

    function sendMessage() {
        const msg = chatInput.value.trim();
        if (msg && currentRemoteSocketId) {
            const time = signaling.sendChatMessage(currentRemoteSocketId, msg);
            ui.appendChatMessage(msg, time, true);
            chatInput.value = '';
        }
    }

    sendChatBtn.onclick = sendMessage;
    chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };

    signaling.on('chat-message', ({ message, timestamp }) => {
        ui.appendChatMessage(message, timestamp, false);
    });

    chatToggle.onclick = () => {
        document.getElementById('files-panel').classList.add('hidden');
        document.getElementById('tasks-panel').classList.add('hidden');
        document.getElementById('terminal-panel').classList.add('hidden');
        ui.elements.chatPanel.classList.toggle('hidden');
        if (!ui.elements.chatPanel.classList.contains('hidden')) {
            ui.elements.chatBadge.classList.add('hidden');
            ui.elements.chatBadge.textContent = '0';
        }
    };

    document.getElementById('btn-files-toggle').onclick = () => {
        ui.elements.chatPanel.classList.add('hidden');
        document.getElementById('tasks-panel').classList.add('hidden');
        document.getElementById('terminal-panel').classList.add('hidden');
        document.getElementById('files-panel').classList.toggle('hidden');
    };

    document.getElementById('btn-close-files').onclick = () => {
        document.getElementById('files-panel').classList.add('hidden');
    };

    document.getElementById('btn-close-tasks').onclick = () => {
        document.getElementById('tasks-panel').classList.add('hidden');
    };

    document.getElementById('btn-close-terminal').onclick = () => {
        document.getElementById('terminal-panel').classList.add('hidden');
    };

    closeChatBtn.onclick = () => ui.elements.chatPanel.classList.add('hidden');

    // ── Form Handling ──

    // ── Form Handling (Professional Flow) ──
    ui.elements.connectForm.onsubmit = (e) => {
        e.preventDefault();
        const targetId = document.getElementById('remote-id').value.replace(/\s/g, '');
        const targetPwd = document.getElementById('remote-password').value;

        if (targetId.length < 9) {
            ui.showToast('المعرّف يجب أن يكون 9 أرقام', 'warning');
            return;
        }

        ui.elements.btnConnect.disabled = true;
        document.getElementById('btn-connect-content').classList.add('hidden');
        document.getElementById('btn-connect-loader').classList.remove('hidden');

        // Request connection (password can be empty here; server will tell us if it's needed)
        signaling.requestConnection(targetId, targetPwd);
    };

    // ── Smart Feedback Handling ──
    signaling.on('connection-error', (data) => {
        ui.elements.btnConnect.disabled = false;
        document.getElementById('btn-connect-content').classList.remove('hidden');
        document.getElementById('btn-connect-loader').classList.add('hidden');

        if (data.code === 'NEED_PASSWORD') {
            document.getElementById('group-remote-password').classList.remove('hidden');
            ui.showToast('هذا الجهاز محمي، يرجى إدخال كلمة المرور', 'warning');
            document.getElementById('remote-password').focus();
        } else if (data.code === 'WRONG_PASSWORD') {
            ui.showToast('كلمة المرور غير صحيحة', 'danger');
            document.getElementById('remote-password').focus();
        } else {
            ui.showToast(data.message || 'خطأ في الاتصال', 'danger');
        }
    });

    // Server settings handling
    document.getElementById('btn-save-server').onclick = () => {
        const newUrl = document.getElementById('server-url').value.trim();
        if (newUrl) {
            localStorage.setItem('serverUrl', newUrl);
            ui.showToast('تم حفظ الرابط، الرجاء إعادة تشغيل البرنامج', 'success');
        }
    };

    // Password visibility toggle
    document.getElementById('check-password-enabled').onchange = async (e) => {
        passwordEnabled = e.target.checked;
        await window.dsdesk.setPasswordEnabled(passwordEnabled);
        ui.setPasswordEnabled(passwordEnabled);
        signaling.updatePassword(password, passwordEnabled);
        validate();
    };

    document.getElementById('btn-toggle-pwd').onclick = () => {
        const pwdSpan = document.getElementById('device-password');
        const eyeIcon = document.querySelector('.icon-eye');
        const eyeOffIcon = document.querySelector('.icon-eye-off');
        
        if (pwdSpan.textContent === '••••••') {
            pwdSpan.textContent = password;
            eyeIcon.classList.add('hidden');
            eyeOffIcon.classList.remove('hidden');
        } else {
            pwdSpan.textContent = '••••••';
            eyeIcon.classList.remove('hidden');
            eyeOffIcon.classList.add('hidden');
        }
    };

    // Refresh password
    document.getElementById('btn-refresh-pwd').onclick = async () => {
        password = await window.dsdesk.refreshPassword();
        ui.updateDeviceInfo(null, password);
        signaling.updatePassword(password, passwordEnabled);
        ui.showToast('تم تحديث كلمة المرور', 'success');
    };

    // Copy ID
    document.getElementById('btn-copy-id').onclick = () => {
        navigator.clipboard.writeText(deviceId);
        ui.showToast('تم نسخ المعرّف', 'success');
    };

    // ── Professional Dashboard & Power Controls ──
    const proDashboard = document.getElementById('pro-dashboard');
    const powerModal = document.getElementById('power-modal');
    let dashInterval = null;

    document.getElementById('btn-quality').onclick = () => {
        proDashboard.classList.toggle('hidden');
        if (!proDashboard.classList.contains('hidden')) {
            startDashboardUpdates();
        } else {
            stopDashboardUpdates();
        }
    };

    document.getElementById('btn-close-dashboard').onclick = () => {
        proDashboard.classList.add('hidden');
        stopDashboardUpdates();
    };

    function startDashboardUpdates() {
        if (dashInterval) return;
        dashInterval = setInterval(async () => {
            const stats = await window.dsdesk.getSystemStats();
            document.getElementById('dash-os').innerText = stats.osName || 'Windows';
            document.getElementById('dash-cpu-text').innerText = `${stats.cpuLoad}%`;
            document.getElementById('dash-cpu-bar').style.width = `${stats.cpuLoad}%`;
            document.getElementById('dash-ram-text').innerText = `${stats.ramUsage}%`;
            document.getElementById('dash-ram-bar').style.width = `${stats.ramUsage}%`;
            document.getElementById('dash-disk-text').innerText = `${stats.diskUsage}%`;
            document.getElementById('dash-disk-bar').style.width = `${stats.diskUsage}%`;
        }, 2000);
    }

    function stopDashboardUpdates() {
        if (dashInterval) {
            clearInterval(dashInterval);
            dashInterval = null;
        }
    }

    document.getElementById('btn-power-menu').onclick = () => {
        powerModal.classList.remove('hidden');
    };

    document.getElementById('action-lock').onclick = () => {
       window.dsdesk.lock();
       ui.showToast('تم إرسال أمر القفل', 'success');
       powerModal.classList.add('hidden');
    };

    document.getElementById('action-reboot').onclick = () => {
       if (confirm('هل أنت متأكد من إعادة تشغيل الجهاز البعيد؟')) {
           window.dsdesk.reboot();
           powerModal.classList.add('hidden');
       }
    };

    document.getElementById('action-shutdown').onclick = () => {
       if (confirm('هل أنت متأكد من إيقاف تشغيل الجهاز البعيد؟')) {
           window.dsdesk.shutdown();
           powerModal.classList.add('hidden');
       }
    };

    // ── Installation Banner Actions ──
    document.getElementById('btn-close-banner').onclick = () => {
        document.getElementById('install-banner').classList.add('hidden');
    };

    document.getElementById('btn-install-now').onclick = async () => {
        const btn = document.getElementById('btn-install-now');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = 'جاري التثبيت...';

        const result = await window.dsdesk.performInstall();
        
        if (result.success) {
            ui.showToast('تم التثبيت بنجاح! سيتم إعادة تشغيل البرنامج من الموقع الجديد.', 'success');
            setTimeout(() => {
                window.dsdesk.launchInstalled(result.path);
            }, 3000);
        } else {
            btn.disabled = false;
            btn.innerText = originalText;
            ui.showToast('فشل التثبيت: ' + result.error, 'danger');
        }
    };
});
