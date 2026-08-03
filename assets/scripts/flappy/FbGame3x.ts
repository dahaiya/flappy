import { _decorator, BlockInputEvents, Camera, Color, Component, director, find, Graphics, Label, Node, Sprite, SpriteAtlas, Tween, tween, UIOpacity, UITransform, Vec3, resources } from 'cc';
import AdManager from './AdManager';
import SkinManager from './SkinManager';
import { Bird3x, BirdState } from './Bird3x';
import { applyCuteYellowBird } from './CuteBirdArt';
import { getDifficultyMode, type DifficultyMode } from './BirdGameStart3x';
import { PipeManager3x } from './PipeManager3x';
import { Scroller3x } from './Scroller3x';
const { ccclass, property } = _decorator;

declare const wx: any;

function ensureUIOpacity(node: Node) {
  let opacity = node.getComponent(UIOpacity);
  if (!opacity) {
    opacity = node.addComponent(UIOpacity);
  }
  return opacity;
}

function getUITransform(node: Node | null) {
  return node?.getComponent(UITransform) || null;
}

const STORAGE_KEYS = {
  bestScore: 'flappy_best_score',
  playCount: 'flappy_play_count',
};

@ccclass('FbGame3x')
export class FbGame3x extends Component {
  @property
  goldScore = 20;

  @property
  silverScore = 10;

  /** 管道开口：更大 = 柱子挡路更短、更好过 */
  @property
  easySpacingMin = 250;

  @property
  easySpacingMax = 300;

  @property
  hardSpacingMin = 210;

  @property
  hardSpacingMax = 250;

  /** 管道水平速度（负=向左），绝对值更小 = 更慢更好躲 */
  @property
  basePipeSpeed = -190;

  @property
  maxPipeSpeed = -280;

  @property(PipeManager3x)
  pipeManager: PipeManager3x | null = null;

  @property(Bird3x)
  bird: Bird3x | null = null;

  @property(Label)
  scoreLabel: Label | null = null;

  @property(Node)
  maskLayer: Node | null = null;

  @property(Node)
  ground: Node | null = null;

  @property(Node)
  readyMenu: Node | null = null;

  @property(Node)
  gameOverMenu: Node | null = null;

  @property(Node)
  pauseBtn: Node | null = null;

  /** True while the run is paused (pipes/bird/scroller frozen). */
  isPaused = false;

  private score = 0;
  private bestScore = 0;
  private playCount = 0;
  private revivedThisRun = false;
  private gameOverShown = false;
  private pauseOverlay: Node | null = null;
  private pauseBtnLabel: Label | null = null;
  private wasPipeRunningBeforePause = false;
  private gameOverBackdrop: Node | null = null;
  private gameOverPanel: Node | null = null;
  private difficultyMode: DifficultyMode = 'easy';
  private reviveFlashTween: Tween<UIOpacity> | null = null;

  onLoad() {
    this.bestScore = this.getStoredNumber(STORAGE_KEYS.bestScore);
    this.playCount = this.getStoredNumber(STORAGE_KEYS.playCount);
    this.difficultyMode = getDifficultyMode();
    this.revivedThisRun = false;
    this.score = 0;
    this.isPaused = false;
    this.gameOverShown = false;
    if (this.scoreLabel) {
      this.scoreLabel.string = String(this.score);
    }
    if (this.gameOverMenu) {
      this.gameOverMenu.active = false;
    }
    this.bird?.init(this);
    AdManager.init();
    // 竖屏铺满：旧包场景可能仍是 960x640，背景会被裁成一条
    this.fitPlayfieldToCanvas();
    // 先绑输入/Ready，再改外观，避免外观逻辑抛错导致「点了没反应」
    this.localizeReadyMenu();
    this.disablePauseUi();
    this.enableInput(true);
    this.applyCustomBirdLook();
    this.applyCurrentSkin();
    this.revealScene();
  }

  /**
   * 按当前 Canvas 铺满背景/地面；若场景仍是横版矮画布，抬到 720x1560。
   * 解决真机「只有蓝底、看不到背景图」+ 地面悬空。
   */
  fitPlayfieldToCanvas() {
    const canvas = find('Canvas') || this.node;
    if (!canvas?.isValid) {
      return;
    }
    const cui = canvas.getComponent(UITransform) || canvas.addComponent(UITransform);
    let w = cui.width || 720;
    let h = cui.height || 1560;
    // 旧 bird_game 是 960x640：竖屏下只占一条，背景贴图盖不住
    if (h < w * 1.15) {
      w = 720;
      h = 1560;
      cui.setContentSize(w, h);
    }

    const camNode = canvas.getChildByName('Camera');
    const cam = camNode?.getComponent(Camera);
    if (cam) {
      cam.orthoHeight = h / 2;
    }

    const bg = canvas.getChildByName('background');
    if (bg?.isValid) {
      const bui = bg.getComponent(UITransform) || bg.addComponent(UITransform);
      bui.setContentSize(w, h);
      bg.setPosition(0, 0, 0);
      const sp = bg.getComponent(Sprite);
      if (sp) {
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.enabled = true;
      }
    }

    const groundH = Math.max(170, Math.min(220, h * 0.13));
    const groundY = -h / 2 + groundH / 2;
    for (const name of ['ground', 'groundLong'] as const) {
      const g = canvas.getChildByName(name);
      if (!g?.isValid) {
        continue;
      }
      const gui = g.getComponent(UITransform) || g.addComponent(UITransform);
      gui.setContentSize(w, groundH);
      g.setPosition(name === 'groundLong' ? w : 0, groundY, 0);
    }

    const mask = canvas.getChildByName('maskLayer');
    if (mask?.isValid) {
      getUITransform(mask)?.setContentSize(w, h);
    }
    if (this.scoreLabel?.node?.isValid) {
      this.scoreLabel.node.setPosition(0, h / 2 - 120, 0);
    }

    const scroller =
      this.ground?.getComponent(Scroller3x) ||
      canvas.getChildByName('ground')?.getComponent(Scroller3x);
    scroller?.layoutStrips();
  }

