/**
 * DSDesk UI Manager - Ultimate Features Edition
 */

class UIManager {
  constructor() {
    this.views = {
      home: document.getElementById('view-home'),
      files: document.getElementById('view-files'),
      terminal: document.getElementById('view-terminal'),
      settings: document.getElementById('view-settings'),
      session: document.getElementById('view-session')
    };

    this.elements = {
      deviceId: document.getElementById('device-id'),
      devicePassword: document.getElementById('device-password'),
      globalStatusDot: document.getElementById('global-status-dot'),
      globalStatusText: document.getElementById('global-status-text'),
      recentList: document.getElementById('recent-list'),
      remoteVideo: document.getElementById('remote-video'),
      modalRequest: document.getElementById('modal-request'),
      requestFromId: document.getElementById('request-from-id'),
      toastContainer: document.getElementById('toast-container'),
      latencyStat: document.getElementById('stat-latency'),
      fpsStat: document.getElementById('stat-fps'),
      dashCpuBar: document.getElementById('dash-cpu-bar'),
      dashCpuText: document.getElementById('dash-cpu-text'),
      dashRamBar: document.getElementById('dash-ram-bar'),
      dashRamText: document.getElementById('dash-ram-text'),
      terminalOutput: document.getElementById('terminal-output'),
      chatPanel: document.getElementById('chat-panel'),
      chatMessages: document.getElementById('chat-messages')
    };

    this._setupWindowControls();
    this._setupNavigation();
    this._setupQuickActions();
    this._setupChat();
  }

  _setupNavigation() {
    const btns = document.querySelectorAll('.nav-btn[data-view]');
    btns.forEach(btn => {
      btn.onclick = () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.switchView(btn.getAttribute('data-view'));
      };
    });
  }

  _setupChat() {
    document.getElementById('btn-chat-toggle')?.addEventListener('click', () => {
        this.elements.chatPanel.classList.toggle('active');
    });
  }

  addChatMessage(text, type = 'received') {
    const msg = document.createElement('div');
    msg.className = `msg ${type}`;
    msg.textContent = text;
    this.elements.chatMessages.appendChild(msg);
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
  }

  addTerminalLine(text, isCommand = false) {
    if (!this.elements.terminalOutput) return;
    const div = document.createElement('div');
    div.className = isCommand ? 'terminal-cmd' : 'terminal-res';
    div.textContent = isCommand ? `$ ${text}` : text;
    this.elements.terminalOutput.appendChild(div);
    this.elements.terminalOutput.scrollTop = this.elements.terminalOutput.scrollHeight;
  }

  _setupQuickActions() {
    document.getElementById('btn-copy-id')?.addEventListener('click', () => {
      const id = this.elements.deviceId.textContent.replace(/\s/g, '');
      navigator.clipboard.writeText(id);
      this.showToast('تم نسخ المعرّف', 'success');
    });
    
    document.getElementById('btn-toggle-pwd')?.addEventListener('click', () => {
      if (this.elements.devicePassword.textContent.includes('•')) {
          this.elements.devicePassword.textContent = window.dsdesk_current_password || '******';
      } else {
          this.elements.devicePassword.textContent = '••••••';
      }
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
      if (view) {
          view.classList.toggle('active', v === viewName);
          view.style.display = v === viewName ? 'flex' : 'none';
      }
    });
    // Update sidebar state
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });
  }

  switchInternalView(viewName) {
      this.switchView(viewName);
  }

  updateDeviceInfo(id, password) {
    if (password) window.dsdesk_current_password = password;
    if (id && this.elements.deviceId) {
        this.elements.deviceId.textContent = id.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }
    if (this.elements.devicePassword) {
        this.elements.devicePassword.textContent = '••••••';
    }
  }

  setConnectionStatus(connected) {
    if (this.elements.globalStatusDot) {
        this.elements.globalStatusDot.className = connected ? 'status-dot status-online' : 'status-dot status-offline';
    }
    if (this.elements.globalStatusText) {
        this.elements.globalStatusText.textContent = connected ? 'ONLINE' : 'OFFLINE';
    }
  }

  updateStats(stats) {
    if (this.elements.latencyStat) this.elements.latencyStat.textContent = `${stats.latency}ms`;
    if (this.elements.fpsStat) this.elements.fpsStat.textContent = stats.fps;
  }

  updateDashboardPerformance(stats) {
    if (this.elements.dashCpuBar) {
        this.elements.dashCpuBar.style.width = `${stats.cpuLoad}%`;
        this.elements.dashCpuText.textContent = `${stats.cpuLoad}%`;
    }
    if (this.elements.dashRamBar) {
        this.elements.dashRamBar.style.width = `${stats.ramUsage}%`;
        this.elements.dashRamText.textContent = `${stats.ramUsage}%`;
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.elements.toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  renderRecentList(list, nicknames, onConnect) {
    if (!this.elements.recentList) return;
    this.elements.recentList.innerHTML = '';
    if (list.length === 0) {
      this.elements.recentList.innerHTML = '<div class="empty-state">لا توجد اتصالات حديثة</div>';
      return;
    }
    list.forEach(id => {
      const item = document.createElement('div');
      item.className = 'recent-item-v glass-card';
      item.style.padding = '16px';
      item.innerHTML = `<div style="font-weight: 700;">${nicknames[id] || id}</div><div class="text-dim" style="font-size: 11px;">ID: ${id}</div>`;
      item.onclick = () => onConnect(id);
      this.elements.recentList.appendChild(item);
    });
  }

  showRequestModal(fromId) {
    if (this.elements.requestFromId) this.elements.requestFromId.textContent = fromId;
    if (this.elements.modalRequest) this.elements.modalRequest.classList.add('active');
  }

  hideRequestModal() {
    if (this.elements.modalRequest) this.elements.modalRequest.classList.remove('active');
  }
}

window.UIManager = UIManager;
