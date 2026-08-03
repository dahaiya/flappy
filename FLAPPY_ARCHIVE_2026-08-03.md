# 欢乐躲避 / Flappy 存档（2026-08-03）

告一段落，便于日后续做。新小程序另开，勿与本工程混目录。

## 路径

| 用途 | 路径 |
|------|------|
| Cocos Creator 工程 | `/opt/workspace/liusan/flappy_cocos3`（Windows 常对应 `D:\codes\flappy_cocos3` 或 WSL 同步盘） |
| 微信开发者工具打开 | **仅** `D:\codes\flappy-minigame`（小游戏构建产物，不是 Creator 工程） |
| 构建产物同步 | Creator 构建 wechatgame → 同步到 `flappy-minigame` |
| 去水印图标等 | `/tmp/flappy-icons-clean/`、`D:\codes\flappy-icons-clean\` |

## AppID

- 小游戏：`wx2f8fecd8ca0f2a6b`（小游戏类型）
- 另有小程序号 `wx1b5c…` 勿当小游戏用

## 已实现（产品）

- 竖屏 720×1560 铺满；夜空+瓷砖+金属管 Graphics 主题（`SceneThemeArt.ts`）
- 开始页：简单/困难、分享蓝按钮 `33,150,243`、无排行
- 困难：更快更窄、橙管、可上下浮动；布局 both/top/bottom 混合
- 失败页：本局/最高、中文「游戏结束」、返回文字链；面板加高防溢出
- **复活关闭**：`FbGame3x.ts` 内 `ENABLE_REVIVE_AD = false`（未开通流量主）；开通后改 `true` 并同步 minigame `index.*.js`
- 天花板 soft clamp；AABB 锚点；双地面滚动
- 预览包曾手改 `assets/main/index.346a5.js`（主题注入、短管、分享色、关复活）；**Creator 全量重建可能覆盖**，重建后按需重同步

## 域名 / 服务器（腾讯云）

- 域名：`liufacai.cn` / `www` → A `122.51.115.67`（DNSPod）
- Ubuntu + Nginx 测试页：`http://122.51.115.67` 可开
- 域名 HTTP 被「未完成备案」拦截：**管局审核中**（首次备案，约 2026-08-02 提交；步骤 1–4 已过，第 5 步管局审核中）
- 备案通过前不要依赖域名做 request 合法域名；通过后再 HTTPS + API

## 续做清单

1. 备案通过 → 域名可访问 → HTTPS
2. 需要后台：API 子域 + 小游戏 request 合法域名
3. 流量主 → `ENABLE_REVIVE_AD = true` + 广告位
4. 上传代码 → 提审 → 发布
5. 全量 Creator 构建后检查 minigame 是否丢主题/关复活等手补逻辑

## 关键 skill

- `cocos-creator-2d-gameplay`（失败 UI、分包 80051、主题、模式与分享等 references）
