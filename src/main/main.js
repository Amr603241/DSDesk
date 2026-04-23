const { app, BrowserWindow, ipcMain, desktopCapturer, session, clipboard, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const si = require('systeminformation');
const Store = require('electron-store');

// ── Steel Path Connection Fixes ──
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
app.commandLine.appendSwitch('allow-loopback-in-peer-connection');
app.commandLine.appendSwitch('enable-features', 'WebRTCPeerConnectionWithUrnUint');

const store = new Store();

let mainWindow;
let inputHandler = null;

// ── Load Input Handler ──
const inputHandlerPath = path.join(__dirname, 'input-handler.js');

try {
  if (fs.existsSync(inputHandlerPath)) {
    inputHandler = require(inputHandlerPath);
  }
  
  if (inputHandler) {
    console.log('[✓] Input handler bridge active');
  } else {
    console.error('[✗] Input handler not found');
  }
} catch (e) {
  console.error('[✗] Input handler failed to load:', e.message);
}

// ── Device ID (9-digit unique identifier based on hardware) ──
async function getDeviceId() {
  const idArg = process.argv.find(arg => arg.startsWith('--device-id='));
  if (idArg) {
    const customId = idArg.split('=')[1];
    console.log(`[!] Using Debug Device ID: ${customId}`);
    return customId;
  }

  let id = store.get('deviceId');
  if (!id) {
    try {
      const data = await si.uuid();
      const sys = await si.system();
      const hardwareBase = sys.serial || data.os || data.hardware || data.macs.join('') || Math.random().toString();
      const hash = crypto.createHash('sha256').update(hardwareBase).digest('hex');
      const numericId = (parseInt(hash.substring(0, 8), 16) % 900000000) + 100000000;
      id = numericId.toString();
      store.set('deviceId', id);
    } catch (e) {
      id = Math.floor(100000000 + Math.random() * 900000000).toString();
      store.set('deviceId', id);
    }
  }

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev || process.argv.includes('--multi-instance')) {
      const sessionTag = Math.floor(100 + Math.random() * 899).toString();
      const instanceId = `${id}-${sessionTag}`;
      console.log(`[!] DEVICE ID ISOLATION active: Using Session ID: ${instanceId}`);
      return instanceId;
  }

  return id;
}

function generatePassword() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0e1a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

// ── IPC Handlers ──
ipcMain.handle('get-device-id', () => getDeviceId());
ipcMain.handle('get-hostname', () => si.osInfo().then(os => os.hostname));

ipcMain.handle('is-admin', async () => {
    return new Promise((resolve) => {
        exec('net session', { stdio: 'ignore' }, (err) => {
            resolve(!err);
        });
    });
});

ipcMain.handle('get-password', () => {
  let pwd = store.get('password');
  if (!pwd) {
    pwd = generatePassword();
    store.set('password', pwd);
  }
  return pwd;
});

ipcMain.handle('refresh-password', () => {
  const pwd = generatePassword();
  store.set('password', pwd);
  return pwd;
});

ipcMain.handle('set-password-enabled', (event, enabled) => {
  store.set('passwordEnabled', enabled);
  return true;
});

ipcMain.handle('get-password-enabled', () => {
  return store.get('passwordEnabled') !== false;
});

ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 }
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL()
    }));
  } catch (e) {
    console.error('Failed to get screen sources:', e);
    return [];
  }
});

ipcMain.handle('get-screen-size', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    width: primaryDisplay.size.width,
    height: primaryDisplay.size.height,
    scaleFactor: primaryDisplay.scaleFactor
  };
});

ipcMain.on('simulate-input', (event, data) => {
    if (inputHandler) {
        try {
            inputHandler.handleInput(data);
        } catch (e) {
            console.error('[CRITICAL] Input simulation crashed:', e.message);
        }
    }
});

ipcMain.handle('clipboard-read', () => {
  return clipboard.readText();
});

ipcMain.handle('clipboard-write', (event, text) => {
  if (text) clipboard.writeText(text);
});

ipcMain.handle('get-system-stats', async () => {
  try {
    const [load, mem, cpu, disk, os] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpu(),
      si.fsSize(),
      si.osInfo()
    ]);
    return {
      cpuLoad: Math.round(load.currentLoad),
      ramUsage: Math.round((mem.active / mem.total) * 100),
      cpuTemp: cpu.main || 0,
      diskUsage: Math.round((disk[0].used / disk[0].size) * 100),
      osName: os.platform + ' ' + os.release,
      hostname: os.hostname
    };
  } catch (e) {
    return { cpuLoad: 0, ramUsage: 0, hostname: 'Unknown' };
  }
});

