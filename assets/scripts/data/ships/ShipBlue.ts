import { BeamEmitter } from '../../entities/emitters/BeamEmitter'
import type { BeamLevel } from '../../entities/emitters/BeamEmitter'
import type { ShipConfig } from './ShipConfig'

/**
 * 湛影（蓝）：激光 · 低血高速，走位要求最高
 *
 * 【"完全不同的射击方式"就是这样落地的】
 *   数值在这里（本文件），实现在 `entities/emitters/BeamEmitter.ts`。
 *   本文件只有装配声明 —— 没有一行算法，也没有为激光特设的分支。
 *
 * 旧结构下这里只能是 `WEAPON_LASER.levels = []` + 每帧 warn：
 *   因为 `FirePlan { interval, shots[] }` 装不下"持续光束"这种模型。
 *   换成 Emitter 之后，激光就是"没有冷却、每帧都在"的一个发射器，和散射平级。
 *
 * 【3 档火力，与 3 张贴图 1:1】（每升一级换一张图）
 *
 * 【数值怎么来的】激光的 dps = damagePerTick / tickInterval（持续命中，全吃）：
 *   lv1 7/0.12  ≈ 58 dps   光束宽 26（原 lv1 是 50 dps，略微上调）
 *   lv2 11/0.10 ≈ 110 dps  宽 34 —— 正好落在旧"lv3 ~110 dps"的校准锚点上
 *   lv3 16/0.08 ≈ 200 dps  宽 44 —— 与旧 lv5 持平，BOSS 的 TTK 不用重算
 * 每级跨度约 +90%（原 5 档约 +30%）：激光没有"多发几颗"这种可见变化，
 * 只能靠"更粗的光束 + 更高的跳伤"来让升级被感知，所以跨度给得比实体弹更大。
 */
const LEVELS: readonly BeamLevel[] = [
  { damagePerTick: 7, tickInterval: 0.12, width: 26, length: 1200 },
  { damagePerTick: 11, tickInterval: 0.1, width: 34, length: 1200 },
  { damagePerTick: 16, tickInterval: 0.08, width: 44, length: 1200 },
]

export const SHIP_BLUE: ShipConfig = {
  id: 'ship_blue',
  name: '湛影',
  maxHp: 100,
  speed: 480,
  scale: 3,
  scalePerLevel: 0.1,
  fireStyleName: '激光',
  emitters: [new BeamEmitter('beam', LEVELS)],

  // 资源：激光机【没有 bullet】，用 beam 代替 —— 不写就是没有，不用塞假值
  assetPaths: {
    // 第 1/2/3 级各一张图，与火力 1:1（取图统一走 getShipSprite(id, 火力等级 - 1)）。
    // ⚠️ 取 SpriteFrame 必须带 `/spriteFrame` 子资源后缀，漏了会加载失败。
    sprites: [
      'ships/ship_blue/sprite_level_1/spriteFrame',
      'ships/ship_blue/sprite_level_2/spriteFrame',
      'ships/ship_blue/sprite_level_3/spriteFrame',
    ],
    beam: 'ships/ship_blue/beam',
    // shoot: 'ships/ship_blue/shoot',
  },
}
