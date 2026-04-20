/**
 * DSDesk Application Orchestrator
 * Coordinates Signaling, WebRTC, and UI
 */

document.addEventListener('DOMContentLoaded', async () => {
    const ui = new UIManager();
    
    // Load server settings
    let savedServerUrl = localStorage.getItem('serverUrl') || 'http://localhost:3456';
    document.getElementById('server-url').value = savedServerUrl;
    
    const signaling = new SignalingClient(savedServerUrl);
    const webrtc = new WebRTCManager();

    let deviceId = '';
    let password = '';
    let currentRemoteSocketId = null;
    let currentRemoteDeviceId = null;
    let isHost = false;
    let lastClipboard = '';
    let statsInterval = null;
    let clipboardInterval = null;
    let receivingFiles = {};

    // ── App Initialization ──
    try {
        deviceId = await window.dsdesk.getDeviceId();
        password = await window.dsdesk.getPassword();
        ui.updateDeviceInfo(deviceId, password);

        await signaling.connect();
        signaling.register(deviceId, password);
        ui.setConnectionStatus(true, 'متصل');
    } catch (err) {
        console.error('Initialization failed:', err);
        ui.showToast('فشل الاتصال بخادم الإشارات', 'error');
        ui.setConnectionStatus(false, 'خطأ في الاتصال');
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

    signaling.on('connection-accepted', async ({ hostSocketId, hostDeviceId }) => {
        isHost = false;
        currentRemoteSocketId = hostSocketId;
        currentRemoteDeviceId = hostDeviceId;

        ui.showToast('تم قبول الاتصال، جاري التجهيز...', 'success');
        ui.setConnectingOverlay(true, 'تجهيز اتصال WebRTC...');
        ui.switchView('session');

        // Start WebRTC as client (viewer)
        await webrtc.initializeConnection(true); // true = creator of data channel
        const offer = await webrtc.createOffer();
        signaling.sendOffer(hostSocketId, offer);
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
        if (isHost) {
            await webrtc.initializeConnection(false);
            await webrtc.startScreenShare();
            const answer = await webrtc.handleOffer(offer);
            signaling.sendAnswer(from, answer);
            ui.setConnectingOverlay(true, 'تم الاتصال، جاري بث الشاشة...');
        }
    });

    signaling.on('answer', async ({ from, answer }) => {
        await webrtc.handleAnswer(answer);
    });

    signaling.on('ice-candidate', async ({ from, candidate }) => {
        await webrtc.addIceCandidate(candidate);
    });

    // ── WebRTC Manager Events ──

    webrtc.on('ice-candidate', (candidate) => {
        if (currentRemoteSocketId) {
            signaling.sendIceCandidate(currentRemoteSocketId, candidate);
        }
    });

    webrtc.on('remote-stream', (stream) => {
        ui.displayRemoteVideo(stream);
        ui.setConnectingOverlay(false);
        ui.showToast('متصل بنجاح', 'success');
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
        } else if (data.type === 'terminal-data') {
            appendTerminalOutput(data.text);
        } else if (data.type === 'terminal-input') {
            if (isHost) window.dsdesk.sendShellInput(data.text);
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

    function sendRemoteInput(type, event) {
        if (isHost || !currentRemoteSocketId) return;

        const rect = remoteVideo.getBoundingClientRect();
        // Calculate relative coordinates in percentage, but we need absolute for host.
        // Actually, let's send normalized coords (0-1) and host will scale to its screen resolution.
        // But for simplicity, we'll try to get host screen size later.
        // For now, let's assume host screen size is provided.

        // Get video natural size vs display size
        const scaleX = remoteVideo.videoWidth / rect.width;
        const scaleY = remoteVideo.videoHeight / rect.height;

        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        const data = {
            type,
            x,
            y,
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
        resetConnectionState();
    });

    function resetConnectionState() {
        currentRemoteSocketId = null;
        currentRemoteDeviceId = null;
        isHost = false;
        ui.setConnectingOverlay(false);
    }

    function resetConnectionUI() {
        document.getElementById('btn-connect').disabled = false;
        document.getElementById('btn-connect-content').classList.remove('hidden');
        document.getElementById('btn-connect-loader').classList.add('hidden');
    }

    // ── Tasks & Stats ──

    function startSessionTasks() {
        // Stats loop (Host sends to Controller)
        if (isHost) {
            statsInterval = setInterval(async () => {
                const stats = await window.dsdesk.getSystemStats();
                webrtc.sendControlData({ type: 'sys-stats', ...stats });
            }, 3000);
        }

        // Clipboard sync loop
        clipboardInterval = setInterval(async () => {
            const current = await window.dsdesk.readClipboard();
            if (current && current !== lastClipboard) {
                lastClipboard = current;
                webrtc.sendControlData({ type: 'clipboard-sync', text: current });
            }
        }, 2000);
    }

    function stopSessionTasks() {
        if (statsInterval) clearInterval(statsInterval);
        if (clipboardInterval) clearInterval(clipboardInterval);
        statsInterval = null;
        clipboardInterval = null;
    }

    function updateStatsUI(cpu, ram) {
        const cpuEl = document.getElementById('stat-cpu');
        const ramEl = document.getElementById('stat-ram');
        cpuEl.querySelector('span').textContent = `CPU: ${cpu}%`;
        ramEl.querySelector('span').textContent = `RAM: ${ram}%`;
        cpuEl.classList.toggle('high', cpu > 80);
        ramEl.classList.toggle('high', ram > 85);
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

        signaling.requestConnection(targetId, targetPwd);
    };

    // Server settings handling
    document.getElementById('btn-save-server').onclick = () => {
        const newUrl = document.getElementById('server-url').value.trim();
        if (newUrl) {
            localStorage.setItem('serverUrl', newUrl);
            ui.showToast('تم حفظ الرابط، الرجاء إعادة تشغيل البرنامج', 'success');
        }
    };

    // Enable button only when inputs are filled
    const remoteIdInput = document.getElementById('remote-id');
    const remotePwdInput = document.getElementById('remote-password');
    const validate = () => {
        ui.elements.btnConnect.disabled = !(remoteIdInput.value.length >= 9 && remotePwdInput.value.length > 0);
    };
    remoteIdInput.oninput = validate;
    remotePwdInput.oninput = validate;

    // Password visibility toggle
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
        signaling.updatePassword(password);
        ui.showToast('تم تحديث كلمة المرور', 'success');
    };

    // Copy ID
    document.getElementById('btn-copy-id').onclick = () => {
        navigator.clipboard.writeText(deviceId);
        ui.showToast('تم نسخ المعرّف', 'success');
    };
});
