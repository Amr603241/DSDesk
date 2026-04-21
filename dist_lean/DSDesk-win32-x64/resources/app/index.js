const { app, BrowserWindow, ipcMain, desktopCapturer, session, clipboard, shell } = require('electron');
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
let inputHandler;

// ── Load Input Handler ──
try {
  inputHandler = require('./src/main/input-handler');
  console.log('[✓] Input handler bridge active');
} catch (e) {
  console.error('[✗] Input handler failed to load:', e.message);
}

// ── Device ID (9-digit unique identifier like AnyDesk) ──
// ── Device ID (9-digit unique identifier based on hardware) ──
async function getDeviceId() {
  // Allow override via command line for loopback testing
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

  // Same-machine COLLISION PREVENTION:
  // For development, testing, or multi-instance scenarios, append a random session tag.
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev || process.argv.includes('--multi-instance')) {
      const sessionTag = Math.floor(100 + Math.random() * 899).toString();
      const instanceId = `${id}-${sessionTag}`;
      console.log(`[!] DEVICE ID ISOLATION active: Using Session ID: ${instanceId}`);
      return instanceId;
  }

  return id;
}

// ── Random password generator ──
function generatePassword() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// ── Create main window ──
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

  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  // Show window when ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Initialize input handler (Windows API via koffi)
  try {
    inputHandler = require('./input-handler');
    console.log('[✓] Input handler loaded successfully');
  } catch (e) {
    console.error('[✗] Input handler failed to load:', e.message);
  }
}

// ── System Controls ──
ipcMain.handle('sys-reboot', () => {
    exec('shutdown /r /t 0');
    return true;
});

ipcMain.handle('sys-shutdown', () => {
    exec('shutdown /s /t 0');
    return true;
});

ipcMain.handle('sys-lock', () => {
    exec('rundll32.exe user32.dll,LockWorkStation');
    return true;
});

// ── Input Simulation Bridge ──
ipcMain.on('simulate-input', (event, data) => {
    if (inputHandler) {
        try {
            inputHandler.handleInput(data);
        } catch (e) {
            console.error('[CRITICAL] Input simulation crashed:', e.message);
        }
    }
});

// ── IPC Handlers ──

// Device info
ipcMain.handle('get-device-id', () => getDeviceId());

ipcMain.handle('is-admin', () => {
    try {
        // 'net session' only succeeds if running as Administrator
        require('child_process').execSync('net session', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
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
  return store.get('passwordEnabled') !== false; // Default to true
});

// Screen capture sources
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

// Screen dimensions
ipcMain.handle('get-screen-size', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    width: primaryDisplay.size.width,
    height: primaryDisplay.size.height,
    scaleFactor: primaryDisplay.scaleFactor
  };
});

// Pro Feature: System Information & Stats
ipcMain.handle('get-system-info', () => {
    const os = require('os');
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    return {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        cpuModel: cpus[0].model,
        cpuCount: cpus.length,
        totalMemory: Math.round(totalMem / (1024 * 1024 * 1024)), // GB
        freeMemory: Math.round(freeMem / (1024 * 1024 * 1024)), // GB
        usedMemoryPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
        uptime: Math.round(os.uptime() / 3600) // Hours
    };
});

// Clipboard handlers
ipcMain.handle('clipboard-read', () => {
  return clipboard.readText();
});

ipcMain.handle('clipboard-write', (event, text) => {
  if (text) clipboard.writeText(text);
});

// System stats handler (Advanced Pro Dashboard)
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
    console.error('Failed to get system stats:', e);
    return { cpuLoad: 0, ramUsage: 0, hostname: 'Unknown' };
  }
});

