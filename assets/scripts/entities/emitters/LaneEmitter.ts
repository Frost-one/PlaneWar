// 仅用于类型标注，编译后消失 —— 本文件运行时不依赖引擎
import type { BulletManager } from '../../managers/BulletManager'
import type { Emitter, FireContext } from './Emitter'

/**
 * 一个火力档的弹道参数（原 `WeaponConfig.WeaponLevel`）。
 *
 * 【为什么类型定义跟着发射器走，而不是单独一个 config 文件】
 *   它是"LaneEmitter 的输入契约" —— 参数的长相由发射器决定，改发射器就得改它。
 *   放在一起才能保证两者不会各自漂移。
 *   数据（各机型的具体数值）则下沉到各自的飞船文件里（见 ShipRed.ts）。
 *
 * 【为什么要保留这个类型，而不是让每架飞船自己定义字段形状】
 *   有统一形状，加一个全局子弹属性（比如弹种 id、暴击率）才能"改一处、全部生效"；
 *   各写各的字段，类型系统就帮不上忙了，最终会变成几个互不相识的字面量对象。
 */
export interface LaneLevel {
  /** 单发伤害：该档【最终】值，运行时直接可用，不再二次相乘 */
  readonly damage: number
  /** 发射间隔（秒） */
  readonly interval: number
  /** 子弹飞行速度（px/s，设计单位） */
  readonly speed: number
  /** 单次发射弹数（省略 = 1） */
  readonly count?: number
  /** 各弹【角度】的总跨度（度）；省略 = 0 即全部平行 */
  readonly spreadAngle?: number
  /** 各弹【横向位置】的总宽度（px）；省略 = 0 即从同一点发出 */
  readonly laneWidth?: number
  /** 可穿透目标数（省略 = 0 即不穿透） */
  readonly pierce?: number
  /**
   * 弹道基准朝向（度，0 = 垂直向上，180 = 垂直向下）；省略 = 0。
   * 玩家子弹默认朝上；敌机子弹要朝下发射，设 180 即可，扇形在此基准上向两侧铺开。
   */
  readonly baseAngle?: number
}

/**
 * 平行 / 扇形弹道发射器 —— 散射与贯穿【共用】这一个实现。
 *
 * 【三种观感由同一组参数自然组合出来】
 *   扇形（散射）：    spreadAngle > 0、laneWidth = 0
 *   平行弹道（贯穿）：spreadAngle = 0、laneWidth > 0
 *   斜向平行：       两者都 > 0
 *
 * 【生命周期：装配期 vs 运行期】
 *   - 装配期（实体生成时）：配置里的工厂闭包 `() => new LaneEmitter(...)` 被调用，
 *     把整份档位表交进来，得到一个发射器实例。此时它什么都不做，只是"待命"。
 *   - 运行期（每帧）：`tick(dt, ctx)` —— 自己攒冷却、自己看当前是第几档、到点了自己生成子弹。
 *
 * 【冷却为什么是对象自己的字段】
 *   一个发射器实例跨所有档位共用同一份冷却进度，所以【升级不打断射击】。
 *   早期版本是"每档一个发射器对象、换档就换对象"，结果换档会丢冷却 → 卡一下才继续开火。
 */
export class LaneEmitter implements Emitter {
  readonly id: string

  /** 各火力档参数；索引 = fireLevel - 1 */
  private readonly levels: readonly LaneLevel[]

  /** 火力档位数（索引上限）；供 P 道具升级时计算 weaponLevel 天花板 */
  readonly maxLevel: number

  /** 低于该火力等级则完全不开火（做"升级解锁僚机 / 副武器"时用） */
  private readonly minLevel: number

  /** 距离下一次开火还剩多少秒；**跨档位共享**，所以换档不会重置它 */
  private cooldown = 0

  /** "没有子弹 prefab"只警告一次的标志位（避免每帧刷屏） */
  private warnedNoPrefab = false

  constructor(id: string, levels: readonly LaneLevel[], minLevel = 1) {
    this.id = id
    this.levels = levels
    this.minLevel = minLevel
    this.maxLevel = levels.length
  }

  tick(dt: number, ctx: FireContext): void {
    // 未解锁：直接返回，且【不推进冷却】—— 解锁后立刻能开火，不用再等一轮
    if (ctx.fireLevel < this.minLevel) return

    // ctx.bulletManager 由 Player 注入，且 Player 已在 onLoad 对 bulletManager 做了必填校验
    // （漏拖直接抛异常），所以这里不再判空
    const bulletManager: BulletManager = ctx.bulletManager

    // 实体弹机型必须带 prefab；激光机型走的是 BeamEmitter，根本不会进这里。
    // 只警告一次：这里是每帧调用，每帧打日志会把控制台刷爆。
    if (!ctx.bulletPrefab) {
      if (!this.warnedNoPrefab) {
        this.warnedNoPrefab = true
        console.warn(
          `[LaneEmitter] ${this.id} 没有子弹 prefab，无法开火（检查该机型 assetPaths.bullet 是否配置且已放进 resources）`,
        )
      }
      return
    }

    const level = this.levelOf(ctx.fireLevel)
    if (!level) return

    // 射速乘区作用在"间隔"上：1.2 倍速 = 间隔 ÷ 1.2
    const interval = level.interval / Math.max(0.01, ctx.mods.rateMultiplier)

    this.cooldown += dt
    if (this.cooldown < interval) return

    // 用"减"而不是"清零"：保留超出的那部分，避免高帧率下射速被悄悄吃掉
    this.cooldown -= interval

    const count = Math.max(1, (level.count ?? 1) + ctx.mods.extraCount)
    const totalAngle = level.spreadAngle ?? 0
    const totalWidth = level.laneWidth ?? 0
    const baseAngle = level.baseAngle ?? 0
    const damage = Math.round(level.damage * ctx.mods.damageMultiplier)

    for (let i = 0; i < count; i++) {
      // t ∈ [-0.5, +0.5]，两端对称摊开
      // ⚠️ 早退只能用 count <= 1 判断，不能看角度/宽度是否为 0 ——
      //    否则 count=3 且 spreadAngle=0（三条平行弹道）会被错当成单发
      const t = count <= 1 ? 0 : i / (count - 1) - 0.5

      bulletManager.spawnBullet(
        ctx.x,
        ctx.y,
        {
          angleDeg: baseAngle + t * totalAngle,
          offsetX: t * totalWidth,
          speed: level.speed,
          damage,
          pierce: level.pierce ?? 0,
        },
        ctx.bulletPrefab,
      )
    }
  }

  /** 清零冷却（换机型 / 重开一局时调用） */
  reset(): void {
    this.cooldown = 0
  }

  /** 取当前档位；越界取最近的有效档，不报错也不打断 */
  private levelOf(fireLevel: number): LaneLevel | null {
    if (this.levels.length === 0) return null
    return this.levels[Math.min(Math.max(fireLevel, 1), this.levels.length) - 1]
  }
}