  onDestroy() {
    this.enableInput(false);
    if (this.readyMenu?.isValid) {
      this.readyMenu.off(Node.EventType.TOUCH_END, this.onReadyTap, this);
      this.readyMenu.off(Node.EventType.TOUCH_START, this.onReadyTap, this);
    }
  }

  /** Ready 页 / 局内点击：Ready 时开局并拍翅，飞行中继续拍翅 */
  onReadyTap() {
    if (this.isPaused || this.gameOverShown) {
      return;
    }
    const state = this.bird?.state;
    if (state === BirdState.Dead || state === BirdState.Drop) {
      return;
    }
    if (state === BirdState.Ready || state === undefined) {
      this.gameStart();
      return;
    }
    this.bird?.rise();
  }

  enableInput(enabled: boolean) {
    const canvas = this.node;
    canvas.off(Node.EventType.TOUCH_END, this.onReadyTap, this);
    canvas.off(Node.EventType.TOUCH_START, this.onReadyTap, this);
    if (this.readyMenu?.isValid) {
      this.readyMenu.off(Node.EventType.TOUCH_END, this.onReadyTap, this);
      this.readyMenu.off(Node.EventType.TOUCH_START, this.onReadyTap, this);
    }
    if (!enabled) {
      return;
    }
    // START 同时绑 START/END，预览与真机都更稳
    canvas.on(Node.EventType.TOUCH_END, this.onReadyTap, this);
    canvas.on(Node.EventType.TOUCH_START, this.onReadyTap, this);
    if (this.readyMenu?.isValid) {
      const ui = this.readyMenu.getComponent(UITransform) || this.readyMenu.addComponent(UITransform);
      // 扩大 Ready 层命中，避免只有小图可点
      if (ui.width < 500 || ui.height < 400) {
        ui.setContentSize(Math.max(ui.width, 640), Math.max(ui.height, 500));
      }
      const block = this.readyMenu.getComponent(BlockInputEvents);
      if (block) {
        // 需要自己收触摸，不要整层吞掉后无回调
        block.enabled = false;
      }
      this.readyMenu.on(Node.EventType.TOUCH_END, this.onReadyTap, this);
      this.readyMenu.on(Node.EventType.TOUCH_START, this.onReadyTap, this);
    }
  }

  getStoredNumber(key: string) {
    const value = parseInt(localStorage.getItem(key) || '0', 10);
    return Number.isNaN(value) ? 0 : value;
  }

  setStoredNumber(key: string, value: number) {
    localStorage.setItem(key, String(value));
  }

  revealScene() {
    if (!this.maskLayer) {
      return;
    }
    this.maskLayer.active = true;
    const sprite = this.maskLayer.getComponent(Sprite);
    if (sprite) {
      sprite.color = Color.BLACK;
    }
    const opacity = ensureUIOpacity(this.maskLayer);
    opacity.opacity = 255;
    tween(opacity).to(0.3, { opacity: 0 }).call(() => {
      if (this.maskLayer) {
        this.maskLayer.active = false;
      }
    }).start();
  }

  restart() {
    SkinManager.consumeTrialRound();
    director.loadScene('bird_game');
  }

  gameStart() {
    this.isPaused = false;
    this.gameOverShown = false;
    this.difficultyMode = getDifficultyMode();
    if (this.pipeManager) {
      this.pipeManager.difficultyScore = 0;
      this.pipeManager.hardMode = this.difficultyMode === 'hard';
    }
    this.hideReadyMenu();
    this.applyDifficulty();
    this.applyCurrentSkin();
    this.pipeManager?.startSpawn();
    this.ground?.getComponent(Scroller3x)?.startScroll();
    this.bird?.startFly();
    // 开局后仍可点屏幕拍翅
    this.enableInput(true);
    // 暂停功能暂不需要
    this.setPauseButtonVisible(false);
  }

  gameOver() {
    // 已展示且仍在显示时不重复；若已复活把 menu 关掉后再次失败，必须能再弹
    if (this.gameOverShown && this.gameOverMenu?.active) {
      return;
    }
    this.gameOverShown = true;
    if (this.isPaused) {
      this.resumeGame(false);
    }
    // Freeze world: pipes, ground scroll, further flaps
    this.pipeManager?.reset();
    this.ground?.getComponent(Scroller3x)?.stopScroll();
    // Bird3x sets Dead itself; ensure input cannot flap after fall-through
    this.enableInput(false);
    this.setPauseButtonVisible(false);
    this.hidePauseOverlay();
    this.blinkOnce();
    this.showGameOverMenu();
    this.maybeShowInterstitial();
  }

