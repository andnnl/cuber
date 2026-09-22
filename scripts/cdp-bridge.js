/* CDP 桥: 外部 Chrome (Web Bluetooth) <-> HTTP 接口, 供真机排查用
 * 端点:
 *   GET /eval?code=<js>        执行 JS (returnByValue), 返回完成值或异常文本
 *   GET /logtail?n=<行数>      返回最近 n 条 console/异常日志
 *   GET /log                   返回全部日志
 *   GET /shot                  截图存 Temp 并返回路径
 * 用法: node scripts/cdp-bridge.js  (自动启动外部 Chrome 并打开 blecross 页面)
 */
const http = require("http");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");

const BRIDGE_PORT = 9333;
const DEBUG_PORT = 9222;
const PAGE_URL = "http://localhost:8080/?mode=blecross";
const PROFILE_DIR = path.join(os.tmpdir(), "ble-chrome-profile");
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const logs = [];
function logLine(s) {
  const line = `[${new Date().toISOString().slice(11, 23)}] ${s}`;
  logs.push(line);
  if (logs.length > 4000) logs.shift();
  console.log(line);
}

function httpGetJson(port, p) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: p }, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
        });
      })
      .on("error", reject);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

let ws = null;
let msgId = 0;
const pending = new Map();

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error("cdp timeout: " + method)); }
    }, 30000);
  });
}

function fmtArg(a) {
  if (a === null || a === undefined) return String(a);
  if (a.value !== undefined) return typeof a.value === "string" ? a.value : JSON.stringify(a.value);
  if (a.description !== undefined) return a.description;
  return JSON.stringify(a);
}

function attachHandlers() {
  ws.on("message", (data) => {
    const m = JSON.parse(data.toString());
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
      return;
    }
    if (m.method === "Runtime.consoleAPICalled") {
      const { type, args } = m.params;
      logLine(args.map(fmtArg).join(" "));
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      const txt = d.exception && d.exception.description ? d.exception.description : d.text;
      logLine("[EXCEPTION] " + txt);
    } else if (m.method === "Log.entryAdded") {
      const e = m.params.entry;
      logLine(`[${e.level}] ${e.source}: ${e.text}`);
    }
  });
  ws.on("close", () => logLine("[BRIDGE] page ws closed"));
  ws.on("error", (e) => logLine("[BRIDGE] ws error: " + e.message));
}

async function findAndConnect() {
  const targets = await httpGetJson(DEBUG_PORT, "/json");
  const page = targets.find((t) => t.type === "page" && t.url.indexOf("localhost:8080") >= 0)
    || targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
  attachHandlers();
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Log.enable");
  logLine("[BRIDGE] attached: " + page.url);
}

async function start() {
  let chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) { console.error("chrome.exe not found"); process.exit(1); }
  let up = false;
  try { await httpGetJson(DEBUG_PORT, "/json/version"); up = true; } catch (e) { /* not running */ }
  if (!up) {
    execFile(chrome, [
      "--remote-debugging-port=" + DEBUG_PORT,
      '--user-data-dir=' + PROFILE_DIR,
      "--enable-features=WebBluetooth",
      "--no-first-run",
      "--no-default-browser-check",
      PAGE_URL,
    ]);
    logLine("[BRIDGE] chrome launched");
  } else {
    logLine("[BRIDGE] existing chrome with debug port");
  }
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      await httpGetJson(DEBUG_PORT, "/json/version");
      await findAndConnect();
      // 确保页面是 blecross
      const cur = await cdp("Runtime.evaluate", { expression: "location.href", returnByValue: true });
      if (String(cur.result.value).indexOf("blecross") < 0) {
        await cdp("Page.navigate", { url: PAGE_URL });
        await sleep(2500);
      }
      logLine("[BRIDGE] ready on http://127.0.0.1:" + BRIDGE_PORT);
      return;
    } catch (e) { /* retry */ }
  }
  console.error("chrome debug port never came up");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  try {
    if (u.pathname === "/eval") {
      const code = u.searchParams.get("code") || "";
      const r = await cdp("Runtime.evaluate", {
        expression: code,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        const txt = d.exception && d.exception.description ? d.exception.description : d.text;
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("page.evaluate: " + txt);
      } else {
        const v = r.result ? r.result.value : undefined;
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(typeof v === "string" ? v : JSON.stringify(v));
      }
    } else if (u.pathname === "/log" || u.pathname === "/logtail") {
      let n = parseInt(u.searchParams.get("n") || "0", 10);
      const out = n > 0 ? logs.slice(-n) : logs;
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(out.join("\n"));
    } else if (u.pathname === "/shot") {
      const r = await cdp("Page.captureScreenshot", { format: "png" });
      const f = path.join(os.tmpdir(), "ble-bridge-shot.png");
      fs.writeFileSync(f, Buffer.from(r.data, "base64"));
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(f);
    } else {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("endpoints: /eval?code= /log /logtail?n= /shot");
    }
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("bridge error: " + e.message);
  }
});

start().then(() => server.listen(BRIDGE_PORT, "127.0.0.1")).catch((e) => { console.error(e); process.exit(1); });
