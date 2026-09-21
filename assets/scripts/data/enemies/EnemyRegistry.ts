import { SpriteFrame } from 'cc'
import { eventBus } from '../../core/EventBus'
import { loadAssetOrNull } from '../../core/utils/asset'
import type { EnemyConfig } from './EnemyConfig'
import { ENEMY_NORMAL } from './EnemyNormal'
import { ENEMY_ELITE } from './EnemyElite'
import { ENEMY_BOSS } from './EnemyBoss'

/**
 * 敌机登记表 + 资源服务（镜像 ships 的 ShipRegistry）。
 *
 * 【为什么它必须独立成文件，不能合并回 EnemyConfig.ts】
 *   它要 value-import 三个敌机数据文件；而那三个文件又要 import type EnemyConfig。
 *   合并就等于让契约层反向依赖数据层 —— 虽然 import type 编译后消失、跑得起来，
 *   但只要有人把 `import { EnemyConfig }` 写成值引用，立刻成循环依赖。
 *   拆开后 **EnemyConfig.ts 是零运行时代码的纯类型文件，循环在结构上不可能发生。**
 *   （与 ShipRegistry 注释同理）
 *
 * 【与 ships 的严格对称（这是本次修正的重点）】
 *   ShipRegistry 只缓存「每机型 config + 每机型资源（机身图 / 子弹 / 光束 / 音效）」，
 *   **绝不持有玩家的 body prefab**——因为玩家是场景节点，不从 registry 生成。
 *   本文件照做：只缓存「每敌机 config + 每敌机外观资源（机身图）」，
 *   **绝不持有敌机的 body prefab**。
 *
 *   敌机的 body prefab 是「生成模板」，属于【生成器（EnemyManager）】的职责，
 *   不是「实体使用的资源」——正如 BulletManager 从不拥有子弹 prefab、只接收调用方传入。
 *   把它搬进 registry 会造成与 ships 不一致，且让 registry 越权管起了节点生成。
 *   所以 `enemies/Enemy.prefab` 的加载与持有现在归 EnemyManager 自己（见其 `ENEMY_PREFAB_PATH`）。
 */

/** 全部敌机配置（枚举顺序即种类顺序；出生权重为临时值，由 EnemyManager.SPAWN_WEIGHTS 按 id 提供，本表只列种类） */
export const ENEMY_REGISTRY: readonly EnemyConfig[] = [ENEMY_NORMAL, ENEMY_ELITE, ENEMY_BOSS]

/** 默认敌机：EnemyManager 还没接波次表时的兜底 */
export const DEFAULT_ENEMY_ID = ENEMY_NORMAL.id

/** 一架敌机的运行时资源（由启动阶段加载产生，之后全局同步取用） */
export interface EnemyAsset {
  readonly sprite: SpriteFrame | null
}

/** 按 id 缓存的敌机贴图 */
const spriteCache = new Map<string, EnemyAsset>()

/**
 * 加载是否已经**跑完一轮**（无论成功几个）。
 * 语义与 ships 一致：区分"还没好"与"真的没有"，避免上层在启动第一帧误报缺资源。
 */
let loaded = false

/** 资源加载是否已结束（无论是否成功）。用于区分"还没好"与"真的没有"。 */
export function isEnemyAssetsLoaded(): boolean {
  return loaded
}

/**
 * 取某敌机的贴图（按 id）。
 * 与 ships 的 getShipSprite 一致：加载失败 / 未配置时返回 null，由消费侧决定兜底
 * （敌机 init 里若取不到，就沿用合并 prefab 自带的默认帧，不会崩）。
 */
export function getEnemySprite(id: string): SpriteFrame | null {
  return spriteCache.get(id)?.sprite ?? null
}

/**
 * 启动阶段调用一次：按每架敌机自己声明的路径把贴图读齐。
 *
 * 失败的机型会被跳过并打 error，不会让整个启动卡住 ——
 * 这样即使你还没把敌机贴图放进 resources/enemies/，游戏也能正常跑（只是没图）。
 *
 * ⚠️ 注意：本函数【只加载外观资源】。共享敌机 body prefab 由 EnemyManager 自己加载持有，
 * 不在此处——registry 不该越权管节点生成模板。
 */
export async function loadEnemyAssets(): Promise<void> {
  await Promise.all(
    ENEMY_REGISTRY.map(async (cfg) => {
      const sprite = await loadAssetOrNull(cfg.assetPaths.sprite, SpriteFrame)
      if (!sprite) {
        console.error(`[enemies] ${cfg.id} 贴图加载失败：${cfg.assetPaths.sprite}`)
      }
      spriteCache.set(cfg.id, { sprite })
    }),
  )

  // 成功的一律不提，最后只汇总一句（没就绪的自然体现在数字上）
  console.log(`[enemies] 资源加载完成：贴图 ${spriteCache.size}/${ENEMY_REGISTRY.length}`)

  // 先置完成标志，再广播 —— 顺序同 ships：订阅方被唤醒时才能读到 loaded === true
  loaded = true

  // 广播"资源就绪"：订阅方（如将来需要预览敌机图的 UI）的 onEnable 可能早于本函数执行完，
  // 那时读不到贴图；资源到位后靠这条广播补一次刷新。
  eventBus.emit('enemy_assets_ready')
}

/**
 * 按 id 查敌机配置。
 * 找不到时返回 null，由调用方决定兜底策略（目前回落到普通机）。
 */
export function getEnemyConfig(id: string): EnemyConfig | null {
  return ENEMY_REGISTRY.find((config) => config.id === id) ?? null
}

/** 兜底版：查不到时回落默认敌机；连默认敌机都没加载成功时返回 null。 */
export function getEnemyConfigOr(id: string): EnemyConfig | null {
  return getEnemyConfig(id) ?? getEnemyConfig(DEFAULT_ENEMY_ID)
}
