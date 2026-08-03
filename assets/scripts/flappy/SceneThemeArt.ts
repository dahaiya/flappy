import { Color, Graphics, Node, Sprite, UITransform } from 'cc';

/**
 * 参考图风格（style-ref）：深蓝夜空竖向渐变 + 星星、
 * 浅蓝透视瓷砖地面、亮绿（困难橙）金属圆角管 + 开口法兰。
 * 运行时 Graphics，不依赖新图集。
 */

const SKY_TOP = new Color(6, 22, 72, 255);
const SKY_MID = new Color(12, 58, 130, 255);
const SKY_BOT = new Color(78, 178, 235, 255);
const STAR = new Color(255, 255, 255, 230);

const TILE_A = new Color(120, 220, 245, 255);
const TILE_B = new Color(95, 200, 230, 255);
const TILE_LINE = new Color(70, 165, 200, 220);
const TILE_EDGE = new Color(50, 125, 165, 255);
const TILE_HI = new Color(210, 250, 255, 90);

const PIPE_LIME = new Color(200, 235, 100, 255);
const PIPE_MID = new Color(165, 215, 75, 255);
const PIPE_DARK = new Color(105, 155, 40, 255);
const PIPE_HI = new Color(240, 255, 190, 230);
const PIPE_RIM = new Color(185, 230, 90, 255);

const PIPE_HARD_L = new Color(255, 195, 95, 255);
const PIPE_HARD_M = new Color(255, 155, 45, 255);
const PIPE_HARD_D = new Color(205, 95, 18, 255);
const PIPE_HARD_HI = new Color(255, 240, 185, 230);

function ensureArt(parent: Node, name: string): { node: Node; g: Graphics; ui: UITransform } {
  let node = parent.getChildByName(name);
  if (!node) {
    node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
  }
  node.active = true;
  node.setPosition(0, 0, 0);
  const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
  let g = node.getComponent(Graphics);
  if (!g) {
    g = node.addComponent(Graphics);
  }
  return { node, g, ui };
}

function hideRootSprite(node: Node) {
  const sp = node.getComponent(Sprite);
  if (sp) {
    sp.enabled = false;
  }
}

/** 深蓝→天蓝竖向渐变 + 星星（盖住旧背景图） */
export function applyNightSkyBackground(bg: Node | null | undefined, width?: number, height?: number) {
  if (!bg?.isValid) {
    return;
  }
  hideRootSprite(bg);
  const rootUi = bg.getComponent(UITransform) || bg.addComponent(UITransform);
  const w = width || rootUi.width || 720;
  const h = height || rootUi.height || 1560;
  rootUi.setContentSize(w, h);

  const { g, ui } = ensureArt(bg, 'themeSkyArt');
  ui.setContentSize(w, h);
  g.clear();

  // 多层横条近似渐变（上深下浅，更接近参考图）
  const bands = 36;
  const bandH = h / bands;
  for (let i = 0; i < bands; i += 1) {
    const t = i / (bands - 1);
    let col: Color;
    if (t < 0.42) {
      col = lerpColor(SKY_TOP, SKY_MID, t / 0.42);
    } else {
      col = lerpColor(SKY_MID, SKY_BOT, (t - 0.42) / 0.58);
    }
    g.fillColor = col;
    const y = h / 2 - (i + 1) * bandH;
    g.rect(-w / 2, y, w, bandH + 1.5);
    g.fill();
  }

  // 星星偏上半屏（确定性伪随机）
  const seed = Math.floor(w * 13 + h * 7);
  for (let i = 0; i < 64; i += 1) {
    const rx = pseudo(seed + i * 17);
    const ry = pseudo(seed + i * 31);
    const x = (rx - 0.5) * w * 0.94;
    const y = h * (0.04 + ry * 0.58);
    const r = 1.0 + pseudo(seed + i * 47) * 2.4;
    const a = 130 + Math.floor(pseudo(seed + i * 53) * 110);
    g.fillColor = new Color(STAR.r, STAR.g, STAR.b, a);
    g.circle(x, h / 2 - y, r);
    g.fill();
    if (r > 2.1) {
      g.strokeColor = new Color(255, 255, 255, 110);
      g.lineWidth = 1;
      g.moveTo(x - r * 1.7, h / 2 - y);
      g.lineTo(x + r * 1.7, h / 2 - y);
      g.moveTo(x, h / 2 - y - r * 1.7);
      g.lineTo(x, h / 2 - y + r * 1.7);
      g.stroke();
    }
  }
}

