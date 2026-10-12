import { eventBus } from '../../core/EventBus'
import { IVfx, VfxId } from './VfxConfig'
import { explosionVfx } from './ExplosionVfx'
import { hitVfx } from './HitVfx'
// 将来加特效：import { upgradeVfx } from './UpgradeVfx' 等，加入下方映射即可

/**
 * 层3：特效注册表（镜像 ship/enemy/pickup 的 *Registry）。
 *
 * 【双存储 + 对外单入口】
 *   静态模板 VFX_REGISTRY（双存储之一：type → 特效实例）即"注册表"；
 *   "运行期资源"（每特效加载好的帧）由各特效实例自己持有（load() 填充），
 *   不另起一个缓存 Map——因为特效实例本身就打包了"配置 + 资源 + 行为"，
 *   比 ship（config 与 asset 拆开）更紧凑（特效无独立实体，不需要拆两层）。
 *
 * 【加载：声明分散、加载集中（与 loadShipAssets 同构）】
 *   loadVfxAssets() 在启动期调用一次，统一 await 所有特效的 load()，
 *   结束发 vfx_assets_ready；每个特效的 prefab（对象池来源）由各自 load() 加载并缓存，
 *   registry 只负责统一编排一次（类比 ship/enemy 各实体自己声明并加载自己的 body prefab）。
 *
 * 【扩展点】要加新特效：写具体特效文件（层2）→ 在此 import 并加入 VFX_REGISTRY
 *   → 在 VfxManager 订阅对应事件调用 play(type)。registry / manager 播放引擎不改。
 */
export const VFX_REGISTRY: Readonly<Record<VfxId, IVfx>> = {
  explosion: explosionVfx,
  hit: hitVfx, // 子弹命中敌机火花
  // playerHit: playerHitVfx,    // 待实现（含玩家机身红闪，另议）
  // upgrade: upgradeVfx,        // 待实现
  // entry: entryVfx,            // 待实现
}

/** 加载是否已跑完一轮（无论成功几个）。区分"还没好"与"真的没有" */
let loaded = false
export function isVfxLoaded(): boolean {
  return loaded
}

/** 统一入口：按 id 取特效实例（配置 + 资源 + 行为 合一）；未注册返回 null */
export function getVfx(id: VfxId): IVfx | null {
  return VFX_REGISTRY[id] ?? null
}

/**
 * 启动阶段调用一次：统一加载所有已注册特效的 prefab（含依赖帧，由各自 load() 加载）。
 * 单个特效失败只记日志、跳过，不卡整体启动。
 */
export async function loadVfxAssets(): Promise<void> {
  const entries = Object.entries(VFX_REGISTRY) as [VfxId, IVfx][]
  await Promise.all(
    entries.map(async ([type, eff]) => {
      try {
        await eff.load()
      } catch (err) {
        console.error(`[VfxRegistry] 特效 ${type} 加载失败，已跳过:`, err)
      }
    }),
  )
  loaded = true
  eventBus.emit('vfx_assets_ready')
}
