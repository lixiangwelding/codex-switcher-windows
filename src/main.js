/**
 * Codex Switcher（Windows 托盘版）主进程。
 * Windows 没有 macOS 式菜单栏，这里用系统托盘图标 + 弹出面板等价实现。
 */

const { app, BrowserWindow, Tray, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const codex = require('./codex');

let tray = null;
let panel = null;

function iconImage() {
  const ico = path.join(__dirname, '..', 'build', 'icon.ico');
  const png = path.join(__dirname, '..', 'build', 'tray.png');
  for (const file of [ico, png]) {
    const img = nativeImage.createFromPath(file);
    if (!img.isEmpty()) return img;
  }
  return nativeImage.createEmpty();
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
  return {
    meters: codex.metersFromRateLimits(result.rateLimits),
    plan: codex.planFromRateLimits(result.rateLimits),
  };
});

ipcMain.handle('quit', () => app.quit());

let loginWindow = null;
let loginChild = null;

/** 弹出登录窗口：实时显示 codex login 输出，登录链接可点击，成功后自动导入。 */
function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }
  loginWindow = new BrowserWindow({
    width: 520,
    height: 460,
    title: '添加 Codex 账号',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  loginWindow.loadFile(path.join(__dirname, 'login.html'));
  loginWindow.on('closed', () => {
    if (loginChild) loginChild.kill();
    loginChild = null;
    loginWindow = null;
  });
}

ipcMain.handle('login-start', () => {
  if (loginChild) return false;
  const loginHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-login-'));
  loginChild = codex.startLogin(loginHome);
  const send = (chunk) => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.webContents.send('login-output', chunk.toString('utf8'));
    }
  };
  loginChild.stdout.on('data', send);
  loginChild.stderr.on('data', send);
  loginChild.on('error', (err) => send(`\n启动失败: ${err.message}\n`));
  loginChild.on('exit', () => {
    loginChild = null;
    const auth = path.join(loginHome, 'auth.json');
    let summary = null;
    if (fs.existsSync(auth)) {
      try {
        summary = codex.importAuthFile(auth);
        refreshPanel();
      } catch (err) {
        send(`\n导入失败: ${err.message}\n`);
      }
    }
    fs.rmSync(loginHome, { recursive: true, force: true });
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.webContents.send('login-done', summary);
    }
  });
  return true;
});

ipcMain.handle('login-cancel', () => {
  if (loginChild) loginChild.kill();
});

ipcMain.handle('open-external', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.handle('add-account', () => openLoginWindow());
