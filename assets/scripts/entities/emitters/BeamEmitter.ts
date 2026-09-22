import { Color, Graphics, Node } from 'cc'
import type { Emitter, FireContext } from './Emitter'

/**
 * 一个火力档的激光参数。
 *
 * 【为什么与 LaneLevel 是两套字段】
 *   两者是【模型差异】，不是参数差异：
 *     实体弹：spawn → 飞行 → 碰撞 → 回收（有 interval / speed，靠飞行体撞上去）
 *     激光　：持续存在的一段判定区（有 width / length / tickInterval，按 tick 结算）
 *   字段集基本不重叠，硬凑成一张表只会造出一堆 0 和 null 的占位。
 *
 * 【类型跟着发射器走】与 LaneLevel 同理：它是 BeamEmitter 的输入契约。
 *   各机型的具体数值下沉到飞船文件（见 ShipBlue.ts）。
 */
export interface BeamLevel {
  /** 每次结算的伤害 */
  readonly damagePerTick: number
  /** 结算间隔（秒） */
  readonly tickInterval: number
  /** 光束宽度（px） */
  readonly width: number
  /** 光束长度（px）；建议 >= 屏幕高度，保证一束贯穿到底 */
  readonly length: number
}

/** 默认光束颜色（青蓝半透明） */
const DEFAULT_BEAM_COLOR = new Color(120, 220, 255, 180)

/**
 * 持续光束发射器（激光）—— 没有冷却、没有子弹，每帧都在。
 *
 * 【它就是"为什么要有 Emitter 这层"的最好论据】
 *   旧结构 `FirePlan { interval, shots[] }` 装不下它，只能 `return []` 假装工作。
 *   现在它自己建节点、自己画、自己按 tick 结算 —— 不需要任何人替它做决定。
 *
 * 【为什么用 Graphics 现画，而不是一个 Beam.prefab】
 *   光束的形状就是"一个跟着机头走的矩形"，没有任何美术资源或碰撞体需要预制体提供。
 *   用 Graphics 现画可以避开"再拖一个 prefab 引用"的编辑器接线成本。
 *   将来要换成带贴图的激光，把 ensureBeam() 换成 instantiate 即可，外部零改动。
 */
export class BeamEmitter implements Emitter {
  readonly id: string

  private readonly levels: readonly BeamLevel[]
  private readonly minLevel: number
  private readonly color: Color

  /** 光束节点（懒创建，reset 时销毁） */
  private node: Node | null = null
  private gfx: Graphics | null = null

  /** 距离下一次伤害结算还剩多少秒 */
  private tickTimer = 0

  private layerWarned = false
  private damageWarned = false

  constructor(
    id: string,
    levels: readonly BeamLevel[],
    minLevel = 1,
    color: Color = DEFAULT_BEAM_COLOR,
  ) {
    this.id = id
    this.levels = levels
    this.minLevel = minLevel
    this.color = color
  }

  tick(dt: number, ctx: FireContext): void {
    // 未解锁 / 档位表为空：收掉光束并退出
    if (ctx.fireLevel < this.minLevel || this.levels.length === 0) {
      this.teardown()
      return
    }

    const level = this.levelOf(ctx.fireLevel)
    if (!level || !this.ensureBeam(ctx)) return

    // 光束锚点在机头，向 +y 延伸 —— 位置每帧跟随机头
    this.node!.setPosition(ctx.x, ctx.y + level.length * 0.5)

    // 重绘：Graphics 每帧 clear + fill 成本很低（就一个矩形）
    this.gfx!.clear()
    this.gfx!.fillColor = this.color
    this.gfx!.rect(-level.width * 0.5, 0, level.width, level.length)
    this.gfx!.fill()

    // 伤害按 tick 结算（与帧率无关）
    const interval = level.tickInterval / Math.max(0.01, ctx.mods.rateMultiplier)
    this.tickTimer += dt
    if (this.tickTimer < interval) return
    this.tickTimer -= interval

    // TODO(P3)：伤害判定 —— 需要一个"当前敌机列表"的查询入口。
    // 做法：做波次系统（WaveDirector）时给 FireContext 加一个 `enemies` 查询器，
    //      本发射器里补一段"矩形 vs 敌机"的判定即可，**结构不用改**。
    if (!this.damageWarned) {
      this.damageWarned = true
      console.warn(
        `[BeamEmitter] 伤害判定待 P3（需要敌机查询入口）；` +
          `当前档位 damagePerTick=${Math.round(level.damagePerTick * ctx.mods.damageMultiplier)} 只显示不结算`,
      )
    }
  }

  /** 清计时 + 销毁光束节点 */
  reset(): void {
    this.tickTimer = 0
    this.teardown()
  }

  /** 取当前档位；越界取最近的有效档 */
  private levelOf(fireLevel: number): BeamLevel | null {
    if (this.levels.length === 0) return null
    return this.levels[Math.min(Math.max(fireLevel, 1), this.levels.length) - 1]
  }

  /** 保证光束节点存在；挂载层缺失时返回 false（不静默失败，首次会 warn） */
  private ensureBeam(ctx: FireContext): boolean {
    if (this.node && this.node.isValid) return true

    if (!ctx.beamLayer) {
      if (!this.layerWarned) {
        this.layerWarned = true
        console.warn('【Player】 beamLayer没拖')
      }
      return false
    }

    this.node = new Node(`Beam_${this.id}`)
    this.node.parent = ctx.beamLayer
    this.gfx = this.node.addComponent(Graphics)
    return true
  }

  private teardown(): void {
    if (this.node && this.node.isValid) this.node.destroy()
    this.node = null
    this.gfx = null
  }
}
