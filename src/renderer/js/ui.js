/**
 * DSDesk UI Manager - SIDEBAR EDITION
 * Handles sidebar navigation and the unified workspace logic
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
      dashRamText: document.getElementById('dash-ram-text')
    };

    this._setupWindowControls();
    this._setupNavigation();
    this._setupQuickActions();
  }

  _setupNavigation() {
    const btns = document.querySelectorAll('.nav-btn[data-view]');
    btns.forEach(btn => {
      btn.onclick = () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const viewName = btn.getAttribute('data-view');
        // Handle view switching (only home for now, others can be added)
        if (viewName === 'home') this.switchView('home');
        else this.showToast('هذه الميزة ستتوفر قريباً في التحديث القادم', 'info');
      };
    });
  }

  _setupQuickActions() {
    document.getElementById('btn-copy-id')?.addEventListener('click', () => {
      const id = this.elements.deviceId.textContent.replace(/\s/g, '');
      navigator.clipboard.writeText(id);
      this.showToast('تم نسخ المعرّف', 'success');
    });

    document.getElementById('btn-toggle-pwd')?.addEventListener('click', (e) => {
      if (this.elements.devicePassword.textContent.includes('•')) {
          this.elements.devicePassword.textContent = window.dsdesk_current_password || '******';
      } else {
          this.elements.devicePassword.textContent = '••••••';
      }
    });

    document.getElementById('btn-refresh-pwd')?.addEventListener('click', async () => {
        const newPwd = await window.dsdesk.refreshPassword();
        this.updateDeviceInfo(null, newPwd);
        this.showToast('كلمة مرور جديدة نشطة', 'success');
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
        view.style.display = 'flex';
      } else {
        view.classList.remove('active');
        view.style.display = 'none';
      }
    });
  }

  updateDeviceInfo(id, password) {
    if (password) window.dsdesk_current_password = password;
    if (this.elements.deviceId && id) {
      this.elements.deviceId.textContent = id.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }
    if (this.elements.devicePassword) {
      this.elements.devicePassword.textContent = '••••••';
    }
  }

  setConnectionStatus(connected, text) {
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
      item.className = 'recent-item-v';
      item.style.padding = '12px';
      item.style.background = 'rgba(255,255,255,0.03)';
      item.style.borderRadius = '8px';
      item.style.marginBottom = '8px';
      item.style.cursor = 'pointer';
      item.innerHTML = `<div style="font-size: 13px; font-weight: 600;">${nicknames[id] || id}</div>`;
      item.onclick = () => onConnect(id);
      this.elements.recentList.appendChild(item);
    });
  }

  showRequestModal(fromId) {
    this.elements.requestFromId.textContent = fromId;
    this.elements.modalRequest.classList.add('active');
  }

  hideRequestModal() {
    this.elements.modalRequest.classList.remove('active');
  }

  showConnecting(text) {
      this.showToast(text, 'info');
  }

  hideConnecting() {}
}

window.UIManager = UIManager;
