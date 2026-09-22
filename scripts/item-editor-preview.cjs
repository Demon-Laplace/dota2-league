// Local, isolated UI fixture. No credentials, API calls or database writes.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const assets = new Set(["/style.css", "/modern-ui.css", "/obsidian-ui.css", "/src/ui/item-editor.css",
  "/src/domain/item-rules.js", "/src/config/item-options.js", "/src/ui/item-editor.js"]);
http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (assets.has(url.pathname)) {
    res.setHeader("Content-Type", url.pathname.endsWith(".css") ? "text/css" : "text/javascript");
    res.end(fs.readFileSync(path.join(root, url.pathname.slice(1))));
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/modern-ui.css"><link rel="stylesheet" href="/obsidian-ui.css">
    <link rel="stylesheet" href="/src/ui/item-editor.css">
    <main style="max-width:${url.searchParams.has("mobile") ? "360" : "720"}px;margin:24px auto;padding:16px">
    <h2>道具编辑器 · 本地测试（不会保存数据）</h2><div id="adminItemCatalogEditorPanel" class="item-management-editor item-rule-editor"></div>
    <output id="testResult"></output></main>
    <script src="/src/domain/item-rules.js"></script><script src="/src/config/item-options.js"></script><script src="/src/ui/item-editor.js"></script>
    <script>
      LeagueItemEditor.update("admin");
      adminItemStackMultiplierList.innerHTML = LeagueItemEditor.stackControl({multiplier:4,specialToken:""}, "admin", "test", "测试组合道具", true);
      adminSaveItemBtn.onclick=()=>{testResult.textContent=JSON.stringify({mode:adminItemResolutionModeSelect.value,multiplier:adminItemScoreMultiplierInput.value})};
    </script></html>`);
}).listen(4173, "127.0.0.1", () => console.log("Isolated editor preview: http://127.0.0.1:4173"));
