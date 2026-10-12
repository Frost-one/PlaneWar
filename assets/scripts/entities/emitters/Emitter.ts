// 仅用于类型标注：`import type` 编译后不产生真实 import，避免与 BulletManager 形成循环依赖
import type { BulletManager } from '../../managers/BulletManager'
import type { Prefab } from 'cc'

/**
 * 发射器 —— 开火的最小可组合单元。
 *
 * 【为什么要有这一层，而不是一个大的 fire() 函数】
 *   这类游戏（雷霆战机）的装备是【分槽且可独立更换】的：主机 / 僚机 / 副武器。
 *   所以"一次开火"从来不是一段逻辑，而是【若干个发射单元同时工作】。
 *   把粒度降到"一个发射器"，组合就只是个数组 —— 换僚机不用碰主机。
 *
 * 【与旧 WeaponSystem 的本质差别】
 *   旧：`buildFirePlan()` 返回 `BulletSpawnParams[]`（一份"本轮发哪些子弹"的数据）
 *   新：`Emitter.tick()` 返回 void（"你自己去执行"）
 *
 *   ⚠️ 这个差别是整套设计的命门：返回"子弹参数"这个契约【本身就排除了激光】——
 *      激光没有子弹、没有飞行体、没有 interval，只能用 `return []` 假装工作。
 *      改成"你自己去执行"之后，发实体弹 / 开持续光束 / 放导弹 全都装得下。
 *
 * 【冷却由谁管】
 *   由每个发射器自己管（闭包里的 cooldown）。这样"主机 0.24s 一轮、僚机 0.5s 一轮、
 *   激光没有冷却"这三种节奏可以天然共存，不需要一个统一结构去兼容它们。
 */

/**
 * 一块判定区域（四条边描述的矩形）。
 *
 * 【为什么用四条边，而不是 center + size】
 *   判定端只关心"谁落在这个范围内"，四条边可以直接比较，
 *   不必每次先把中心换算成 min/max —— 少一层推导就少一处能写错的地方。
 *
 * 【坐标系】与 ctx.x / ctx.y 同源：三个容器（Player / EnemyContainer / BulletContainer）
 *   同为 GameRoot 的直接子节点且都在原点，所以这里一律是【局部坐标】，不做任何转换。
 */
export interface HitRect {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/**
 * 可被伤害的最小契约 —— 只有"挨打"这一件事。
 *
 * 【为什么激光器不直接拿 Enemy】
 *   让它认识 Enemy 本体，就等于给发射器加了一条对具体敌机类型的依赖；
 *   将来要给 BOSS 的护盾、场景里的可破坏物、僚机的假目标做同样的事都要改类型。
 *   只需要"能挨打"，那就只声明"能挨打"。
 */
export interface Damageable {
  /** hitPoint：可选的命中点（世界坐标）。子弹由 Enemy 碰撞回调给、激光由 BeamEmitter 给；不传则由受击方自行取默认位置 */
  takeDamage(d: number, hitPoint?: { x: number; y: number }): void
}

/**
 * 一次矩形查询的结果：最近的目标，以及它此刻的 y。
 *
 * 【为什么要把 y 也带出来】
 *   光束不贯穿 ⇒ 它必须【画到<｜hy_place▁holder▁no▁813｜> 目标身上为止】。位置是画不出 dash 的关键输入，
 *   而目标本身（Damageable）刻意只有 takeDamage 一件事。
 *   把坐标放进查询结果，就不需要为了显示问题去撑胖 Damageable 接口。
 */
export interface HitResult {
  readonly target: Damageable
  /** 命中目标此刻的中心 y（与 rect 同源的坐标） */
  readonly y: number
}

/**
 * 矩形查询：给我一块区域，返回【其中最接近发射端的一个】目标，没有则返回 null。
 *
 * 【为什么是"一个"而不是"所有"】
 *   湛影定位是不贯穿：一个 tick 只结算挡在最前面的那一台。
 *   "谁最近"取决于坐标，而坐标只有持有节点的那一侧知道 —— 所以选择逻辑在 Manager 里做，
 *   这里只把它对外表现为一个简单函数，不必把坐标也塞进 Damageable 接口。
 */
export type HitQuery = (rect: HitRect) => HitResult | null

/**
 * 开火上下文：一次 tick 时的"当时事实"。
 * 发射器只从 ctx 读，不自己去别的地方捞 —— 这是它能被复用（甚至被 BOSS 复用）的前提。
 */
export interface FireContext {
  /**
   * 当前火力等级（1 起）。
   *
   * 【为什么等级是"上下文的一个数"，而不是"换一个发射器"】
   *   早期写法是每档一个发射器实例、换档就换对象 —— 结果是：
   *   换档会丢掉已积累的冷却进度，玩家体感是"升级瞬间卡一下才继续射击"；
   *   而且来回切换时，各对象残留的冷却值还不一样，时快时慢、不可预期。
   *   现在一个发射器持有全部档位，换档只是它下次开火时读的另一个数，
   *   冷却连续 → **升级不打断射击**。
   *
   * 发射器自己负责 clamp（越界静默取最近的有效档），调用方不用管上限。
   */
  readonly fireLevel: number
  /** 出生点 x（机头，容器局部坐标） */
  readonly x: number
  /** 出生点 y */
  readonly y: number
  /** 子弹工厂（玩家的或敌方的），由持有者注入 */
  readonly bulletManager: BulletManager | null

