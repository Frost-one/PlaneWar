import { type EnemyConfig } from './EnemyConfig'
import { LaneEmitter } from '../../entities/emitters/LaneEmitter'

/**
 * BOSS：血厚、多阶段、必掉。
 *
 * 【数值校准】锚点 = 玩家 lv3（满级，~150 dps），目标击杀 ~40s（多阶段）→ maxHp 3000。
 * 详见 EnemyConfig.ts 顶部"TTK 倒推"说明。
 *
 * 【能力目录（只声明"拥有什么"）】
 *   三个移动能力：descent（入场下降）/ sweep（顶部横扫）/ triangle（三角走位）
 *   两个开火能力：spread（扇形散射）/ aim（更快直射）
 *   "何时用什么"完全交给 BossAI（entities/ai/BossAI.ts）：
 *   下降入场 → 顶部横扫+扇形 → 三角+瞄准 → 循环 1↔2。想换套路只改 BossAI，本文件不用动。
 *
 * ⚠️ 走位参数（悬停线 / 摆幅 / 频率 / 三角顶点）是手感参数，需在 Cocos 编辑器里调；
 *   这里给的是"能看出套路"的初值，不是最终手感。
 */
const BOSS_HOVER_Y = 220

export const ENEMY_BOSS: EnemyConfig = {
  id: 'enemy_boss',
  name: 'BOSS',
  maxHp: 3000,
  speed: 60,
  score: 500,
  damage: 60,
  spawnCentered: true,
  dropChance: 1,
  isBoss: true,
  scale: 7,
  assetPaths: {
    sprite: 'enemies/enemy_boss/ship_0012/spriteFrame',
    bullet: 'enemies/enemy_boss/Enemy_Bullet',
  },
  // —— 移动能力目录 ——
  moves: {
    // 入场下降：纯下坠
    descent: (node, s) => {
      const p = node.position
      node.setPosition(p.x, p.y - s.speed * s.dt)
    },
    // 顶部左右横扫（雷霆战机标志性走位）：在悬停线水平正弦摆
    sweep: (node, s) => {
      const SWEEP_AMP = Math.min(200, (s.bounds.maxX - s.bounds.minX) / 2 - 40)
      const SWEEP_FREQ = 0.45
      const x = s.startX + SWEEP_AMP * Math.sin(2 * Math.PI * SWEEP_FREQ * s.elapsed)
      node.setPosition(x, BOSS_HOVER_Y)
    },
    // 三角移动：顶点在悬停线上下摆动（相位从 0 开始，循环回横扫不会错位）
    triangle: (node, s) => {
      const T = 4
      const cy = BOSS_HOVER_Y
      const verts = [
        { x: s.startX, y: cy - 90 },
        { x: s.startX - 130, y: cy + 70 },
        { x: s.startX + 130, y: cy + 70 },
      ]
      const t = (s.elapsed % T) / T * 3
      const seg = Math.floor(t) % 3
      const local = t - Math.floor(t)
      const a = verts[seg]
      const b = verts[(seg + 1) % 3]
      node.setPosition(a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local)
    },
  },
  // —— 开火能力目录（保留箭头函数形式；AI 按 key 启用）——
  emitters: {
    spread: () => new LaneEmitter('enemy_boss_spread', [
      { damage: 8, interval: 1.6, speed: 220, baseAngle: 180, count: 5, spreadAngle: 60 }
    ]),
    aim: () => new LaneEmitter('enemy_boss_aim', [
      { damage: 12, interval: 0.7, speed: 320, baseAngle: 180 }
    ]),
  },
}
