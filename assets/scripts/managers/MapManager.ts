import {
  _decorator,
  Component,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
} from 'cc'
import { GameConfig } from '../data/config/GameConfig'
import { eventBus } from '../core/EventBus'
import { GameState } from '../data/GameState'
import type { StateChangePayload } from '../core/GameEvent'
import { WFCGenerator, type WFCTile } from '../core/WFCGenerator'
import { validateRequiredProps } from '../core/utils/validate'
const { ccclass, property } = _decorator

// ==================== 瓦片 id 约定 ====================
// 0          纯水面
// 1  ~ 9     草地岛 3×3 模板：左上,上,右上 / 左,中,右 / 左下,下,右下
// 10 ~ 18    沙地岛 3×3 模板：顺序同上
const WATER_ID = 0
const GRASS_BASE = 1
const SAND_BASE = 10

/**
 * 3×3 模板各位置的四条边是否处于「外缘」（外缘 = 海岸线，画着沙滩描边）。
 * 模板位置索引：0左上 1上 2右上 3左 4中 5右 6左下 7下 8右下
 */
const TEMPLATE_EDGE: {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}[] = [
  { up: true, down: false, left: true, right: false }, // 0 左上
  { up: true, down: false, left: false, right: false }, // 1 上
  { up: true, down: false, left: false, right: true }, // 2 右上
  { up: false, down: false, left: true, right: false }, // 3 左
  { up: false, down: false, left: false, right: false }, // 4 中
  { up: false, down: false, left: false, right: true }, // 5 右
  { up: false, down: true, left: true, right: false }, // 6 左下
  { up: false, down: true, left: false, right: false }, // 7 下
  { up: false, down: true, left: false, right: true }, // 8 右下
]

// 边标签
const L_WATER = 'W' // 水
const L_GRASS = 'G' // 草地内部
const L_SAND = 'S' // 沙地内部
const L_GRASS_SHORE = 'BG' // 草地的海岸线（沙滩描边）
const L_SAND_SHORE = 'BS' // 沙地的海岸线

/**
 * 两条边标签能否面对面。
 * 规则：
 * - 同类型内部边可以相接（水-水、草-草、沙-沙）
 * - 海岸线**只能**对着水（这保证了每片陆地都被沙滩描边包围）
 * - 草与沙不能直接相接（必须隔水）—— 这也是把瓦片集保持完整的关键约束
 */
function edgeMatch(a: string, b: string): boolean {
  if (a === b) {
    return a === L_WATER || a === L_GRASS || a === L_SAND
  }
  if (a === L_WATER) return b === L_GRASS_SHORE || b === L_SAND_SHORE
  if (b === L_WATER) return a === L_GRASS_SHORE || a === L_SAND_SHORE
  return false
}

/** 按上面的 id 约定构造 WFC 瓦片集 */
function buildTileSet(waterWeight: number): WFCTile[] {
  const tiles: WFCTile[] = []

  tiles.push({
    id: WATER_ID,
    up: L_WATER,
    down: L_WATER,
    left: L_WATER,
    right: L_WATER,
    weight: Math.max(1, Math.round(waterWeight)),
  })

  const addTemplate = (base: number, inner: string, shore: string): void => {
    for (let i = 0; i < 9; i++) {
      const e = TEMPLATE_EDGE[i]
      tiles.push({
        id: base + i,
        up: e.up ? shore : inner,
        down: e.down ? shore : inner,
        left: e.left ? shore : inner,
        right: e.right ? shore : inner,
        weight: 1,
      })
    }
  }

  addTemplate(GRASS_BASE, L_GRASS, L_GRASS_SHORE)
  addTemplate(SAND_BASE, L_SAND, L_SAND_SHORE)

  return tiles
}

/** 一行地形的运行时数据 */
interface MapRow {
  /** 行节点：其子节点是本行的各列瓦片 */
  node: Node
  /** 本行各列的瓦片精灵，按列顺序 */
  cells: Sprite[]
  /** 本行各列当前显示的瓦片 id（生成下一块时用于接缝约束） */
  tiles: number[]
}

