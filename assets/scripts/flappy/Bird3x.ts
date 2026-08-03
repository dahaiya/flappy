import { _decorator, Animation, Collider2D, Component, Contact2DType, Enum, find, Node, tween, UITransform, Vec3 } from 'cc';
import type { FbGame3x } from './FbGame3x';
import type { PipeGroup3x } from './PipeGroup3x';
const { ccclass, property } = _decorator;

export enum BirdState {
  Ready = 0,
  Rise = 1,
  FreeFall = 2,
  Drop = 3,
  Dead = 4,
}
Enum(BirdState);

@ccclass('Bird3x')
export class Bird3x extends Component {
  /** 起跳初速：场景里若仍是 800 会跳太高；默认 480 更稳 */
  @property
  initRiseSpeed = 480;

  @property
  gravity = 1100;

  @property({ type: Node })
  ground: Node | null = null;

  state: BirdState = BirdState.Ready;
  private game: FbGame3x | null = null;
  private currentSpeed = 0;
  private nextPipe: PipeGroup3x | null = null;
  private collideWithPipe = false;
  private collideWithGround = false;
  private gameOverTriggered = false;
  private anim: Animation | null = null;
  private tweenStopper: { stop?: () => void } | null = null;

  onLoad() {
    this.resolveGround();
    const collider = this.getComponent(Collider2D);
    if (collider) {
      collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
    }
  }

  resolveGround() {
    if (this.ground?.isValid) {
      return this.ground;
    }
    this.ground = find('Canvas/ground');
    return this.ground;
  }

  init(game: FbGame3x) {
    this.game = game;
    this.resolveGround();
    this.state = BirdState.Ready;
    this.currentSpeed = 0;
    this.nextPipe = null;
    this.collideWithPipe = false;
    this.collideWithGround = false;
    this.gameOverTriggered = false;
    this.anim = this.getComponent(Animation);
    this.anim?.play('birdFlapping');
    this.anim?.play('birdWing');
  }

  startFly() {
    this.resolveGround();
    this.syncNextPipe();
    this.anim?.stop();
    this.rise();
  }

  /** 取 x 最大且仍在鸟前方的管道作为计分目标（不 shift 丢管道） */
  syncNextPipe() {
    const list = this.game?.pipeManager?.activePipeList || [];
    const bx = this.node.position.x;
    let best: PipeGroup3x | null = null;
    let bestX = Infinity;
    for (const p of list) {
      if (!p?.node?.isValid) {
        continue;
      }
      const x = p.node.position.x;
      if (x + 40 > bx && x < bestX) {
        bestX = x;
        best = p;
      }
    }
    this.nextPipe = best;
  }

  getNextPipe() {
    this.syncNextPipe();
  }

  update(dt: number) {
    if (this.game?.isPaused) {
      return;
    }
    if (this.state === BirdState.Ready || this.state === BirdState.Dead) {
      return;
    }
    // 限制单帧，避免卡顿后穿模
    const step = Math.min(dt, 0.05);
    this.updatePosition(step);
    this.updateState();
    this.detectCollision();
    this.fixBirdFinalPosition();
  }

  updatePosition(dt: number) {
    const flying = this.state === BirdState.Rise || this.state === BirdState.FreeFall || this.state === BirdState.Drop;
    if (!flying) {
      return;
    }
    this.currentSpeed -= dt * this.gravity;
    // 终端速度，避免掉落过猛
    const minVy = -700;
    if (this.currentSpeed < minVy) {
      this.currentSpeed = minVy;
    }
    this.node.setPosition(this.node.position.x, this.node.position.y + dt * this.currentSpeed);
  }

  updateState() {
    if (this.state === BirdState.Rise && this.currentSpeed < 0) {
      this.state = BirdState.FreeFall;
      this.runFallAction(0.6);
      return;
    }
    if (this.state === BirdState.Drop && this.collideWithGround) {
      this.killOnGround();
    }
  }

