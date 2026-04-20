const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dsdesk', {
  // ── Device Info ──
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  getPassword: () => ipcRenderer.invoke('get-password'),
  refreshPassword: () => ipcRenderer.invoke('refresh-password'),
  getPasswordEnabled: () => ipcRenderer.invoke('get-password-enabled'),
  setPasswordEnabled: (enabled) => ipcRenderer.invoke('set-password-enabled', enabled),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),

  // ── Remote Controls ──
  reboot: () => ipcRenderer.invoke('sys-reboot'),
  shutdown: () => ipcRenderer.invoke('sys-shutdown'),
  lock: () => ipcRenderer.invoke('sys-lock'),

  // ── Installation ──
  getInstallStatus: () => ipcRenderer.invoke('get-install-status'),
  performInstall: () => ipcRenderer.invoke('perform-install'),
  launchInstalled: (path) => ipcRenderer.invoke('launch-installed', path),

  // ── Screen Capture ──
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),

  // ── Clipboard ──
  readClipboard: () => ipcRenderer.invoke('clipboard-read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard-write', text),

  // ── System Monitoring ──
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  getProcessList: () => ipcRenderer.invoke('get-process-list'),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),

  // ── Shell / Terminal ──
  startShell: () => ipcRenderer.send('shell-start'),
  sendShellInput: (input) => ipcRenderer.send('shell-input', input),
  onShellData: (callback) => ipcRenderer.on('shell-data', (e, data) => callback(data)),

  // ── Trusted Devices ──
  getTrustedDevices: () => ipcRenderer.invoke('get-trusted-devices'),
  addTrustedDevice: (id) => ipcRenderer.invoke('add-trusted-device', id),
  removeTrustedDevice: (id) => ipcRenderer.invoke('remove-trusted-device', id),

  // ── Input Simulation ──
  simulateInput: (data) => ipcRenderer.send('simulate-input', data),

  // ── Window Controls ──
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
});
