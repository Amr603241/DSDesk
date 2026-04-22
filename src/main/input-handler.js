/**
 * Input Handler - PRO EDITION
 * Simulates mouse and keyboard events on the host machine
 * With drag/drop support and improved precision
 */

let user32 = null;
let SetCursorPos, mouse_event_fn, keybd_event_fn, GetAsyncKeyState;

try {
  const koffi = require('koffi');
  user32 = koffi.load('user32.dll');

  SetCursorPos = user32.func('int __stdcall SetCursorPos(int X, int Y)');
  mouse_event_fn = user32.func('void __stdcall mouse_event(unsigned int dwFlags, unsigned int dx, unsigned int dy, unsigned int dwData, uintptr_t dwExtraInfo)');
  keybd_event_fn = user32.func('void __stdcall keybd_event(unsigned char bVk, unsigned char bScan, unsigned int dwFlags, uintptr_t dwExtraInfo)');
  GetAsyncKeyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)');

  console.log('[✓] Windows API PRO loaded via koffi');
} catch (e) {
  console.error('[✗] Failed to load koffi/user32.dll:', e.message);
  console.error('    Input simulation will be disabled.');
}

// ── Mouse event flags (PRO) ──
const MOUSEEVENTF_MOVE        = 0x0001;
const MOUSEEVENTF_LEFTDOWN    = 0x0002;
const MOUSEEVENTF_LEFTUP      = 0x0004;
const MOUSEEVENTF_RIGHTDOWN   = 0x0008;
const MOUSEEVENTF_RIGHTUP   = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP   = 0x0040;
const MOUSEEVENTF_WHEEL      = 0x0800;
const MOUSEEVENTF_ABSOLUTE  = 0x8000;
const MOUSEEVENTF_WHEEL_HORIZONTAL = 0x1000;

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
 * PRO VERSION with better precision and drag support
 */
function handleInput(data) {
  if (!user32) return;

  const x = Math.round(data.x);
  const y = Math.round(data.y);

  switch (data.type) {
    case 'mousemove':
      SetCursorPos(x, y);
      break;

    case 'mousedown':
      SetCursorPos(x, y);
      if (data.button === 0) mouse_event_fn(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
      else if (data.button === 2) mouse_event_fn(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
      else if (data.button === 1) mouse_event_fn(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0);
      break;

    case 'mouseup':
      if (data.button === 0) mouse_event_fn(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
      else if (data.button === 2) mouse_event_fn(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
      else if (data.button === 1) mouse_event_fn(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);
      break;

    case 'mousedrag': {
      SetCursorPos(x, y);
      mouse_event_fn(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
      break;
    }

    case 'mousedrop': {
      SetCursorPos(x, y);
      mouse_event_fn(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
      break;
    }

    case 'dblclick':
      SetCursorPos(x, y);
      mouse_event_fn(MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
      mouse_event_fn(MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
      break;

    case 'wheel':
      const wheelDelta = Math.round(data.deltaY) * 120;
      mouse_event_fn(MOUSEEVENTF_WHEEL, 0, 0, wheelDelta, 0);
      break;

    case 'hwheel':
      const hWheelDelta = Math.round(data.deltaX) * 120;
      mouse_event_fn(MOUSEEVENTF_WHEEL_HORIZONTAL, 0, 0, hWheelDelta, 0);
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

    case 'text':
      if (data.text) {
        for (const char of data.text) {
          const vk = char.toUpperCase().charCodeAt(0);
          if (vk >= 0x41 && vk <= 0x5A) {
            keybd_event_fn(vk, 0, KEYEVENTF_KEYDOWN, 0);
            keybd_event_fn(vk, 0, KEYEVENTF_KEYUP, 0);
          }
        }
      }
      break;
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