  getGroundTopY(birdHalf: number) {
    const g = this.resolveGround();
    if (g?.isValid) {
      const groundHalf = (g.getComponent(UITransform)?.height || 140) / 2;
      return g.position.y + groundHalf + birdHalf;
    }
    const canvas = find('Canvas');
    const canvasH = canvas?.getComponent(UITransform)?.height || 1560;
    return -canvasH / 2 + birdHalf;
  }

  getPlayBounds() {
    const canvas = find('Canvas');
    const canvasH = canvas?.getComponent(UITransform)?.height || 1560;
    const birdHalf = (this.node.getComponent(UITransform)?.height || 60) / 2;
    const topY = canvasH / 2 - birdHalf;
    const bottomY = this.getGroundTopY(birdHalf);
    return { topY, bottomY, birdHalf };
  }

  detectCollision() {
    if (this.state === BirdState.Ready || this.state === BirdState.Dead) {
      return;
    }

    const { topY, bottomY } = this.getPlayBounds();
    const y = this.node.position.y;

    // 碰顶：只夹紧在屏幕内，不算失败、不 gameOver
    if (y >= topY) {
      this.node.setPosition(this.node.position.x, topY);
      this.currentSpeed = Math.min(this.currentSpeed, 0);
      // 不 return：本帧仍可判管道/计分（顶边不是致死区）
    }

    if (y <= bottomY || this.collideWithGround) {
      this.killOnGround();
      return;
    }

    if (this.state !== BirdState.Drop) {
      if (this.collideWithPipe || this.hitAnyPipeAabb()) {
        this.failAndDrop(false);
        return;
      }
    }

    this.tryScore();
  }

  tryScore() {
    if (!this.nextPipe?.node?.isValid) {
      this.syncNextPipe();
    }
    const pipe = this.nextPipe;
    if (!pipe?.node?.isValid) {
      return;
    }
    const pipeW = pipe.topPipe?.getComponent(UITransform)?.width || 75;
    // 鸟完全越过管子中心偏右再得分
    if (this.node.position.x > pipe.node.position.x + pipeW * 0.35) {
      this.game?.gainScore();
      this.nextPipe = null;
      this.syncNextPipe();
    }
  }

  /**
   * 正确处理 UITransform 锚点：
   * topPipe anchor (0.5,1) → 位置在管顶，实体向下伸
   * bottomPipe anchor (0.5,0) → 位置在管底，实体向上伸
   * 旧逻辑按中心算，几乎碰不到管子。
   */
  hitAnyPipeAabb(): boolean {
    const pipes = this.game?.pipeManager?.activePipeList || [];
    if (!pipes.length) {
      return false;
    }
    const birdUi = this.node.getComponent(UITransform);
    const bw = (birdUi?.width || 60) * 0.85;
    const bh = (birdUi?.height || 60) * 0.85;
    const bx = this.node.position.x;
    const by = this.node.position.y;
    const birdL = bx - bw / 2;
    const birdR = bx + bw / 2;
    const birdB = by - bh / 2;
    const birdT = by + bh / 2;

    for (const group of pipes) {
      if (!group?.node?.isValid) {
        continue;
      }
      // top-only / bottom-only 时另一根会 active=false，跳过
      if (group.topPipe?.active && this.nodeHitsPipeSprite(group.node, group.topPipe, birdL, birdR, birdB, birdT)) {
        return true;
      }
      if (group.bottomPipe?.active && this.nodeHitsPipeSprite(group.node, group.bottomPipe, birdL, birdR, birdB, birdT)) {
        return true;
      }
    }
    return false;
  }

