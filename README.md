# Dota2 League

原生 HTML/CSS/JavaScript 前端，Supabase 提供数据库、权限及 Edge Functions。

## 自动比赛抓取开发

`dev/modern-auto-getresult` 基于网页部署分支 `design/modern-league-ui`，移植
`auto-getresult` 的 Steam 账号映射、联赛比赛读取、比赛详情关联、截图及快照归档功能。
保留现代版积分、道具与赛季逻辑。无需新增迁移；复用
`player_external_accounts`、`official_match_assets`、`official_match_snapshots`
及现有比赛/账号 RPC。

只读浏览不会提交截图请求。管理员手动强制同步触发截图工作流；定时任务仍暂停。
导入会检查赛季、选手和胜负；多场相同阵容需要选择关联场次。
英雄/KDA 存入快照表，归档保留源快照，并按校验和写入不可变压缩文件。

## 隔离验证与部署

开发分支不会自动部署数据库或 Edge Functions；部署工作流只允许
`main` 和 `design/modern-league-ui`，手动运行也受分支限制。
**分支隔离不等于数据库隔离**：本地页面的默认配置仍指向现有 Supabase 项目。
进行真实写入验证前，在 `app.js` 加载前设置 `window.__DOTA2SYS_CONFIG__`，
使用独立测试项目的 `projectId`、`supabaseUrl`、`supabaseAnonKey`。
仅允许公开客户端密钥，禁止在前端配置 service-role、Steam 或 GitHub 私密令牌。

隔离测试项目需要先应用现有迁移并部署以下函数：

- `fetch-dota-match`：配置 `STEAM_WEB_API_KEY`；使用用户身份验证与赛季权限校验。
- `request-opendota-screenshot`：记录截图队列；不会自行调度 GitHub Action。
- `trigger-opendota-archive-action`：配置 `GITHUB_SCREENSHOT_DISPATCH_TOKEN`
  和明确的 `GITHUB_SCREENSHOT_REF`，令牌需能调度本仓库工作流。

GitHub 的 `workflow_dispatch` 要求工作流先出现在默认分支；开发分支代码本身
不会完成这项注册。启用前应审查默认分支上的工作流变更。
测试截图工作流需要仓库变量 `SUPABASE_DEV_PROJECT_ID`、`SUPABASE_DEV_URL`
和密钥 `SUPABASE_DEV_SERVICE_ROLE_KEY`，且测试项目必须与
`SUPABASE_PROJECT_ID` 不同。测试归档固定写入触发它的开发分支。
`STEAM_WEB_API_KEY` 用于官方接口，`GITHUB_TOKEN` 用于归档提交。

生产工作流分支由 `OPENDOTA_AUTOMATION_BRANCH` 指定，默认
`design/modern-league-ui`。归档默认写入该分支的 `data/opendota`；
如调整 `SNAPSHOT_ARCHIVE_BRANCH` 或 `SNAPSHOT_ARCHIVE_PREFIX`，应确保网页能读取相应归档。
前端联赛 ID 可通过 `dotaLeagueId` 配置，工作流使用 `DOTA_LEAGUE_ID`；两者应一致。

## 本地检查

使用 Node.js 22.13 或更高版本；回归测试不需要项目 npm 依赖或生产凭据：

```sh
node --check app.js
node --check .github/scripts/capture-opendota-screenshots.mjs
node --test scripts/*.test.cjs scripts/*.test.mjs
node scripts/test-match-power.cjs
```

自动抓取测试用模拟接口覆盖权限、上游回退、月份分页、重复导入、
详情持久化、错误归档及源数据保留。浏览器与离线测试不能证明真实 Steam API、
Supabase RLS 或 GitHub 截图任务已经配置成功。
比赛创建和外部详情关联仍为多个请求；失败时会明确提示已保存的比赛。
跨浏览器同时提交尚无数据库层的原子去重保证，应避免同时导入同一外部比赛。
