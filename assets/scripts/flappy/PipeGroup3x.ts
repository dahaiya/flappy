import { _decorator, Color, Component, find, Node, Sprite, UITransform } from 'cc';
import type { PipeManager3x } from './PipeManager3x';
const { ccclass, property } = _decorator;

function getWidth(node: Node | null) {
  return node?.getComponent(UITransform)?.width || 0;
}

function getHeight(node: Node | null) {
  return node?.getComponent(UITransform)?.height || 0;
}

function setHeight(node: Node | null, h: number) {
  const ui = node?.getComponent(UITransform);
  if (!ui) {
    return;
  }
  ui.setContentSize(ui.width || 75, Math.max(40, h));
}

/** both=经典上下管；top=只有上管；bottom=只有下管 */
export type PipeLayoutMode = 'both' | 'top' | 'bottom';

@ccclass('PipeGroup3x')
export class PipeGroup3x extends Component {
  @property
  topPipeMinHeight = 70;

  @property
  bottomPipeMinHeight = 70;

  /** 上下管开口更大 = 柱子“有效挡路”更短、更好过 */
  @property
  spacingMinValue = 250;

  @property
  spacingMaxValue = 300;

  @property(Node)
  topPipe: Node | null = null;

  @property(Node)
  bottomPipe: Node | null = null;

  pipeManager: PipeManager3x | null = null;
  recycleX = 0;
  /** 本根柱子布局（生成时写入） */
  layoutMode: PipeLayoutMode = 'both';
  /** prefab 原始高度，回收时不依赖被改过的 contentSize */
  private baseTopH = 0;
  private baseBottomH = 0;

  // 困难模式：垂直浮动（通过改开口位置实现，顶/底边仍贴天/地）
  private verticalMotion = false;
  private verticalPhase = 0;
  private verticalAmp = 0;
  private verticalOmega = 0;
  private skyTop = 320;
  private groundTop = -200;
  private baseGapTop = 0;
  private baseGapBottom = 0;
  private singleTopH = 0;
  private singleBotH = 0;
  private minTopH = 70;
  private minBotH = 70;

  init(pipeManager: PipeManager3x) {
    this.pipeManager = pipeManager;
    if (!this.baseTopH) {
      this.baseTopH = getHeight(this.topPipe) || 467;
    }
    if (!this.baseBottomH) {
      this.baseBottomH = getHeight(this.bottomPipe) || 467;
    }
    this.verticalMotion = false;
    this.initPositionX();
    this.initPositionY();
    this.applyHardVisual();
  }

  initPositionX() {
    const canvas = find('Canvas');
    if (!canvas || !this.topPipe || !this.bottomPipe) {
      return;
    }
    const width = getWidth(canvas);
    const sceneLeft = -width / 2;
    const sceneRight = width / 2;
    this.node.setPosition(sceneRight + 300, this.node.position.y);
    this.recycleX = sceneLeft - Math.max(getWidth(this.topPipe), getWidth(this.bottomPipe));
  }

  /**
   * 按难度混合三种柱子：
   * - both：上下都有，中间空（经典）
   * - top：只从上往下伸（无下管）
   * - bottom：只从下往上伸（无上管）
   * 简单模式：前期偏 both；困难模式：更早随机，方便看到变化。
   */
  pickLayoutMode(): PipeLayoutMode {
    const score = this.pipeManager?.difficultyScore ?? 0;
    const hard = !!this.pipeManager?.hardMode;
    if (hard) {
      // 困难：从第 1 分起就有机会单柱，但仍保留 both
      if (score < 1) {
        return Math.random() < 0.75 ? 'both' : (Math.random() < 0.5 ? 'top' : 'bottom');
      }
      const r = Math.random();
      if (score < 8) {
        if (r < 0.55) return 'both';
        return r < 0.78 ? 'top' : 'bottom';
      }
      if (r < 0.4) return 'both';
      return r < 0.7 ? 'top' : 'bottom';
    }
    if (score < 5) {
      return 'both';
    }
    const r = Math.random();
    if (score < 12) {
      if (r < 0.6) return 'both';
      return r < 0.8 ? 'top' : 'bottom';
    }
    if (r < 0.4) return 'both';
    return r < 0.7 ? 'top' : 'bottom';
  }

