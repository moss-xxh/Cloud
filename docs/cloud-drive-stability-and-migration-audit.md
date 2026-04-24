# 云盘项目稳定性与换底方案审计报告

- 审计日期：2026-04-24
- 审计范围：`/root/projects/cloud-drive/vue3-project`（git HEAD `7e5227d`）
- 审计目标：
  1. 判断 **Vue3 + FileBrowser** 方案继续优化的可行性；
  2. 评估 **Nextcloud / Seafile 换底** 方案的落地代价；
  3. 给出明确技术路线推荐与下一步可执行计划。
- 约束：本轮仅做审计产出，不改业务代码、不部署、不重启服务。

---

## 0. 结论先给（TL;DR）

| 事项 | 结论 |
|---|---|
| 当前前端是否存在硬 bug | **存在**（DriveView 模板嵌套错乱、重复 Teleport、AuthImage 每次刷新重下全文件、无统一错误处理） |
| FileBrowser 作为后端的架构天花板 | **低**：无分块上传、无缩略图服务、无版本、无多用户权限、无外链密码/过期、无真实"共享给我"模型 |
| 单靠优化前端能否达到"成熟云盘"水准 | **不能**。多数 P0/P1 问题根因在后端能力，而不是 Vue 代码 |
| **推荐路线** | **A：Nextcloud 换底 + 保留 Vue 前端骨架**（~70% 代码可复用），Seafile 为备选 |
| B 路线（继续优化）是否可行 | 可行，但只适合"个人/极小团队"场景，2–3 周稳定化工作可交付一个能日常用的版本，但到不了 Google Drive 水准 |

---

## A. 代码与架构审计

### A.1 技术栈 & 项目结构

- **前端**：Vue 3.5 + Vue Router 4.6 + TypeScript 5.9（strict）+ Tailwind v4 + Vite 7；无 Pinia、无 axios、无 UI 库。
- **后端（由网络特征推断）**：FileBrowser（`/api/login` 返回纯文本 token、`/api/resources/*`、`X-Auth` 请求头、`/api/search/*` 返回 NDJSON、`/api/share`、`/api/raw`、`/api/usage`）。详见 `src/api/index.ts:13–293`。
- **入口**：`index.html` → `src/main.ts` → `src/App.vue` → `router` → `AppLayout.vue`（外壳）→ `DriveView / SearchView / TrashView / SharedView(stub) / StarredView(stub) / LoginView`。
- **路由 base**：`/cloud/`（`vite.config.ts:6`、`router/index.ts:4`）。
- **代理**：Vite dev 代理 `/api → 127.0.0.1:8090`（FileBrowser 默认端口），`vite.config.ts:8–11`。

### A.2 源码规模

```
DriveView.vue      860 行（过大，职责混杂）
FilePreview.vue    273
ContextMenu.vue    261
AppLayout.vue      245
MoveModal.vue      209
SearchView.vue     175
NewMenu.vue        165
ShareDialog.vue    149
TrashView.vue      138
UploadToast.vue    100
LoginView.vue       69
AuthImage.vue       24
SharedView.vue       7（占位）
StarredView.vue      7（占位）
```

### A.3 架构现状

1. **无状态管理**：所有状态散落在组件 `ref` 内；父子传递靠 props/emit，跨组件靠 `window.dispatchEvent('drive:refresh' | 'drive:upload-*')`。
2. **鉴权**：JWT 存 `localStorage.auth_token`，每请求手工 `X-Auth` 头（`api/index.ts:7–11`）。仅 `getResources` 对 401 做重定向（`api/index.ts:30–33`），其它 API 不一致。
3. **错误处理**：一律抛 `new Error(statusText)`，UI 层统一 `alert(...)`/`prompt(...)`/`confirm(...)`。无 toast 统一层，无重试。
4. **上传**：裸 `XMLHttpRequest`（`api/index.ts:114–148`），无分块、无断点续传、单文件串行。
5. **预览**：`FilePreview.vue` 直接 `fetch → blob`，整文件入内存，视频/PDF 大文件会爆内存。
6. **缩略图**：`AuthImage.vue` 对每张图片下载完整原图做 `objectURL`，列表页无缓存、无缩略图服务。
7. **跨组件通信**：`CustomEvent` + 全局事件总线（`UploadToast.vue:56–67`、`DriveView.vue:393–416`、`NewMenu.vue:96–105`）。简单但脆弱，事件名字符串、无类型约束。

