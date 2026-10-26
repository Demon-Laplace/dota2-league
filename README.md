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

数据库与 Edge Functions 的生产部署动态跟随 GitHub Pages 的发布分支，
从 Pages API 读取 `source.branch`，不再固定允许 `main` 和 `design/modern-league-ui`。
只有当前发布分支上相关文件的 push 会部署生产环境，其他分支自动跳过。
读取 Pages 配置失败或 Pages 不再使用“Deploy from a branch”时，生产部署会停止。

两个工作流均可在 Actions 中手动运行：选择代码分支，再选择 `target`。
`target` 默认是 `development`，只允许独立测试项目；选择 `production` 时，
代码分支必须仍是 Pages 当前发布分支。部署前会重新校验，防止排队期间切换分支。
数据库与函数按环境共用部署队列，不会因新任务取消正在执行的部署。

生产环境继续使用现有 secrets：`SUPABASE_PROJECT_ID`、`SUPABASE_ACCESS_TOKEN`
和数据库工作流所需的 `SUPABASE_DB_PASSWORD`。测试部署需要额外配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Repository variable | `SUPABASE_DEV_PROJECT_ID` | 独立测试项目 ID，必须不同于生产项目 |
| Repository secret | `SUPABASE_DEV_ACCESS_TOKEN` | 能访问测试项目的 Supabase 令牌 |
| Repository secret | `SUPABASE_DEV_DB_PASSWORD` | 测试项目数据库密码，仅数据库部署需要 |

测试配置缺失时会报错停止，不会回退到生产凭据。测试新功能时，先手动运行
`Deploy Supabase DB`，成功后再运行 `Deploy Supabase Edge Functions`，均选择
开发分支和 `development`。本地页面或独立预览页面也必须连接这个测试项目。

切换 Pages 发布分支前，将生产库已应用的迁移原文件同步到新分支，并确保新分支
包含这些部署工作流、校验脚本及测试。切换后手动运行数据库工作流，选择
`production` 检查并应用迁移，成功后再运行函数工作流。仅修改 Pages 设置不会触发
这里的 push 工作流；切换分支也不会回滚数据库。不要通过修改已应用的迁移记录
来绕过历史检查。工作流还需同步到仓库默认分支，以支持 Actions 的手动运行入口。

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

截图与归档工作流仍独立使用 `OPENDOTA_AUTOMATION_BRANCH`，默认
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