  /**
   * 关键：管体贴图固定 467 高会穿出地面/屏幕。
   * 顶管 anchorY=1：顶边贴 skyTop，高度 = 顶边到开口上沿。
   * 底管 anchorY=0：底边贴 groundTop，高度 = 地面到开口下沿。
   */
  initPositionY() {
    const canvas = find('Canvas');
    const ground = find('Canvas/ground');
    if (!canvas || !ground || !this.topPipe || !this.bottomPipe || !this.pipeManager) {
      return;
    }

    const canvasH = getHeight(canvas) || 1560;
    this.skyTop = canvasH / 2;
    this.groundTop = ground.position.y + getHeight(ground) / 2;
    const spacingMin = this.pipeManager.spacingMinValue || this.spacingMinValue;
    const spacingMax = this.pipeManager.spacingMaxValue || this.spacingMaxValue;
    const spacing = spacingMin + Math.random() * Math.max(0, spacingMax - spacingMin);

    this.minTopH = this.topPipeMinHeight;
    this.minBotH = this.bottomPipeMinHeight;
    const gapLow = this.groundTop + this.minBotH;
    const gapHigh = this.skyTop - this.minTopH;

    this.layoutMode = this.pickLayoutMode();
    this.topPipe.active = true;
    this.bottomPipe.active = true;
    this.verticalMotion = false;

    if (this.layoutMode === 'both') {
      const gapTopMin = gapLow + spacing;
      const gapTopMax = gapHigh;
      const span = Math.max(8, gapTopMax - gapTopMin);
      const gapTop = gapTopMin + Math.random() * span;
      const gapBottom = gapTop - spacing;
      this.baseGapTop = gapTop;
      this.baseGapBottom = gapBottom;
      this.applyBothGap(gapTop, gapBottom);
      this.setupVerticalMotionIfHard();
      return;
    }

    if (this.layoutMode === 'top') {
      const playH = Math.max(200, this.skyTop - this.groundTop);
      // 困难略放宽 flyGap，避免单柱太堵
      const flyMul = this.pipeManager.hardMode ? 0.42 : 0.35;
      const flyGap = Math.max(190, Math.min(spacing * 0.9, playH * flyMul));
      const topHMin = Math.max(this.minTopH * 2, playH * (this.pipeManager.hardMode ? 0.42 : 0.48));
      const topHMax = Math.max(topHMin + 8, playH - flyGap);
      this.singleTopH = topHMin + Math.random() * Math.max(8, topHMax - topHMin);
      setHeight(this.topPipe, this.singleTopH);
      this.topPipe.setPosition(this.topPipe.position.x, this.skyTop);
      this.bottomPipe.active = false;
      setHeight(this.bottomPipe, this.baseBottomH);
      this.bottomPipe.setPosition(this.bottomPipe.position.x, this.groundTop - this.baseBottomH);
      this.setupVerticalMotionIfHard();
      return;
    }

    // bottom only
    {
      const playH = Math.max(200, this.skyTop - this.groundTop);
      const flyMul = this.pipeManager.hardMode ? 0.42 : 0.35;
      const flyGap = Math.max(190, Math.min(spacing * 0.9, playH * flyMul));
      const botHMin = Math.max(this.minBotH * 2, playH * (this.pipeManager.hardMode ? 0.42 : 0.48));
      const botHMax = Math.max(botHMin + 8, playH - flyGap);
      this.singleBotH = botHMin + Math.random() * Math.max(8, botHMax - botHMin);
      setHeight(this.bottomPipe, this.singleBotH);
      this.bottomPipe.setPosition(this.bottomPipe.position.x, this.groundTop);
      this.topPipe.active = false;
      setHeight(this.topPipe, this.baseTopH);
      this.topPipe.setPosition(this.topPipe.position.x, this.skyTop + this.baseTopH);
      this.setupVerticalMotionIfHard();
    }
  }