### A.4 具体问题清单（按严重度排序）

#### A.4.1 硬 Bug（必须修）
| # | 位置 | 问题 | 影响 |
|---|---|---|---|
| B1 | `DriveView.vue:524–564` + `:820–859` | "详情抽屉" `Teleport` 被**复制了两份**，其中一份错误嵌入到了面包屑 `<template v-for>` 内部，模板结构 `</template>` 提前闭合。Vue 仍能编译（因模板容错），但有隐性渲染风险 | 未来模板变动极易触发 hydration/渲染异常 |
| B2 | `FilePreview.vue:143–146` | `loadTextContent()` 在 `onMounted` 中被连续调用两次 | 文本预览打开时发起两份请求 |
| B3 | `api/index.ts:208–213` `getAuthRawUrl` | 将 `auth=token` 拼到 query，用于下载/新窗口预览 | **Token 泄漏**至浏览器历史、代理日志、Referer |
| B4 | `api/index.ts:68–80` `moveToTrash` | 每次先 `createFolder('.trash')`，捕获后忽略 | 每次删除多一次请求；并且 `.trash` 命名和 FileBrowser 隐藏目录冲突 |
| B5 | `api/index.ts:82–96` `parseTrashName` | 以 `__FROM__` 作为分隔符；文件名含此串时解析错误 | 还原到错误目录 |
| B6 | `DriveView.vue:142–151` HTML 预览 | 单独分支用 `fetch → blob → window.open`，逻辑和 `FilePreview` 重复 | 双实现 |
| B7 | `TrashView.vue:34–41` `handleRestore` | 若原目录已被删除，`moveResource` 会 404，无目录自动重建 | 还原失败不可控 |
| B8 | `api/index.ts:158–185` `searchFiles` | NDJSON 解析不做 schema 校验，任何字段异常 `JSON.parse` 抛出会中断整页 | 脆弱 |
| B9 | 全局 `alert/confirm/prompt` | `DriveView.vue:170/194`、`ContextMenu.vue:43/61`、`TrashView.vue:44/54`、`MoveModal`、`NewMenu` 等 | 阻塞 UI、移动端体验差、样式不统一 |
| B10 | `AuthImage.vue:7–18` | 每次 path 变化都重新 `fetch → blob`，无 LRU/disk 缓存；大量缩略图切换时浪费带宽 | 列表翻页/刷新卡顿 |

#### A.4.2 架构问题（FileBrowser 能力天花板，前端不可修）
| # | 能力 | 现状 | 根因 |
|---|---|---|---|
| C1 | 分块/断点续传上传 | 单 XHR 整文件 | FileBrowser 不支持 tus/分块协议 |
| C2 | 缩略图服务 | 下载原图切 objectURL | FileBrowser 无 thumb endpoint |
| C3 | 文件版本 | 无 | FileBrowser 无版本模型 |
| C4 | 多用户 / 权限 / ACL | LoginView 默认 admin/固定密码；无用户管理 UI | FileBrowser 用户系统简单（仅用户+可写根目录） |
| C5 | 外链密码 / 过期 | `shareResource` POST `{}` 空 body | FileBrowser 原生支持，但当前前端未接入 |
| C6 | "共享给我" | `SharedView.vue` 是占位页 | FileBrowser 没有"用户间互相分享"模型，只有"公开外链" |
| C7 | 星标 / 收藏 | `StarredView.vue` 是占位页 | 后端无此 meta 存储 |
| C8 | 回收站 | 自造 `.trash/__FROM__<encoded>` 命名方案 | FileBrowser 无回收站 |
| C9 | 内容全文搜索 / OCR | 仅文件名匹配 | FileBrowser 搜索仅 filename |
| C10 | 在线编辑 / 协同 | 无 | 无 Office/OnlyOffice/Collabora 集成点 |
| C11 | 审计日志 | 无 | 不支持 |
| C12 | 桌面/移动端同步客户端 | 无 | FileBrowser 无官方 sync client |
| C13 | 文件夹 zip 下载 | 无 | FileBrowser 无 server-side zip（社区版缺失） |
| C14 | WebDAV / CalDAV 等标准协议 | 无 | 无 |

