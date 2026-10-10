import { Prefab, SpriteFrame } from 'cc'
import { eventBus } from '../../core/EventBus'
import { loadAssetOrNull } from '../../core/utils/asset'
import type { EnemyConfig, EnemyId } from './EnemyConfig'
import { ENEMY_NORMAL } from './EnemyNormal'
import { ENEMY_ELITE } from './EnemyElite'
import { ENEMY_BOSS } from './EnemyBoss'

/**
 * 敌机登记表 + 资源服务（镜像 ships 的 ShipRegistry）。
 *
 * 【为什么独立成文件，不合并回 EnemyConfig.ts】
 *   本文件 value-import 三个敌机数据文件；那三个文件只用 `import type` 引用 EnemyConfig。
 *   拆开后 EnemyConfig.ts 是零运行时代码的纯类型文件，循环依赖在结构上不可能发生。
 *
 * 【与 ships 的严格对称：双存储 + 对外单入口】
 *   ShipRegistry 缓存「每机型 config + 每机型资源（机身图 / 子弹 / 光束 / 音效）」，
 *   本文件只缓存「每敌机 config + 每敌机外观资源（机身图）」——
 *   静态模板 ENEMY_REGISTRY（双存储之一）+ 资源缓存 spriteCache（双存储之二），
 *   对外只暴露一个 getEnemy(id) 取出 {config, asset} 大对象。
 *
 *   敌机的 body prefab 是「生成模板」，归生成器 EnemyManager 持有，不在此处——
 *   registry 只缓存「实体使用的外观资源」，不越权管节点生成。
 */

/** 全部敌机配置（枚举顺序即种类顺序） */
export const ENEMY_REGISTRY: readonly EnemyConfig[] = [
  ENEMY_NORMAL,
  ENEMY_ELITE,
  ENEMY_BOSS
]

/** 一架敌机的运行时资源（由启动阶段加载产生，之后全局同步取用） */
export interface EnemyAsset {
  readonly sprite: SpriteFrame | null
  /** 子弹 prefab：敌机开火用（普通机为 null） */
  readonly bulletPrefab: Prefab | null
}

/**
 * 运行期大对象 = 静态配置 + 加载资源，调用方只认这一个（与 ship 同构）。
 * ⚠️ asset 可空：配置在启动期即可用，资源是异步加载的、可能尚未就绪（asset = null）。
 *    〔id 未知〕才返回 null；〔资源没加载完〕时仍返回包装对象、只是 asset 为 null。
 */
export interface EnemyPackage {
  readonly config: EnemyConfig
  /** 运行期资源；异步加载，启动期可能为 null（见 getEnemy） */
  readonly asset: EnemyAsset | null
}

/** 按 id 缓存的敌机贴图（双存储之二） */
const spriteCache = new Map<string, EnemyAsset>()

/** 加载是否已跑完一轮（无论成功几个）。区分"还没好"与"真的没有" */
let loaded = false
export function isEnemyAssetsLoaded(): boolean {
  return loaded
}

/**
 * 统一入口：按 id 取"配置 + 资源"大对象。
 * 〔id 未知〕返回 null；〔资源未加载完〕仍返回对象、asset 为 null（配置始终可用）。
 * 内部从双存储 join 而成——对外只看得到这一个大对象。
 */
export function getEnemy(id: EnemyId): EnemyPackage | null {
  const c = ENEMY_REGISTRY.find((x) => x.id === id)
  if (!c) return null
  return { config: c, asset: spriteCache.get(id) ?? null }
}

/**
 * 启动阶段调用一次：按每架敌机自己声明的路径把贴图读齐。
 * 失败的机型会被跳过并打 error，不卡整个启动（美术没放资源也能跑，只是没图）。
 * ⚠️ 只加载外观资源；共享敌机 body prefab 由 EnemyManager 自己加载持有，不在此处。
 */
export async function loadEnemyAssets(): Promise<void> {
  await Promise.all(
    ENEMY_REGISTRY.map(async (cfg) => {
      const sprite = await loadAssetOrNull(cfg.assetPaths.sprite, SpriteFrame)
      const bulletPrefab = await loadAssetOrNull(cfg.assetPaths.bullet, Prefab)
      if (!sprite) {
        console.error(`[enemies] ${cfg.id} 贴图加载失败：${cfg.assetPaths.sprite}`)
      }
      if (cfg.assetPaths.bullet && !bulletPrefab) {
        console.error(`[enemies] ${cfg.id} 子弹加载失败：${cfg.assetPaths.bullet}`)
      }
      spriteCache.set(cfg.id, { sprite, bulletPrefab })
    }),
  )
  console.log(`[enemies] 资源加载完成：贴图 ${spriteCache.size}/${ENEMY_REGISTRY.length}`)
  loaded = true
  eventBus.emit('enemy_assets_ready')
}
