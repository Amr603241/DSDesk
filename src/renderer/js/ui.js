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
      sentinelItems: document.querySelectorAll('.sentinel-item'),
      btnConnect: document.getElementById('btn-connect'),
      connectForm: document.getElementById('connect-form')
    };

    this._setupWindowControls();
    this._setupSentinelToggles();
  }

  _setupSentinelToggles() {
    this.elements.sentinelItems.forEach(item => {
      item.onclick = () => {
        item.classList.toggle('active');
        // Vibrate or play subtle sound if needed for elite feel
      };
    });
  }

  _setupWindowControls() {
    document.getElementById('btn-minimize').onclick = () => window.dsdesk.minimize();
    document.getElementById('btn-maximize').onclick = () => window.dsdesk.maximize();
    document.getElementById('btn-close').onclick = () => window.dsdesk.close();
  }

  switchView(viewName) {
    Object.keys(this.views).forEach(v => {
      const view = this.views[v];
      if (v === viewName) {
          view.classList.add('active');
          view.style.opacity = '0';
          setTimeout(() => {
              view.style.transition = 'opacity 0.4s ease-in-out';
              view.style.opacity = '1';
          }, 10);
      } else {
          view.classList.remove('active');
          view.style.opacity = '0';
      }
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
        
        // Capture AnyDesk-style permissions
        const permissions = {
            allowMouse: document.getElementById('perm-mouse').classList.contains('active'),
            allowKeyboard: document.getElementById('perm-keyboard').classList.contains('active'),
            allowClipboard: document.getElementById('perm-clipboard').classList.contains('active'),
            allowFiles: document.getElementById('perm-files').classList.contains('active')
        };

        onAccept(trustChecked, permissions); 
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

  // AnyDesk-Elite: Address Book Rendering
  renderRecent(recentList, nicknames = {}) {
    const container = document.getElementById('recent-list');
    if (!container) return;
    
    if (!recentList || recentList.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <p>لا توجد اتصالات سابقة</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    recentList.forEach(id => {
      const nickname = nicknames[id] || `جهاز ${id}`;
      const item = document.createElement('div');
      item.className = 'recent-item glass';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.padding = '12px 16px';
      item.style.marginBottom = '8px';
      item.style.borderRadius = 'var(--radius-md)';
      
      item.innerHTML = `
        <div class="recent-info">
          <div class="recent-nickname" style="font-weight:700; font-size:14px;">${nickname}</div>
          <div class="recent-id-sub" style="font-family:var(--font-mono); font-size:11px; opacity:0.6;">${id}</div>
        </div>
        <div style="display:flex; gap:5px;">
           <button class="btn-icon btn-rename-device" data-id="${id}" title="تغيير الاسم">
             <i class="fas fa-edit"></i>
           </button>
           <button class="btn-icon btn-quick-connect" data-id="${id}" title="اتصال سريع" style="color:var(--accent);">
             <i class="fas fa-arrow-left"></i>
           </button>
        </div>
      `;
      container.appendChild(item);
    });
  }
}

window.UIManager = UIManager;