### A.5 区分：前端可修 vs 后端天花板

- **纯前端可修**：B1–B10、状态管理改造、toast/dialog 替换、DriveView 拆分、批量操作并发控制、事件总线改 Pinia、缩略图 LRU 缓存、Token 泄漏修复、单测骨架。
- **需换后端或加中间层**：C1–C14（分块上传、权限、版本、协同、真共享、同步客户端、全文搜索、在线编辑、审计等）。

---

## B. 产品成熟度审计（对标 Google Drive / 成熟云盘）

### B.1 差距矩阵

| 维度 | Google Drive / 成熟云盘 | 本项目现状 | 级别 |
|---|---|---|---|
| 上传稳定性（大文件/断网续传） | tus/resumable + 并发 | 单 XHR 整文件 | **P0 / C** |
| 缩略图/预览加速 | 服务端生成多分辨率 | 下载原图 | **P0 / C** |
| 错误反馈 | Toast + 重试 + 埋点 | `alert()` | **P0** |
| 状态一致性 | 乐观更新 + rollback | 每次操作后重拉列表 | **P0** |
| 文件夹下载 | 服务端打包 zip 流 | 无 | **P1 / C** |
| 回收站 | 服务端一级能力，含配额/过期策略 | 前端造 `.trash` 目录 | **P1 / C** |
| 搜索 | 全文 / OCR / 图像内容 | 文件名前缀匹配 | **P1 / C** |
| 共享（外链） | 密码、过期、只读/可写、可撤销 | 仅生成 hash，无密码/过期 | **P0** 前端未接入 |
| 共享给我 | 是一等公民，含权限继承 | 占位页 | **P2 / C** |
| 星标/收藏 | 用户元数据 | 占位页 | **P2 / C** |
| 用户/组/ACL | 细粒度 | 单管理员 | **P1 / C** |
| 版本历史 / 恢复 | 每次写入产生版本 | 无 | **P1 / C** |
| 在线协同编辑 | Docs/Sheets/Slides | 无 | **P2 / C** |
| 快捷键 | 丰富（`n` 新建、`/` 搜索、`del` 删除…） | 仅 Esc/左右（预览内） | **P1** |
| 拖拽移动 / 跨窗口拖拽 | 支持 | 仅拖入上传 | **P1** |
| 移动端 | 原生 App + 响应式 | 仅响应式 | **P1** |
| 2FA / SSO | 标配 | 无 | **P1 / C** |
| 审计 / 告警 | 有 | 无 | **P2 / C** |
| 桌面同步 | 官方客户端 | 无 | **P2 / C** |
| i18n | 多语言 | 中文硬编码 | **P2** |
| 可访问性（a11y） | ARIA / 键盘导航 | 基本无 | **P1** |
| 暗黑模式 | 支持 | 无 | **P2** |

> 标注 **/C** 表示该差距是 FileBrowser 架构天花板（前端单独无解）。

### B.2 优先级分桶

- **P0（稳定性必修，前端能修）**：B1–B10、错误反馈体系、Token 泄漏、AuthImage 缓存、上传进度一致性、统一 dialog 组件、`DriveView.vue` 拆分。
- **P0（稳定性必修，但需后端或中间层）**：分块/断点续传、缩略图服务、外链密码/过期对接（FileBrowser 支持但前端未用）。
- **P1（体验提升）**：快捷键、拖拽移动、批量操作可视化、星标/共享实现、文件夹 zip 下载、暗黑模式、可访问性。
- **P2（架构换底才能做）**：在线协同编辑、多用户 ACL、版本历史、桌面同步客户端、全文/OCR、审计。

---

## C. A/B 路线裁决

### C.1 对比矩阵

