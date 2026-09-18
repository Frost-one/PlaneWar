import { LaneEmitter } from '../../entities/emitters/LaneEmitter'
import type { LaneLevel } from '../../entities/emitters/LaneEmitter'
import type { ShipConfig } from './ShipConfig'

/**
 * 赤焰（红）：散射 · 中血中速，清杂兵
 *
 * 【数值为什么直接写在这里，而不是另开一个 WeaponConfig】
 *   一架飞机对应一组弹道数值，且这组数值【只被这一架用】 ——
 *   那它就是这个机型的一部分，拆出去只是多一次跳转，没有任何复用收益。
 *   调赤焰手感时开这一个文件就够了，不用在飞船表和武器表之间来回横跳。
 *
 * 【索引约定】数组下标 = weaponLevel - 1，**数组长度即火力上限**。
 *   想加一档火力就往数组里加一行，别处不用动。
 */
const LEVELS: readonly LaneLevel[] = [
  { damage: 9, interval: 0.3, speed: 1000, count: 7, spreadAngle: 32, pierce: 0 },
  { damage: 11, interval: 0.3, speed: 1000, count: 8, spreadAngle: 36, pierce: 0 },
  { damage: 13, interval: 0.28, speed: 1050, count: 9, spreadAngle: 40, pierce: 0 },
  { damage: 15, interval: 0.26, speed: 1100, count: 10, spreadAngle: 40, pierce: 0 },
  { damage: 17, interval: 0.24, speed: 1150, count: 12, spreadAngle: 40, pierce: 0 },
]

export const SHIP_RED: ShipConfig = {
  id: 'ship_red',
  name: '赤焰',
  maxHp: 120,
  speed: 420,
  fireStyleName: '散射',
  spriteIndex: 0,

  /**
   * 装配：一个 LaneEmitter 吃下全部 5 档（扇形铺开：spreadAngle > 0、laneWidth = 0）
   *
   * 【将来要加僚机长什么样】（先不实现，只是说明扩展点）
   *   emitters: [
   *     new LaneEmitter('main', LEVELS),
   *     new LaneEmitter('wing', WING_LEVELS, 3),  // ← 第三参数 = 火力 3 级起才开火
   *   ],
   *   注意：没有引入任何新概念，emitters 数组多一个元素而已，Player 的 tick 循环不用改。
   */
  emitters: [new LaneEmitter('main', LEVELS)],
}