  /** 暂停暂不需要：隐藏场景/运行时暂停钮，不创建新 UI。 */
  disablePauseUi() {
    if (this.pauseBtn?.isValid) {
      this.pauseBtn.off(Node.EventType.TOUCH_END, this.onPauseButtonClick, this);
      this.pauseBtn.active = false;
    }
    const auto = this.node.getChildByName('pauseBtn');
    if (auto?.isValid) {
      auto.active = false;
    }
    if (this.pauseOverlay?.isValid) {
      this.pauseOverlay.active = false;
    }
  }

  /** 兼容旧调用名 */
  ensurePauseUi() {
    this.disablePauseUi();
  }

  /** 开局英文 GET READY / TAP（含下方小框手势图）来自原版图集，玩家看不懂。
   * 隐藏贴图，改成中文「点击屏幕起飞」。
   */
  localizeReadyMenu() {
    if (!this.readyMenu?.isValid) {
      return;
    }
    const hideNames = ['getready', 'getReady', 'GET READY', 'tapTips', 'tap', 'TAP'];
    for (const child of this.readyMenu.children) {
      if (hideNames.includes(child.name) || /getready|tap/i.test(child.name)) {
        child.active = false;
        const sp = child.getComponent(Sprite);
        if (sp) {
          sp.enabled = false;
        }
      }
    }

    let tip = this.readyMenu.getChildByName('cnReadyTip');
    if (!tip) {
      tip = new Node('cnReadyTip');
      tip.layer = this.readyMenu.layer;
      tip.addComponent(UITransform).setContentSize(420, 80);
      tip.setPosition(0, 20, 0);
      const label = tip.addComponent(Label);
      label.string = '点击屏幕起飞';
      label.fontSize = 36;
      label.isBold = true;
      label.color = Color.WHITE;
      label.enableOutline = true;
      label.outlineColor = new Color(20, 30, 50, 230);
      label.outlineWidth = 3;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      this.readyMenu.addChild(tip);
    }
    tip.active = true;
    ensureUIOpacity(tip).opacity = 255;
    ensureUIOpacity(this.readyMenu).opacity = 255;
    this.readyMenu.active = true;

    // 点击绑定统一走 enableInput，避免只绑一半
    this.enableInput(true);
  }

  /** 全场景统一：可爱黄鸟（蓝翅 + 黄嘴黄脚），盖住图集 pixel bird。 */
  applyCustomBirdLook() {
    applyCuteYellowBird(this.bird?.node);
  }

  onPauseButtonClick() {
    if (this.bird?.state === BirdState.Ready || this.bird?.state === BirdState.Dead || this.gameOverShown) {
      return;
    }
    if (this.isPaused) {
      this.resumeGame(true);
    } else {
      this.pauseGame();
    }
  }

  pauseGame() {
    if (this.isPaused || this.gameOverShown) {
      return;
    }
    this.isPaused = true;
    this.wasPipeRunningBeforePause = !!this.pipeManager?.pipeIsRunning;
    if (this.pipeManager) {
      this.pipeManager.pipeIsRunning = false;
    }
    this.ground?.getComponent(Scroller3x)?.stopScroll();
    this.enableInput(false);
    if (this.pauseOverlay) {
      this.pauseOverlay.active = true;
      this.pauseOverlay.setSiblingIndex(this.node.children.length - 1);
    }
    if (this.pauseBtn) {
      this.pauseBtn.setSiblingIndex(this.node.children.length - 1);
    }
    this.refreshPauseButtonLabel();
  }

  resumeGame(restoreInput: boolean) {
    if (!this.isPaused) {
      return;
    }
    this.isPaused = false;
    if (this.pipeManager && this.wasPipeRunningBeforePause) {
      this.pipeManager.pipeIsRunning = true;
    }
    this.ground?.getComponent(Scroller3x)?.startScroll();
    this.hidePauseOverlay();
    if (restoreInput && !this.gameOverShown) {
      this.enableInput(true);
    }
    this.refreshPauseButtonLabel();
  }

  hidePauseOverlay() {
    if (this.pauseOverlay) {
      this.pauseOverlay.active = false;
    }
  }

  setPauseButtonVisible(visible: boolean) {
    if (this.pauseBtn) {
      this.pauseBtn.active = visible;
    }
  }

  refreshPauseButtonLabel() {
    const text = this.isPaused ? '继续' : '暂停';
    if (this.pauseBtnLabel) {
      this.pauseBtnLabel.string = text;
    } else if (this.pauseBtn) {
      const label = this.pauseBtn.getComponentInChildren(Label);
      if (label) {
        label.string = text;
      }
    }
  }

  maybeShowInterstitial() {
    this.playCount += 1;
    this.setStoredNumber(STORAGE_KEYS.playCount, this.playCount);
    if (this.playCount % 3 === 0) {
      AdManager.showInterstitial();
    }
  }

  applyCurrentSkin() {
    const config = SkinManager.getSkinConfig(SkinManager.getSelectedSkin());
    // 鸟已改为 Graphics 黄鸟，不再用 Sprite 染色（会把隐藏贴图又染回去）
    this.applyCustomBirdLook();
    // 困难模式柱子强制预警橙，不被皮肤盖掉
    const hard = this.difficultyMode === 'hard';
    const hardTint = this.pipeManager?.hardPipeTint || new Color(255, 152, 0, 255);
    this.pipeManager?.forEachActivePipe((pipe) => {
      const tint = hard ? hardTint : config.pipeTint;
      const topSprite = pipe.topPipe?.getComponent(Sprite);
      const bottomSprite = pipe.bottomPipe?.getComponent(Sprite);
      if (topSprite) topSprite.color = tint;
      if (bottomSprite) bottomSprite.color = tint;
    });
  }