  private applyBothGap(gapTop: number, gapBottom: number) {
    if (!this.topPipe || !this.bottomPipe) {
      return;
    }
    const topH = Math.max(this.minTopH, this.skyTop - gapTop);
    setHeight(this.topPipe, topH);
    this.topPipe.setPosition(this.topPipe.position.x, this.skyTop);

    const botH = Math.max(this.minBotH, gapBottom - this.groundTop);
    setHeight(this.bottomPipe, botH);
    this.bottomPipe.setPosition(this.bottomPipe.position.x, this.groundTop);
  }

  /** 困难模式：几乎从开局就上下缓动，幅度先小后大 */
  private setupVerticalMotionIfHard() {
    const pm = this.pipeManager;
    if (!pm?.hardMode) {
      this.verticalMotion = false;
      return;
    }
    const score = pm.difficultyScore ?? 0;
    // 第 0 根就有轻微浮动，后面逐渐加大，方便“看得到动态柱”
    this.verticalAmp = Math.min(pm.verticalAmp || 28, 16 + Math.min(score, 12) * 2.2);
    this.verticalOmega = (pm.verticalOmega || 1.35) * (0.85 + Math.random() * 0.35);
    this.verticalPhase = Math.random() * Math.PI * 2;
    this.verticalMotion = this.verticalAmp > 1;
  }

  private applyHardVisual() {
    const hard = !!this.pipeManager?.hardMode;
    const tint = hard
      ? (this.pipeManager?.hardPipeTint || new Color(255, 152, 0, 255))
      : new Color(255, 255, 255, 255);
    for (const n of [this.topPipe, this.bottomPipe]) {
      const sp = n?.getComponent(Sprite);
      if (sp) {
        sp.color = tint;
      }
    }
  }

  private applyVerticalOffset(offset: number) {
    if (!this.topPipe || !this.bottomPipe) {
      return;
    }
    if (this.layoutMode === 'both') {
      const gapTop = this.baseGapTop + offset;
      const gapBottom = this.baseGapBottom + offset;
      // 夹紧，避免穿天/地
      const maxUp = this.skyTop - this.minTopH - this.baseGapTop;
      const maxDown = this.baseGapBottom - (this.groundTop + this.minBotH);
      const clamped = Math.max(-Math.abs(maxDown), Math.min(Math.abs(maxUp), offset));
      this.applyBothGap(this.baseGapTop + clamped, this.baseGapBottom + clamped);
      return;
    }
    if (this.layoutMode === 'top' && this.topPipe.active) {
      // 单上管：高度在合理范围内呼吸变化
      const playH = Math.max(200, this.skyTop - this.groundTop);
      const h = Math.max(this.minTopH * 2, Math.min(playH * 0.82, this.singleTopH + offset));
      setHeight(this.topPipe, h);
      this.topPipe.setPosition(this.topPipe.position.x, this.skyTop);
      return;
    }
    if (this.layoutMode === 'bottom' && this.bottomPipe.active) {
      const playH = Math.max(200, this.skyTop - this.groundTop);
      const h = Math.max(this.minBotH * 2, Math.min(playH * 0.82, this.singleBotH + offset));
      setHeight(this.bottomPipe, h);
      this.bottomPipe.setPosition(this.bottomPipe.position.x, this.groundTop);
    }
  }

  update(dt: number) {
    if (!this.pipeManager?.pipeIsRunning) {
      return;
    }
    this.node.setPosition(this.node.position.x + this.pipeManager.pipeMoveSpeed * dt, this.node.position.y);

    if (this.verticalMotion) {
      this.verticalPhase += this.verticalOmega * dt;
      const offset = Math.sin(this.verticalPhase) * this.verticalAmp;
      this.applyVerticalOffset(offset);
    }

    if (this.node.position.x < this.recycleX) {
      this.pipeManager.recyclePipe(this);
    }
  }
}
