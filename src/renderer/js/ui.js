/**
 * DSDesk UI Manager - PRO MAX Edition
 * Handles modern SaaS interface logic and animations
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
      bandwidthStat: document.getElementById('stat-bandwidth')
    };

    this._setupWindowControls();
    this._setupSettingsTabs();
    this._setupInteractions();
  }

  _setupInteractions() {
    // Add hover sound/glow effects here if desired
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        // Subtle haptic or glow logic
      });
    });
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
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.getAttribute('data-tab');
        // Logic to show/hide setting sections
        console.log('[UI] Switched to settings tab:', target);
      });
    });
  }

  switchView(viewName) {
    console.log('[UI] Switching to view:', viewName);
    Object.keys(this.views).forEach(v => {
      const view = this.views[v];
      if (v === viewName) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });
  }

  updateDeviceInfo(id, password) {
    if (this.elements.deviceId && id) {
      const formattedId = id.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      this.elements.deviceId.textContent = formattedId;
    }
    if (this.elements.devicePassword && password) {
      this.elements.devicePassword.textContent = password;
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
      this.elements.statusText.textContent = text || (connected ? 'متصل بالشبكة الذكية' : 'غير متصل');
      this.elements.statusText.style.color = connected ? 'var(--secondary)' : 'var(--text-muted)';
    }
  }

  updateStats(stats) {
    if (this.elements.latencyStat) this.elements.latencyStat.textContent = `${stats.latency}ms`;
    if (this.elements.fpsStat) this.elements.fpsStat.textContent = stats.fps;
    if (this.elements.bandwidthStat) this.elements.bandwidthStat.textContent = `${stats.bandwidth} Mbps`;
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-triangle' : 
                 type === 'warning' ? 'fa-info-circle' : 'fa-bell';
                 
    toast.innerHTML = `
      <i class="fas ${icon}"></i>
      <span>${message}</span>
    `;
    
    this.elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-20px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  showRequestModal(fromId) {
    if (this.elements.modalRequest) {
      this.elements.requestFromId.textContent = fromId;
      this.elements.modalRequest.classList.add('active');
    }
  }

  hideRequestModal() {
    if (this.elements.modalRequest) {
      this.elements.modalRequest.classList.remove('active');
    }
  }

  showConnecting(statusText) {
    if (this.elements.connectingOverlay) {
      this.elements.connectingStatus.textContent = statusText || 'جاري إنشاء الاتصال...';
      this.elements.connectingOverlay.style.display = 'flex';
      this.elements.connectingOverlay.classList.add('active');
    }
  }

  hideConnecting() {
    if (this.elements.connectingOverlay) {
      this.elements.connectingOverlay.style.display = 'none';
      this.elements.connectingOverlay.classList.remove('active');
    }
  }
}

window.UIManager = UIManager;
