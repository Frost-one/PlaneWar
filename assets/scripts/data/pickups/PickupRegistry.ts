import { SpriteFrame } from 'cc'
import { eventBus } from '../../core/EventBus'
import { loadAssetOrNull } from '../../core/utils/asset'
import { PickupType } from './PickupConfig'
import type { PickupConfig, PickupId } from './PickupConfig'

/**
 * 道具登记表 + 资源服务（镜像 ships 的 ShipRegistry / enemies 的 EnemyRegistry）。
 *
 * 【双存储 + 对外单入口】
 *   静态模板 PICKUP_CONFIGS（双存储之一）+ 资源缓存 spriteCache（双存储之二），
 *   对外只暴露一个 getPickup(id) 取出 {config, asset} 大对象。
 *   图标 SpriteFrame 由 loadPickupAssets 在启动期按 config.spritePath resources.load 并缓存——
 *   不再依赖 DropManager 的 @property 数组（消除"按序拖数组易错位"隐患，与 ship/enemy 一致）。
 *
 * 【id 与 type 是两件事】
 *   config.id 是「哪一件道具」的唯一标识（字符串字面量联合，= 注册键）；
 *   config.type 是「什么类别的 buff」（数字枚举，给 Player.onPickup 做 switch 收窄）。
 *   registry 以 id 为键：漏写一个 id / 多了多余键，编译期直接报错。
 */

/**
 * 武器升级：提升 1 档火力（受当前机型发射器档位数上限约束）。
 * 视觉：橙环图标（assets/resources/pickups/pickup_weapon_up）。
 */
const PICKUP_WEAPON_UP: PickupConfig = {
  id: 'pickup_weapon_up',
  type: PickupType.WEAPON_UP,
  levels: 1,
  trackPlayer: true,
  spritePath: 'pickups/pickup_weapon_up/spriteFrame',
}

/**
 * 武器暴走：立即把火力拉到当前机型上限。
 * 视觉：红环图标（assets/resources/pickups/pickup_rampage），自旋（spin）演示"道具自身旋转、不影响垂直下落"。
 *
 * ⚠️ 该 buff 目前【暂未实现】，仅配置与数据通路就位；掉落也暂不会产出
 * （pickDropType 仍只返 pickup_weapon_up）。将来在 Player.onPickup 加一个
 * WEAPON_RAMPAGE 分支（拉满火力）即可生效。
 */
const PICKUP_RAMPAGE: PickupConfig = {
  id: 'pickup_rampage',
  type: PickupType.WEAPON_RAMPAGE,
  trackPlayer: true,
  spin: 0,
  spritePath: 'pickups/pickup_rampage/spriteFrame',
}

/**
 * 回血：恢复 heal 点生命值（字面量，具体数值在此配置）。
 *
 * ⚠️ 该 buff 目前【暂未实现】（PlayerData 暂无 heal 方法，按约定本次不做）。
 * 配置与数据通路已就位，将来在 PlayerData 加 heal() 并在 Player.onPickup 加 HEAL 分支即可。
 */
const PICKUP_HEAL: PickupConfig = {
  id: 'pickup_heal',
  type: PickupType.HEAL,
  heal: 30,
  trackPlayer: true,
  spritePath: 'pickups/pickup_heal/spriteFrame',
}

/**
 * 护盾：获得 shield 点护盾值（字面量）。
 *
 * ⚠️ 该 buff 目前【暂未实现】（PlayerData 暂无 shield 字段，按约定本次不做）。
 * 配置与数据通路已就位，将来在 PlayerData 加 shield 字段 / addShield() 并在 Player.onPickup 加 SHIELD 分支即可。
 */
const PICKUP_SHIELD: PickupConfig = {
  id: 'pickup_shield',
  type: PickupType.SHIELD,
  shield: 50,
  trackPlayer: true,
  spritePath: 'pickups/pickup_shield/spriteFrame',
}

/**
 * 静态道具模板：零运行时（双存储之一）。
 * 用 `Record<PickupId, PickupConfig>` + `satisfies` 强制「穷尽」：
 * 漏写一个 id、或多了多余键，编译期直接报错。
 * 遍历（加载 / 掉落）统一走 `Object.values(PICKUP_CONFIGS)`。
 */
export const PICKUP_CONFIGS = {
  pickup_weapon_up: PICKUP_WEAPON_UP,
  pickup_rampage: PICKUP_RAMPAGE,
  pickup_heal: PICKUP_HEAL,
  pickup_shield: PICKUP_SHIELD,
} satisfies Record<PickupId, PickupConfig>

/** 遍历用数组（顺序即种类顺序），等价于原 PICKUP_REGISTRY */
export const PICKUP_REGISTRY: readonly PickupConfig[] = Object.values(PICKUP_CONFIGS)

/** 运行期资源：图标 SpriteFrame（双存储之二） */
export interface PickupAsset {
  readonly sprite: SpriteFrame | null
}

/**
 * 运行期大对象 = 静态配置 + 加载资源，调用方只认这一个（与 ship / enemy 同构）。
 * ⚠️ asset 可空：配置在启动期即可用，资源是异步加载的、可能尚未就绪（asset = null）。
 *    〔id 未知〕才返回 null；〔资源没加载完〕时仍返回包装对象、只是 asset 为 null。
 */
export interface PickupPackage {
  readonly config: PickupConfig
  /** 运行期资源；异步加载，启动期可能为 null（见 getPickup） */
  readonly asset: PickupAsset | null
}

/** 按 id 缓存的图标（双存储之二） */
const spriteCache = new Map<string, PickupAsset>()

/** 加载是否已跑完一轮（无论成功几个）。区分"还没好"与"真的没有" */
let loaded = false
export function isPickupAssetsLoaded(): boolean {
  return loaded
}

/**
 * 统一入口：按 id 取"配置 + 资源"大对象。
 * 〔id 未知〕返回 null；〔资源未加载完〕仍返回对象、asset 为 null（配置始终可用）。
 * 内部从双存储 join 而成——对外只看得到这一个大对象。
 */
export function getPickup(id: PickupId): PickupPackage | null {
  const c = PICKUP_REGISTRY.find((x) => x.id === id)
  if (!c) return null
  return { config: c, asset: spriteCache.get(id) ?? null }
}

/**
 * 启动阶段调用一次：按每种道具自己的 spritePath 把图标读齐。
 * 失败的道具跳过并打 error，不卡整个启动（没放图标也能跑，只是回退到 tint+label）。
 */
export async function loadPickupAssets(): Promise<void> {
  await Promise.all(
    PICKUP_REGISTRY.map(async (cfg) => {
      const sprite = await loadAssetOrNull(cfg.spritePath, SpriteFrame)
      if (!sprite) console.error(`[pickups] ${cfg.id} 图标加载失败：${cfg.spritePath}`)
      spriteCache.set(cfg.id, { sprite })
    }),
  )
  console.log(`[pickups] 资源加载完成：图标 ${spriteCache.size}/${PICKUP_REGISTRY.length}`)
  loaded = true
  eventBus.emit('pickup_assets_ready')
}

/**
 * 掉落时选道具（返回 PickupId = 哪一件道具；其 type 决定是什么 buff）。
 * 目前只掉已实现的 pickup_weapon_up；将来接「每敌机掉落表」后，改为按权重抽（例如精英机概率掉回血）。
 */
export function pickDropType(): PickupId {
  return 'pickup_weapon_up'
}
