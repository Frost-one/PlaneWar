import { type EnemyConfig } from './EnemyConfig'
import { LaneEmitter } from '../../entities/emitters/LaneEmitter'

/**
 * BOSS：血厚、多阶段、必掉；悬停与弹幕留到 BOSS 阶段再加。
 *
 * 【数值校准】锚点 = 玩家 lv3（满级，~150 dps），目标击杀 ~40s（多阶段）→ maxHp 6000。
 * 详见 EnemyConfig.ts 顶部"TTK 倒推"说明。
 */
export const ENEMY_BOSS: EnemyConfig = {
  id: 'e_boss',
  name: 'BOSS',
  maxHp: 3000,
  speed: 60,
  score: 500,
  damage: 60,
  /** 入场后悬停：降到 HOVER_Y 后停住（hoverY 写死在闭包），不再下落 */
  move: (node, s) => {
    const p = node.position
    const HOVER_Y = 250
    const y = p.y - s.speed * s.dt
    node.setPosition(p.x, Math.max(y, HOVER_Y))
  },
  spawnCentered: true,
  dropChance: 1,
  isBoss: true,
  scale: 7,
  assetPaths: {
    sprite: 'enemies/enemy_boss/ship_0012/spriteFrame',
    bullet: 'enemies/enemy_boss/Enemy_Bullet',
  },
  /**
   * 开火：两个发射器组合——
   *   e_boss_spread：5 路扇形铺开（基准朝下 180°，左右各 30°），单颗伤害低；
   *   e_boss_aim：中间一道更快的直射弹，压迫走位。
   * 单颗伤害都不高（8 / 12），靠"数量 + 弹幕形状"制造威胁，符合"红圆易躲"。
   * emitters 是【工厂闭包】数组：箭头函数延迟到敌机生成时才 new 出实例（见 Enemy.init）。
   */
  emitters: [
    () => new LaneEmitter('e_boss_spread', [
      { damage: 8, interval: 1.6, speed: 220, baseAngle: 180, count: 5, spreadAngle: 60 }
    ]),
    () => new LaneEmitter('e_boss_aim', [
      { damage: 12, interval: 0.7, speed: 320, baseAngle: 180 }
    ]),
  ],
}
