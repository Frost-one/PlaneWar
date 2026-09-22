import { type EnemyConfig } from './EnemyConfig'

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
  assetPaths: { sprite: 'enemies/enemy_boss/ship_0012/spriteFrame' },
}