  gainScore() {
    this.score += 1;
    if (this.scoreLabel) {
      this.scoreLabel.string = String(this.score);
    }
    this.applyDifficulty();
  }

  applyDifficulty() {
    if (!this.pipeManager) {
      return;
    }
    // easy = 当前默认；hard = 更快更窄 + 橙色动态柱（难度已调回）
    this.pipeManager.difficultyScore = this.score;
    this.pipeManager.hardMode = this.difficultyMode === 'hard';
    if (this.difficultyMode === 'hard') {
      // 困难：开局就明显更难，约 18 分 ramp 满
      const difficulty = Math.min(this.score, 18) / 18;
      const hardBase = this.maxPipeSpeed; // e.g. -260
      const hardMax = this.maxPipeSpeed - 60; // e.g. -320
      this.pipeManager.pipeMoveSpeed = hardBase + (hardMax - hardBase) * difficulty;
      this.pipeManager.spacingMinValue = this.hardSpacingMin + (185 - this.hardSpacingMin) * difficulty;
      this.pipeManager.spacingMaxValue = this.hardSpacingMax + (220 - this.hardSpacingMax) * difficulty;
      // 竖屏更窄：水平管距略收，画面更密
      this.pipeManager.pipeSpacing = 260 - 30 * difficulty;
      // 动态柱：开局就有，后面更明显
      this.pipeManager.verticalAmp = 26 + 18 * difficulty;
      this.pipeManager.verticalOmega = 1.35 + 0.45 * difficulty;
      return;
    }
    this.pipeManager.hardMode = false;
    // 简单：前 8 分几乎不加压，之后缓慢变难
    const difficulty = Math.min(Math.max(this.score - 8, 0), 24) / 24;
    this.pipeManager.pipeMoveSpeed = this.basePipeSpeed + (this.maxPipeSpeed - this.basePipeSpeed) * difficulty;
    this.pipeManager.spacingMinValue = this.easySpacingMin + (this.hardSpacingMin - this.easySpacingMin) * difficulty;
    this.pipeManager.spacingMaxValue = this.easySpacingMax + (this.hardSpacingMax - this.easySpacingMax) * difficulty;
    this.pipeManager.pipeSpacing = 280;
    this.pipeManager.verticalAmp = 0;
  }

  hideReadyMenu() {
    if (this.scoreLabel?.node) {
      this.scoreLabel.node.active = true;
      ensureUIOpacity(this.scoreLabel.node).opacity = 255;
    }
    if (!this.readyMenu?.isValid) {
      return;
    }
    // 立即关掉命中，避免 Ready 层继续挡点击；再淡出
    const ready = this.readyMenu;
    ready.off(Node.EventType.TOUCH_END, this.onReadyTap, this);
    ready.off(Node.EventType.TOUCH_START, this.onReadyTap, this);
    tween(ensureUIOpacity(ready)).stop();
    tween(ensureUIOpacity(ready)).to(0.25, { opacity: 0 }).call(() => {
      if (ready.isValid) {
        ready.active = false;
      }
    }).start();
  }

  blinkOnce() {
    if (!this.maskLayer) {
      return;
    }
    const sprite = this.maskLayer.getComponent(Sprite);
    if (sprite) {
      sprite.color = Color.WHITE;
    }
    tween(ensureUIOpacity(this.maskLayer)).to(0.1, { opacity: 200 }).to(0.1, { opacity: 0 }).start();
  }