// ── Admin Check Helper ──
function isAdmin() {
    try {
        const { execSync } = require('child_process');
        execSync('net session', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

// ── AnyDesk-Style Installation Logic ──

const INSTALL_PATH = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'DSDesk');
const EXE_NAME = 'DSDesk.exe';

ipcMain.handle('get-install-status', () => {
    const currentPath = app.getPath('exe').toLowerCase();
    return currentPath.includes('program files\\dsdesk');
});

ipcMain.handle('perform-install', async () => {
    const currentExe = app.getPath('exe');
    const isAlreadyAdmin = isAdmin();

    if (!isAlreadyAdmin) {
        console.log('[INSTALL] Not admin, attempting elevation...');
        const psCmd = `powershell Start-Process -FilePath "${currentExe}" -Verb RunAs`;
        try {
            exec(psCmd);
            setTimeout(() => app.quit(), 1000);
            return { success: true, message: 'elevating' };
        } catch (e) {
            return { success: false, error: 'Elevation failed' };
        }
    }

    try {
        const sourceDir = path.dirname(currentExe);
        const targetExe = path.join(INSTALL_PATH, EXE_NAME);

        // 1. Create Directory
        if (!fs.existsSync(INSTALL_PATH)) {
            fs.mkdirSync(INSTALL_PATH, { recursive: true });
        }

        // 2. Copy Files (Robust recursive copy)
        // Note: For portable apps, we want the files to stay in place but be registered
        // but here we specifically copy to Program Files
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

        // 3. Register for Auto-Start
        const regRun = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "DSDesk" /t REG_SZ /d "\\"${targetExe}\\"" /f`;
        exec(regRun);

        // 4. Register for "Add/Remove Programs" (Control Panel)
        const uninstKey = `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DSDesk`;
        const regUninst = [
            `reg add "${uninstKey}" /v "DisplayName" /t REG_SZ /d "DSDesk Professional" /f`,
            `reg add "${uninstKey}" /v "UninstallString" /t REG_SZ /d "cmd /c rmdir /s /q \\"${INSTALL_PATH}\\"" /f`,
            `reg add "${uninstKey}" /v "DisplayIcon" /t REG_SZ /d "${targetExe}" /f`,
            `reg add "${uninstKey}" /v "Publisher" /t REG_SZ /d "DSDesk Team" /f`,
            `reg add "${uninstKey}" /v "DisplayVersion" /t REG_SZ /d "1.8.0" /f`
        ];
        regUninst.forEach(cmd => exec(cmd));

        // 5. Create Desktop Shortcut
        const desktopPath = path.join(process.env.USERPROFILE, 'Desktop', 'DSDesk.lnk');
        const psShortcut = `powershell "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${desktopPath}');$s.TargetPath='${targetExe}';$s.WorkingDirectory='${INSTALL_PATH}';$s.Save()"`;
        exec(psShortcut);

        return { success: true, path: targetExe };
    } catch (err) {
        console.error('Installation failed:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('launch-installed', (event, targetExe) => {
    shell.openPath(targetExe);
    app.quit();
});

// ── Process Manager (Task Manager) ──
ipcMain.handle('get-process-list', () => {
  return new Promise((resolve, reject) => {
    exec('tasklist /FO CSV /NH', (err, stdout) => {
      if (err) return reject(err);
      const lines = stdout.trim().split('\n');
      const processes = lines.map(line => {
        const parts = line.split('","').map(p => p.replace(/"/g, ''));
        return { name: parts[0], pid: parts[1], mem: parts[4] };
      }).slice(0, 50); // Get top 50 for performance
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

// ── Basic Shell for Terminal ──
let shellProcess = null;

ipcMain.on('shell-start', (event) => {
  if (shellProcess) shellProcess.kill();
  
  shellProcess = spawn('cmd.exe');
  
  shellProcess.stdout.on('data', (data) => {
    event.sender.send('shell-data', data.toString());
  });
  
  shellProcess.stderr.on('data', (data) => {
    event.sender.send('shell-data', data.toString());
  });
});

ipcMain.on('shell-input', (event, input) => {
  if (shellProcess) {
    shellProcess.stdin.write(input);
  }
});

// ── Trusted Devices ──
ipcMain.handle('get-trusted-devices', () => {
  return store.get('trustedDevices') || [];
});

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

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// Pro Monitor Switcher State
let selectedSourceId = null;
ipcMain.handle('set-active-monitor', (event, sourceId) => {
    selectedSourceId = sourceId;
    return true;
});

// ── App lifecycle ──
app.whenReady().then(() => {
  // Handle getDisplayMedia requests from renderer
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      // Find the specifically requested source or fallback to the first screen
      const target = sources.find(s => s.id === selectedSourceId) || sources[0];
      if (target) {
        callback({ video: target });
      } else {
        callback({});
      }
    }).catch((err) => {
      console.error('Display handler error:', err);
      callback({});
    });
  });

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
