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
 * 【tickInterval 三档统一 = 0.1s（10Hz），输出量只由 damagePerTick 承担】
 *
 * 【为什么不随等级变间隔】
 *   间隔是"节奏 / 事件粒度"，不是输出量。让它随等级变，等于把两件事拧在同一个旋钮上：
 *   升一级到底是"打得更疼"还是"打得更密"？玩家感知不出区别，调数值的人却要同时算两个数。
 *   固定之后 dps 与 damagePerTick 一一对应 —— **改伤害就是改输出，没有第二种解读**。
 *
 * 【为什么是 0.1s】
 *   高频持续伤害（激光 / 电链 / 光环）业界常见区间是 0.05 ~ 0.15s，0.1s 是最主流的取值：
 *     - 100ms 以下，人眼已经当作"连续在掉血"，看不出一跳一跳；
 *     - 又足够稀疏，一次结算仍是一次【离散事件】——击杀（enemy_die → 加分 / 掉落 /
 *       将来的受击特效）需要一个明确的"这一下打死"的时刻，做成每帧扣血就永远糊在一起。
 *   本项目里加密 tick 几乎零成本（敌机查询本来就每帧都在做，结算只是复用那一帧的结果），
 *   所以这个值纯按手感挑，不受性能约束。想更顺滑就调到 0.06s，伤害同比缩小即可。
 *
 * 【数值怎么来的】dps = damagePerTick / tickInterval，持续命中全吃：
 *   lv1 6 / 0.1 = 60 dps
 *   lv2 11 / 0.1 = 110 dps —— 旧"lv3 ~110 dps"的校准锚点
 *   lv3 20 / 0.1 = 200 dps —— 与旧 lv5 持平，BOSS 的 TTK 不用重算
 * ⚠️ Math.round 在结算时取整，lv1 的 6 实际是 60dps（较理论 58 高约 3%），无感。
 *
 * 【width 仍然递进（36 → 40 → 44）】
 *   严格"只改伤害"的话 width 也该统一，但它是激光【唯一可见的升级反馈】——
 *   激光不像实体弹能"多发几颗"，光束不跟着变粗，升级在画面上就只剩机型贴图变了。
 *   若你更想要"等级纯粹 = 伤害"，把三档 width 拉平即可，一行的事。
 */
const LEVELS: readonly BeamLevel[] = [
  { damagePerTick: 6, tickInterval: 0.1, width: 36, length: 1200 },
  { damagePerTick: 11, tickInterval: 0.1, width: 40, length: 1200 },
  { damagePerTick: 20, tickInterval: 0.1, width: 44, length: 1200 },
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
    // shoot: 'ships/ship_blue/shoot',
  },
}
