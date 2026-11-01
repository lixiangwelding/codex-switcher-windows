/**
 * Codex Switcher（Windows 托盘版）主进程。
 * Windows 没有 macOS 式菜单栏，这里用系统托盘图标 + 弹出面板等价实现。
 */

const { app, BrowserWindow, Tray, ipcMain, nativeImage } = require('electron');
const path = require('path');
const codex = require('./codex');

let tray = null;
let panel = null;

function iconImage() {
  const file = path.join(__dirname, '..', 'build', 'tray.png');
  const img = nativeImage.createFromPath(file);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function createPanel() {
  panel = new BrowserWindow({
    width: 380,
    height: 560,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  panel.loadFile(path.join(__dirname, 'panel.html'));
  panel.on('blur', () => panel.hide());
}

function togglePanel() {
  if (!panel) return;
  if (panel.isVisible()) {
    panel.hide();
    return;
  }
  const { x, y } = tray.getBounds();
  const [w] = panel.getSize();
  panel.setPosition(Math.round(x - w / 2), Math.round(y - 560));
  panel.show();
  panel.focus();
}

function refreshPanel() {
  if (panel && !panel.isDestroyed()) panel.webContents.send('state', codex.loadState());
}

app.whenReady().then(() => {
  tray = new Tray(iconImage());
  tray.setToolTip('Codex Switcher');
  tray.on('click', togglePanel);
  createPanel();
});

app.on('window-all-closed', (e) => e && e.preventDefault());

ipcMain.handle('list', () => codex.loadState());

ipcMain.handle('import-current', () => {
  const summary = codex.importCurrent();
  refreshPanel();
  return summary;
});

ipcMain.handle('activate', (_e, id) => {
  codex.activate(id);
  refreshPanel();
  return true;
});

ipcMain.handle('remove', (_e, id) => {
  codex.removeAccount(id);
  refreshPanel();
  return true;
});

ipcMain.handle('usage', async (_e, id) => {
  const snapshot = path.join(codex.accountsDir(), `${id}.json`);
  const tmpHome = path.join(require('os').tmpdir(), `codex-switcher-probe-${id}`);
  require('fs').mkdirSync(tmpHome, { recursive: true });
  require('fs').copyFileSync(snapshot, path.join(tmpHome, 'auth.json'));
  const result = await codex.probeUsage(path.join(tmpHome, 'auth.json'));
  return { meters: codex.metersFromRateLimits(result.rateLimits), plan: result.account?.plan || '' };
});

ipcMain.handle('quit', () => app.quit());
