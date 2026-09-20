import { Prefab, SpriteFrame, AudioClip } from 'cc'
import { eventBus } from '../../core/EventBus'
import { loadAssetList, loadAssetOrNull } from '../../core/utils/asset'
import type { ShipAsset, ShipConfig } from './ShipConfig'
import { SHIP_RED } from './ShipRed'
import { SHIP_GREEN } from './ShipGreen'
import { SHIP_BLUE } from './ShipBlue'

/**
 * 机型登记表 + 资源服务（原 ShipTable.ts 已合并进来）。
 *
 * 【为什么它必须独立成文件，不能合并回 ShipConfig.ts】
 *   它要 value-import 三个机型文件；而那三个文件又要 import type ShipConfig。
 *   合并就等于让契约层反向依赖数据层 —— 虽然 import type 编译后消失、跑得起来，
 *   但只要有人把 `import { ShipConfig }` 写成值引用，立刻成循环依赖。
 *   拆开后 **ShipConfig.ts 是零运行时代码的纯类型文件，循环在结构上不可能发生。**
 *
 * 【为什么资源加载也放在这里，而不是 core】
 *   core/utils/asset.ts 只认识「路径 + 类型」，不认识飞机；
 *   而"遍历所有机型、按各自声明的 assetPaths 去加载"必须认识 ShipConfig。
 *   依赖方向是 data → core，反过来不行。
 */

/** 全部机型 */
export const SHIP_TABLE: readonly ShipConfig[] = [SHIP_RED, SHIP_GREEN, SHIP_BLUE]

/** 默认机型：还没选过时的兜底 */
export const DEFAULT_SHIP_ID = SHIP_RED.id

/** 全部机型 id（存档校验 / Debug 面板用） */
export const SHIP_IDS: readonly string[] = SHIP_TABLE.map((c) => c.id)

/** 一架飞机的"数值 + 资源"——消费侧唯一需要认识的东西 */
export interface ShipPackage {
  readonly config: ShipConfig
  readonly asset: ShipAsset
}

/**
 * 已加载资源的缓存。
 *
 * 这是整套设计里【唯一的异步产物】：路径写在飞船文件里是静态的，
 * 但 SpriteFrame / Prefab 这些对象必须运行时加载，加载完就存在这里，
 * 之后所有取用都是同步的。
 */
const assetCache = new Map<string, ShipAsset>()

/**
 * 【火力档 → 外观档】的对齐表。
 *
 * 为什么要这张表、而不是直接 `sprites[fireLevel - 1]`：
 *   两个东西的数量【本来就不一样】—— 火力有 5 档（数值爽感要细），
 *   外观只有 3 张图（美术成本要省）。用 min(火力, 外观) 硬凑会得到
 *   "第 4 档没图"或"第 1 档就换图"这类偏差，且每一处消费点都要各自处理。
 *
 * 把它收成【一个显式映射】的好处：
 *   - 改对齐关系只改这一处（想 1:1 就写成 [0,1,2,3,4]）；
 *   - 越界自动取最后一档，新增火力档不用回来补表（`?? 最后一项` 兜底）；
 *   - 表是【推导不出来的设计决策】，必须写下来，不能靠约定。
 *
 * 索引 = 火力等级 - 1；值 = 外观档（即 sprites 的下标）。
 */
const STAGE_OF_LEVEL: readonly number[] = [0, 0, 1, 1, 2]

/**
 * 火力等级 → 外观档（sprites 下标）。
 *
 * 各处（Player / 选机预览 / 将来的皮肤）都走这个函数，
 * 保证"同样 3 档火力"在任何界面都长一样。
 */
export function stageOfLevel(weaponLevel: number): number {
  const i = Math.max(1, Math.floor(weaponLevel)) - 1
  return STAGE_OF_LEVEL[i] ?? STAGE_OF_LEVEL[STAGE_OF_LEVEL.length - 1]
}

/**
 * 取某架飞机在指定外观档下的贴图。
 *
 * 【为什么要"向上回退"】外观档是稀疏的：可能只配了 1 张（单图机型），
 *   也可能第 2 张路径写错没加载出来。这时**宁可沿用上一张图**，
 *   也不要返回 null 让飞机变空白 —— 缺图是内容问题，不该让游戏崩掉表现。
 *
 * @param id         机型 id
 * @param stage      外观档（sprites 下标）；省略 = 0（第 1 档，永远存在）
 */