/**
 * 程序化地图生成器（基于 WFC 波函数坍缩）
 *
 * 生成模型：
 * - 图集里存在完整可拼接的 3×3「岛屿自动瓦片」模板（草地 / 沙地各一套），
 *   每张瓦片用四条边的标签描述，WFC 保证相邻瓦片的边缘严格对上
 * - WFC 在「水 / 草地 / 沙地」之间自动生成岛屿分布：
 *   陆地一定带沙滩描边且被水包围，草与沙不会直接相接
 *
 * 无限滚动：
 * - 每行节点独立向下移动（模拟飞机向前飞）
 * - 某行移出屏幕底部后挪到顶部，换上「预生成缓冲」里的地形
 * - 缓冲由 WFC 分块生成，每块最下面一行受「已存在的上一行」约束，保证接缝连续
 *
 * 贴图不写死在代码里：三组 SpriteFrame 由 Inspector 配置。
 */
@ccclass('MapManager')
export class MapManager extends Component {
  // ==================== 贴图配置 ====================

  /** 纯水面瓦片（对应 tile_0042） */
  @property({ type: SpriteFrame, tooltip: '纯水面瓦片，例如 tile_0042' })
  waterFrame: SpriteFrame | null = null

  /**
   * 草地岛的 3×3 模板，**必须按以下顺序拖入 9 张**：
   *   [0] 左上角  [1] 上边    [2] 右上角
   *   [3] 左边    [4] 中心    [5] 右边
   *   [6] 左下角  [7] 下边    [8] 右下角
   * 对应 tile_0037, 0038, 0039 / 0049, 0050, 0051 / 0061, 0062, 0063
   */
  @property({
    type: [SpriteFrame],
    tooltip: '草地岛 3×3 模板；顺序=左上,上,右上,左,中,右,左下,下,右下',
  })
  grassFrames: SpriteFrame[] = []

  /**
   * 沙地岛的 3×3 模板，顺序与 grassFrames 完全相同。
   * 对应 tile_0043, 0044, 0045 / 0055, 0056, 0057 / 0067, 0068, 0069
   */
  @property({
    type: [SpriteFrame],
    tooltip: '沙地岛 3×3 模板；顺序同 grassFrames',
  })
  sandFrames: SpriteFrame[] = []

  // ==================== 尺寸与滚动 ====================

  /** 每格瓦片的显示边长（像素） */
  @property({ tooltip: '每格瓦片的显示边长（像素）' })
  tileSize = 64

  /** 地图向下滚动的速度（像素/秒） */
  @property({ tooltip: '地图向下滚动速度（像素/秒）' })
  scrollSpeed = 80

  // ==================== WFC 参数 ====================

  /** 水面权重：越大水越多、岛屿越稀疏 */
  @property({ tooltip: '水面权重；越大水越多、岛屿越稀疏' })
  waterWeight = 10

  /** 每次 WFC 生成多少行 */
  @property({ tooltip: '每次 WFC 生成的行数；越大越连贯但单次耗时更高' })
  blockRows = 10

  /** 预生成缓冲行数：提前生成多少行备用，太小会在回收时卡顿 */
  @property({ tooltip: '提前生成多少行备用；太小会在回收时卡顿' })
  lookaheadRows = 8

  // ==================== 运行时状态 ====================

  /** id -> SpriteFrame 的查表 */
  private frameById: (SpriteFrame | null)[] = []
  /** WFC 求解器 */
  private wfc: WFCGenerator | null = null

  /** 所有行 */
  private rows: MapRow[] = []
  /** 列数（含左右各一列缓冲） */
  private cols = 0
  /** 每列瓦片中心的 x 起点（最左一列） */
  private leftX = 0
  /** 顶部阈值：行高于此 y 即认为在最上方 */
  private topY = 0
  /** 底部阈值：行低于此 y 即需要回收 */
  private bottomY = 0
  /** 整张地图的总高度，回收时用于把行挪回顶部 */
  private mapHeight = 0
  /** 是否处于暂停（冻结）；仅 PLAYING 时滚动 */
  private isPaused = true

  /**
   * 预生成的行缓冲。
   * pending[0] 是「下一个要出现在屏幕顶部的行」，后面的元素依次更靠上。
   */
  private pending: number[][] = []