  showGameOverMenu() {
    if (!this.scoreLabel || !this.gameOverMenu) {
      return;
    }

    // 隐藏局内分数，避免和结算板叠字
    const scoreOpacity = ensureUIOpacity(this.scoreLabel.node);
    Tween.stopAllByTarget(scoreOpacity);
    scoreOpacity.opacity = 0;
    this.scoreLabel.node.active = false;

    // 失败后 ready 提示 / 闪白遮罩都关掉，避免透出来或挡住弹窗
    if (this.readyMenu) {
      this.readyMenu.active = false;
    }
    if (this.maskLayer) {
      Tween.stopAllByTarget(ensureUIOpacity(this.maskLayer));
      this.maskLayer.active = false;
    }

    this.ensureGameOverChrome();

    const gameOverNode = this.gameOverMenu.getChildByName('gameOverLabel');
    const resultBoardNode = this.gameOverMenu.getChildByName('resultBoard');
    const startButtonNode = this.gameOverMenu.getChildByName('startBtn');
    const backButtonNode = this.gameOverMenu.getChildByName('backbtn');
    const reviveButtonNode = this.gameOverMenu.getChildByName('reviveBtn');
    const tipsLabelNode = this.gameOverMenu.getChildByName('tipsLabel');
    const currentScoreNode = resultBoardNode?.getChildByName('currentScore');
    const bestScoreNode = resultBoardNode?.getChildByName('bestScore');
    const medalNode = resultBoardNode?.getChildByName('medal');

    let bestScore = this.bestScore;
    if (this.score > bestScore) {
      bestScore = this.score;
      this.bestScore = bestScore;
      this.setStoredNumber(STORAGE_KEYS.bestScore, bestScore);
    }

    // 分数节点是单 Label：直接「本局 N / 最高 N」——抬高，避免被复活按钮挡住
    if (currentScoreNode) {
      currentScoreNode.setPosition(0, 36, 0);
    }
    if (bestScoreNode) {
      bestScoreNode.setPosition(0, -18, 0);
    }
    this.setScoreRow(currentScoreNode, '本局', this.score);
    this.setScoreRow(bestScoreNode, '最高', bestScore);
    if (tipsLabelNode?.getComponent(Label)) {
      const tips = tipsLabelNode.getComponent(Label)!;
      tips.string = this.revivedThisRun
        ? '本局已复活过，可点「返回」回开始页'
        : '点「复活」看广告后继续（预览为模拟广告）';
      tips.fontSize = 20;
      tips.color = new Color(230, 230, 230, 255);
      tips.horizontalAlign = Label.HorizontalAlign.CENTER;
      tips.verticalAlign = Label.VerticalAlign.CENTER;
      getUITransform(tipsLabelNode)?.setContentSize(520, 60);
      tipsLabelNode.setPosition(0, -260, 0);
      tipsLabelNode.active = true;
      ensureUIOpacity(tipsLabelNode).opacity = 255;
    }

    // 低分不要显示默认金牌图
    if (medalNode) {
      const medalSprite = medalNode.getComponent(Sprite);
      if (medalSprite && this.score < this.silverScore) {
        medalSprite.spriteFrame = null;
        medalSprite.enabled = false;
        medalNode.active = false;
      } else if (medalNode) {
        medalNode.active = true;
        if (medalSprite) {
          medalSprite.enabled = true;
        }
      }
    }
    resources.load('res_bundle', SpriteAtlas, (_err, atlas) => {
      if (!atlas || !medalNode?.isValid) {
        return;
      }
      const medalSprite = medalNode.getComponent(Sprite);
      if (!medalSprite) {
        return;
      }
      if (this.score >= this.goldScore) {
        medalNode.active = true;
        medalSprite.enabled = true;
        medalSprite.spriteFrame = atlas.getSpriteFrame('medal_gold');
      } else if (this.score >= this.silverScore) {
        medalNode.active = true;
        medalSprite.enabled = true;
        medalSprite.spriteFrame = atlas.getSpriteFrame('medal_silver');
      } else {
        medalSprite.spriteFrame = null;
        medalSprite.enabled = false;
        medalNode.active = false;
      }
    });

    // 失败 UI：超大吸睛「复活」+ 闪烁/缩放；下方文字「返回」；隐藏「再来一局」
    if (startButtonNode) {
      startButtonNode.active = false;
      startButtonNode.off(Node.EventType.TOUCH_END, this.restart, this);
    }
    this.styleReviveButton(reviveButtonNode);
    this.styleTextLinkButton(backButtonNode, '返回', 30);

    if (reviveButtonNode) {
      // 分数板下方，不再盖住「最高」
      reviveButtonNode.setPosition(0, -150, 0);
      reviveButtonNode.active = !this.revivedThisRun;
      const ro = ensureUIOpacity(reviveButtonNode);
      ro.opacity = this.revivedThisRun ? 0 : 255;
      this.stopReviveFlash();
      if (!this.revivedThisRun) {
        this.startReviveFlash(reviveButtonNode, ro);
      }
    }
    if (backButtonNode) {
      backButtonNode.setPosition(0, -230, 0);
      backButtonNode.active = true;
      ensureUIOpacity(backButtonNode).opacity = 255;
    }
    if (resultBoardNode) {
      getUITransform(resultBoardNode)?.setContentSize(360, 170);
      resultBoardNode.setPosition(0, 70, 0);
      resultBoardNode.active = true;
      ensureUIOpacity(resultBoardNode).opacity = 255;
    }
    if (gameOverNode) {
      // 关掉旧 GAME OVER 图 + 写清晰中文标题
      this.ensureGameOverTitle(gameOverNode);
      gameOverNode.setPosition(0, 230, 0);
      gameOverNode.active = true;
      ensureUIOpacity(gameOverNode).opacity = 255;
    }

    // 全屏遮罩 + 弹层置顶，盖住场上 START / 鸟 / 管
    if (this.gameOverBackdrop) {
      this.gameOverBackdrop.active = true;
      ensureUIOpacity(this.gameOverBackdrop).opacity = 210;
      this.gameOverBackdrop.setSiblingIndex(this.node.children.length - 1);
    }
    if (this.gameOverPanel) {
      this.gameOverPanel.active = true;
      this.gameOverPanel.setSiblingIndex(this.node.children.length - 1);
    }

    // 扩大 menu 命中区域，并保证整层可见
    getUITransform(this.gameOverMenu)?.setContentSize(520, 640);
    this.gameOverMenu.active = true;
    ensureUIOpacity(this.gameOverMenu).opacity = 255;
    // 顺序：遮罩 < 面板 < 菜单按钮（菜单必须最顶）
    if (this.gameOverBackdrop) {
      this.gameOverBackdrop.setSiblingIndex(this.node.children.length - 1);
    }
    if (this.gameOverPanel) {
      this.gameOverPanel.setSiblingIndex(this.node.children.length - 1);
    }
    this.gameOverMenu.setSiblingIndex(this.node.children.length - 1);

    // 重新绑定：复活 / 返回
    if (backButtonNode) {
      backButtonNode.off(Node.EventType.TOUCH_END, this.backGameList, this);
      backButtonNode.on(Node.EventType.TOUCH_END, this.backGameList, this);
    }
    if (reviveButtonNode && !this.revivedThisRun) {
      reviveButtonNode.off(Node.EventType.TOUCH_END, this.reviveGame, this);
      reviveButtonNode.on(Node.EventType.TOUCH_END, this.reviveGame, this);
    }
  }

