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
 * 本文件 value-import 三个机型文件，而它们只用 `import type` 引用 ShipConfig，
 * 故 ShipConfig.ts 保持零运行时代码，循环依赖在结构上不可能发生。
 * 资源加载也放在这里而非 core：core 只认识"路径 + 类型"，
 * "遍历机型、按各自 assetPaths 加载"必须认识 ShipConfig（依赖方向 data → core）。
 */

/** 静态机型模板：零运行时，仅作加载路径来源与数值源（双存储之一） */
export const SHIP_REGISTRY: readonly ShipConfig[] = [
  SHIP_RED,
  SHIP_GREEN,
  SHIP_BLUE
]

/**
 * 运行时完整大对象 = 静态配置 + 加载资源，调用方只认这一个。
 * 直接引用 ShipConfig / ShipAsset 两个源类型：未来给任一【源接口】加字段，
 * 这里【不用改】——类型自动延伸，getShip 也只是原样打包。
 * 保留 config / asset 两级，静态模板与运行期资源的边界在类型上依然清晰。
 *
 * ⚠️ asset 可空：配置在启动期即可用，资源是异步加载的、可能尚未就绪（asset = null）。
 *    〔id 未知〕才返回 null；〔资源没加载完〕时仍返回包装对象、只是 asset 为 null，
 *    调用方取资源前判空、等 `ship_assets_ready` 广播后刷新即可。
 */
export interface ShipPackage {
  readonly config: ShipConfig
  /** 运行期资源；异步加载，启动期可能为 null（见 getShip） */
  readonly asset: ShipAsset | null
}

/** 已加载资源的缓存：整套设计里唯一的异步产物（双存储之二） */
const assetCache = new Map<string, ShipAsset>()

/**
 * 加载是否已跑完一轮。
 * 区分"资源还在加载中"与"加载结束却仍缺资源"——UI 据此决定是否告警。
 */
let loaded = false
export function isShipAssetsLoaded(): boolean {
  return loaded
}

/**
 * 统一入口：按 id 取"数值 + 资源"大对象。
 * 〔id 未知〕返回 null；〔资源未加载完〕仍返回对象、asset 为 null（配置始终可用）。
 * 内部从双存储（静态模板 + 资源缓存）join 而成——对外只看得到这一个大对象。
 */
export function getShip(id: string): ShipPackage | null {
  const c = SHIP_REGISTRY.find((x) => x.id === id)
  if (!c) return null
  return { config: c, asset: assetCache.get(id) ?? null }
}

/**
 * 启动阶段调用一次：按每架飞机自己声明的路径把资源读齐。
 * 失败的机型跳过并打 error，不卡整个启动（美术没放资源也能跑，只是没图）。
 */
export async function loadShipAssets(): Promise<void> {
  await Promise.all(
    SHIP_REGISTRY.map(async (cfg) => {
      const p = cfg.assetPaths
      const [sprites, bulletPrefab, beamPrefab, shootSfx] = await Promise.all([
        loadAssetList(p.sprites, SpriteFrame),
        loadAssetOrNull(p.bullet, Prefab),
        loadAssetOrNull(p.beam, Prefab),
        loadAssetOrNull(p.shoot, AudioClip),
      ])
      const ok =
        (!p.bullet || !!bulletPrefab) &&
        (!p.beam || !!beamPrefab) &&
        (!p.shoot || !!shootSfx)
      if (!ok) console.error(`[ships] ${cfg.id} 资源加载失败`)
      if (!sprites[0]) return // 机身图必备，缺了整架不可用
      assetCache.set(cfg.id, { sprites, bulletPrefab, beamPrefab, shootSfx })
    }),
  )
  console.log(`[ships] 资源加载完成：${assetCache.size}/${SHIP_REGISTRY.length}`)
  loaded = true
  eventBus.emit('ship_assets_ready')
}

/** 选机界面左右切换：负数取模坑收在这里（JS % 对负数返回负值） */
export function cycleShip(currentId: string, offset: number): ShipConfig {
  const total = SHIP_REGISTRY.length
  const current = SHIP_REGISTRY.findIndex((c) => c.id === currentId)
  const base = current < 0 ? 0 : current
  return SHIP_REGISTRY[(((base + offset) % total) + total) % total]
}
