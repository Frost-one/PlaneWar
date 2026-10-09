import { _decorator, Component, Node, Prefab } from 'cc'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { poolManager } from '../core/PoolManager'
import { Pickup } from '../entities/Pickup'
import { PickupType } from '../data/pickups/PickupConfig'
import { pickDropType } from '../data/pickups/PickupRegistry'
import { validateRequiredProps } from '../core/utils/validate'

const { ccclass, property } = _decorator

/**
 * 掉落管理器（挂在场景中的一个节点，建议放在 GameRoot 下，与 Player / EnemyContainer 同级）。
 *
 * 职责：监听 `enemy_die` → 按敌机 dropChance 掷骰 → 用对象池借出 Pickup 节点并初始化；
 * 回收 Pickup（掉出下界 / 被拾取）统一归还对象池。不做任何判定 / 移动逻辑（那是 Pickup 自己的事）。
 *
 * ⚠️ pickupPrefab 必须在编辑器里拖入（小且稳定资源，走 @property，与 EnemyManager.enemyPrefab 同思路）。
 *   漏拖则 onLoad 直接抛异常，不会静默失效。
 */
@ccclass('DropManager')
export class DropManager extends Component {
  private static instance: DropManager | null = null

  public static getInstance(): DropManager {
    if (!DropManager.instance) {
      throw new Error('[DropManager] 场景里没有挂载 DropManager 节点')
    }
    return DropManager.instance
  }

  /** 掉落物 prefab（小且稳定，走 @property） */
  @property(Prefab)
  pickupPrefab: Prefab | null = null

  // 各类型道具图标不再走 @property 数组：改由 PickupRegistry.loadPickupAssets 启动时统一加载缓存，Pickup.init 经 getPickup(type).asset 取用。

  /** 是否冻结（非 PLAYING 时不生成） */
  private isPaused = true
  /** 在场掉落物追踪列表（供清场统一回收） */
  private alivePickups: Node[] = []

  protected onLoad(): void {
    validateRequiredProps('DropManager', { pickupPrefab: this.pickupPrefab })
    if (DropManager.instance && DropManager.instance !== this) {
      throw new Error('[DropManager] 场景里有多个 DropManager 节点，请只保留一个')
    }
    DropManager.instance = this
  }

  protected onEnable(): void {
    eventBus.on('state_change', this.onStateChange, this)
    eventBus.on('enemy_die', this.onEnemyDie, this)
  }
  protected onDisable(): void {
    eventBus.off('state_change', this.onStateChange, this)
    eventBus.off('enemy_die', this.onEnemyDie, this)
  }
  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)
    eventBus.off('enemy_die', this.onEnemyDie, this)
    if (DropManager.instance === this) DropManager.instance = null
  }

  private onStateChange({ oldState, newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING
    // 「时间停止」区间（PAUSED）只冻结、不清场；其余迁移（新局 / 回菜单）清掉残留掉落物
    if (oldState === GameState.PAUSED || newState === GameState.PAUSED) return
    if (newState === GameState.OVER || newState === GameState.MENU) this.clearPickups()
  }

  private onEnemyDie(data: { enemyNode?: Node; score: number; dropChance?: number }): void {
    if (this.isPaused) return
    const node = data.enemyNode
    if (!node || !node.isValid) return

    // 按 dropChance 掷骰；没配 / 为 0 就不掉
    const chance = data.dropChance ?? 0
    if (chance <= 0 || Math.random() > chance) return

    this.spawnAt(node.position.x, node.position.y, pickDropType())
  }

  private spawnAt(x: number, y: number, type: PickupType = PickupType.WEAPON_UP): void {
    const prefab = this.pickupPrefab
    if (!prefab) return
    const node = poolManager.acquire(prefab, this.node)
    node.setPosition(x, y)
    node.getComponent(Pickup)?.init(this, type)
    this.alivePickups.push(node)
  }

  /** 由 Pickup 在回收时调用：摘除追踪并归还对象池 */
  public releasePickup(node: Node): void {
    const idx = this.alivePickups.indexOf(node)
    if (idx >= 0) this.alivePickups.splice(idx, 1)
    if (this.pickupPrefab) poolManager.release(this.pickupPrefab, node)
  }

  private clearPickups(): void {
    const list = this.alivePickups.slice()
    this.alivePickups.length = 0
    for (const node of list) {
      if (this.pickupPrefab) poolManager.release(this.pickupPrefab, node)
    }
  }
}