  /** 纯文字可点「返回」 */
  styleTextLinkButton(btn: Node | null | undefined, text: string, fontSize: number) {
    if (!btn) {
      return;
    }
    getUITransform(btn)?.setContentSize(220, 56);
    // 去掉实心底
    const bg = btn.getChildByName('btnBg');
    if (bg) {
      bg.active = false;
    }
    const rootSprite = btn.getComponent(Sprite);
    if (rootSprite) {
      rootSprite.enabled = false;
    }
    const rootLabel = btn.getComponent(Label);
    if (rootLabel) {
      rootLabel.enabled = false;
    }

    let labelNode = btn.getChildByName('btnLabel');
    if (!labelNode) {
      labelNode = new Node('btnLabel');
      labelNode.layer = btn.layer;
      labelNode.addComponent(UITransform).setContentSize(220, 56);
      btn.addChild(labelNode);
    }
    labelNode.active = true;
    labelNode.setSiblingIndex(btn.children.length - 1);
    getUITransform(labelNode)?.setContentSize(220, 56);
    let lbl = labelNode.getComponent(Label);
    if (!lbl) {
      lbl = labelNode.addComponent(Label);
    }
    lbl.enabled = true;
    lbl.string = text;
    lbl.fontSize = fontSize;
    lbl.isBold = true;
    lbl.color = new Color(210, 220, 240, 255);
    lbl.enableOutline = true;
    lbl.outlineColor = new Color(20, 24, 40, 200);
    lbl.outlineWidth = 2;
    lbl.enableUnderline = true;
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    ensureUIOpacity(btn).opacity = 255;
    ensureUIOpacity(labelNode).opacity = 255;
  }

