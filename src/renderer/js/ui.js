/**
 * DSDesk UI Manager - PRO ELITE Edition
 * Handles advanced SaaS interactions, animations, and real-time state updates
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
      aiSuggestion: document.getElementById('ai-suggestion')
    };

    this._setupWindowControls();
    this._setupSettingsTabs();
    this._setupQuickActions();
  }

  _setupQuickActions() {
    // Copy ID logic
    const btnCopy = document.getElementById('btn-copy-id');
    if (btnCopy) {
      btnCopy.onclick = () => {
        const id = this.elements.deviceId.textContent.replace(/\s/g, '');
        navigator.clipboard.writeText(id);
        this.showToast('تم نسخ المعرّف بنجاح', 'success');
      };
    }

    // Toggle Password Visibility
    const btnToggle = document.getElementById('btn-toggle-pwd');
    if (btnToggle) {
      btnToggle.onclick = () => {
        const icon = btnToggle.querySelector('i');
        if (this.elements.devicePassword.textContent.includes('•')) {
            this.elements.devicePassword.textContent = window.dsdesk_current_password || '******';
            icon.className = 'far fa-eye-slash';
        } else {
            this.elements.devicePassword.textContent = '••••••';
            icon.className = 'far fa-eye';
        }
      };
    }
  }

  _setupWindowControls() {
    const controls = {
      'btn-minimize': () => window.dsdesk.minimize(),
      'btn-maximize': () => window.dsdesk.maximize(),
      'btn-close': () => window.dsdesk.close()
    };

    Object.entries(controls).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.onclick = fn;
    });
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
    window.dsdesk_current_password = password; // Global cache for toggle
    if (this.elements.deviceId && id) {
      const formattedId = id.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      this.elements.deviceId.textContent = formattedId;
    }
    // Keep it hidden by default in the new UI
    if (this.elements.devicePassword) {
      this.elements.devicePassword.textContent = '••••••';
    }
  }

  setConnectionStatus(connected, text) {
    if (this.elements.statusBadge) {
      const dot = this.elements.statusBadge.querySelector('.device-status');
      if (dot) {
        dot.className = connected ? 'device-status status-online' : 'device-status status-offline';
      }
    }
    if (this.elements.statusText) {
      this.elements.statusText.textContent = text || (connected ? 'الشبكة الذكية: متصل' : 'الشبكة الذكية: غير متصل');
    }
  }

  updateStats(stats) {
    if (this.elements.latencyStat) this.elements.latencyStat.textContent = `${stats.latency}ms`;
    if (this.elements.fpsStat) this.elements.fpsStat.textContent = stats.fps;
    if (this.elements.bandwidthStat) this.elements.bandwidthStat.textContent = `${stats.bandwidth} Mbps`;
    
    // AI Intelligent monitoring
    if (stats.latency > 250) {
        this.showAISuggestion('تم اكتشاف بطء في الاستجابة. هل ترغب في تفعيل نمط الأداء الفائق؟');
    }
  }

  showAISuggestion(text) {
    if (this.elements.aiPanel && this.elements.aiSuggestion) {
        this.elements.aiSuggestion.textContent = text;
        this.elements.aiPanel.classList.remove('hidden');
        this.elements.aiPanel.style.display = 'flex';
        
        // Auto-hide after 10 seconds
        if (this.aiTimeout) clearTimeout(this.aiTimeout);
        this.aiTimeout = setTimeout(() => {
            this.elements.aiPanel.style.display = 'none';
        }, 10000);
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-triangle' : 
                 type === 'warning' ? 'fa-info-circle' : 'fa-bell';
                 
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    this.elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  renderRecentList(list, nicknames, onConnect) {
    if (!this.elements.recentList) return;
    this.elements.recentList.innerHTML = '';
    
    // Mock files for demonstration
    this.renderFileList('local-files', ['Documents', 'Downloads', 'DSDesk.exe', 'System32']);
    this.renderFileList('remote-files', ['Work', 'Photos', 'Project_Final.zip']);

    if (list.length === 0) {
      this.elements.recentList.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 20px; color: var(--text-dim);">
          <p>لا توجد اتصالات حديثة</p>
        </div>`;
      return;
    }

    list.forEach(id => {
      const name = nicknames[id] || `جهاز ${id}`;
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.innerHTML = `
        <div class="device-status status-offline"></div>
        <div style="flex: 1;">
          <div style="font-size: 14px; font-weight: 600;">${name}</div>
          <div class="text-dim" style="font-size: 11px;">${id}</div>
        </div>
        <button class="tool-btn" style="width: 32px; height: 32px;"><i class="fas fa-play"></i></button>
      `;
      item.onclick = () => onConnect(id);
      this.elements.recentList.appendChild(item);
    });
  }

  renderFileList(elementId, files) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = files.map(f => `
      <div class="file-item">
        <i class="fas ${f.includes('.') ? 'fa-file' : 'fa-folder'}" style="color: var(--primary);"></i>
        <span>${f}</span>
      </div>
    `).join('');
  }

  showConnecting(statusText) {
    if (this.elements.connectingOverlay) {
      this.elements.connectingStatus.textContent = statusText || 'جاري إنشاء الاتصال...';
      this.elements.connectingOverlay.style.display = 'flex';
    }
  }

  hideConnecting() {
    if (this.elements.connectingOverlay) {
      this.elements.connectingOverlay.style.display = 'none';
    }
  }
}

window.UIManager = UIManager;
