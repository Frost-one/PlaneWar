import { LaneEmitter } from '../../entities/emitters/LaneEmitter'
import type { LaneLevel } from '../../entities/emitters/LaneEmitter'
import type { ShipConfig } from './ShipConfig'

/**
 * 苍岩（绿）：贯穿 · 高血低速，站桩刚
 *
 * 与赤焰【共用同一个 LaneEmitter 类】—— 差别全在下面的数值：
 *   赤焰：spreadAngle > 0、laneWidth = 0 → 扇形铺开
 *   苍岩：spreadAngle = 0、laneWidth > 0 → 多条平行弹道 + 穿透
 * 所以"共用发射器"和"数值写在各自飞船文件里"并不冲突：
 *   共享的是【算法】，不共享的是【数值】。
 *
 * 【3 档火力，与 3 张贴图 1:1】（每升一级换一张图）
 *
 * 【数值怎么来的】取原 5 档里的第 1 / 3 / 5 档做基底，中间档略作收敛：
 *   lv1 25 伤 单弹 不穿透  → 保留，开局手感不变（~78 dps）
 *   lv2 36 伤 2 弹 穿 1    → 弹道间距 32，开始有"一条线扫过去"的感觉（~120 dps）
 *   lv3 52 伤 3 弹 穿 3    → 满级 ≈ 旧 lv5（~185 dps）
 * 每级跨度约 +55%，比原来 5 档的 +20% 更有升级感。
 */
const LEVELS: readonly LaneLevel[] = [
  { damage: 25, interval: 0.32, speed: 900, pierce: 0, count: 1 },
  { damage: 36, interval: 0.3, speed: 920, pierce: 1, count: 2, laneWidth: 32 },
  { damage: 52, interval: 0.28, speed: 940, pierce: 3, count: 3, laneWidth: 64 },
]

export const SHIP_GREEN: ShipConfig = {
  id: 'ship_green',
  name: '苍岩',
  maxHp: 160,
  speed: 360,
  scale: 3,
  scalePerLevel: 0.1,
  fireStyleName: '贯穿',
  emitters: [new LaneEmitter('main', LEVELS)],

  // 资源：与数值同处一个文件
  assetPaths: {
    // 第 1/2/3 级各一张图，与火力 1:1（取图统一走 getShipSprite(id, 火力等级 - 1)）。
    // ⚠️ 取 SpriteFrame 必须带 `/spriteFrame` 子资源后缀，漏了会加载失败。
    sprites: [
      'ships/ship_green/sprite_level_1/spriteFrame',
      'ships/ship_green/sprite_level_2/spriteFrame',
      'ships/ship_green/sprite_level_3/spriteFrame',
    ],
    // 与赤焰共用同一份子弹 prefab
    bullet: 'ships/ship_green/Bullet_1',
    // shoot: 'ships/ship_green/shoot',
  },
}