/** 青蓝瓷砖地面（随 ground 节点一起滚动） */
export function applyTileGround(ground: Node | null | undefined) {
  if (!ground?.isValid) {
    return;
  }
  hideRootSprite(ground);
  const rootUi = ground.getComponent(UITransform) || ground.addComponent(UITransform);
  const w = rootUi.width || 720;
  const h = rootUi.height || 180;

  const { g, ui } = ensureArt(ground, 'themeTileArt');
  ui.setContentSize(w, h);
  g.clear();

  g.fillColor = TILE_A;
  g.rect(-w / 2, -h / 2, w, h);
  g.fill();

  const tile = Math.max(34, Math.min(48, Math.floor(h * 0.26)));
  const cols = Math.ceil(w / tile) + 1;
  const rows = Math.ceil(h / tile) + 1;
  const originX = -w / 2;
  const originY = -h / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = originX + col * tile;
      const y = originY + row * tile;
      const alt = (row + col) % 2 === 0;
      g.fillColor = alt ? TILE_A : TILE_B;
      g.rect(x, y, tile, tile);
      g.fill();
      g.fillColor = TILE_HI;
      g.rect(x + 1, y + tile - 5, tile - 2, 4);
      g.fill();
      g.strokeColor = TILE_LINE;
      g.lineWidth = 1.4;
      g.rect(x, y, tile, tile);
      g.stroke();
    }
  }

  // 顶边深线（接天空）
  g.strokeColor = TILE_EDGE;
  g.lineWidth = 3;
  g.moveTo(-w / 2, h / 2 - 1);
  g.lineTo(w / 2, h / 2 - 1);
  g.stroke();
  // 次高光线
  g.strokeColor = new Color(180, 235, 250, 120);
  g.lineWidth = 2;
  g.moveTo(-w / 2, h / 2 - 4);
  g.lineTo(w / 2, h / 2 - 4);
  g.stroke();
}

export type MetalPipeOpts = {
  /** topPipe anchorY=1；bottomPipe anchorY=0 */
  isTop: boolean;
  hard?: boolean;
};

/**
 * 亮绿金属管道：圆角柱身 + 开口侧法兰环。
 * 保留根 UITransform 尺寸供 AABB；关掉 Sprite。
 * 高度变化后必须重绘。
 */
