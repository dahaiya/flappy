import { Color, Graphics, Node, Sprite, UITransform } from 'cc';

/**
 * 统一可爱黄鸟：黄身、蓝翅、黄嘴黄脚。
 * 盖住图集 pixel bird，保留根节点 UITransform 供 AABB。
 */
export function applyCuteYellowBird(birdNode: Node | null | undefined) {
  if (!birdNode?.isValid) {
    return;
  }

  const rootSprite = birdNode.getComponent(Sprite);
  if (rootSprite) {
    rootSprite.enabled = false;
  }

  // 隐藏其它旧装饰
  for (const child of birdNode.children) {
    if (child.name !== 'customBirdArt' && /bird|wing|eye/i.test(child.name)) {
      child.active = false;
    }
  }

  let art = birdNode.getChildByName('customBirdArt');
  if (!art) {
    art = new Node('customBirdArt');
    art.layer = birdNode.layer;
    birdNode.addChild(art);
  }
  art.active = true;
  art.setPosition(0, 0, 0);
  art.setSiblingIndex(birdNode.children.length - 1);

  const rootUi = birdNode.getComponent(UITransform);
  const w = rootUi?.width || 86;
  const h = rootUi?.height || 60;
  const ui = art.getComponent(UITransform) || art.addComponent(UITransform);
  ui.setContentSize(w, h);

  let g = art.getComponent(Graphics);
  if (!g) {
    g = art.addComponent(Graphics);
  }
  g.clear();

  // 颜色
  const body = new Color(255, 214, 70, 255);      // 黄身
  const bodyShade = new Color(245, 180, 40, 255); // 肚皮阴影
  const wing = new Color(80, 170, 255, 255);      // 蓝翅
  const wingDark = new Color(50, 130, 220, 255);
  const beak = new Color(255, 170, 40, 255);      // 黄嘴
  const beakDark = new Color(230, 130, 20, 255);
  const foot = new Color(255, 190, 50, 255);      // 黄脚
  const eyeWhite = new Color(255, 255, 255, 255);
  const eyeBlack = new Color(30, 30, 40, 255);
  const cheek = new Color(255, 140, 150, 200);
  const outline = new Color(40, 50, 70, 255);

  // 脚（先画，在身后感）
  g.fillColor = foot;
  g.roundRect(-14, -22, 10, 8, 3);
  g.fill();
  g.roundRect(2, -22, 10, 8, 3);
  g.fill();
  g.strokeColor = outline;
  g.lineWidth = 1.5;
  g.roundRect(-14, -22, 10, 8, 3);
  g.stroke();
  g.roundRect(2, -22, 10, 8, 3);
  g.stroke();

  // 身体
  g.fillColor = body;
  g.circle(0, 0, 22);
  g.fill();
  g.fillColor = bodyShade;
  g.ellipse(0, -6, 14, 10);
  g.fill();
  g.strokeColor = outline;
  g.lineWidth = 2;
  g.circle(0, 0, 22);
  g.stroke();

  // 蓝翅膀（身后偏左下）
  g.fillColor = wing;
  g.ellipse(-16, -2, 14, 10);
  g.fill();
  g.fillColor = wingDark;
  g.ellipse(-18, -4, 8, 5);
  g.fill();
  g.strokeColor = outline;
  g.lineWidth = 1.5;
  g.ellipse(-16, -2, 14, 10);
  g.stroke();

  // 前翅一点装饰
  g.fillColor = wing;
  g.ellipse(8, -4, 9, 7);
  g.fill();
  g.strokeColor = outline;
  g.lineWidth = 1.2;
  g.ellipse(8, -4, 9, 7);
  g.stroke();

  // 嘴（朝右，飞行朝向）
  g.fillColor = beak;
  g.moveTo(18, 2);
  g.lineTo(32, -1);
  g.lineTo(18, -6);
  g.close();
  g.fill();
  g.strokeColor = beakDark;
  g.lineWidth = 1.5;
  g.moveTo(18, 2);
  g.lineTo(32, -1);
  g.lineTo(18, -6);
  g.close();
  g.stroke();

  // 眼睛
  g.fillColor = eyeWhite;
  g.circle(8, 8, 7);
  g.fill();
  g.fillColor = eyeBlack;
  g.circle(10, 8, 3.2);
  g.fill();
  g.fillColor = eyeWhite;
  g.circle(11, 9.5, 1.2);
  g.fill();
  g.strokeColor = outline;
  g.lineWidth = 1.2;
  g.circle(8, 8, 7);
  g.stroke();

  // 腮红
  g.fillColor = cheek;
  g.circle(4, 0, 3.5);
  g.fill();

  // 小羽冠
  g.fillColor = body;
  g.circle(-4, 20, 4);
  g.fill();
  g.circle(2, 22, 3.2);
  g.fill();
  g.strokeColor = outline;
  g.lineWidth = 1.2;
  g.circle(-4, 20, 4);
  g.stroke();
  g.circle(2, 22, 3.2);
  g.stroke();
}