| 维度 | **A. Nextcloud / Seafile 换底**（推荐） | **B. 继续 Vue + FileBrowser 优化** |
|---|---|---|
| 适用目标 | 多用户团队云盘、需 ACL / 版本 / 在线编辑 / 同步客户端 | 个人或 ≤5 人小团队、只做"共享文件夹 + Google Drive 外观" |
| 交付能力（开箱） | 用户/组/ACL、WebDAV、外链（密码/过期/只读）、版本、回收站、OCS Share API、Office 在线编辑（Collabora/OnlyOffice 插件）、2FA、审计、桌面/移动客户端 | 基础 CRUD + 自造回收站 + 简易外链；P2 能力全部需要自研 |
| 前端复用率 | **~70%**：组件树全部保留，只需重写 `src/api/index.ts`（~300 行）将 FileBrowser API 映射到 OCS + WebDAV | 100% 保留 |
| 后端工作量 | 部署 Docker 镜像 + 持久卷 + 反向代理 + DB（1–2 天 POC；1 周完成 SSO/共享/版本验证） | 无（现有） |
| 数据迁移 | 直接挂载现有存储目录到 Nextcloud data 或 rsync + `occ files:scan` 即可 | 无 |
| 分块/断点续传 | 原生（Nextcloud 支持 chunked upload v2；Seafile 原生 block 协议） | 需前端自造，或引入 tus 服务（增 1 个组件） |
| 外链能力（密码/过期/只读/上传收集） | OCS Share API 原生 | FileBrowser 原生也有，但前端需重做 `ShareDialog` |
| 协同/在线编辑 | 插件化接入 Collabora/OnlyOffice | 需自研或接入 OnlyOffice DocEditor（含签发 JWT） |
| 同步客户端 | 官方 Windows/macOS/Linux/iOS/Android | 需自建 |
| 权限模型成熟度 | 高（组、共享权限、"仅下载"、有效期、提醒） | 无 |
| 可维护性 / 社区活跃 | Nextcloud：★★★★★ 大；Seafile：★★★★ | FileBrowser：★★★ 社区项目，功能迭代慢 |
| 合规 / 审计 / 备份 | 支持 | 无 |
| CJK / 本土化 | Nextcloud 完整；Seafile 起源即中文 | 有，但自己维护 |
| 主要风险 | （1）auth 模型切换：Session cookie vs 现 JWT；（2）CORS 配置；（3）UI 既有"类 Google Drive"定制需映射到 OCS 的"Share"和"Favorite"模型 | （1）持续堆补丁；（2）多用户需求到来时推翻重来；（3）FileBrowser 不能承载产品后续演进 |
| 时间成本 | 1 周 POC + 2 周前端 API 适配 + 1 周灰度 = ~4 周 | 2–3 周稳定化，但永远到不了"Google Drive 体验" |
| 长期成本 | 低（社区维护组件） | 高（所有高级能力自研） |
| 回滚 | Vite 代理切回 `:8090` + 旧前端打包即可 | N/A |

### C.2 Nextcloud vs Seafile（A 路线内部）

| 维度 | Nextcloud | Seafile |
|---|---|---|
| 协议/API | OCS + WebDAV（富） | seafile-api（偏自有） |
| 在线编辑 | Collabora / OnlyOffice 成熟 | 偏弱（依赖 OnlyOffice） |
| 大文件/海量文件性能 | 中 | **强**（block-level dedup、GC） |
| 部署体量 | 大（PHP + Apache + Redis + DB） | 小（Go/Python，轻量） |
| 前端适配难度 | 稍高（WebDAV 语义） | 中（API 较私有） |
| 社区 / 插件市场 | **★★★★★** | ★★★ |
| 中文运维资料 | 多 | 多 |

**推荐**：若"协同编辑 / 多用户 / 插件生态"优先 → **Nextcloud**；若"超大仓库 + 同步客户端 + 去重"优先 → Seafile。本项目当前 UI 偏 Google Drive（强调共享/预览/编辑），**Nextcloud 更契合**。

### C.3 明确推荐

**推荐路线：A（Nextcloud 换底），保留当前 Vue 前端骨架**。

