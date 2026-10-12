import { type EnemyConfig } from './EnemyConfig'
import { LaneEmitter } from '../../entities/emitters/LaneEmitter'

/**
 * 精英机：正弦横摆、血量厚、掉落率高。
 *
 * 【数值校准】锚点 = 玩家 lv2（中期，~110 dps），目标击杀 ~2.5s → maxHp 260。
 * 详见 EnemyConfig.ts 顶部"TTK 倒推"说明。
 *
 * 【能力目录】declares：一个正弦横摆移动 descent + 一个朝下红圆发射器 main。
 *   何时横摆、何时开火由 DefaultEnemyAI 决定（每帧 descent + 启用全部发射器）。
 *   "写死的阶段/发射器"已从数据里消失——编排在 AI。
 */
export const ENEMY_ELITE: EnemyConfig = {
  id: 'enemy_elite',
  name: '精英机',
  maxHp: 260,
  speed: 110,
  score: 50,
  damage: 40,
  dropChance: 0.35,
  isBoss: false,
  scale: 5,
  assetPaths: {
    sprite: 'enemies/enemy_elite/ship_0016/spriteFrame',
    bullet: 'enemies/enemy_elite/Enemy_Bullet',
  },
  // 能力目录：正弦横摆移动 + 一个朝下红圆（弹丸伤害 10 与撞击 40 解耦，符合"体积小易躲"）
  moves: {
    descent: (node, s) => {
      const p = node.position
      const SINE_AMP = 120
      const SINE_FREQ = 0.6
      const phase = 2 * Math.PI * SINE_FREQ * s.elapsed
      // 对称夹紧：出生点靠边时波峰不飘出屏外（直接 clamp 会把波峰削平）
      const room = Math.min(s.startX - s.bounds.minX, s.bounds.maxX - s.startX)
      const amp = Math.min(SINE_AMP, Math.max(0, room))
      node.setPosition(s.startX + amp * Math.sin(phase), p.y - s.speed * s.dt)
    },
  },
  emitters: {
    // 保留箭头函数形式（与 ShipConfig.emitters 同形）；AI 按 key 'main' 启用
    main: () => new LaneEmitter('enemy_elite_main', [
      { damage: 10, interval: 1.3, speed: 240, baseAngle: 180 }
    ]),
  },
}
