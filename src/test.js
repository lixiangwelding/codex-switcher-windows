/**
 * 核心逻辑测试（不依赖 Electron，也不碰真实 ~/.codex）。
 * 运行：node src/test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csw-test-'));
process.env.CODEX_HOME = path.join(tmp, 'codex');
process.env.APPDATA = path.join(tmp, 'appdata');

const codex = require('./codex');

function fakeAuth(email, accountId) {
  const payload = Buffer.from(JSON.stringify({
    email,
    'https://api.openai.com/auth': { chatgpt_account_id: accountId, chatgpt_plan_type: 'pro' },
  })).toString('base64url');
  return JSON.stringify({ tokens: { id_token: `x.${payload}.y`, account_id: accountId } });
}

const home = process.env.CODEX_HOME;
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(path.join(home, 'auth.json'), fakeAuth('alice@qq.com', 'id-alice'));

const a = codex.importCurrent();
assert.strictEqual(a.email, 'alice@qq.com');
assert.strictEqual(a.plan, 'pro');
assert.strictEqual(a.maskedEmail, 'a...@qq.com');

fs.writeFileSync(path.join(home, 'auth.json'), fakeAuth('bob@qq.com', 'id-bob'));
const b = codex.importCurrent();

let state = codex.loadState();
assert.strictEqual(state.accounts.length, 2);
assert.strictEqual(state.activeId, 'id-bob');

codex.activate('id-alice');
const restored = JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8'));
assert.strictEqual(restored.tokens.account_id, 'id-alice');
assert.ok(fs.existsSync(path.join(home, 'auth.json.bak-switcher')), '切换前应备份');
state = codex.loadState();
assert.strictEqual(state.activeId, 'id-alice');

codex.removeAccount('id-bob');
state = codex.loadState();
assert.strictEqual(state.accounts.length, 1);
assert.ok(!fs.existsSync(path.join(codex.accountsDir(), 'id-bob.json')));

const meters = codex.metersFromRateLimits({
  rateLimits: {
    primary: { usedPercent: 100, windowDurationMins: 10080, resetsAt: 1793774863 },
    secondary: null,
    credits: { hasCredits: true, unlimited: false, balance: '7205.9' },
    planType: 'pro',
  },
});
assert.strictEqual(meters.length, 2);
assert.strictEqual(meters[0].title, '每周');
assert.strictEqual(meters[0].usedPercent, 100);
assert.ok(meters[0].resetsAt.startsWith('2026-'));
assert.strictEqual(meters[1].title, '余额');
assert.strictEqual(codex.planFromRateLimits({ rateLimits: { planType: 'pro' } }), 'pro');

assert.throws(() => codex.activate('no-such'), /快照不存在/);

fs.rmSync(tmp, { recursive: true });
console.log('ALL_TESTS_PASSED');