原因（不是模棱两可）：
1. 现有"稳定性问题"不全是前端 bug：分块上传、缩略图、版本、回收站、外链密码/过期 这些 P0/P1 能力在 FileBrowser 上**永远没法彻底解决**。继续优化 B 只是补丁叠补丁。
2. 前端投入可继承：2700 LOC 的 Vue 代码组件结构合理，只需重写 `src/api/index.ts` 一个文件（~300 行）对接 OCS + WebDAV，视觉层面无需改动。
3. Nextcloud 是同类产品的工业级底座（含高校/政企用户），风险可控、社区活跃、插件化扩展在线编辑/审计/2FA 零成本。
4. 落地门槛低：docker-compose 一把梭 POC、现有存储目录可 `occ files:scan` 无损挂载。

若因时间紧迫**只能继续 B**：也给出 2–3 周稳定化拆分（见 D.2），但定位为"**过渡方案**"，12 个月内必须做 A。

---

## D. 下一步可执行计划

### D.1（推荐）A 路线：Nextcloud 换底 POC + 迁移

#### D.1.1 POC 部署（T+3d）

1. **容器编排**（新建 `docker-compose.yml`，**本轮不执行**）
   - `nextcloud:stable`（Apache 变体）
   - `mariadb:10.11`（或复用现有 PG）
   - `redis:7`（缓存/文件锁）
   - `collabora/code` 或 `onlyoffice/documentserver`（按选型）
2. **反向代理**：现有 `/cloud/` base 改指向 Nextcloud 的 `/` 即可；保留 `/api/*` 仅供旧 FileBrowser 读路径在迁移期并存。
3. **数据挂载**：把 FileBrowser 根目录作为 Nextcloud 的外部存储（`files_external` 应用）或直接作为 `/var/www/html/data/<user>/files/` 并执行 `occ files:scan --all`。
4. **用户/权限初始化**：建立 `admin` + 普通用户 + `drive-users` 组；默认共享权限收敛到只读。

#### D.1.2 前端 API 适配（T+1w ~ T+2w）

**关键文件**：`src/api/index.ts`（单点重写），`src/types/index.ts`（增加 Share/Version 类型），新增 `src/api/webdav.ts`。

| 现 API（FileBrowser） | 映射到（Nextcloud） |
|---|---|
| `POST /api/login` (return token) | `HEAD /remote.php/dav/files/<user>/` + Basic Auth（首次），后续用 Session Cookie 或 App Password |
| `GET /api/resources/<path>` | `PROPFIND /remote.php/dav/files/<user>/<path>` |
| `DELETE /api/resources/<path>` | `DELETE /remote.php/dav/...` |
| `PATCH ?action=rename` | WebDAV `MOVE` header `Destination:` |
| `POST /api/resources/<path>/` 建目录 | WebDAV `MKCOL` |
| `POST /api/resources/<path>?override=true` 上传 | `PUT /remote.php/dav/...` + chunked v2（分块上传） |
| `GET /api/raw/<path>` | `GET /remote.php/dav/...`（带 thumbnail 时走 `/index.php/core/preview`） |
| `GET /api/usage` | `GET /ocs/v1.php/cloud/user`（quota 字段） |
| `GET /api/search/<path>?query=` | `REPORT /remote.php/dav/files/<user>/` + `nc:search-files` 或 `/ocs/v2.php/search/providers/files/search` |
| `POST /api/share/<path>` | `POST /ocs/v2.php/apps/files_sharing/api/v1/shares` |
| `GET /api/shares` / `DELETE /api/share/<hash>` | `GET` / `DELETE /ocs/v2.php/apps/files_sharing/api/v1/shares` |
| **自造 `.trash` 回收站** | **删除** → `/remote.php/dav/trashbin/<user>/trash/`（`TrashView.vue` 逻辑大幅简化） |
| **本地收藏/星标** | Nextcloud `<nc:favorite>` PROPPATCH / `GET /ocs/v2.php/apps/files/api/v1/tags/_$!<system>!$_/favorites` |

