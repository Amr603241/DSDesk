/**
 * DSDesk UI Manager
 * Handles DOM interactions, views switching, and toast notifications
 */

class UIManager {
  constructor() {
    this.views = {
      home: document.getElementById('view-home'),
      session: document.getElementById('view-session')
    };

    this.elements = {
      deviceId: document.getElementById('device-id'),
      devicePassword: document.getElementById('device-password'),
      statusText: document.getElementById('status-text'),
      statusBadge: document.getElementById('status-badge'),
      idDisplay: document.getElementById('id-display'),
      passwordDisplay: document.querySelector('.password-display'),
      passwordEnabled: document.getElementById('check-password-enabled'),
      chatPanel: document.getElementById('chat-panel'),
      chatMessages: document.getElementById('chat-messages'),
      chatBadge: document.getElementById('chat-badge'),
      toastContainer: document.getElementById('toast-container'),
      connectingOverlay: document.getElementById('connecting-overlay'),
      connectingStatus: document.getElementById('connecting-status'),
      remoteVideo: document.getElementById('remote-video'),
      modalRequest: document.getElementById('modal-request'),
      requestFromId: document.getElementById('request-from-id'),
      btnConnect: document.getElementById('btn-connect'),
      connectForm: document.getElementById('connect-form')
    };

    this._setupWindowControls();
  }

  _setupWindowControls() {
    document.getElementById('btn-minimize').onclick = () => window.dsdesk.minimize();
    document.getElementById('btn-maximize').onclick = () => window.dsdesk.maximize();
    document.getElementById('btn-close').onclick = () => window.dsdesk.close();
  }

  switchView(viewName) {
    Object.keys(this.views).forEach(v => {
      this.views[v].classList.toggle('active', v === viewName);
    });
  }

  setPasswordEnabled(enabled) {
    if (this.elements.passwordEnabled) {
      this.elements.passwordEnabled.checked = enabled;
      this.elements.passwordDisplay.style.opacity = enabled ? '1' : '0.5';
      this.elements.passwordDisplay.style.pointerEvents = enabled ? 'auto' : 'none';
      this.elements.passwordDisplay.title = enabled ? '' : 'تم تعطيل كلمة المرور';
    }
  }

  updateDeviceInfo(id, password) {
    if (id) {
      // Format: 123 456 789
      const formattedId = id.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      this.elements.deviceId.textContent = formattedId;
    }
    if (password) {
      this.elements.devicePassword.textContent = password;
    }
  }

  setConnectionStatus(connected, text) {
    this.elements.statusBadge.classList.toggle('connected', connected);
    this.elements.statusText.textContent = text || (connected ? 'متصل بالخادم' : 'غير متصل');
  }

  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  showRequestModal(fromId, onAccept, onReject) {
    this.elements.requestFromId.textContent = fromId;
    this.elements.modalRequest.classList.remove('hidden');

    const acceptBtn = document.getElementById('btn-accept');
    const rejectBtn = document.getElementById('btn-reject');

    const cleanup = () => {
      this.elements.modalRequest.classList.add('hidden');
      acceptBtn.onclick = null;
      rejectBtn.onclick = null;
    };

    acceptBtn.onclick = () => { 
        const trustChecked = document.getElementById('check-trust-device').checked;
        onAccept(trustChecked); 
        cleanup(); 
    };
    rejectBtn.onclick = () => { onReject(); cleanup(); };
  }

  setConnectingOverlay(visible, statusText = '') {
    this.elements.connectingOverlay.classList.toggle('hidden', !visible);
    if (statusText) this.elements.connectingStatus.textContent = statusText;
  }

  appendChatMessage(message, time, isSelf = false) {
    const empty = this.elements.chatMessages.querySelector('.chat-empty');
    if (empty) empty.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${isSelf ? 'self' : 'remote'}`;
    msgDiv.innerHTML = `
      <p>${message}</p>
      <span class="msg-time">${time}</span>
    `;

    this.elements.chatMessages.appendChild(msgDiv);
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;

    if (!isSelf && this.elements.chatPanel.classList.contains('hidden')) {
      const currentCount = parseInt(this.elements.chatBadge.textContent || '0');
      this.elements.chatBadge.textContent = currentCount + 1;
      this.elements.chatBadge.classList.remove('hidden');
    }
  }

  displayRemoteVideo(stream) {
    this.elements.remoteVideo.srcObject = stream;
    this.elements.remoteVideo.play().catch(e => console.error("[UI] Video Play Error:", e));
  }
}

window.UIManager = UIManager;
