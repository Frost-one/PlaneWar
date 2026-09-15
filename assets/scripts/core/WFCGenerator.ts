/**
 * Wave Function Collapse（波函数坍缩）核心算法
 *
 * 纯逻辑实现，不依赖 Cocos，便于单独测试。
 * 采用「简单瓦片模型（Simple Tiled Model）」：
 *   每张瓦片用四条边的「边标签」描述，两张瓦片能否相邻取决于相接的两条边是否匹配。
 *
 * 算法流程：
 *   1. 初始化：每个格子的「波」= 所有瓦片都可能（用位掩码表示）
 *   2. 若有初始约束（如已存在的相邻行），先应用并传播
 *   3. 循环：
 *      a. 找出「熵最小」的格子（可选瓦片最少且 > 1）
 *      b. 按权重随机坍缩成一个瓦片
 *      c. 向四方传播约束（BFS），不允许的瓦片从邻居的候选中剔除
 *      d. 若某格候选变空 → 矛盾，本次求解失败
 *   4. 全部坍缩完成 → 输出瓦片索引网格
 *
 * 说明：本实现遇到矛盾时直接返回 null（由调用方重试或降级），
 * 不做回溯 —— 对本项目「小尺寸分块生成」的场景足够且更简单。
 */

/** 边的类型标签（如 'W' 水 / 'G' 草 / 'BG' 草的海岸线 …） */
export type EdgeLabel = string

/** 参与 WFC 的瓦片定义 */
export interface WFCTile {
  /** 对外索引：渲染时用它查表拿 SpriteFrame */
  id: number
  /** 上边标签 */
  up: EdgeLabel
  /** 下边标签 */
  down: EdgeLabel
  /** 左边标签 */
  left: EdgeLabel
  /** 右边标签 */
  right: EdgeLabel
  /** 权重：越大越容易被坍缩选中（用于控制地形配比） */
  weight: number
}

/** 判断两条边标签能否面对面 */
export type EdgeMatchFn = (a: EdgeLabel, b: EdgeLabel) => boolean

/** 确定性伪随机数生成器（mulberry32），保证同一 seed 结果可复现 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 位掩码里 1 的个数 */
function popCount(m: number): number {
  let c = 0
  while (m) {
    m &= m - 1
    c++
  }
  return c
}

/** 取位掩码里唯一的那个位（下标）；掩码必须只有一个位 */
function soleBitIndex(m: number): number {
  let i = 0
  while ((m & 1) === 0) {
    m >>>= 1
    i++
  }
  return i
}

export class WFCGenerator {
  private readonly tiles: WFCTile[]
  private readonly n: number
  private readonly fullMask: number
  /** compat[dir][a] = 允许放在 a 的 dir 方向的瓦片位掩码 */
  private readonly compat: {
    up: number[]
    down: number[]
    left: number[]
    right: number[]
  }
  /** 带权重的坍缩选择用的随机源 */
  private rng: () => number
  private readonly seed: number

  constructor(tiles: WFCTile[], match: EdgeMatchFn, seed = 20260914) {
    this.tiles = tiles
    this.n = tiles.length
    this.seed = seed

    if (this.n === 0) {
      throw new Error('[WFC] 瓦片集为空')
    }
    // 位掩码用 32 位整数表示，故最多 30 张（留出符号位安全余量）
    if (this.n > 30) {
      throw new Error(
        `[WFC] 瓦片数 ${this.n} 超过 30，位掩码会溢出；请精简瓦片集`,
      )
    }

    this.fullMask = (1 << this.n) - 1
    this.rng = makeRng(seed)

    const mk = (): number[] => new Array<number>(this.n).fill(0)
    this.compat = { up: mk(), down: mk(), left: mk(), right: mk() }

    for (let a = 0; a < this.n; a++) {
      for (let b = 0; b < this.n; b++) {
        // b 在 a 上方：b.down 与 a.up 相接
        if (match(tiles[b].down, tiles[a].up)) this.compat.up[a] |= 1 << b
        // b 在 a 下方：b.up 与 a.down 相接
        if (match(tiles[b].up, tiles[a].down)) this.compat.down[a] |= 1 << b
        // b 在 a 左侧：b.right 与 a.left 相接
        if (match(tiles[b].right, tiles[a].left)) this.compat.left[a] |= 1 << b
        // b 在 a 右侧：b.left 与 a.right 相接
        if (match(tiles[b].left, tiles[a].right)) this.compat.right[a] |= 1 << b
      }
    }
  }

  /** 取某方向上的兼容掩码（供外部构造初始约束用） */
  public compatMask(dir: 'up' | 'down' | 'left' | 'right', tileId: number): number {
    const idx = this.indexOf(tileId)
    return idx < 0 ? 0 : this.compat[dir][idx]
  }