export function applyMetalPipeArt(pipe: Node | null | undefined, opts: MetalPipeOpts) {
  if (!pipe?.isValid) {
    return;
  }
  hideRootSprite(pipe);
  const rootUi = pipe.getComponent(UITransform) || pipe.addComponent(UITransform);
  const w = Math.max(40, rootUi.width || 75);
  const h = Math.max(40, rootUi.height || 200);
  // 视觉略加宽，更接近参考图粗金属管；碰撞仍用 root UITransform
  const bodyW = Math.min(w * 1.08, w + 8);
  const rimW = bodyW * 1.32;
  const rimH = Math.min(30, Math.max(16, bodyW * 0.34));
  const ringH = Math.min(11, rimH * 0.42);

  const hard = !!opts.hard;
  const cL = hard ? PIPE_HARD_L : PIPE_LIME;
  const cM = hard ? PIPE_HARD_M : PIPE_MID;
  const cD = hard ? PIPE_HARD_D : PIPE_DARK;
  const cH = hard ? PIPE_HARD_HI : PIPE_HI;
  const cR = hard ? PIPE_HARD_L : PIPE_RIM;

  const { g, ui } = ensureArt(pipe, 'themePipeArt');
  ui.setContentSize(w, h);
  ui.setAnchorPoint(rootUi.anchorX, rootUi.anchorY);
  g.clear();

  const isTop = opts.isTop;
  const shaftEnd = isTop ? -(h - rimH) : h - rimH;
  const y0 = 0;

  // 柱身
  g.fillColor = cM;
  roundRectFill(g, -bodyW / 2, isTop ? shaftEnd : y0, bodyW, isTop ? -shaftEnd : shaftEnd, 12);
  // 暗侧
  g.fillColor = cD;
  roundRectFill(g, bodyW * 0.16, isTop ? shaftEnd : y0, bodyW * 0.34, isTop ? -shaftEnd : shaftEnd, 7);
  // 高光条
  g.fillColor = cH;
  roundRectFill(
    g,
    -bodyW * 0.4,
    isTop ? shaftEnd + 4 : 4,
    bodyW * 0.18,
    Math.max(18, (isTop ? -shaftEnd : shaftEnd) - 8),
    5,
  );

  // 开口法兰
  const rimY = isTop ? -h : h - rimH;
  g.fillColor = cR;
  roundRectFill(g, -rimW / 2, rimY, rimW, rimH, 9);
  g.fillColor = cL;
  roundRectFill(g, -rimW / 2 + 3, rimY + 3, rimW - 6, rimH - 6, 7);
  g.strokeColor = cD;
  g.lineWidth = 2;
  g.roundRect(-rimW / 2 + 2, rimY + 2, rimW - 4, rimH - 4, 6);
  g.stroke();

  // 环箍
  const bandY = isTop ? shaftEnd * 0.55 : shaftEnd * 0.45;
  g.fillColor = cL;
  g.rect(-bodyW / 2 - 2, bandY - ringH / 2, bodyW + 4, ringH);
  g.fill();
  g.strokeColor = cD;
  g.lineWidth = 1.5;
  g.rect(-bodyW / 2 - 2, bandY - ringH / 2, bodyW + 4, ringH);
  g.stroke();

  // 外轮廓
  g.strokeColor = new Color(40, 60, 30, 180);
  g.lineWidth = 2;
  roundRectStroke(g, -bodyW / 2, isTop ? shaftEnd : y0, bodyW, isTop ? -shaftEnd : shaftEnd, 12);
  roundRectStroke(g, -rimW / 2, rimY, rimW, rimH, 9);
}

function roundRectFill(g: Graphics, x: number, y: number, w: number, h: number, r: number) {
  if (h < 0) {
    y += h;
    h = -h;
  }
  if (w < 0) {
    x += w;
    w = -w;
  }
  const rr = Math.min(r, w / 2, h / 2);
  g.roundRect(x, y, w, h, rr);
  g.fill();
}

function roundRectStroke(g: Graphics, x: number, y: number, w: number, h: number, r: number) {
  if (h < 0) {
    y += h;
    h = -h;
  }
  if (w < 0) {
    x += w;
    w = -w;
  }
  const rr = Math.min(r, w / 2, h / 2);
  g.roundRect(x, y, w, h, rr);
  g.stroke();
}

function lerpColor(a: Color, b: Color, t: number) {
  const u = Math.max(0, Math.min(1, t));
  return new Color(
    Math.round(a.r + (b.r - a.r) * u),
    Math.round(a.g + (b.g - a.g) * u),
    Math.round(a.b + (b.b - a.b) * u),
    255,
  );
}

function pseudo(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 背景 + 双地面一键套用 */
export function applyPlayfieldTheme(canvas: Node | null | undefined) {
  if (!canvas?.isValid) {
    return;
  }
  const cui = canvas.getComponent(UITransform);
  const w = cui?.width || 720;
  const h = cui?.height || 1560;
  applyNightSkyBackground(canvas.getChildByName('background'), w, h);
  applyTileGround(canvas.getChildByName('ground'));
  applyTileGround(canvas.getChildByName('groundLong'));
}
