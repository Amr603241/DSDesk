/**
 * Input Handler - Windows API via koffi
 * Simulates mouse and keyboard events on the host machine
 */

let user32 = null;
let SetCursorPos, mouse_event_fn, keybd_event_fn;

try {
  const koffi = require('koffi');
  user32 = koffi.load('user32.dll');

  SetCursorPos = user32.func('int __stdcall SetCursorPos(int X, int Y)');
  mouse_event_fn = user32.func('void __stdcall mouse_event(unsigned int dwFlags, unsigned int dx, unsigned int dy, unsigned int dwData, uintptr_t dwExtraInfo)');
  keybd_event_fn = user32.func('void __stdcall keybd_event(unsigned char bVk, unsigned char bScan, unsigned int dwFlags, uintptr_t dwExtraInfo)');

  // Enforce DPI awareness to ensure SetCursorPos works with physical pixels
  try {
    const SetProcessDPIAware = user32.func('int __stdcall SetProcessDPIAware()');
    SetProcessDPIAware();
  } catch (e) {
    console.warn('SetProcessDPIAware not supported or already set');
  }

  console.log('[✓] Windows API (user32.dll) loaded with High DPI awareness');
} catch (e) {
  console.error('[✗] Failed to load koffi/user32.dll:', e.message);
  console.error('    Input simulation will be disabled.');
}

// ── Mouse event flags ──
const MOUSEEVENTF_MOVE        = 0x0001;
const MOUSEEVENTF_LEFTDOWN    = 0x0002;
const MOUSEEVENTF_LEFTUP      = 0x0004;
const MOUSEEVENTF_RIGHTDOWN   = 0x0008;
const MOUSEEVENTF_RIGHTUP     = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN  = 0x0020;
const MOUSEEVENTF_MIDDLEUP    = 0x0040;
const MOUSEEVENTF_WHEEL       = 0x0800;
const MOUSEEVENTF_HWHEEL      = 0x1000;

// ── Keyboard event flags ──
const KEYEVENTF_KEYDOWN       = 0x0000;
const KEYEVENTF_KEYUP         = 0x0002;
const KEYEVENTF_EXTENDEDKEY   = 0x0001;

// ── JS key code to Windows Virtual Key code mapping ──
const VK_MAP = {
  'Backspace': 0x08, 'Tab': 0x09, 'Enter': 0x0D, 'ShiftLeft': 0x10,
  'ShiftRight': 0x10, 'ControlLeft': 0x11, 'ControlRight': 0x11,
  'AltLeft': 0x12, 'AltRight': 0x12, 'Pause': 0x13, 'CapsLock': 0x14,
  'Escape': 0x1B, 'Space': 0x20, 'PageUp': 0x21, 'PageDown': 0x22,
  'End': 0x23, 'Home': 0x24, 'ArrowLeft': 0x25, 'ArrowUp': 0x26,
  'ArrowRight': 0x27, 'ArrowDown': 0x28, 'PrintScreen': 0x2C,
  'Insert': 0x2D, 'Delete': 0x2E,
  'Digit0': 0x30, 'Digit1': 0x31, 'Digit2': 0x32, 'Digit3': 0x33,
  'Digit4': 0x34, 'Digit5': 0x35, 'Digit6': 0x36, 'Digit7': 0x37,
  'Digit8': 0x38, 'Digit9': 0x39,
  'KeyA': 0x41, 'KeyB': 0x42, 'KeyC': 0x43, 'KeyD': 0x44,
  'KeyE': 0x45, 'KeyF': 0x46, 'KeyG': 0x47, 'KeyH': 0x48,
  'KeyI': 0x49, 'KeyJ': 0x4A, 'KeyK': 0x4B, 'KeyL': 0x4C,
  'KeyM': 0x4D, 'KeyN': 0x4E, 'KeyO': 0x4F, 'KeyP': 0x50,
  'KeyQ': 0x51, 'KeyR': 0x52, 'KeyS': 0x53, 'KeyT': 0x54,
  'KeyU': 0x55, 'KeyV': 0x56, 'KeyW': 0x57, 'KeyX': 0x58,
  'KeyY': 0x59, 'KeyZ': 0x5A,
  'MetaLeft': 0x5B, 'MetaRight': 0x5C,
  'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73,
  'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77,
  'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,
  'NumLock': 0x90, 'ScrollLock': 0x91,
  'Semicolon': 0xBA, 'Equal': 0xBB, 'Comma': 0xBC,
  'Minus': 0xBD, 'Period': 0xBE, 'Slash': 0xBF,
  'Backquote': 0xC0, 'BracketLeft': 0xDB, 'Backslash': 0xDC,
  'BracketRight': 0xDD, 'Quote': 0xDE
};

