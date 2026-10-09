import { Color, Graphics, Node, UITransform } from 'cc'
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
 * 流动特效的参数 —— 让光束看起来是"正在往外发射的能量"，而不是一条静止的色块。
 *
 * 【为什么放在这里，而不是机型配置里】
 *   它是【发射器级的外观】，不是"每档会变的数值"：三档共用同一套流动感，
 *   换档只改宽度和伤害。按项目的判据 —— 只有"换机型才变"的东西才值得进配置，
 *   所以颜色/流动参数跟着发射器走（与 BeamLevel 是档位数值，两者刻意分开）。
 */
/** 相邻两条亮条的固定间距（px）—— 与光束长度无关，保证密度和速度恒定 */
const FLOW_SPACING = 200
/** 单段亮条的高度（px） */
const FLOW_SEGMENT_HEIGHT = 18
/** 亮条上移速度（px/s） */
const FLOW_SPEED = 900
/** 亮条相对光束的横向占比（略窄，露出底色当描边） */
const FLOW_WIDTH_RATIO = 0.7
/** 亮条比底色亮多少（0~255） */
const FLOW_BRIGHTNESS = 70
/** 亮条的 alpha（比底色更实，才会"看得见在动"） */
const FLOW_ALPHA = 235

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

  /** 火力档位数（索引上限）；供 P 道具升级时计算 weaponLevel 天花板 */
  readonly maxLevel: number
  private readonly color: Color
  /** 流动亮条的颜色：由底色现算，换底色时自动跟随，不必再多一个配置位 */
  private readonly flowColor: Color

  /** 光束节点（懒创建，reset 时销毁） */
  private node: Node | null = null
  private gfx: Graphics | null = null

  /** 距离下一次伤害结算还剩多少秒 */
  private tickTimer = 0

  /** 流动特效的相位（秒）；reset 时清零 */
  private elapsed = 0

  private layerWarned = false

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
    this.maxLevel = levels.length
    // 亮条 = 底色整体提亮（各通道夹到 255），换底色时不用再手配一个颜色
    this.flowColor = new Color(
      Math.min(255, color.r + FLOW_BRIGHTNESS),
      Math.min(255, color.g + FLOW_BRIGHTNESS),
      Math.min(255, color.b + FLOW_BRIGHTNESS),
      FLOW_ALPHA,
    )
  }

  tick(dt: number, ctx: FireContext): void {
    // 未解锁 / 档位表为空：收掉光束并退出
    if (ctx.fireLevel < this.minLevel || this.levels.length === 0) {
      this.teardown()
      return
    }

    const level = this.levelOf(ctx.fireLevel)
    if (!level || !this.ensureBeam(ctx)) return

    // —— 每帧查询一次：结果同时给【绘制长度】和【本帧的伤害结算】用 ——
    //
    // 【为什么放在 tick 开头，而不是等到伤害结算那一刻才查】
    //   光束的视觉长度必须【每帧】跟着最近的那台敌机动，否则它会以 8~12Hz（tick 频率）
    //   一跳一跳地伸缩，看上去像卡顿、还会露馅。查一次的代价是一次列表遍历
    //   （规模由屏内的敌机数决定，通常 < 30），比多维护一份"上次查询缓存"简单得多。
    //
    // 【激光的命中不走物理】它没有飞行体，不会有 onBeginContact 回调；
    //   判定就是【这一段矩形区域】 vs 【敌机命中盒】的纯几何比较，
    //   由 ctx.hitQuery 完成（持有者注入，本发射器不认识任何管理器）。
    const half = level.width * 0.5
    const hit = ctx.hitQuery?.({
      minX: ctx.x - half,
      maxX: ctx.x + half,
      minY: ctx.y,
      maxY: ctx.y + level.length,
    })

    // —— 绘制 ——
    //
    // ⚠️ 位置必须是【机头本身】，不能再往上抬。
    //    Graphics 画的内容以节点锚点为原点：rect(0 → len) 本身就是从锚点向 +y 延伸 len。
    //    早前写成 `ctx.y + length * 0.5`，等于先把锚点抬高半个长、再从那里向上画，
    //    于是整条光束悬空了 length / 2 —— 而判定矩形是直接用 ctx.y 算的、没有这半个偏移，
    //    结果就是"判定正常、显示错位"。这正是"同一份事实不要有两条推导路径"的反面教材。
    this.node!.setPosition(ctx.x, ctx.y)

    // 重绘：Graphics 每帧 clear + fill 成本很低（就几个矩形）
    // 不贯穿 ⇒ 画到被它打中的那台敌机身上为止，长度随目标实时伸缩。
    // ⚠️ clamp 到 >= 0：目标几乎贴上机头时差值可能为负，负值会让矩形朝下画。
    const beamLen = hit ? Math.max(0, hit.y - ctx.y) : level.length

    // 流动相位：暂停时 Player.update 直接 return，dt 不推进 → 亮条跟着一起冻结
    this.elapsed += dt

    this.gfx!.clear()

    // ① 底色：整条光束
    this.gfx!.fillColor = this.color
    this.gfx!.rect(-half, 0, level.width, beamLen)
    this.gfx!.fill()

    // ② 流动亮条：在光束内部【从下往上】循环滚动 —— 表达"正在发射"
    //
    // 【速度必须与光束长度解耦】亮条位置 = 相位 + k·间距，
    //   相位 = elapsed·FLOW_SPEED，间距是固定像素值 FLOW_SPACING（不随光束长度缩放）。
    //   于是：
    //     · 每条亮条的移动速度恒为 FLOW_SPEED px/s（无论光束多长都不变）；
    //     · 短光束只是"容纳的亮条更少"，而不是"亮条跑得更快"。
    //   早前的写法用 `(i·beamLen)/FLOW_SEGMENTS` 当间距、又用 beamLen 取模，
    //   导致命中使光束变短时整段流光节奏被压缩成数倍 ⇒ 看着像加速。
    this.gfx!.fillColor = this.flowColor
    const phase = (this.elapsed * FLOW_SPEED) % FLOW_SPACING
    for (let y = phase; y < beamLen; y += FLOW_SPACING) {
      // 最顶端那条可能被光束末端截断，按剩余长度裁一下，避免画到敌机身上
      const h = Math.min(FLOW_SEGMENT_HEIGHT, beamLen - y)
      this.gfx!.rect(-half * FLOW_WIDTH_RATIO, y, level.width * FLOW_WIDTH_RATIO, h)
    }
    // 所有亮条合成一次 fill（Graphics 支持多段 path 一次填充，比每段 fill 一次便宜）
    this.gfx!.fill()

    // —— 伤害按 tick 结算（与帧率无关）——
    const interval = level.tickInterval / Math.max(0.01, ctx.mods.rateMultiplier)
    this.tickTimer += dt
    if (this.tickTimer < interval) return
    this.tickTimer -= interval

    // 不贯穿：一个 tick 只结算挡在最前面的那一台（"最前面"由查询侧判定）
    hit?.target.takeDamage(Math.round(level.damagePerTick * ctx.mods.damageMultiplier))
  }

  /** 清计时 + 清流动相位 + 销毁光束节点 */
  reset(): void {
    this.tickTimer = 0
    this.elapsed = 0
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

    // 挂载层 = 子弹管理器的容器节点 —— 激光和实体弹渲染在同一个容器下，
    // 层级统一；坐标也一致（容器位置是 0，与 Player 同父）。
    const layer = ctx.bulletManager?.node
    if (!layer) {
      if (!this.layerWarned) {
        this.layerWarned = true
        console.warn('【BeamEmitter】 拿不到子弹管理器（BulletManager 未注册）')
      }
      return false
    }

    this.node = new Node(`Beam_${this.id}`)
    this.node.parent = layer
    this.gfx = this.node.addComponent(Graphics)

    // ⚠️ 锚点必须设成左下角：让【节点本地原点 == node.position】，画什么就落在哪。
    //    否则 UITransform 渲染时会给内容加一个 anchor × contentSize 的反向平移
    //    （新建节点的默认anchor 是 (0.5, 0.5)、contentSize 是 100×100
    //     ⇒ 整条光束被悄悄挪了 (-50, -50)，而且这个尺寸还随 Graphics 是否更新包围盒而变化）。
    //    设成 (0,0) 之后偏移量恒为 0，与尺寸彻底解耦。
    this.node.getComponent(UITransform)?.setAnchorPoint(0, 0)
    return true
  }

  private teardown(): void {
    if (this.node && this.node.isValid) this.node.destroy()
    this.node = null
    this.gfx = null
  }
}
