import { _decorator, Color, Component, instantiate, NodePool, Prefab } from 'cc';
import { PipeGroup3x } from './PipeGroup3x';
const { ccclass, property } = _decorator;

@ccclass('PipeManager3x')
export class PipeManager3x extends Component {
  @property(Prefab)
  pipePrefab: Prefab | null = null;

  /** 更慢，降低难度 */
  @property
  pipeMoveSpeed = -190;

  /** 管间距（生成间隔用）；竖屏略收，画面更密 */
  @property
  pipeSpacing = 280;

  @property
  spacingMinValue = 250;

  @property
  spacingMaxValue = 300;

  pipeList: PipeGroup3x[] = [];
  activePipeList: PipeGroup3x[] = [];
  pipeIsRunning = false;
  /** 供 PipeGroup 按得分混合 top/bottom/both 布局 */
  difficultyScore = 0;

  /** 困难模式：橙色预警 + 垂直浮动柱 */
  hardMode = false;
  /** 困难模式柱体染色 */
  hardPipeTint = new Color(255, 152, 0, 255);
  /** 垂直浮动幅度（像素） */
  verticalAmp = 28;
  /** 垂直浮动角速度 */
  verticalOmega = 1.35;

  private pipePool = new NodePool();

  onLoad() {
    for (let i = 0; i < 3; i += 1) {
      if (!this.pipePrefab) {
        break;
      }
      this.pipePool.put(instantiate(this.pipePrefab));
    }
  }

  startSpawn() {
    this.pipeList = [];
    this.activePipeList = [];
    this.spawnPipe();
    const spawnInterval = Math.abs(this.pipeSpacing / this.pipeMoveSpeed);
    this.schedule(this.spawnPipe, spawnInterval);
    this.pipeIsRunning = true;
  }

  spawnPipe = () => {
    if (!this.pipePrefab) {
      return;
    }
    let pipeGroup: PipeGroup3x | null = null;
    if (this.pipePool.size() > 0) {
      pipeGroup = this.pipePool.get()!.getComponent(PipeGroup3x);
    } else {
      pipeGroup = instantiate(this.pipePrefab).getComponent(PipeGroup3x);
    }
    if (!pipeGroup) {
      return;
    }
    this.node.addChild(pipeGroup.node);
    pipeGroup.node.active = true;
    pipeGroup.init(this);
    this.pipeList.push(pipeGroup);
    this.activePipeList.push(pipeGroup);
  };

  recyclePipe(pipe: PipeGroup3x) {
    const activeIndex = this.activePipeList.indexOf(pipe);
    if (activeIndex !== -1) {
      this.activePipeList.splice(activeIndex, 1);
    }
    const listIndex = this.pipeList.indexOf(pipe);
    if (listIndex !== -1) {
      this.pipeList.splice(listIndex, 1);
    }
    pipe.node.active = false;
    this.pipePool.put(pipe.node);
  }

  forEachActivePipe(callback: (pipe: PipeGroup3x) => void) {
    this.activePipeList.forEach(callback);
  }

  /** @deprecated 计分改由 Bird 按 active 列表选下一根，保留兼容 */
  getNext() {
    return this.pipeList.shift() || null;
  }

  /**
   * 复活清场：清掉鸟前方 clearAhead 内的管子，并在更远处保留/生成，
   * 避免在死亡点原地复活立刻撞管。
   */
  resumeAfterRevive(birdX: number, clearAhead = 420) {
    const keep: PipeGroup3x[] = [];
    const drop: PipeGroup3x[] = [];
    for (const pipe of this.activePipeList) {
      if (!pipe?.node?.isValid) {
        continue;
      }
      if (pipe.node.position.x > birdX + clearAhead) {
        keep.push(pipe);
      } else {
        drop.push(pipe);
      }
    }
    for (const p of drop) {
      p.node.active = false;
      this.pipePool.put(p.node);
    }
    this.activePipeList = keep;
    this.pipeList = keep.slice().sort((a, b) => a.node.position.x - b.node.position.x);
    this.unschedule(this.spawnPipe);
    const spawnInterval = Math.abs(this.pipeSpacing / this.pipeMoveSpeed);
    // 稍晚再出第一根，给玩家反应时间
    this.scheduleOnce(() => {
      if (!this.pipeIsRunning) {
        return;
      }
      this.spawnPipe();
      this.schedule(this.spawnPipe, spawnInterval);
    }, 0.85);
    this.pipeIsRunning = true;
  }

  reset() {
    this.unschedule(this.spawnPipe);
    // 回收所有活跃管，避免残留
    const snapshot = this.activePipeList.slice();
    for (const p of snapshot) {
      if (p?.node?.isValid) {
        p.node.active = false;
        this.pipePool.put(p.node);
      }
    }
    this.pipeList = [];
    this.activePipeList = [];
    this.pipeIsRunning = false;
    this.difficultyScore = 0;
  }
}
