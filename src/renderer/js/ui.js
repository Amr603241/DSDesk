/**
 * DSDesk UI Manager - PRO ELITE Edition
 * Handles professional layout logic, settings synchronization, and system monitoring UI
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
      recentList: document.getElementById('recent-list'),
      remoteVideo: document.getElementById('remote-video'),
      connectingOverlay: document.getElementById('connecting-overlay'),
      connectingStatus: document.getElementById('connecting-status'),
      modalRequest: document.getElementById('modal-request'),
      requestFromId: document.getElementById('request-from-id'),
      toastContainer: document.getElementById('toast-container'),
      latencyStat: document.getElementById('stat-latency'),
      fpsStat: document.getElementById('stat-fps'),
      bandwidthStat: document.getElementById('stat-bandwidth'),
      aiPanel: document.getElementById('ai-panel'),
      aiSuggestion: document.getElementById('ai-suggestion'),
      dashCpuBar: document.getElementById('dash-cpu-bar'),
      dashCpuText: document.getElementById('dash-cpu-text'),
      dashRamBar: document.getElementById('dash-ram-bar'),
      dashRamText: document.getElementById('dash-ram-text')
    };

    this._setupWindowControls();
    this._setupSettingsTabs();
    this._setupQuickActions();
    this._setupRangeValues();
  }

  _setupRangeValues() {
    // Sync range sliders with text labels
    const sync = (id, targetId, unit = '') => {
      const el = document.getElementById(id);
      const target = document.getElementById(targetId);
      if (el && target) {
        el.addEventListener('input', () => { target.textContent = el.value + unit; });
      }
    };
    sync('setting-fps', 'val-fps');
    sync('setting-bitrate', 'val-bitrate');
  }

  _setupQuickActions() {
    document.getElementById('btn-copy-id')?.addEventListener('click', () => {
      const id = this.elements.deviceId.textContent.replace(/\s/g, '');
      navigator.clipboard.writeText(id);
      this.showToast('تم نسخ المعرّف بنجاح', 'success');
    });

    document.getElementById('btn-toggle-pwd')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const icon = btn.querySelector('i');
      if (this.elements.devicePassword.textContent.includes('•')) {
          this.elements.devicePassword.textContent = window.dsdesk_current_password || '******';
          icon.className = 'far fa-eye-slash';
      } else {
          this.elements.devicePassword.textContent = '••••••';
          icon.className = 'far fa-eye';
      }
    });

    document.getElementById('btn-refresh-pwd')?.addEventListener('click', async () => {
        const newPwd = await window.dsdesk.refreshPassword();
        this.updateDeviceInfo(null, newPwd);
        this.showToast('تم تحديث كلمة المرور', 'success');
    });
  }

  _setupWindowControls() {
    document.getElementById('btn-minimize').onclick = () => window.dsdesk.minimize();
    document.getElementById('btn-maximize').onclick = () => window.dsdesk.maximize();
    document.getElementById('btn-close').onclick = () => window.dsdesk.close();
  }

  _setupSettingsTabs() {
    const tabs = document.querySelectorAll('.nav-item');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        const targetId = `tab-${tab.getAttribute('data-tab')}`;
        const content = document.getElementById(targetId);
        if (content) content.style.display = 'block';
      });
    });
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

  setConnectionStatus(connected, text, serverUrl) {
    if (this.elements.statusBadge) {
      const dot = this.elements.statusBadge.querySelector('.device-status');
      if (dot) dot.className = connected ? 'device-status status-online' : 'device-status status-offline';
    }
    if (this.elements.statusText) this.elements.statusText.textContent = text;
    const serverDisplay = document.getElementById('server-url-display');
    if (serverDisplay && serverUrl) serverDisplay.textContent = serverUrl;
  }

  updateStats(stats) {
    if (this.elements.latencyStat) this.elements.latencyStat.textContent = `${stats.latency}ms`;
    if (this.elements.fpsStat) this.elements.fpsStat.textContent = stats.fps;
    if (this.elements.bandwidthStat) this.elements.bandwidthStat.textContent = stats.bandwidth;
    
    if (stats.latency > 300) {
        this.showAISuggestion('تم اكتشاف بطء في الاستجابة (300ms+). هل ترغب في تقليل جودة الصورة لزيادة السرعة؟');
    }
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

  showAISuggestion(text) {
    if (this.elements.aiPanel && this.elements.aiSuggestion) {
        this.elements.aiSuggestion.textContent = text;
        this.elements.aiPanel.style.display = 'flex';
        if (this.aiTimeout) clearTimeout(this.aiTimeout);
        this.aiTimeout = setTimeout(() => { this.elements.aiPanel.style.display = 'none'; }, 8000);
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check' : 'fa-info'}"></i> <span>${message}</span>`;
    this.elements.toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  renderRecentList(list, nicknames, onConnect) {
    if (!this.elements.recentList) return;
    this.elements.recentList.innerHTML = '';
    if (list.length === 0) {
      this.elements.recentList.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px; color: var(--text-dim);">لا توجد اتصالات حديثة</div>';
      return;
    }
    list.forEach(id => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.innerHTML = `
        <div class="device-status status-offline" style="width: 8px; height: 8px;"></div>
        <div style="flex: 1; font-size: 13px;">${nicknames[id] || id}</div>
        <button class="tool-btn" style="width: 28px; height: 28px;"><i class="fas fa-play" style="font-size: 10px;"></i></button>
      `;
      item.onclick = () => onConnect(id);
      this.elements.recentList.appendChild(item);
    });
  }

  showConnecting(statusText) {
    if (this.elements.connectingOverlay) {
        this.elements.connectingStatus.textContent = statusText || 'جاري الاتصال...';
        this.elements.connectingOverlay.classList.add('active');
    }
  }

  hideConnecting() {
    if (this.elements.connectingOverlay) this.elements.connectingOverlay.classList.remove('active');
  }
}

window.UIManager = UIManager;