export function getShipSprite(id: string, stage = 0): SpriteFrame | null {
  const sprites = assetCache.get(id)?.sprites
  if (!sprites || sprites.length === 0) return null

  // 从目标档往前找第一张非空的图（含 stage=0 自己）
  for (let i = Math.min(stage, sprites.length - 1); i >= 0; i--) {
    const frame = sprites[i]
    if (frame) return frame
  }
  return null
}

/**
 * 启动阶段调用一次：按每架飞机【自己声明的路径】把资源读齐。
 *
 * 失败的机型会被跳过并打 error，不会让整个启动卡住 ——
 * 这样即使你还没把美术资源放进 resources/，游戏也能正常跑起来（只是没图）。
 */
export async function loadShipAssets(): Promise<void> {
  await Promise.all(
    SHIP_TABLE.map(async (cfg) => {
      const p = cfg.assetPaths

      // 贴图用 loadAssetList（不是 loadAssetOrNull）：它内部 Promise.all 按顺序并发，
      // ✅ 返回值与入参【下标严格一一对应】—— 这是 sprites[i] ⟷ 第 i 档外观的前提。
      // ⚠️ 不要图省事改成"逐个 await 塞进 Map"，那会丢掉顺序语义。
      const [sprites, bulletPrefab, beamPrefab, shootSfx] = await Promise.all([
        loadAssetList(p.sprites, SpriteFrame),
        loadAssetOrNull(p.bullet, Prefab),
        loadAssetOrNull(p.beam, Prefab),
        loadAssetOrNull(p.shoot, AudioClip),
      ])

      // 只要有任何一项"配了却没加载出来"，就记一次失败。
      // 具体是哪个路径、什么原因，由 loadAsset 自己打印 —— 这里只说结论。
      const ok =
        (!p.bullet || !!bulletPrefab) &&
        (!p.beam || !!beamPrefab) &&
        (!p.shoot || !!shootSfx)

      if (!ok) console.error(`[ships] ${cfg.id} 资源加载失败`)

      // 机身图是必备的：缺了整架不可用。
      // ⚠️ 只判第 0 档 —— 后面几档缺图是"内容待补"，沿用上一张图即可（见 getShipSprite）。
      if (!sprites[0]) return

      assetCache.set(cfg.id, { sprites, bulletPrefab, beamPrefab, shootSfx })
    }),
  )

  // 成功的一律不提，最后只汇总一句（没就绪的自然体现在数字上）
  console.log(`[ships] 资源加载完成：${assetCache.size}/${SHIP_TABLE.length}`)

  // —— 广播"资源就绪" ——
  // 顺序必须是【先写缓存（上面的 assetCache.set）→ 再广播】，
  // 否则订阅方被唤醒时读到的还是空缓存。
  //
  // 为什么需要这个事件：展示方（选机界面）的 onEnable 可能早于本函数执行完，
  // 那时它读不到贴图；资源到位后靠这条广播补一次刷新。
  eventBus.emit('ship_assets_ready')
}

/** 按 id 取"数值 + 资源"，任一缺失返回 null（调用方决定如何兜底） */
export function getShipPackage(id: string): ShipPackage | null {
  const config = SHIP_TABLE.find((c) => c.id === id)
  const asset = assetCache.get(id)
  if (!config || !asset) return null
  return { config, asset }
}

/**
 * 兜底版：取不到就回落默认机型；连默认机型都没加载成功时返回 null。
 * UI 用这个省得到处判空，但仍要处理 null（资源没放好的情况下会发生）。
 */
export function getShipPackageOr(id: string): ShipPackage | null {
  return getShipPackage(id) ?? getShipPackage(DEFAULT_SHIP_ID)
}

// ==================== 以下为原 ShipTable 的查询接口（保持原有行为） ====================

/** 按 id 查机型，查不到返回 null */
export function getShip(id: string): ShipConfig | null {
  return SHIP_TABLE.find((c) => c.id === id) ?? null
}

/** 兜底版：查不到时回落默认机型 */
export function getShipOr(id: string): ShipConfig {
  return getShip(id) ?? SHIP_RED
}

/**
 * 循环取"第 offset 架"（选机界面左右箭头用）。
 * 把取模逻辑收在这里，是因为 JS 的 % 对负数返回负值（-1 % 3 === -1，不是 2），
 * 必须 `((x % n) + n) % n` 才对 —— 这种坑不该让 UI 层记。
 */
export function cycleShip(currentId: string, offset: number): ShipConfig {
  const total = SHIP_TABLE.length
  const current = SHIP_TABLE.findIndex((c) => c.id === currentId)
  const base = current < 0 ? 0 : current
  return SHIP_TABLE[(((base + offset) % total) + total) % total]
}
