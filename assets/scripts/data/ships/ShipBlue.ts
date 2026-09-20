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
 */
const LEVELS: readonly BeamLevel[] = [
  { damagePerTick: 6, tickInterval: 0.12, width: 26, length: 1200 },
  { damagePerTick: 8, tickInterval: 0.11, width: 30, length: 1200 },
  { damagePerTick: 10, tickInterval: 0.1, width: 34, length: 1200 },
  { damagePerTick: 13, tickInterval: 0.09, width: 38, length: 1200 },
  { damagePerTick: 16, tickInterval: 0.08, width: 44, length: 1200 },
]

export const SHIP_BLUE: ShipConfig = {
  id: 'ship_blue',
  name: '湛影',
  maxHp: 100,
  speed: 480,
  fireStyleName: '激光',
  emitters: [new BeamEmitter('beam', LEVELS)],

  // 资源：激光机【没有 bullet】，用 beam 代替 —— 不写就是没有，不用塞假值
  assetPaths: {
    // ⚠️ 与苍岩一样是【占位路径】，图还没进 resources/。
    //    蓝色机现在是靠"加载失败也能跑"的兜底在运行（Player 保持 prefab 原图）。
    sprites: [
      'ships/ship_blue/sprite_level_1/spriteFrame',
      'ships/ship_blue/sprite_level_2/spriteFrame',
      'ships/ship_blue/sprite_level_3/spriteFrame',
    ],
    beam: 'ships/ship_blue/beam',
    // shoot: 'ships/ship_blue/shoot',
  },
}