  /**
   * 本次开火要用哪种子弹 prefab（由持有者从机型资源注入）。
   *
   * 【为什么放进 ctx 而不是让 BulletManager 自己知道】
   *   BulletManager 一旦认识"机型"，就等于给它加了一条对玩家数据的反向依赖，
   *   将来敌机开火、僚机副武器都复用不了它。放进 ctx 之后，
   *   BulletManager 退化成纯工厂："给我 prefab，我给你子弹"。
   *
   * 【激光机型为 null】
   *   激光没有实体弹，`BeamEmitter` 根本不读这个字段 ——
   *   "没有"就用 null 表达，不用塞一个假 prefab。
   */
  readonly bulletPrefab: Prefab | null
  /** 修饰量：飞船升级 / 道具带来的乘区 */
  readonly mods: FireMods

  /**
   * 命中查询器：给发射器一个"这块矩形里有没有目标"的入口（激光用）。
   *
   * 【为什么它必须在 ctx 里，而不是发射器自己去取管理器】
   *   一旦 BeamEmitter 自己 import EnemyManager，它就和一个具体的场景管理器
   *   焊死了，脱离本场景（复用给 BOSS、写单元测试）都做不到。
   *   放进 ctx 之后它退化成"谁调用我，谁负责给我事实"。
   *
   * 【实体弹不需要它】
   *   子弹有飞行体，命中由物理碰撞回调完成，所以在 LaneEmitter 这里是 null。
   */
  readonly hitQuery: HitQuery | null
}

/**
 * 开火修饰量 —— 飞船升级（局外成长）唯一的注入方式。
 *
 * ⚠️ 只放"乘区"，不放基值：基值永远是配置表里的那个数。
 *    否则 3 机型 × 5 飞船级 × 3 火力档 = 45 份数值，改一个基值要改 45 处。
 */
export interface FireMods {
  /** 射速乘区：1 = 原速，1.2 = 快 20%（作用于 interval） */
  readonly rateMultiplier: number
  /** 伤害乘区：1 = 原伤，1.2 = +20% */
  readonly damageMultiplier: number
  /** 每轮额外多发几颗（整数，作用于 count） */
  readonly extraCount: number
}

export const NO_MODS: FireMods = {
  rateMultiplier: 1,
  damageMultiplier: 1,
  extraCount: 0,
}

export interface Emitter {
  /** 唯一标识（同一个机型里不要重名，用于 debug 与缓存 key） */
  readonly id: string

  /** 火力档位数（= levels.length）；P 道具升级时作为 weaponLevel 的天花板 */
  readonly maxLevel: number

  /**
   * 每帧推进。到点了就自己开火 —— 没有"返回值"，也没有"本轮发什么"的数据契约。
   *
   * @param dt 帧间隔
   * @param ctx 本次 tick 的上下文
   */
  tick(dt: number, ctx: FireContext): void

  /**
   * 重置：换机型 / 换火力档 / 重开一局时调用。
   * 必须把冷却清零，并销毁自己创建的一切节点（例如激光的光束节点）。
   */
  reset(): void
}