ipcMain.handle('sys-reboot', () => { exec('shutdown /r /t 0'); return true; });
ipcMain.handle('sys-shutdown', () => { exec('shutdown /s /t 0'); return true; });
ipcMain.handle('sys-lock', () => { exec('rundll32.exe user32.dll,LockWorkStation'); return true; });

ipcMain.handle('get-install-status', () => {
    const currentPath = app.getPath('exe').toLowerCase();
    return currentPath.includes('program files\\dsdesk');
});

ipcMain.handle('perform-install', async () => {
    const INSTALL_PATH = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'DSDesk');
    const EXE_NAME = 'DSDesk.exe';
    try {
        const currentExe = app.getPath('exe');
        const sourceDir = path.dirname(currentExe);
        const targetExe = path.join(INSTALL_PATH, EXE_NAME);
        if (!fs.existsSync(INSTALL_PATH)) fs.mkdirSync(INSTALL_PATH, { recursive: true });
        const files = fs.readdirSync(sourceDir);
        for (const file of files) {
            const src = path.join(sourceDir, file);
            const dest = path.join(INSTALL_PATH, file);
            if (fs.lstatSync(src).isDirectory()) {
                if (fs.cpSync) fs.cpSync(src, dest, { recursive: true });
            } else {
                fs.copyFileSync(src, dest);
            }
        }
        exec(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "DSDesk" /t REG_SZ /d "\\"${targetExe}\\"" /f`);
        const desktopPath = path.join(process.env.USERPROFILE, 'Desktop', 'DSDesk.lnk');
        exec(`powershell "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${desktopPath}');$s.TargetPath='${targetExe}';$s.WorkingDirectory='${INSTALL_PATH}';$s.Save()"`);
        return { success: true, path: targetExe };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('launch-installed', (event, targetExe) => {
    shell.openPath(targetExe);
    app.quit();
});

ipcMain.handle('get-process-list', () => {
  return new Promise((resolve, reject) => {
    exec('tasklist /FO CSV /NH', (err, stdout) => {
      if (err) return reject(err);
      const lines = stdout.trim().split('\n');
      const processes = lines.map(line => {
        const parts = line.split('","').map(p => p.replace(/"/g, ''));
        return { name: parts[0], pid: parts[1], mem: parts[4] };
      }).slice(0, 50);
      resolve(processes);
    });
  });
});

ipcMain.handle('kill-process', (event, pid) => {
  return new Promise((resolve, reject) => {
    exec(`taskkill /F /PID ${pid}`, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
});

let shellProcess = null;
ipcMain.on('shell-start', (event) => {
  if (shellProcess) shellProcess.kill();
  shellProcess = spawn('cmd.exe');
  shellProcess.stdout.on('data', (data) => event.sender.send('shell-data', data.toString()));
  shellProcess.stderr.on('data', (data) => event.sender.send('shell-data', data.toString()));
});
ipcMain.on('shell-input', (event, input) => { if (shellProcess) shellProcess.stdin.write(input); });

ipcMain.handle('get-trusted-devices', () => store.get('trustedDevices') || []);
ipcMain.handle('add-trusted-device', (event, deviceId) => {
  const trusted = store.get('trustedDevices') || [];
  if (!trusted.includes(deviceId)) {
    trusted.push(deviceId);
    store.set('trustedDevices', trusted);
  }
  return true;
});
ipcMain.handle('remove-trusted-device', (event, deviceId) => {
  let trusted = store.get('trustedDevices') || [];
  trusted = trusted.filter(id => id !== deviceId);
  store.set('trustedDevices', trusted);
  return true;
});

ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.handle('is-maximized', () => mainWindow ? mainWindow.isMaximized() : false);

// ── Extra Features from src/main/main.js ──
ipcMain.handle('take-screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    if (sources.length > 0) return sources[0].thumbnail.toDataURL();
    return null;
  } catch (e) { return null; }
});

ipcMain.handle('get-autostart', () => store.get('autostart') || false);
ipcMain.handle('set-autostart', (event, enabled) => {
  store.set('autostart', enabled);
  const exePath = app.getPath('exe');
  const regCmd = enabled 
    ? `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "DSDesk" /t REG_SZ /d "\\"${exePath}\\"" /f`
    : `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "DSDesk" /f`;
  exec(regCmd);
  return true;
});

ipcMain.handle('get-settings', () => store.get('settings') || { quality: 'high', fps: 60, bitrate: 30, cursor: true, clipboard: true, autostart: false });
ipcMain.handle('set-settings', (event, settings) => {
  store.set('settings', settings);
  return true;
});

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      const target = sources[0];
      if (target) callback({ video: target });
      else callback({});
    }).catch(() => callback({}));
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
