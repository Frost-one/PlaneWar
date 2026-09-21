import { type EnemyConfig } from './EnemyConfig'

/**
 * 普通机：直线下坠，用于构成波次的主体。
 *
 * 【数值校准】锚点 = 玩家 lv1 火力（~45 dps），目标击杀 ~0.4s → maxHp 16。
 * 详见 EnemyConfig.ts 顶部"TTK 倒推"说明。
 *
 * 【为什么数值直接写在这里，而不是另开一个 EnemyStats】
 *   一种敌机对应一组数值，且这组数值【只被这一架用】 ——
 *   那它就是这一种敌机的一部分，拆出去只是多一次跳转，没有任何复用收益。
 *   （与 ships 的 ShipRed 同理：一架飞机一套文件）
 */
export const ENEMY_NORMAL: EnemyConfig = {
  id: 'e_normal',
  name: '普通机',
  maxHp: 16,
  speed: 160,
  score: 10,
  damage: 25,
  /** 直线下坠：x 不变，y 每帧减 speed·dt */
  move: (node, s) => {
    const p = node.position
    node.setPosition(p.x, p.y - s.speed * s.dt)
  },
  dropChance: 0.08,
  isBoss: false,
  scale: 3,
  assetPaths: { sprite: 'enemies/enemy_normal/ship_0020/spriteFrame' },
}
