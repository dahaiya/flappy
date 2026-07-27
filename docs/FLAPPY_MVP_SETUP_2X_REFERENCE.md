# Flappy MVP Setup（2.x 对照参考）

> **本文描述的是旧 2.x / 早期 MVP 能力清单，不是当前 3.8.8 工程的待办。**  
> 当前可运行工程：本仓库根目录；玩法脚本在 `assets/scripts/flappy/`。

## Current status

The Flappy source project now includes:

- local best score storage
- rewarded revive flow once per run
- interstitial display every 3 runs
- tourist-mode ad mocking for development
- a basic difficulty curve
- share hook methods
- leaderboard placeholder hook
- rewarded skin trial local state

## Files changed

- `assets/script/bird_js/ad_manager.js`
- `assets/script/bird_js/skin_manager.js`
- `assets/script/bird_js/bird.js`
- `assets/script/bird_js/bird_game_start.js`
- `assets/script/bird_js/fb_game.js`
- `assets/script/bird_js/pipe_group.js`
- `assets/script/bird_js/pipe_manager.js`

## Required manual scene work

Open `assets/scene/flappy_bird/bird_game.fire` in Cocos Creator and add these two nodes under the `gameOverMenu` node:

1. `reviveBtn`
   - add a `cc.Sprite`
   - add a `cc.Button`
   - place it near the restart button
   - optional text: `REVIVE`

2. `tipsLabel`
   - add a `cc.Label`
   - place it above the buttons or below the result board
   - width should allow one line of Chinese text

3. `shareBtn`
   - button under `reviveBtn`
   - bind to `onShareClick` in game scene or `shareGame` in start scene

4. `rankBtn`
   - button near `shareBtn`
   - bind to `onRankClick` in game scene or `showRankPlaceholder` in start scene

5. optional skin buttons on the start scene
   - call `trialSkin` with `space` or `food`
   - one default button can call `trialSkin` only for trial skins; classic stays default

The runtime code already reads these names. Once they exist, revive UI starts working.

## Ad config

Replace the placeholder IDs in `assets/script/bird_js/ad_manager.js`:

- `replace-with-your-rewarded-adunit`
- `replace-with-your-interstitial-adunit`

## App config

In WeChat DevTools, replace the project AppID from tourist mode to your real mini-game AppID.

## Recommended next tasks

1. Replace all third-party art and audio assets before release.
2. Add share hooks and a friend leaderboard entry point.
3. Add one more ad-based reward such as a score multiplier or skin trial.

## Suggested button labels

- `reviveBtn`: `立即复活`
- `shareBtn`: `晒成绩`
- `rankBtn`: `好友排行`
- `space` trial button: `试用太空皮肤`
- `food` trial button: `试用美食皮肤`
