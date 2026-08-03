import { _decorator, Component, Node, UITransform } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Dual-strip ground scroll.
 * Moves both `this.node` (ground) and `longGround` so the bottom "台阶" seam stays continuous.
 * (Previously only the primary ground node moved — groundLong sat still → broken floor.)
 */
@ccclass('Scroller3x')
export class Scroller3x extends Component {
  @property
  speed = -300;

  @property(Node)
  canvasNode: Node | null = null;

  @property(Node)
  longGround: Node | null = null;

  private canScroll = true;
  /** Width of one ground strip; used to wrap the pair. */
  private stripWidth = 720;

  start() {
    this.layoutStrips();
  }

  layoutStrips() {
    const canvas = this.canvasNode;
    const longG = this.longGround;
    if (!canvas || !longG) {
      return;
    }
    const canvasTransform = canvas.getComponent(UITransform);
    const selfTransform = this.node.getComponent(UITransform);
    const longTransform = longG.getComponent(UITransform);
    if (!canvasTransform || !selfTransform || !longTransform) {
      return;
    }
    this.stripWidth = canvasTransform.width || 720;
    selfTransform.width = this.stripWidth;
    longTransform.width = this.stripWidth;
    // Keep Y; place strips side by side
    const y = this.node.position.y;
    this.node.setPosition(0, y);
    longG.setPosition(this.stripWidth, y);
  }

  update(deltaTime: number) {
    if (!this.canScroll) {
      return;
    }
    const dx = this.speed * deltaTime;
    this.node.setPosition(this.node.position.x + dx, this.node.position.y);
    if (this.longGround) {
      this.longGround.setPosition(this.longGround.position.x + dx, this.longGround.position.y);
    }
    this.wrapPair();
  }

  /** When a strip fully leaves the left, move it to the right of the other. */
  wrapPair() {
    const longG = this.longGround;
    if (!longG) {
      // single-node fallback
      if (this.node.position.x <= -this.stripWidth) {
        this.node.setPosition(this.node.position.x + this.stripWidth, this.node.position.y);
      }
      return;
    }
    const a = this.node;
    const b = longG;
    // leftmost strip reappears to the right of the other
    if (a.position.x <= -this.stripWidth) {
      const right = Math.max(a.position.x, b.position.x);
      a.setPosition(right + this.stripWidth, a.position.y);
    }
    if (b.position.x <= -this.stripWidth) {
      const right = Math.max(a.position.x, b.position.x);
      b.setPosition(right + this.stripWidth, b.position.y);
    }
  }

  stopScroll() {
    this.canScroll = false;
  }

  startScroll() {
    this.canScroll = true;
  }
}
