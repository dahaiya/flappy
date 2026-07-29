# 微信官方广告接入（Flappy）

对齐仓库旁官方示例：`/opt/workspace/liusan/minigame-demo/miniprogram/js/api/AD/`。

## 已接能力

| 类型 | API | 用途 | 默认 adUnit（官方 demo） |
|------|-----|------|--------------------------|
| 激励视频 | `wx.createRewardedVideoAd` | 看广告复活 / 皮肤试用 | `adunit-367ee566b15d46b3` / `adunit-52baa2f38c69b5f7` |
| 插屏 | `wx.createInterstitialAd` | 每 3 局一次 | `adunit-4a474184cd6eb5cc` |

实现文件：`assets/scripts/flappy/AdManager.ts`  
调用：`FbGame3x` 复活、`BirdGameStart3x` 试用皮肤、局数插屏。

## 环境行为

| 环境 | 行为 |
|------|------|
| 浏览器 / Creator 预览 | 全屏 **mock**（倒计时 +「已看完」） |
| 微信开发者工具 **touristappid** | mock（游客播不了你的流量主） |
| 微信 **正式/体验版** + 有效 adunit | 走官方广告；`onClose.isEnded === true` 才发奖 |
| 真广告 `show` 失败 | toast 后 mock 兜底，避免复活按钮假死 |

## 换成你自己的广告位（上线必做）

1. 微信公众平台 → 流量主 → 创建「激励式视频」「插屏」广告位，复制 `adunit-xxxx`。
2. 任选其一：

**A. 改默认（简单）**  
编辑 `AdManager.ts` 里 `AD_DEFAULTS.rewardedAdUnitIds` / `interstitialAdUnitId`。

**B. 运行时注入（不改源码发版）** 在小游戏入口最早执行：

```js
globalThis.__FLAPPY_AD_CONFIG__ = {
  rewardedAdUnitId: 'adunit-你的激励',
  // 或 rewardedAdUnitIds: ['adunit-长', 'adunit-短'],
  interstitialAdUnitId: 'adunit-你的插屏',
};
```

**C. 代码里** `AdManager.configure({ rewardedAdUnitId: 'adunit-...' })`

## 与官方 demo 的对应关系

- create → `onError`（errCode 1000–1008 文案同 demo）→ `load`
- show → 失败则 `load` 再 `show`
- 激励关闭：`res.isEnded` 才算看完
- 关闭后再 `load` 预加载下一条

## 注意

- **官方 demo 的 adunit 绑定 demo 小游戏**，挂到你自己的 AppId 上可能报「广告单元无效 (1002)」。上线必须用自己流量主位。
- 未开通流量主 / 广告位审核中，会走 error 或 mock 兜底。
- 调试：`AdManager.getDebugInfo()` 看当前 unit、是否 tourist、lastError。