  /** 按对外 id 找内部索引 */
  private indexOf(tileId: number): number {
    for (let i = 0; i < this.n; i++) {
      if (this.tiles[i].id === tileId) return i
    }
    return -1
  }

  /**
   * 求解一个 width × height 的瓦片网格。
   *
   * @param width  列数
   * @param height 行数
   * @param init   可选的初始约束：长度 = width*height 的数组，
   *               每项是「允许瓦片的位掩码」，-1 表示该格不约束。
   *               行优先，index = y * width + x。
   * @returns 瓦片对外 id 的网格（行优先）；求解失败返回 null
   */
  public solve(width: number, height: number, init?: number[]): number[] | null {
    const size = width * height
    if (size <= 0) return null

    const wave = new Int32Array(size).fill(this.fullMask)

    if (init) {
      for (let i = 0; i < size; i++) {
        const m = init[i]
        if (m === undefined || m < 0) continue
        const masked = m & this.fullMask
        if (masked === 0) return null // 初始约束自相矛盾
        wave[i] = masked
      }
    }

    // 初始传播：把所有被约束过的格子入队
    const queue: number[] = []
    const inQueue = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
      if (wave[i] !== this.fullMask) {
        queue.push(i)
        inQueue[i] = 1
      }
    }
    if (!this.drain(width, height, wave, queue, inQueue)) return null

    // 主循环：反复「找最小熵 → 坍缩 → 传播」
    for (;;) {
      let best = -1
      let bestCount = Number.MAX_SAFE_INTEGER
      for (let i = 0; i < size; i++) {
        const c = popCount(wave[i])
        if (c > 1 && c < bestCount) {
          bestCount = c
          best = i
        }
      }
      if (best < 0) break // 全部塌缩完成

      const t = this.pickByWeight(wave[best])
      wave[best] = 1 << t

      if (!this.propagate(width, height, wave, best)) return null
    }

    // 输出对外 id
    const out = new Array<number>(size)
    for (let i = 0; i < size; i++) {
      out[i] = this.tiles[soleBitIndex(wave[i])].id
    }
    return out
  }

  /** 按权重从掩码中随机选一个瓦片（返回内部索引） */
  private pickByWeight(mask: number): number {
    let total = 0
    const ids: number[] = []
    for (let i = 0; i < this.n; i++) {
      if (mask & (1 << i)) {
        ids.push(i)
        total += this.tiles[i].weight
      }
    }
    if (ids.length === 0) return 0

    let r = this.rng() * total
    for (const i of ids) {
      r -= this.tiles[i].weight
      if (r <= 0) return i
    }
    return ids[ids.length - 1]
  }

  /** 从单个格子开始传播 */
  private propagate(
    width: number,
    height: number,
    wave: Int32Array,
    start: number,
  ): boolean {
    const queue: number[] = [start]
    const inQueue = new Uint8Array(width * height)
    inQueue[start] = 1
    return this.drain(width, height, wave, queue, inQueue)
  }

  /** 处理队列中的格子，逐个收紧邻居的候选集；出现矛盾返回 false */
  private drain(
    width: number,
    height: number,
    wave: Int32Array,
    queue: number[],
    inQueue: Uint8Array,
  ): boolean {
    while (queue.length > 0) {
      const idx = queue.pop() as number
      inQueue[idx] = 0

      const x = idx % width
      const y = (idx / width) | 0

      if (y > 0) {
        if (!this.constrain(wave, idx, idx - width, this.compat.up, queue, inQueue)) return false
      }
      if (y < height - 1) {
        if (!this.constrain(wave, idx, idx + width, this.compat.down, queue, inQueue)) return false
      }
      if (x > 0) {
        if (!this.constrain(wave, idx, idx - 1, this.compat.left, queue, inQueue)) return false
      }
      if (x < width - 1) {
        if (!this.constrain(wave, idx, idx + 1, this.compat.right, queue, inQueue)) return false
      }
    }
    return true
  }

  /** 把 from 的约束传播到 to：收紧 to 的候选集 */
  private constrain(
    wave: Int32Array,
    from: number,
    to: number,
    compat: number[],
    queue: number[],
    inQueue: Uint8Array,
  ): boolean {
    // to 的候选 = from 的每个候选在该方向上允许的并集
    let allowed = 0
    const m = wave[from]
    for (let i = 0; i < this.n; i++) {
      if (m & (1 << i)) allowed |= compat[i]
    }

    const next = wave[to] & allowed
    if (next === wave[to]) return true // 没有变化
    if (next === 0) return false // 矛盾

    wave[to] = next
    if (!inQueue[to]) {
      inQueue[to] = 1
      queue.push(to)
    }
    return true
  }

  /** 当前 seed（供调试输出） */
  public getSeed(): number {
    return this.seed
  }
}