  startReviveFlash(btn: Node, opacity: UIOpacity) {
    this.stopReviveFlash();
    opacity.opacity = 255;
    btn.setScale(1, 1, 1);
    // 透明度闪 + 轻微缩放脉冲，更吸睛
    this.reviveFlashTween = tween(opacity)
      .repeatForever(
        tween(opacity)
          .to(0.28, { opacity: 255 })
          .to(0.28, { opacity: 130 })
          .to(0.28, { opacity: 255 }),
      )
      .start();
    tween(btn)
      .repeatForever(
        tween(btn)
          .to(0.35, { scale: new Vec3(1.04, 1.04, 1) }, { easing: 'sineOut' })
          .to(0.35, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineIn' }),
      )
      .start();
  }

  stopReviveFlash() {
    if (this.reviveFlashTween) {
      this.reviveFlashTween.stop();
      this.reviveFlashTween = null;
    }
    const revive = this.gameOverMenu?.getChildByName('reviveBtn');
    if (revive?.isValid) {
      Tween.stopAllByTarget(revive);
      revive.setScale(1, 1, 1);
    }
  }

  /** 失败页主 CTA：中等尺寸，不挡分数 */
  styleReviveButton(btn: Node | null | undefined) {
    if (!btn?.isValid) {
      return;
    }
    const width = 240;
    const height = 72;
    const text = '复活';
    const fontSize = 34;
    const bgColor = new Color(255, 87, 34, 255);
    this.styleActionButton(btn, width, height, text, fontSize, bgColor);

    // 轻描边，不再用超大光晕
    let glow = btn.getChildByName('btnGlow');
    if (!glow) {
      glow = new Node('btnGlow');
      glow.layer = btn.layer;
      glow.addComponent(UITransform).setContentSize(width + 12, height + 12);
      glow.setPosition(0, 0, 0);
      btn.addChild(glow);
      glow.setSiblingIndex(0);
    }
    const gUi = glow.getComponent(UITransform) || glow.addComponent(UITransform);
    gUi.setContentSize(width + 12, height + 12);
    let gg = glow.getComponent(Graphics);
    if (!gg) {
      gg = glow.addComponent(Graphics);
    }
    gg.clear();
    gg.strokeColor = new Color(255, 230, 80, 180);
    gg.lineWidth = 3;
    gg.roundRect(-(width + 12) / 2, -(height + 12) / 2, width + 12, height + 12, 14);
    gg.stroke();

    const labelNode = btn.getChildByName('btnLabel');
    const lbl = labelNode?.getComponent(Label);
    if (lbl) {
      lbl.fontSize = fontSize;
      lbl.isBold = true;
      lbl.color = new Color(255, 255, 255, 255);
      lbl.enableOutline = true;
      lbl.outlineColor = new Color(120, 20, 0, 255);
      lbl.outlineWidth = 3;
      lbl.string = text;
    }
    const bg = btn.getChildByName('btnBg');
    const g = bg?.getComponent(Graphics);
    if (g) {
      g.clear();
      g.fillColor = bgColor;
      g.roundRect(-width / 2, -height / 2, width, height, 14);
      g.fill();
      g.strokeColor = new Color(255, 255, 200, 200);
      g.lineWidth = 3;
      g.roundRect(-width / 2, -height / 2, width, height, 14);
      g.stroke();
    }
  }

  ensureGameOverChrome() {
    const parent = this.gameOverMenu?.parent || this.node;
    if (!this.gameOverBackdrop?.isValid) {
      const bg = new Node('gameOverBackdrop');
      bg.layer = parent.layer;
      const canvasUi = find('Canvas')?.getComponent(UITransform);
      const cw = canvasUi?.width || 720;
      const ch = canvasUi?.height || 1560;
      bg.addComponent(UITransform).setContentSize(cw, ch);
      bg.setPosition(0, 0, 0);
      const g = bg.addComponent(Graphics);
      g.fillColor = new Color(10, 18, 36, 210);
      g.rect(-cw / 2, -ch / 2, cw, ch);
      g.fill();
      bg.addComponent(BlockInputEvents);
      parent.addChild(bg);
      this.gameOverBackdrop = bg;
    }
    this.gameOverBackdrop.active = true;
    ensureUIOpacity(this.gameOverBackdrop).opacity = 210;
    this.gameOverBackdrop.setSiblingIndex(parent.children.length - 1);

    if (!this.gameOverPanel?.isValid) {
      const panel = new Node('gameOverPanel');
      panel.layer = parent.layer;
      panel.addComponent(UITransform).setContentSize(420, 460);
      panel.setPosition(0, 10, 0);
      const g = panel.addComponent(Graphics);
      g.fillColor = new Color(28, 42, 68, 245);
      g.roundRect(-210, -230, 420, 460, 18);
      g.fill();
      g.strokeColor = new Color(120, 170, 255, 180);
      g.lineWidth = 3;
      g.roundRect(-210, -230, 420, 460, 18);
      g.stroke();
      parent.addChild(panel);
      this.gameOverPanel = panel;
    }
    this.gameOverPanel.active = true;
    this.gameOverPanel.setSiblingIndex(parent.children.length - 1);
  }

  ensureGameOverTitle(gameOverNode: Node) {
    // 场景里 gameOverLabel 是「GAME OVER」Sprite：关掉旧图，避免白字叠白边看不清
    const oldSprite = gameOverNode.getComponent(Sprite);
    if (oldSprite) {
      oldSprite.enabled = false;
    }
    const oldLabel = gameOverNode.getComponent(Label);
    if (oldLabel) {
      oldLabel.enabled = false;
    }

    let title = gameOverNode.getChildByName('gameOverTitle');
    if (!title) {
      title = new Node('gameOverTitle');
      title.layer = gameOverNode.layer;
      title.addComponent(UITransform).setContentSize(420, 90);
      title.setPosition(0, 0, 0);
      gameOverNode.addChild(title);
    }
    title.active = true;
    let lbl = title.getComponent(Label);
    if (!lbl) {
      lbl = title.addComponent(Label);
    }
    lbl.string = '游戏结束';
    lbl.fontSize = 52;
    lbl.isBold = true;
    lbl.color = new Color(255, 236, 80, 255);
    lbl.enableOutline = true;
    lbl.outlineColor = new Color(20, 24, 40, 255);
    lbl.outlineWidth = 5;
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    ensureUIOpacity(title).opacity = 255;
    ensureUIOpacity(gameOverNode).opacity = 255;
  }

  /**
   * 场景 currentScore/bestScore 是单 Label 节点（无 up/down 子节点）。
   * 直接写成「本局 12 / 最高 30」，深色字保证在结算板上可读。
   */
  setScoreRow(node: Node | null, label: string, value: number) {
    if (!node?.isValid) {
      return;
    }
    node.active = true;
    let lbl = node.getComponent(Label);
    if (!lbl) {
      const up = node.getChildByName('up');
      const down = node.getChildByName('down');
      if (up?.getComponent(Label) && down?.getComponent(Label)) {
        const upL = up.getComponent(Label)!;
        const downL = down.getComponent(Label)!;
        upL.string = label;
        downL.string = String(value);
        upL.color = new Color(40, 48, 64, 255);
        downL.color = new Color(20, 24, 36, 255);
        downL.fontSize = Math.max(downL.fontSize, 36);
        ensureUIOpacity(node).opacity = 255;
        return;
      }
      lbl = node.addComponent(Label);
    }
    lbl.enabled = true;
    lbl.string = `${label}  ${value}`;
    lbl.fontSize = 34;
    lbl.isBold = true;
    lbl.color = new Color(25, 30, 45, 255);
    lbl.enableOutline = true;
    lbl.outlineColor = new Color(255, 255, 255, 220);
    lbl.outlineWidth = 2;
    lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    getUITransform(node)?.setContentSize(200, 44);
    ensureUIOpacity(node).opacity = 255;
  }

  /**
   * 按钮常是：根 Sprite（START 图）或根 Label。
   * 根 Label 在 Graphics 下面会「空白按钮」——必须子节点 btnLabel 在 btnBg 之上。
   */
  styleActionButton(btn: Node | null, width: number, height: number, text: string, fontSize: number, bgColor: Color) {
    if (!btn?.isValid) {
      return;
    }
    btn.active = true;
    const ui = btn.getComponent(UITransform) || btn.addComponent(UITransform);
    ui.setContentSize(width, height);

    const rootSprite = btn.getComponent(Sprite);
    if (rootSprite) {
      rootSprite.enabled = false;
    }
    const rootLabel = btn.getComponent(Label);
    if (rootLabel) {
      rootLabel.enabled = false;
      rootLabel.string = '';
    }

    let bg = btn.getChildByName('btnBg');
    if (!bg) {
      bg = new Node('btnBg');
      bg.layer = btn.layer;
      bg.addComponent(UITransform).setContentSize(width, height);
      bg.setPosition(0, 0, 0);
      btn.addChild(bg);
      bg.setSiblingIndex(0);
    }
    const bgUi = bg.getComponent(UITransform) || bg.addComponent(UITransform);
    bgUi.setContentSize(width, height);
    let g = bg.getComponent(Graphics);
    if (!g) {
      g = bg.addComponent(Graphics);
    }
    g.clear();
    g.fillColor = bgColor;
    g.roundRect(-width / 2, -height / 2, width, height, 12);
    g.fill();
    g.strokeColor = new Color(255, 255, 255, 90);
    g.lineWidth = 2;
    g.roundRect(-width / 2, -height / 2, width, height, 12);
    g.stroke();

    let labelNode = btn.getChildByName('btnLabel');
    if (!labelNode) {
      labelNode = new Node('btnLabel');
      labelNode.layer = btn.layer;
      labelNode.addComponent(UITransform).setContentSize(width, height);
      labelNode.setPosition(0, 0, 0);
      btn.addChild(labelNode);
    }
    labelNode.setSiblingIndex(btn.children.length - 1);
    let lbl = labelNode.getComponent(Label);
    if (!lbl) {
      lbl = labelNode.addComponent(Label);
    }
    lbl.enabled = true;
    lbl.string = text;
    lbl.fontSize = fontSize;
    lbl.isBold = true;
    lbl.color = Color.WHITE;
    lbl.enableOutline = true;
    lbl.outlineColor = new Color(20, 24, 40, 255);
    lbl.outlineWidth = 3;
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    ensureUIOpacity(btn).opacity = 255;
    ensureUIOpacity(labelNode).opacity = 255;
  }

  backGameList() {
    // 独立工程没有合集 startscene，回到开始页自身
    this.fadeMaskThen('flappy_start');
  }

  /**
   * 看广告复活：走 AdManager 官方激励视频（真机）/ 模拟广告（预览·游客）。
   * 成功后安全落点 + 清前方管子，本局仅一次。
   */
  reviveGame() {
    if (this.revivedThisRun) {
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '本局已复活过', icon: 'none' });
      }
      return;
    }
    if (!this.gameOverShown && this.bird?.state !== BirdState.Dead && this.bird?.state !== BirdState.Drop) {
      return;
    }

    // 防止连点
    const reviveBtn = this.gameOverMenu?.getChildByName('reviveBtn');
    if (reviveBtn) {
      reviveBtn.off(Node.EventType.TOUCH_END, this.reviveGame, this);
    }

    AdManager.showRewarded().then((finished) => {
      if (!finished) {
        // 未看完：恢复按钮可点
        if (reviveBtn?.isValid && !this.revivedThisRun) {
          reviveBtn.on(Node.EventType.TOUCH_END, this.reviveGame, this);
        }
        if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '需看完广告才能复活', icon: 'none' });
        }
        return;
      }
      this.doSafeRevive();
    });
  }

  /** 广告成功后的安全复活 */
  private doSafeRevive() {
    this.revivedThisRun = true;
    this.gameOverShown = false;
    this.isPaused = false;

    // 关结算 UI
    this.stopReviveFlash();
    if (this.gameOverMenu) {
      this.gameOverMenu.active = false;
    }
    if (this.gameOverBackdrop) {
      this.gameOverBackdrop.active = false;
    }
    if (this.gameOverPanel) {
      this.gameOverPanel.active = false;
    }
    if (this.readyMenu) {
      this.readyMenu.active = false;
    }
    if (this.scoreLabel?.node) {
      this.scoreLabel.node.active = true;
      ensureUIOpacity(this.scoreLabel.node).opacity = 255;
      this.scoreLabel.string = String(this.score);
    }

    // 安全坐标：偏左、中高，远离地面
    const canvas = find('Canvas');
    const canvasH = canvas?.getComponent(UITransform)?.height || 1560;
    const safeX = -120;
    const safeY = Math.min(80, canvasH * 0.15);
    if (this.bird?.node) {
      this.bird.node.setPosition(safeX, safeY, 0);
      this.bird.node.setRotationFromEuler(0, 0, 0);
    }

    // 清前方管子，稍晚再刷
    this.pipeManager?.resumeAfterRevive(safeX, 450);
    if (this.pipeManager) {
      this.pipeManager.pipeIsRunning = true;
    }
    this.ground?.getComponent(Scroller3x)?.startScroll();
    this.bird?.revive();
    this.enableInput(true);
    this.setPauseButtonVisible(false);

    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title: '复活成功', icon: 'success' });
    }
  }

  fadeMaskThen(loadSceneName: string) {
    if (!this.maskLayer) {
      director.loadScene(loadSceneName);
      return;
    }
    this.maskLayer.active = true;
    const sprite = this.maskLayer.getComponent(Sprite);
    if (sprite) {
      sprite.color = Color.BLACK;
    }
    const opacity = ensureUIOpacity(this.maskLayer);
    opacity.opacity = 0;
    tween(opacity)
      .to(0.2, { opacity: 255 })
      .call(() => director.loadScene(loadSceneName))
      .start();
  }
}