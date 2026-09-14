import {
  _decorator,
  Component,
  Node,
  Prefab,
  instantiate,
  math,
} from 'cc'
import { GameConfig } from '../data/GameConfig'
import { eventBus } from '../core/EventBus'
import { StateChangePayload, GameState } from '../data/GameState'
import { Enemy } from '../entities/Enemy'
const { ccclass, property } = _decorator

/**
 * 敌机生成管理器（挂在场景中的一个节点上）
 * - 按固定间隔在屏幕上方随机横向位置生成敌机
 * - 敌机统一挂到 enemyContainer（专用容器 Enemies）下，便于整体清场
 * - 仅在 PLAYING 状态下生成；菜单/暂停/结算时暂停生成
 *
 * 职责边界：本类只负责【生成】与【销毁/回收】敌机，
 * 不干涉敌机自身的移动、碰撞等行为（那是 Enemy 组件的事）。
 */
@ccclass('EnemyManager')
export class EnemyManager extends Component {
  /** 敌机预制体（拖入 Enemy.prefab） */
  @property(Prefab)
  enemyPrefab: Prefab | null = null

  /** 生成间隔（秒）：每隔多少秒生成一架 */
  @property
  spawnInterval = 1

  /** 累计生成计时 */
  private timer = 0

  /** 是否处于暂停（冻结）状态；启动时为 true（停在菜单，不生成） */
  private isPaused = true

  /**
   * 敌机专用容器节点（建议拖入 GameRoot/Enemies）。
   * 该节点下应仅存放敌机，以便清场时安全地整体清理。
   *
   * 留空时默认使用本组件所在节点 —— 适合直接把本组件挂在容器节点上的用法
   * （此时连引用都不用拖）。
   */
  @property(Node)
  enemyContainer: Node | null = null

  /**
   * 当前存活的敌机列表。
   * 用于快速遍历与统一回收；配合 isValid 判断可容忍"敌机自行销毁"造成的失效引用。
   * 后续接入对象池时，这里可直接改为持有可复用的敌机实例。
   */
  private enemyList: Node[] = []

  protected onLoad(): void {
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 状态切换：决定"要不要继续吐敌机"，以及生成计时的生死。
   *
   * 暂停采用「时间停止」语义（整体冻结、恢复后接着走）：
   *   - PLAYING → PAUSED：计时器**冻结、保留余量**
   *   - PAUSED  → PLAYING：计时器**从冻结处接着走**
   *   两者合起来即"时间停止"：暂停期间不推进，恢复后无缝续上。
   *   例：spawnInterval = 1，暂停时已累积 0.9s → 恢复后 0.1s 即出下一架。
   *
   * 其余迁移都视为「本局开始/中断」，计时一律清零：
   *   - → PLAYING（来自 MENU / OVER）：新的一局，给予完整间隔的喘息期
   *   - → MENU / OVER：本局作废，清掉残留进度，避免影响下一局
   */
  private onStateChange({ oldState, newState }: StateChangePayload): void {
    this.isPaused = newState !== GameState.PLAYING

    // 「时间停止」区间：PAUSED 的进入与离开都不动计时器，也不清场
    if (oldState === GameState.PAUSED || newState === GameState.PAUSED) {
      return
    }

    // 其余所有迁移：计时清零
    this.timer = 0

    // 进入 OVER 时暂不清场：保留结算瞬间的战场画面
    if (newState === GameState.OVER) {
      return
    }

    // 其余迁移（新开局 / 回菜单）：清空残留敌机
    this.clearEnemies()
  }

  update(deltaTime: number): void {
    if (!this.enemyPrefab) return
    if (this.isPaused) return

    this.timer += deltaTime
    if (this.timer >= this.spawnInterval) {
      this.timer -= this.spawnInterval
      this.spawnEnemy()
    }
  }

  /** 在屏幕上方随机横向位置生成一架敌机 */
  private spawnEnemy(): void {
    const enemy = instantiate(this.enemyPrefab)
    if (!enemy) return

    // 挂到专用容器下（便于整体清场）；未指定容器时退回本组件所在节点
    enemy.parent = this.enemyContainer ?? this.node

    // 出生位置：x 随机在玩家横向范围内，y 固定在屏幕上方界外（从屏外滑入）
    const randX = math.randomRange(
      GameConfig.BOUND_MIN_X,
      GameConfig.BOUND_MAX_X,
    )
    const spawnY = GameConfig.BOUND_MAX_Y + 50
    enemy.setPosition(randX, spawnY)

    // 初始化敌机：注入管理者引用（敌机自行销毁时会通过它摘除追踪记录），
    // 并留出运行时属性初始化的扩展点
    const enemyComp = enemy.getComponent(Enemy)
    if (enemyComp) enemyComp.init(this)
    // 纳入追踪列表，供后续统一回收
    this.enemyList.push(enemy)
  }

  // ==================== 销毁 / 回收 ====================

  /**
   * 统一回收接口：销毁一架敌机并将其移出追踪列表。
   * 敌机自行销毁（如飞出屏幕、被击中）时也应走这里，避免残留失效引用。
   * 后续接入对象池时，只需把 destroy() 换成回池操作。
   *
   * @param enemy 待回收的敌机节点
   */
  public destroyEnemy(enemy: Node): void {
    // 先从追踪列表摘除（找不到也无妨，说明已被回收过）
    this.unregisterEnemy(enemy)

    // isValid 判断：敌机可能已被自身 destroy，避免重复销毁报错
    if (enemy.isValid) enemy.destroy()
  }

  /**
   * 清空全部敌机。
   * 以追踪列表为准（而非遍历容器子节点），因此不依赖容器的子节点构成。
   */
  private clearEnemies(): void {
    // 拷贝一份再遍历：destroyEnemy 会修改原数组
    const list = this.enemyList.slice()
    for (const enemy of list) {
      this.destroyEnemy(enemy)
    }
    // 保险：清理可能遗漏的无效引用
    this.enemyList.length = 0
  }

  /**
   * 从追踪列表摘除某架敌机（不销毁节点）。
   * 供 Enemy 脚本在自行销毁前调用，避免列表残留失效引用。
   *
   * @param enemy 要摘除的敌机节点
   */
  public unregisterEnemy(enemy: Node): void {
    const idx = this.enemyList.indexOf(enemy)
    if (idx >= 0) this.enemyList.splice(idx, 1)
  }
}