伴随调整：
- `AuthImage.vue` 切换到 `/index.php/core/preview?fileId=<id>&x=256&y=256`，**服务端缩略图**；无需再下载原图。
- `UploadToast.vue` / `uploadFile` 改为 **chunked v2**：`MKCOL /uploads/<user>/<tx>/` → 多段 `PUT` → `MOVE` 到目标。
- `ShareDialog.vue` 扩展：密码、过期、权限位（read/update/create/delete/share）。
- `ContextMenu.vue` 增加"版本历史"、"添加到收藏"、"切换只读"。
- 路由守卫：401 处理从 `/cloud/login` 改为引导到 Nextcloud 登录或内嵌 iframe；保留原有 `/login` 自有页以做 OCS 登录代理。

#### D.1.3 数据迁移策略

- **就地挂载**（首选）：停写 1 小时 → 文件原位置不动 → Nextcloud 以外部存储方式接入 → `occ files:scan --path=<group>` 构建索引 → 切流量。
- **rsync 迁移**（若需换盘）：`rsync -aAXHS` 到新卷 → `files:scan` → 校验 checksum → 切流量。
- **共享链接**：现有 `/api/share/<hash>` 旧链逐步过期；新链走 Nextcloud。提供 30 天兼容层（旧 FileBrowser 仅保留 `/share/*` 只读路径）。

#### D.1.4 回滚方案

- 保留 FileBrowser 镜像和数据只读副本 ≥ 30 天。
- Vite 代理切换层做一次性前端 feature flag：`VITE_BACKEND=filebrowser|nextcloud`，两套 API 共存一个构建，通过环境变量一键切回。
- 数据：就地挂载方案下，文件没有搬家，回滚只需撤销 Nextcloud → 直接用旧前端读即可。

#### D.1.5 验收清单

- [ ] 登录（admin + 普通用户）、2FA（可选）
- [ ] 文件 CRUD + 目录创建/移动/重命名
- [ ] 分块上传 ≥ 5 GB 单文件成功；断网续传 OK
- [ ] 回收站（Nextcloud 原生）—— 还原/永久删除
- [ ] 外链：密码 + 过期 + 只读；权限撤销后链接失效
- [ ] 服务端缩略图在 1000 张图片的目录下列表加载 < 1.5s
- [ ] 版本历史：覆盖写后可回滚；磁盘占用受配置约束
- [ ] 全文/文件名搜索
- [ ] 在线编辑 docx/xlsx（若启用 Collabora）
- [ ] 配额统计与 Drive 实际占用一致
- [ ] 审计日志记录登录/下载/分享创建
- [ ] 回滚演练：切回 FileBrowser 后前端可用

### D.2（备选）B 路线：继续优化的稳定性清单

> 仅当 A 路线因资源/时间不可行时作为过渡。

#### P0（1 周，稳定性必修）
1. **修 `DriveView.vue` 模板嵌套错乱**（B1）：拆分成 `DriveToolbar.vue` / `DriveGrid.vue` / `DriveList.vue` / `DriveDetailDrawer.vue` / `DriveQuickMenu.vue`；删掉重复 Teleport。
2. **统一错误/确认 UI**（B9）：新增 `composables/useDialog.ts` + `components/AppDialog.vue`、`components/AppToast.vue`，全量替换 `alert/confirm/prompt`。
3. **Pinia 引入**（避免 `window.dispatchEvent` 事件总线）：
   - `stores/auth.ts`：token/登录态/401 拦截
   - `stores/files.ts`：当前目录、选择、排序、视图模式
   - `stores/upload.ts`：队列、进度、取消、重试
4. **Token 泄漏修复**（B3）：所有 `/api/raw` 统一走 `fetch(... X-Auth ...)` → blob → objectURL；移除 `auth=` query；下载走 `<a download>` + blob。
5. **`AuthImage` LRU 缓存**（B10）：`composables/useBlobCache.ts` Map + size 限制；同 path 只下载一次；对大图改请求 `Range: bytes=0-0` 作为 probe 再决定是否加载。
6. **错误边界 + 401 统一拦截**：新增 `api/http.ts` 包装 `fetch`，401 → 清 token + 跳转；网络错误 → toast；5xx → 退避重试（最多 2 次）。
7. **`FilePreview.vue` 重复调用修复**（B2）。
8. **`.trash` 方案修复**（B4/B5）：分隔符改成 ASCII 31（不可打印，用户不可能输入）或存于 sidecar JSON；`moveToTrash` 先探测再 `createFolder`；`restoreFromTrash` 在目标不存在时 `MKCOL` 补建。

