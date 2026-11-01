/**
 * Codex 账号与用量逻辑（纯 Node，无 Electron 依赖，可单独测试）。
 *
 * 行为对齐 znary/codex-switcher（macOS 菜单栏版）的核心实现：
 * - 每个账号单独保存一份 auth.json 快照；
 * - 切换 = 把快照覆盖回 ~/.codex/auth.json；
 * - 用量 = 启动 `codex app-server`，走 JSON-RPC 调 account/read 与 account/rateLimits/read。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const APP_DIR_NAME = 'CodexSwitcherWindows';

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function appDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, APP_DIR_NAME);
}

function accountsDir() {
  return path.join(appDir(), 'accounts');
}

function stateFile() {
  return path.join(appDir(), 'state.json');
}

function authFile() {
  return path.join(codexHome(), 'auth.json');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return { accounts: [], activeId: null };
  }
}

function saveState(state) {
  fs.mkdirSync(appDir(), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2));
}

/** 从 JWT 解出 payload（不校验签名，只取展示信息）。 */
function decodeJwt(token) {
  const part = String(token || '').split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!domain || !name) return email || '';
  return `${name[0]}...@${domain}`;
}

/** 从 auth.json 内容提取账号摘要。 */
function summarizeAuth(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const tokens = data.tokens || {};
  const claims = decodeJwt(tokens.id_token) || {};
  const auth = claims['https://api.openai.com/auth'] || {};
  const email = claims.email || data.email || '';
  const id = tokens.account_id || auth.chatgpt_account_id || email || `acct-${Date.now()}`;
  return {
    id: String(id),
    email,
    maskedEmail: maskEmail(email),
    plan: auth.chatgpt_plan_type || '',
  };
}

/** 把当前 ~/.codex/auth.json 导入为一个已保存账号（按账号 id 去重）。 */
function importCurrent() {
  const file = authFile();
  if (!fs.existsSync(file)) {
    throw new Error(`找不到 ${file}，请先用 codex login 登录一个账号`);
  }
  const raw = fs.readFileSync(file, 'utf8');
  const summary = summarizeAuth(raw);
  fs.mkdirSync(accountsDir(), { recursive: true });
  fs.writeFileSync(path.join(accountsDir(), `${summary.id}.json`), raw);
  const state = loadState();
  const existing = state.accounts.find((a) => a.id === summary.id);
  if (existing) {
    Object.assign(existing, summary);
  } else {
    state.accounts.push(summary);
  }
  state.activeId = summary.id;
  saveState(state);
  return summary;
}

/** 切换：用快照覆盖 ~/.codex/auth.json，切换前先备份现有文件。 */
function activate(id) {
  const snapshot = path.join(accountsDir(), `${id}.json`);
  if (!fs.existsSync(snapshot)) throw new Error(`账号快照不存在: ${id}`);
  fs.mkdirSync(codexHome(), { recursive: true });
  const current = authFile();
  if (fs.existsSync(current)) {
    fs.copyFileSync(current, `${current}.bak-switcher`);
  }
  fs.copyFileSync(snapshot, current);
  const state = loadState();
  state.activeId = id;
  saveState(state);
}

function removeAccount(id) {
  const snapshot = path.join(accountsDir(), `${id}.json`);
  if (fs.existsSync(snapshot)) fs.unlinkSync(snapshot);
  const state = loadState();
  state.accounts = state.accounts.filter((a) => a.id !== id);
  if (state.activeId === id) state.activeId = null;
  saveState(state);
}

/** 解析 codex 可执行文件：环境变量优先，其次常见安装位置。 */
function resolveCodexBinary() {
  if (process.env.CODEX_BINARY_PATH && fs.existsSync(process.env.CODEX_BINARY_PATH)) {
    return process.env.CODEX_BINARY_PATH;
  }
  const candidates = [
    path.join(process.env.APPDATA || '', 'npm', 'codex.cmd'),
    'C:\\Program Files\\nodejs\\codex.cmd',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'codex.cmd'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return 'codex';
}

/**
 * 调用 `codex app-server` 读取账号与额度。
 * 协议与 znary/codex-switcher 的 CodexUsageProbe 一致：
 * initialize -> initialized -> account/read(id=2) + account/rateLimits/read(id=3)。
 */
function probeUsage(snapshotPath, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCodexBinary(), ['-s', 'read-only', '-a', 'never', 'app-server'], {
      env: { ...process.env, CODEX_HOME: path.dirname(snapshotPath) },
      windowsHide: true,
    });
    let buf = '';
    let account = null;
    let rateLimits = null;
    let settled = false;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (err) reject(err); else resolve(value);
    };

    const timer = setTimeout(() => finish(new Error('读取用量超时')), timeoutMs);

    const send = (obj) => child.stdin.write(`${JSON.stringify(obj)}\n`);

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) {
          send({ jsonrpc: '2.0', method: 'initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'account/read', params: { refreshToken: false } });
          send({ jsonrpc: '2.0', id: 3, method: 'account/rateLimits/read' });
        } else if (msg.id === 2 && msg.result) {
          account = msg.result;
        } else if (msg.id === 3 && msg.result) {
          rateLimits = msg.result;
        }
        if (account && rateLimits) finish(null, { account, rateLimits });
      }
    });

    child.on('error', (err) => finish(new Error(`启动 codex 失败: ${err.message}`)));
    child.on('exit', () => {
      if (!settled) finish(new Error('codex app-server 提前退出'));
    });

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'codex-switcher-windows', title: 'Codex Switcher', version: '1.0.0' },
        capabilities: { experimentalApi: true },
      },
    });
  });
}

/** 把 rateLimits 结果规整成展示用的窗口列表。 */
function metersFromRateLimits(rateLimits) {
  const meters = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.used_percent === 'number') {
      meters.push({
        title: node.name || node.window || node.id || `窗口${meters.length + 1}`,
        usedPercent: node.used_percent,
        resetsAt: node.resets_at || node.reset_at || null,
      });
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') walk(v);
    }
  };
  walk(rateLimits);
  return meters;
}

module.exports = {
  loadState,
  importCurrent,
  activate,
  removeAccount,
  probeUsage,
  metersFromRateLimits,
  summarizeAuth,
  resolveCodexBinary,
  accountsDir,
};