  /**
   * 同步、无依赖的初始化：一次性铺好整张地图（建行节点 + WFC 生成地形）。
   * 这是 onLoad 该做的事 —— 同步、无 await、不依赖其他组件的 start。
   */
  protected onLoad(): void {
    // 三组贴图是必填的：缺了整张地图都是空白，且不报错 —— 启动即抛异常。
    // 数组属性连空数组也算缺失（validateRequiredProps 内部对 [] 单独判了）。
    validateRequiredProps('MapManager', {
      waterFrame: this.waterFrame,
      grassFrames: this.grassFrames,
      sandFrames: this.sandFrames,
    })
    this.build()
  }

  /**
   * 订阅跟随【激活状态】，与 onDisable 严格对称（统一走默认模式，不再用常驻例外）。
   * 本组件挂在常驻容器节点上、全程不失活，onDisable 实际不会被调用，
   * 但保持 onEnable/onDisable 配对能与实体/UI 组件完全一致，也避免将来节点被停用时漏退订。
   */
  protected onEnable(): void {
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDisable(): void {
    eventBus.off('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    // 兜底注销（off 幂等），不依赖 onDisable 是否被调用过
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 状态切换：与敌机/子弹一致，采用「时间停止」语义 ——
   * 仅 PLAYING 时滚动，暂停/菜单/结算时原地冻结。
   */
  private onStateChange({ newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING
  }

  // ==================== 构建 ====================

  /** 铺出整张地图：先建行节点，再用 WFC 生成地形填进去 */
  private build(): void {
    this.initTileSet()

    const T = this.tileSize
    const halfW = GameConfig.BOUND_MAX_X
    const halfH = GameConfig.BOUND_MAX_Y

    // 左右各多 1 列缓冲；上下各多几行缓冲，滚动时不留真空
    this.cols = Math.ceil((halfW * 2) / T) + 2
    const rowCount = Math.ceil((halfH * 2) / T) + 3

    this.topY = halfH + T
    this.bottomY = -halfH - T
    this.mapHeight = rowCount * T
    this.leftX = -((this.cols * T) / 2) + T / 2

    // 先造出所有行节点（此时还没贴图）
    for (let r = 0; r < rowCount; r++) {
      const row = this.createRow()
      row.node.setPosition(0, this.topY - r * T)
      this.rows.push(row)
    }

    // 一次性生成足够铺满屏幕的地形，逐行填进去
    const initial = this.generateBlock(rowCount, null)
    for (let r = 0; r < rowCount; r++) {
      this.applyRowTiles(this.rows[r], initial[r])
    }

    // 预生成后续要出现在顶部的行
    this.ensurePending()
  }

  /** 建立 id -> SpriteFrame 查表，并构造 WFC 求解器 */
  private initTileSet(): void {
    const frames: (SpriteFrame | null)[] = []
    frames[WATER_ID] = this.waterFrame
    for (let i = 0; i < 9; i++) {
      frames[GRASS_BASE + i] = this.grassFrames[i] ?? null
      frames[SAND_BASE + i] = this.sandFrames[i] ?? null
    }
    this.frameById = frames

    if (this.grassFrames.length < 9) {
      console.warn(
        '[MapManager] grassFrames 需要 9 张（3×3 模板顺序），当前不足，草地会显示为空',
      )
    }
    if (this.sandFrames.length < 9) {
      console.warn(
        '[MapManager] sandFrames 需要 9 张（3×3 模板顺序），当前不足，沙地会显示为空',
      )
    }
    if (!this.waterFrame) {
      console.warn('[MapManager] waterFrame 未设置，水面会显示为空')
    }

    this.wfc = new WFCGenerator(buildTileSet(this.waterWeight), edgeMatch)
  }

  /** 创建一行空节点（列精灵已就位，但还没贴图） */
  private createRow(): MapRow {
    const node = new Node('Row')
    node.parent = this.node

    const cells: Sprite[] = []
    for (let c = 0; c < this.cols; c++) {
      const cellNode = new Node(`Cell_${c}`)
      cellNode.parent = node

      const ui = cellNode.addComponent(UITransform)
      ui.setContentSize(this.tileSize, this.tileSize)

      const sp = cellNode.addComponent(Sprite)
      sp.sizeMode = Sprite.SizeMode.CUSTOM
      sp.trim = false

      cellNode.setPosition(this.leftX + c * this.tileSize, 0)
      cells.push(sp)
    }

    return {
      node,
      cells,
      tiles: new Array<number>(this.cols).fill(WATER_ID),
    }
  }

  /** 把一行瓦片 id 贴到行节点上 */
  private applyRowTiles(row: MapRow, tiles: number[]): void {
    for (let c = 0; c < this.cols; c++) {
      const id = tiles[c] ?? WATER_ID
      row.tiles[c] = id
      row.cells[c].spriteFrame = this.frameById[id] ?? null
    }
  }

  // ==================== WFC 生成 ====================

  /**
   * 生成一块地形。
   *
   * @param rowCount 要生成多少行
   * @param belowRow 下方已存在的那一行瓦片 id，用于约束本块「最下面一行」与其接缝；
   *                 传 null 表示无约束（首次生成）
   * @returns 行优先的瓦片 id 网格（共 rowCount 行）；多次失败则降级为全水
   */
  private generateBlock(
    rowCount: number,
    belowRow: number[] | null,
  ): number[][] {
    const wfc = this.wfc
    const w = this.cols
    if (!wfc) return this.fallbackBlock(rowCount)

    // 有下方参照行时，把本块最后一行的候选收紧为「能接在它之上」的瓦片
    let init: number[] | undefined
    if (belowRow) {
      init = new Array<number>(w * rowCount).fill(-1)
      const y = rowCount - 1
      for (let x = 0; x < w; x++) {
        init[y * w + x] = wfc.compatMask('up', belowRow[x] ?? WATER_ID)
      }
    }

    // WFC 属于随机求解，有失败概率，重试几次
    for (let attempt = 0; attempt < 6; attempt++) {
      const flat = wfc.solve(w, rowCount, init)
      if (flat) {
        const out: number[][] = []
        for (let y = 0; y < rowCount; y++) {
          out.push(flat.slice(y * w, (y + 1) * w))
        }
        return out
      }
    }

    console.warn('[MapManager] WFC 多次求解失败，本块降级为全水')
    return this.fallbackBlock(rowCount)
  }

  /** 降级方案：整块都是水面 */
  private fallbackBlock(rowCount: number): number[][] {
    const out: number[][] = []
    for (let y = 0; y < rowCount; y++) {
      out.push(new Array<number>(this.cols).fill(WATER_ID))
    }
    return out
  }

  /** 保证预生成缓冲里有足够多的行 */
  private ensurePending(): void {
    while (this.pending.length < this.lookaheadRows) {
      // 接缝基准：优先用缓冲里最靠上的一行；缓冲为空则用屏幕最上面一行
      const ref =
        this.pending.length > 0
          ? this.pending[this.pending.length - 1]
          : this.getTopRowTiles()

      const block = this.generateBlock(this.blockRows, ref)

      // block[0] 是块的顶部、block[last] 是底部（紧贴 ref）。
      // 而 pending 的消费顺序是「从下往上」，所以要倒着压入。
      for (let i = block.length - 1; i >= 0; i--) {
        this.pending.push(block[i])
      }
    }
  }

  /** 取当前屏幕上最上面那一行的瓦片 id */
  private getTopRowTiles(): number[] | null {
    let top: MapRow | null = null
    for (const r of this.rows) {
      if (top === null || r.node.position.y > top.node.position.y) top = r
    }
    return top ? top.tiles : null
  }

  // ==================== 滚动与回收 ====================

  protected update(deltaTime: number): void {
    if (this.isPaused) return
    if (this.rows.length === 0) return

    const dy = this.scrollSpeed * deltaTime

    for (const row of this.rows) {
      const p = row.node.position
      let y = p.y - dy

      // 完全移出底部 → 挪到顶部，并换上预生成好的地形
      if (y < this.bottomY) {
        y += this.mapHeight
        const next = this.pending.shift()
        if (next) this.applyRowTiles(row, next)
        this.ensurePending()
      }

      row.node.setPosition(p.x, y)
    }
  }
}