#### P1（1–2 周，体验）
9. **`ShareDialog` 扩展密码/过期/只读**：把 FileBrowser 现有字段接入（body `{expires, password, permissions}`，参考 FileBrowser `shares` API）。
10. **分块上传**：引入 tus 协议，或自造 `Range` 分块 + 客户端重组；大文件 / 断网场景可重试。
11. **文件夹 zip 下载**：需 FileBrowser 开启 `Create share archive`；若开启，则前端新增"下载为 zip"。
12. **快捷键**：`n` 新建、`/` 搜索、`Del` 删除、`Ctrl+A` 全选、`F2` 重命名、`Ctrl+C/V` 复制/粘贴（映射为 copy/move）。
13. **拖拽移动（drag-to-move）**：HTML5 DnD，目标为同视图的文件夹或侧栏。
14. **`SharedView` 实现**：FileBrowser 没"共享给我"的概念；仅能实现"我创建的分享列表"——把 `GET /api/shares` 接到 `SharedView`，展示/撤销。
15. **`StarredView` 实现**：`composables/useStars.ts` + `localStorage`（用户级）or FileBrowser 扩展元数据接口（需后端改）。
16. **文件夹面包屑右键菜单**、**多选 Shift 区间稳定化**、**列表排序状态持久化**（已有视图模式持久化，缺排序）。
17. **在列表/网格内内嵌重命名**（替代 `prompt`）。

#### P2（暂不做，属架构换底范畴）
版本、协同编辑、多用户 ACL、OCR、桌面同步。

#### 测试策略
- 引入 **Vitest + Vue Test Utils**：对 `composables/*`、`api/*` 做纯函数单测（`parseTrashName`、`formatSize`、`encodeURIComponent` 路径拼接）。
- **Playwright** E2E（可选）：登录 → 上传 5MB+100MB → 下载 → 预览图片/PDF/文本 → 重命名/移动/删除/还原 → 创建/复制/撤销分享。
- 构建关卡：`npm run build`（当前已通过）+ `vue-tsc --noEmit` 纳入 CI。

---

## E. 关键决策点（留给主 stakeholder）

1. **业务场景定义**：个人云盘（B 足够） vs 团队云盘（A 必选）？当前 UI（共享/星标/共享给我）暗示目标是团队云盘。
2. **在线协同编辑是否必需**：是 → A + Collabora/OnlyOffice；否 → 可在 B 上先跑一年。
3. **同步客户端是否必需**：是 → A（Nextcloud/Seafile 官方客户端）；否 → B 可撑。
4. **人力**：A 路线建议 1 前端 + 0.5 运维 x 4 周；B 路线 1 前端 x 3 周，但只是"过渡稳定化"。

---

## F. 审计环节的只读命令留痕

- `npm run build`：应在最后一步重跑并确认通过（见本次验收章节）。
- 未运行 `npm run dev`；未触发任何部署；未读取 `.env*`；未打印任何密钥。

---

## 附录 1：`src/api/index.ts` → Nextcloud 映射速查表

见 §D.1.2 表格。

## 附录 2：FileBrowser API 观察清单

从源码推断的 FileBrowser endpoints（均位于 `:8090`）：
- `POST /api/login` → text token
- `GET /api/resources/<path>` → JSON listing
- `POST /api/resources/<path>/` → MKCOL
- `POST /api/resources/<path>?override=true` → 上传（multipart `files`）
- `DELETE /api/resources/<path>`
- `PATCH /api/resources/<path>?destination=&action=rename`
- `GET /api/raw/<path>[?inline=false][&auth=<token>]`
- `GET /api/usage`
- `GET /api/search/<path>?query=` → NDJSON
- `POST /api/share/<path>` → `{hash}`
- `GET /api/shares` → `[{hash,path,expire}]`
- `DELETE /api/share/<hash>`

## 附录 3：本次审计未改动的文件

无。本报告为只读产出，未修改任何业务代码。
