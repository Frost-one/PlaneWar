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
 */
const LEVELS: readonly LaneLevel[] = [
  { damage: 25, interval: 0.32, speed: 900, pierce: 0, count: 1 },
  { damage: 30, interval: 0.31, speed: 910, pierce: 1, count: 2, laneWidth: 24 },
  { damage: 36, interval: 0.3, speed: 920, pierce: 2, count: 3, laneWidth: 48 },
  { damage: 43, interval: 0.29, speed: 930, pierce: 3, count: 3, laneWidth: 64 },
  { damage: 52, interval: 0.28, speed: 940, pierce: 4, count: 3, laneWidth: 80 },
]

export const SHIP_GREEN: ShipConfig = {
  id: 'ship_green',
  name: '苍岩',
  maxHp: 160,
  speed: 360,
  scale: 3,
  scalePerLevel: 0.05,
  fireStyleName: '贯穿',
  emitters: [new LaneEmitter('main', LEVELS)],

  // 资源：与数值同处一个文件
  assetPaths: {
    // ⚠️ 这里是【占位路径】：苍岩的三张外观图还没放进 resources/，
    //    加载会失败但不会卡住启动（第 0 档缺图 → 整架跳过 + 打 error）。
    //    补图时只需把文件放进去、路径对上，代码一行都不用改。
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
