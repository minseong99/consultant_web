// README 에 넣는 화면 사진을 찍는다(docs/images). 화면 없이 띄운 Chrome 을 DevTools 프로토콜로 조작하며 추가 의존성이 없다.
// 쓰는 법: 샘플 데이터 모드 서버를 3001번에 띄운 뒤(USE_MOCK=true npx next build && USE_MOCK=true npx next start -p 3001)
//   node scripts/readme-shots.mjs
// 서버를 새로 띄운 직후에 실행해야 화면 상태가 단계 순서와 맞는다. macOS 의 Google Chrome 경로를 쓴다(CHROME 환경변수로 바꿀 수 있음).
// 실제 고객 정보가 사진에 들어가지 않도록 샘플 데이터 모드에서만 쓴다.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const OUT = process.argv[2] ?? "docs/images";
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "readme-shots-"));
const BASE = "http://localhost:3001";
const PORT = 9333;
const chrome = spawn(process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, (m) => res(m.result ?? m)); ws.send(JSON.stringify({ id, method, params })); });
const size = (width, height, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile });
const go = async (path, wait = 1500) => { await send("Page.navigate", { url: BASE + path }); await sleep(wait); };
const js = async (expression) => (await send("Runtime.evaluate", { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64")); console.log("saved", name); };
const post = (url, body) => `await fetch(${JSON.stringify(url)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})}).then(r=>r.status)`;
const click = (text, scope = "document") => `{const bs=[...${scope}.querySelectorAll('button')]; (bs.find(b=>b.textContent.trim()===${JSON.stringify(text)})||bs.find(b=>b.textContent.includes(${JSON.stringify(text)})))?.click();}`;
await send("Page.enable"); await send("Runtime.enable");
try {
  // 준비: 직원 로그인(샘플 모드는 비밀번호 없음)
  await size(1280, 800); await go("/");
  console.log("login", await js(`return ${post("/api/staff/login", { staff_id: "STAFF-001", password: "" })}`));

  // 2. 접수 (휴대폰)
  await size(390, 844, true); await go("/join");
  await js(`document.querySelector('input[type=checkbox]').click(); await new Promise(r=>setTimeout(r,200)); ${click("다음")} await new Promise(r=>setTimeout(r,700)); ${click("기기를 선택해")} await new Promise(r=>setTimeout(r,900));`);
  await shot("02-join");

  // 3. 고객 상세 브리프
  await size(1280, 800); await go("/staff/customers/CUST-1001", 2500);
  await shot("03-brief");

  // 4. 추천
  console.log("recommend", await js(`return ${post("/api/staff/recommend", { customer_id: "CUST-1001" })}`));
  await go("/staff/customers/CUST-1001", 2500);
  await js(`document.getElementById('customer-tab-recommend')?.click(); scrollTo(0,0);`); await sleep(1200);
  await shot("04-recommend");

  // 1, 5. 직원 화면과 고객 화면을 나란히 (같은 출처의 두 틀)
  console.log("identify", await js(`return ${post("/api/consult", { customer_name: "김서연", phone: "01023456789" })}`));
  await size(1560, 860); await go("/");
  await js(`document.documentElement.style.zoom=''; document.body.innerHTML='<div style="display:flex;gap:28px;align-items:center;justify-content:center;height:100vh;padding:28px;box-sizing:border-box;background:#e7e2db"><iframe id="staff" src="/staff/customers/CUST-1001" style="flex:1;height:100%;border:0;border-radius:18px;box-shadow:0 20px 50px -20px rgba(0,0,0,.35);background:#f7f5f2"></iframe><iframe id="cust" src="/consult" style="width:390px;height:100%;border:10px solid #1c1917;border-radius:44px;box-sizing:border-box;background:#f7f5f2"></iframe></div>';`);
  await sleep(4500);
  await js(`const d=document.getElementById('staff').contentDocument; d.getElementById('customer-tab-recommend')?.click();`);
  await sleep(4000);
  await shot("01-hero");
  await js(`const d=document.getElementById('staff').contentDocument; [...d.querySelectorAll('[aria-label="고객 화면 조작"] button')].find(b=>b.textContent.trim()==='월 요금')?.click();`);
  await sleep(3500);
  await shot("05-remote");

  // 6. 상담 기록
  await size(1280, 800); await go("/staff/customers/CUST-1001", 2500);
  await js(`document.getElementById('customer-tab-record')?.click(); await new Promise(r=>setTimeout(r,400)); ${click("상담 시작")} await new Promise(r=>setTimeout(r,600)); const t=document.getElementById('notes'); const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(t,'Galaxy S26과 5G 스탠다드 69 요금제를 안내. 가격을 가족과 상의한 뒤 다시 방문하기로 함.'); t.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,300)); ${click("상담 기록 저장")}`);
  await sleep(5500); await js(`scrollTo(0,0)`); await sleep(300);
  await shot("06-record");

  // 7. 일정 달력
  await go("/staff/schedules", 2500); await shot("07-schedules");
  // 8. 프로모션
  await go("/staff/promotions", 2500); await shot("08-promotions");
  // 첫 화면
  await size(1280, 720); await go("/", 5500); await shot("00-home");
} finally {
  ws.close();
  chrome.kill();
  fs.rmSync(PROFILE, { recursive: true, force: true });
}
