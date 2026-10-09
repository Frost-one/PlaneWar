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
 *
 * 【为什么是 3 档，而且和贴图 1:1】
 *   火力档数 = 外观张数 = 3：每升一级飞机就换个样，升级的反馈最直接。
 *   代价是单档跨度变大（原 5 档每级约 +15%，现 3 档每级约 +60%），
 *   手感差异更明显 —— 这正是"上限压到 3"想要的效果：让升级这件事被看见。
 *
 * 【数值怎么来的】取原 5 档里的第 1 / 3 / 5 档做基底，再拉开间隔：
 *   原 lv1 9 伤 7 弹   → 保留，开局手感不变
 *   原 lv3 13 伤 9 弹  → 提速到 0.27s、扇形加宽到 38°
 *   原 lv5 17 伤 12 弹 → 提到 18 伤、扇形加宽到 44°
 *   满级 ≈ 旧 lv5（单目标约 150 dps），敌机按旧锚点校准的 TTK 基本不用动。
 */
const LEVELS: readonly LaneLevel[] = [
  { damage: 9, interval: 0.3, speed: 1000, count: 7, spreadAngle: 32, pierce: 0 },
  { damage: 13, interval: 0.27, speed: 1080, count: 9, spreadAngle: 38, pierce: 0 },
  { damage: 18, interval: 0.24, speed: 1150, count: 12, spreadAngle: 44, pierce: 0 },
]

export const SHIP_RED: ShipConfig = {
  id: 'ship_red',
  name: '赤焰',
  maxHp: 120,
  speed: 420,
  scale: 3,
  // 每升 1 级 +0.1（满级 3 级 → 3.2）。原来是 0.3（满级会到 3.6），
  // 疑似与其他两艘 0.05 同批写入时手滑 —— 三艘统一 0.1：
  // 既看得出来变大，又不会让判定框随体型一起肥一圈（STG 里那是纯惩罚）。
  scalePerLevel: 0.1,
  fireStyleName: '散射',

  // 资源：与数值同处一个文件，改这架飞机只看这里
  assetPaths: {
    // 外观档：数组下标 = 外观档号，与火力【1:1】—— 第 1/2/3 级各一张图。
    // 第 1/2/3 级各一张图，与火力 1:1。将来若档数 > 图数，映射加在 getShip(id).asset.sprites 里即可。
    // ⚠️ 取 SpriteFrame 必须带 `/spriteFrame` 子资源后缀，漏了会加载失败。
    sprites: [
      'ships/ship_red/sprite_level_1/spriteFrame',
      'ships/ship_red/sprite_level_2/spriteFrame',
      'ships/ship_red/sprite_level_3/spriteFrame',
    ],
    // 与苍岩共用同一份子弹 prefab：结构完全一样，复制三份只会拆散对象池
    bullet: 'ships/ship_red/Bullet_1',
    // shoot: 'ships/ship_red/shoot',
  },

  /**
   * 装配：一个 LaneEmitter 吃下全部 3 档（扇形铺开：spreadAngle > 0、laneWidth = 0）
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
