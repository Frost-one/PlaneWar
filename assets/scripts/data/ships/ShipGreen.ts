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
  fireStyleName: '贯穿',
  spriteIndex: 1,
  emitters: [new LaneEmitter('main', LEVELS)],
}
