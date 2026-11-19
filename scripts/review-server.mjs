// 확인 화면(레퍼런스 선택, 스토리보드)을 로컬에서 띄우고, 사용자가 화면에서 보낸 답을 파일로 받는다.
// 답을 받으면 표준 출력에 찍고 끝난다. 백그라운드로 실행하면 종료가 곧 "답이 왔다"는 신호다.
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".mp4": "video/mp4" };

// 화면에 넣는 공통 스크립트. send(답) 을 부르면 서버로 보낸다.
// 이 서버(127.0.0.1)가 띄운 화면이 아니면 답을 받을 서버가 없다. 파일로 직접 열었거나 배포한 카탈로그가 그렇다. 그때는 클립보드에 복사한다.
// 클립보드를 쓸 수 없는 브라우저(메신저 안의 브라우저 등)에서는 답을 화면에 적어 손으로 복사하게 한다.
export const CLIENT_JS = `
async function send(payload) {
  const done = (msg) => { document.body.innerHTML = '<p style="font:600 22px/1.6 -apple-system,sans-serif;padding:80px;text-align:center">' + msg + '</p>'; };
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) {
    const text = JSON.stringify(payload, null, 2);
    try { await navigator.clipboard.writeText(text); }
    catch { return done('아래 답을 복사해 Claude 채팅에 붙여 넣으세요.<pre style="font:400 14px/1.6 ui-monospace,Menlo,monospace;text-align:left;white-space:pre-wrap;max-width:720px;margin:24px auto 0;user-select:all">' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>'); }
    return done('답을 클립보드에 복사했습니다. Claude 채팅에 붙여 넣으세요.');
  }
  const r = await fetch('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  done(r.ok ? '전달했습니다. 이 창은 닫아도 됩니다.' : '전달하지 못했습니다. Claude 채팅에 직접 적어 주세요.');
}`;

export function serve(dir, page, outFile, { open = true } = {}) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/submit") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let data;
        try { data = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
        const text = JSON.stringify({ ...data, at: new Date().toISOString() }, null, 2);
        writeFileSync(join(root, outFile), text + "\n");
        res.writeHead(200).end("ok");
        console.log(`답을 받았다 → ${join(root, outFile)}\n${text}`);
        server.close(); server.closeAllConnections();
      });
      return;
    }
    const file = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!(file === root || file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  server.listen(0, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${server.address().port}/${page}`;
    console.log(`확인 화면 ${url}\n사용자가 화면에서 답을 보낼 때까지 기다린다.`);
    if (open) process.platform === "win32" ? execFileSync("cmd", ["/c", "start", "", url]) : execFileSync("open", [url]);
  });
}