/**
 * Handle an input event from the remote client
 * @param {Object} data - Input event data
 */
function handleInput(data) {
  if (!user32 || !data) return;

  // Validation: Ensure coordinates are valid numbers to prevent native crashes
  const x = Number.isFinite(data.x) ? Math.round(data.x) : null;
  const y = Number.isFinite(data.y) ? Math.round(data.y) : null;

  switch (data.type) {
    case 'mousemove':
      if (x !== null && y !== null) {
        // Use high-precision absolute coordinates (0-65535)
        // This is the industry standard for remote control to bypass scaling drift
        const screenWidth = user32.GetSystemMetrics(0);
        const screenHeight = user32.GetSystemMetrics(1);
        const absX = Math.round((x * 65535) / screenWidth);
        const absY = Math.round((y * 65535) / screenHeight);
        
        mouse_event_fn(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, absX, absY, 0, 0);
      }
      break;

    case 'mousedown':
      if (x !== null && y !== null) {
        const screenWidth = user32.GetSystemMetrics(0);
        const screenHeight = user32.GetSystemMetrics(1);
        const absX = Math.round((x * 65535) / screenWidth);
        const absY = Math.round((y * 65535) / screenHeight);
        mouse_event_fn(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, absX, absY, 0, 0);
      }
      if (data.button === 0) mouse_event_fn(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
      else if (data.button === 2) mouse_event_fn(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
      else if (data.button === 1) mouse_event_fn(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0);
      break;

    case 'mouseup':
      if (data.button === 0) mouse_event_fn(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
      else if (data.button === 2) mouse_event_fn(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
      else if (data.button === 1) mouse_event_fn(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);
      break;

    case 'dblclick':
      if (x !== null && y !== null) SetCursorPos(x, y);
      mouse_event_fn(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
      mouse_event_fn(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
      mouse_event_fn(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
      mouse_event_fn(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
      break;

    case 'wheel':
      // deltaY > 0 means scroll down, send negative value
      const wheelDelta = data.deltaY > 0 ? -120 : 120;
      mouse_event_fn(MOUSEEVENTF_WHEEL, 0, 0, wheelDelta, 0);
      break;

    case 'keydown': {
      const vk = getVirtualKey(data.code, data.key);
      if (vk) {
        const flags = isExtendedKey(data.code) ? KEYEVENTF_EXTENDEDKEY : 0;
        keybd_event_fn(vk, 0, flags, 0);
      }
      break;
    }

    case 'keyup': {
      const vk = getVirtualKey(data.code, data.key);
      if (vk) {
        const flags = KEYEVENTF_KEYUP | (isExtendedKey(data.code) ? KEYEVENTF_EXTENDEDKEY : 0);
        keybd_event_fn(vk, 0, flags, 0);
      }
      break;
    }
  }
}

function getVirtualKey(code, key) {
  if (VK_MAP[code]) return VK_MAP[code];
  // Fallback: use character code for printable chars
  if (key && key.length === 1) {
    return key.toUpperCase().charCodeAt(0);
  }
  return null;
}

function isExtendedKey(code) {
  const extended = [
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
    'ControlRight', 'AltRight', 'MetaLeft', 'MetaRight'
  ];
  return extended.includes(code);
}

module.exports = { handleInput };
