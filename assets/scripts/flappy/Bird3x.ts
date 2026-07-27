import { _decorator, Animation, Collider2D, Component, Contact2DType, Enum, find, Node, tween, UITransform, Vec3 } from 'cc';
import type { FbGame3x } from './FbGame3x';
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
  @property
  initRiseSpeed = 800;

  @property
  gravity = 1000;

  @property({ type: Node })
  ground: Node | null = null;

  state: BirdState = BirdState.Ready;
  private game: FbGame3x | null = null;
  private currentSpeed = 0;
  private nextPipe: any = null;
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

  /** Scene may omit collider; still resolve ground node for AABB. */
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
    this.getNextPipe();
    this.anim?.stop();
    this.rise();
  }

  getNextPipe() {
    this.nextPipe = this.game?.pipeManager?.getNext() || null;
  }

  update(dt: number) {
    if (this.game?.isPaused) {
      return;
    }
    if (this.state === BirdState.Ready || this.state === BirdState.Dead) {
      return;
    }
    this.updatePosition(dt);
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

  /**
   * Top of ground sprite in Canvas space.
   * bird_game: ground y=-250, h=140 → top ≈ -180 (not canvas bottom -320).
   * Without this, bird falls through the visible "台阶" before stopping.
   */
  getGroundTopY(birdHalf: number) {
    const g = this.resolveGround();
    if (g?.isValid) {
      const groundHalf = (g.getComponent(UITransform)?.height || 140) / 2;
      return g.position.y + groundHalf + birdHalf;
    }
    const canvas = find('Canvas');
    const canvasH = canvas?.getComponent(UITransform)?.height || 640;
    return -canvasH / 2 + birdHalf;
  }

  getPlayBounds() {
    const canvas = find('Canvas');
    const canvasH = canvas?.getComponent(UITransform)?.height || 640;
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

    // Ceiling
    if (y >= topY) {
      this.node.setPosition(this.node.position.x, topY);
      this.currentSpeed = Math.min(this.currentSpeed, 0);
      this.failAndDrop(true);
      return;
    }

    // Ground / 台阶 top — pure AABB (scene has 0 BoxCollider2D)
    if (y <= bottomY || this.collideWithGround) {
      this.killOnGround();
      return;
    }

    // Pipes: physics contact if colliders exist; else AABB vs next pipe
    if (this.state !== BirdState.Drop) {
      if (this.collideWithPipe || this.hitPipeAabb()) {
        this.failAndDrop(false);
        return;
      }
    }

    if (!this.nextPipe) {
      return;
    }
    const pipeWidth = this.nextPipe.topPipe?.getComponent(UITransform)?.width || 0;
    const crossPipe = this.node.position.x > this.nextPipe.node.position.x + pipeWidth / 2;
    if (crossPipe) {
      this.game?.gainScore();
      this.getNextPipe();
    }
  }

  /** Fallback when scene has no 2D colliders (current bird_game.scene). */
  hitPipeAabb(): boolean {
    const pipe = this.nextPipe;
    if (!pipe?.node?.isValid || !pipe.topPipe || !pipe.bottomPipe) {
      return false;
    }
    const birdUi = this.node.getComponent(UITransform);
    const bw = (birdUi?.width || 60) * 0.7;
    const bh = (birdUi?.height || 60) * 0.7;
    const bx = this.node.position.x;
    const by = this.node.position.y;

    const hit = (pipeNode: Node) => {
      const ui = pipeNode.getComponent(UITransform);
      if (!ui) {
        return false;
      }
      // pipe child local + group world-ish (group under pipeManager at 0,0)
      const px = pipe.node.position.x + pipeNode.position.x;
      const py = pipe.node.position.y + pipeNode.position.y;
      const hw = ui.width / 2;
      const hh = ui.height / 2;
      return Math.abs(bx - px) < hw + bw / 2 && Math.abs(by - py) < hh + bh / 2;
    };

    return hit(pipe.topPipe) || hit(pipe.bottomPipe);
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
    // End the run immediately so "掉落也不停止" cannot continue as free play
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

  revive() {
    this.resolveGround();
    this.state = BirdState.FreeFall;
    this.collideWithPipe = false;
    this.collideWithGround = false;
    this.gameOverTriggered = false;
    this.currentSpeed = 0;
    this.tweenStopper?.stop?.();
    this.tweenStopper = null;
    this.node.setRotationFromEuler(0, 0, 0);
    this.anim?.play('birdFlapping');
    this.anim?.play('birdWing');
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
