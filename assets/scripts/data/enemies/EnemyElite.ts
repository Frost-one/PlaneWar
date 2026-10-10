import { type EnemyConfig } from './EnemyConfig'
import { LaneEmitter } from '../../entities/emitters/LaneEmitter'

/**
 * 精英机：正弦横摆、血量厚、掉落率高。
 *
 * 【数值校准】锚点 = 玩家 lv2（中期，~110 dps），目标击杀 ~2.5s → maxHp 260。
 * 详见 EnemyConfig.ts 顶部"TTK 倒推"说明。
 */
export const ENEMY_ELITE: EnemyConfig = {
  id: 'e_elite',
  name: '精英机',
  maxHp: 260,
  speed: 110,
  score: 50,
  damage: 40,
  /** 正弦横摆：以出生 x 为基准左右摆，同时持续下坠；摆动参数写死在闭包里 */
  move: (node, s) => {
    const p = node.position
    const SINE_AMP = 120
    const SINE_FREQ = 0.6
    const phase = 2 * Math.PI * SINE_FREQ * s.elapsed
    // 对称夹紧：出生点靠边时波峰不飘出屏外（直接 clamp 会把波峰削平）
    const room = Math.min(s.startX - s.bounds.minX, s.bounds.maxX - s.startX)
    const amp = Math.min(SINE_AMP, Math.max(0, room))
    node.setPosition(s.startX + amp * Math.sin(phase), p.y - s.speed * s.dt)
  },
  dropChance: 0.35,
  isBoss: false,
  scale: 5,
  assetPaths: {
    sprite: 'enemies/enemy_elite/ship_0016/spriteFrame',
    bullet: 'enemies/enemy_elite/Enemy_Bullet',
  },
  /**
   * 开火：一发朝下的红色小圆，间隔适中、易躲。
   * 弹丸伤害（10）与撞击伤害（cfg.damage=40）解耦——弹幕单颗只扣 10，符合"体积小易躲"。
   * emitters 是【工厂闭包】数组：箭头函数延迟到敌机生成时才 new 出实例（见 Enemy.init），
   * 配置加载时只创建函数、不创建实例。
   */
  emitters: [
    () => new LaneEmitter('e_elite_main', [
      { damage: 10, interval: 1.3, speed: 240, baseAngle: 180 }
    ]),
  ],
}