  nodeHitsPipeSprite(
    group: Node,
    pipeNode: Node | null,
    birdL: number,
    birdR: number,
    birdB: number,
    birdT: number,
  ): boolean {
    if (!pipeNode?.isValid) {
      return false;
    }
    const ui = pipeNode.getComponent(UITransform);
    if (!ui) {
      return false;
    }
    const ax = ui.anchorX;
    const ay = ui.anchorY;
    const w = ui.width;
    const h = ui.height;
    // group 在 pipeManager 下，与 bird 同属 Canvas 空间
    const x = group.position.x + pipeNode.position.x;
    const y = group.position.y + pipeNode.position.y;
    const left = x - ax * w;
    const right = x + (1 - ax) * w;
    const bottom = y - ay * h;
    const top = y + (1 - ay) * h;
    return birdL < right && birdR > left && birdB < top && birdT > bottom;
  }

  killOnGround() {
    if (this.state === BirdState.Dead) {
      return;
    }
    this.collideWithGround = true;
    this.currentSpeed = 0;
    this.state = BirdState.Dead;
    this.anim?.stop();
    this.tweenStopper?.stop?.();
    this.fixBirdFinalPosition();
    this.triggerGameOver();
  }

  failAndDrop(fromCeiling: boolean) {
    if (this.state === BirdState.Dead) {
      return;
    }
    if (this.state === BirdState.Drop) {
      if (fromCeiling) {
        this.currentSpeed = Math.min(this.currentSpeed, 0);
      }
      return;
    }
    this.state = BirdState.Drop;
    this.runDropAction();
    this.anim?.stop();
    this.triggerGameOver();
  }

  triggerGameOver() {
    if (this.gameOverTriggered) {
      return;
    }
    this.gameOverTriggered = true;
    this.game?.gameOver();
  }

  fixBirdFinalPosition() {
    if (this.state !== BirdState.Dead && !this.collideWithGround) {
      return;
    }
    const birdHalf = (this.node.getComponent(UITransform)?.height || 60) / 2;
    const y = this.getGroundTopY(birdHalf);
    this.node.setPosition(this.node.position.x, y);
  }

  onBeginContact(_self: Collider2D | null, other: Collider2D | null) {
    const otherName = other?.node?.name;
    if (otherName === 'topPipe' || otherName === 'bottomPipe') {
      this.collideWithPipe = true;
    }
    if (otherName === 'ground' || otherName === 'groundLong') {
      this.collideWithGround = true;
    }
  }

  rise() {
    if (this.game?.isPaused || this.state === BirdState.Dead || this.state === BirdState.Drop) {
      return;
    }
    this.state = BirdState.Rise;
    this.collideWithPipe = false;
    this.collideWithGround = false;
    this.currentSpeed = this.initRiseSpeed;
    this.runRiseAction();
  }

  /**
   * 复活：清状态，给一点初速，由 FbGame 负责放到安全坐标并清管。
   */
  revive() {
    this.resolveGround();
    this.state = BirdState.Rise;
    this.collideWithPipe = false;
    this.collideWithGround = false;
    this.gameOverTriggered = false;
    this.currentSpeed = this.initRiseSpeed * 0.55;
    this.nextPipe = null;
    this.tweenStopper?.stop?.();
    this.tweenStopper = null;
    this.node.setRotationFromEuler(0, 0, 0);
    this.anim?.play('birdFlapping');
    this.anim?.play('birdWing');
    this.runRiseAction();
    this.syncNextPipe();
  }

  runRiseAction() {
    this.tweenStopper?.stop?.();
    this.tweenStopper = tween(this.node).to(0.3, { eulerAngles: new Vec3(0, 0, 30) }, { easing: 'cubicOut' }).start();
  }

  runFallAction(duration: number) {
    this.tweenStopper?.stop?.();
    this.tweenStopper = tween(this.node).to(duration, { eulerAngles: new Vec3(0, 0, -90) }, { easing: 'cubicIn' }).start();
  }

  runDropAction() {
    if (this.currentSpeed > 0) {
      this.currentSpeed = 0;
    }
    this.runFallAction(0.4);
  }
}
