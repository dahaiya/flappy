import { _decorator, Component, instantiate, Node, NodePool, Prefab } from 'cc';
import { PipeGroup3x } from './PipeGroup3x';
const { ccclass, property } = _decorator;

@ccclass('PipeManager3x')
export class PipeManager3x extends Component {
  @property(Prefab)
  pipePrefab: Prefab | null = null;

  @property
  pipeMoveSpeed = -300;

  @property
  pipeSpacing = 300;

  @property
  spacingMinValue = 150;

  @property
  spacingMaxValue = 200;

  pipeList: PipeGroup3x[] = [];
  activePipeList: PipeGroup3x[] = [];
  pipeIsRunning = false;
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
      pipeGroup = this.pipePool.get().getComponent(PipeGroup3x);
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
    pipe.node.active = false;
    this.pipePool.put(pipe.node);
  }

  forEachActivePipe(callback: (pipe: PipeGroup3x) => void) {
    this.activePipeList.forEach(callback);
  }

  getNext() {
    return this.pipeList.shift() || null;
  }

  resumeAfterRevive(birdX: number) {
    const visiblePipes = this.activePipeList.filter((pipe) => pipe.node.position.x > birdX + 80);
    this.activePipeList = visiblePipes;
    this.pipeList = visiblePipes.slice();
    this.unschedule(this.spawnPipe);
    const spawnInterval = Math.abs(this.pipeSpacing / this.pipeMoveSpeed);
    this.schedule(this.spawnPipe, spawnInterval);
    this.pipeIsRunning = true;
  }

  reset() {
    this.unschedule(this.spawnPipe);
    this.pipeList = [];
    this.activePipeList = [];
    this.pipeIsRunning = false;
  }
}
