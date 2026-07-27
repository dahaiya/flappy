import { _decorator, Component, find, Node, UITransform } from 'cc';
import type { PipeManager3x } from './PipeManager3x';
const { ccclass, property } = _decorator;

function getWidth(node: Node | null) {
  return node?.getComponent(UITransform)?.width || 0;
}

function getHeight(node: Node | null) {
  return node?.getComponent(UITransform)?.height || 0;
}

@ccclass('PipeGroup3x')
export class PipeGroup3x extends Component {
  @property
  topPipeMinHeight = 100;

  @property
  bottomPipeMinHeight = 100;

  @property
  spacingMinValue = 150;

  @property
  spacingMaxValue = 200;

  @property(Node)
  topPipe: Node | null = null;

  @property(Node)
  bottomPipe: Node | null = null;

  pipeManager: PipeManager3x | null = null;
  recycleX = 0;

  init(pipeManager: PipeManager3x) {
    this.pipeManager = pipeManager;
    this.initPositionX();
    this.initPositionY();
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

  initPositionY() {
    const canvas = find('Canvas');
    const ground = find('Canvas/ground');
    if (!canvas || !ground || !this.topPipe || !this.bottomPipe || !this.pipeManager) {
      return;
    }
    const topPipeMaxY = getHeight(canvas) / 2 - this.topPipeMinHeight;
    const bottomPipeMinY = ground.position.y + getHeight(ground) / 2 + this.bottomPipeMinHeight;
    const spacingMin = this.pipeManager.spacingMinValue || this.spacingMinValue;
    const spacingMax = this.pipeManager.spacingMaxValue || this.spacingMaxValue;
    const spacing = spacingMin + Math.random() * (spacingMax - spacingMin);
    const topY = topPipeMaxY - Math.random() * (topPipeMaxY - bottomPipeMinY - spacing);
    this.topPipe.setPosition(this.topPipe.position.x, topY);
    this.bottomPipe.setPosition(this.bottomPipe.position.x, topY - spacing);
  }

  update(dt: number) {
    if (!this.pipeManager?.pipeIsRunning) {
      return;
    }
    this.node.setPosition(this.node.position.x + this.pipeManager.pipeMoveSpeed * dt, this.node.position.y);
    if (this.node.position.x < this.recycleX) {
      this.pipeManager.recyclePipe(this);
    }
  }
}
