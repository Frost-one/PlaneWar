import { _decorator, Component, Node, Prefab } from 'cc'
import { eventBus } from '../core/EventBus'
import { GameState } from '../data/GameState'
import { poolManager } from '../core/PoolManager'
import { VfxId } from '../data/effects/VfxConfig'
import type { VfxHandle } from '../data/effects/VfxConfig'
import { getVfx, loadVfxAssets } from '../data/effects/VfxRegistry'
import type { EnemyDiePayload, EnemyHitPayload, StateChangePayload } from '../core/GameEvent'

const { ccclass } = _decorator

/**
 * 特效管理器（组件，挂载在编辑器创建的 VfxLayer 节点上）
 *
 * 【三层协作】
 *   层1 VfxConfig（契约）/ 层2 具体特效（ExplosionVfx 等，自带 prefabPath + load + play）
 *   / 层3 VfxRegistry（注册表 + loadVfxAssets 统一加载）。本类只做"调度"：
 *   统一等待各特效 prefab 加载（经 registry）→ 借/还节点 → 按事件找特效、把参数交给它播
 *   → 暂停/清空。播放逻辑（摆位 / 触发动画）一个字都不在本类里，全在具体特效文件。
 *
 * 【不再有"共享壳 prefab"】每个特效自己声明 prefabPath（模型 B 带 Animation 的预制体，
 *   或模型 A 的空 Sprite 壳），manager 按 eff.prefab 分池借还；壳内部长什么样 manager 不管。
 *
 * 【节点摆位归特效】manager 借出节点后只把它变换归零（干净起点），落点/朝向由
 *   特效在自己的 play(params) 里决定——不同特效参数不同（爆炸要落点，光束要两端点）。
 *
 * 【暂停 / 清空】播放返回的 VfxHandle 让本类能暂停 / 恢复 / 强制停止活动中的特效，
 *   节点回收统一在本类（done 回调 或 cancel 后）。
 *
 * 【生命周期】订阅跟随激活状态（onEnable 订阅、onDisable 退订）；
 *   进菜单 / 结束 → 清空残留特效，避免上一局的爆炸飞进新一局。
 */
@ccclass('VfxManager')
export class VfxManager extends Component {
  private static instance: VfxManager | null = null

  /** 活动中特效：节点 → 句柄（用于暂停 / 清空） */
  private active = new Map<Node, { handle: VfxHandle; prefab: Prefab }>()

  protected async onLoad(): Promise<void> {
    VfxManager.instance = this
    // 各特效的 prefab（及素材）统一由 registry 的 loadVfxAssets() 加载，本类只等完成
    try {
      await loadVfxAssets()
    } catch (err) {
      // 理论上 registry 已容错不会到这里；万一仍抛错，必须暴露
      console.error('[VfxManager] onLoad 加载特效异常:', err)
    }
  }

  protected onEnable(): void {
    eventBus.on('enemy_die', this.onEnemyDie, this)
    eventBus.on('enemy_hit', this.onEnemyHit, this)
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDisable(): void {
    eventBus.off('enemy_die', this.onEnemyDie, this)
    eventBus.off('enemy_hit', this.onEnemyHit, this)
    eventBus.off('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    this.clearAll()
    if (VfxManager.instance === this) VfxManager.instance = null
  }

  /** 给外部（如调试）取挂载实例；本类主要靠事件驱动，外部一般无需访问 */
  public static getInstance(): VfxManager | null {
    return VfxManager.instance
  }

  // —— 事件回调 ——
  private onEnemyDie(payload: EnemyDiePayload): void {
    const node = payload.enemyNode
    if (!node || !node.isValid) {
      console.warn('[VfxManager] enemy_die 事件缺少有效 enemyNode，跳过爆炸')
      return
    }
    // 爆炸只要落点；具体摆位交给 ExplosionVfx.play
    this.play('explosion', { x: node.worldPosition.x, y: node.worldPosition.y })
  }

  private onEnemyHit(payload: EnemyHitPayload): void {
    const node = payload.enemyNode
    if (!node || !node.isValid) {
      console.warn('[VfxManager] enemy_hit 缺 enemyNode，跳过命中火花')
      return
    }
    // 命中点优先用事件携带的 hitPoint（碰撞处），缺失再回退敌机中心
    const pt = payload.hitPoint ?? { x: node.worldPosition.x, y: node.worldPosition.y }
    this.play('hit', { x: pt.x, y: pt.y })
  }

  private onStateChange({ newState }: StateChangePayload): void {
    if (newState === GameState.PAUSED) {
      // 时间停止：暂停所有活动特效（动画停 tick，FINISHED 不触发）
      this.active.forEach((e) => e.handle.pause())
      return
    }
    if (newState === GameState.PLAYING) {
      // 恢复：继续被暂停的特效
      this.active.forEach((e) => e.handle.resume())
      return
    }
    // 进菜单 / 结束：清空残留特效，避免上一局的爆炸飞进新一局
    this.clearAll()
  }

  // —— 对外入口：从注册表取特效，借节点，把参数交给特效自己播 ——

  private play(type: VfxId, params: unknown): void {
    const eff = getVfx(type)
    const prefab = eff?.prefab ?? null
    if (!eff) {
      // 未注册：明确告诉你哪个类型没在 VfxRegistry 里登记
      console.warn(`[VfxManager] 特效未注册: ${type}（去 VfxRegistry.VFX_REGISTRY 登记）`)
      return
    }
    if (!prefab) {
      // 已注册但 prefab 没加载好：给出类型与路径，方便核对资源/路径
      console.warn(`[VfxManager] ${type} prefab 未就绪: ${eff.prefabPath}`)
      return
    }
    const node = poolManager.acquire(prefab, this.node)
    // 借出先归零变换，给特效一个干净起点（落点/缩放由特效自己设）
    node.setScale(1, 1, 1)
    node.setRotationFromEuler(0, 0, 0)
    // 先入表再 play：play 内部可能因素材未就绪同步调 done()，此时 recycle 能正确回收
    const entry = { handle: null as VfxHandle | null, prefab }
    this.active.set(node, entry)
    entry.handle = eff.play(node, params, () => this.recycle(node))
  }

  private recycle(node: Node): void {
    const entry = this.active.get(node)
    if (!entry) return
    this.active.delete(node)
    poolManager.release(entry.prefab, node)
  }

  /** 清空所有活动特效（进菜单 / 结束时调用） */
  private clearAll(): void {
    this.active.forEach((entry, node) => {
      entry.handle?.cancel()
      poolManager.release(entry.prefab, node)
    })
    this.active.clear()
  }
}
