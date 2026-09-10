import {
  _decorator,
  Component,
  Node,
  Prefab,
  instantiate,
  Vec3,
  math,
} from 'cc'
import { GameConfig } from '../data/GameConfig'
const { ccclass, property } = _decorator

/**
 * 敌机生成管理器（挂在场景中的一个节点上）
 * - 按固定间隔在屏幕上方随机横向位置生成敌机
 * - 敌机实例取自 enemyPrefab，生成后放入 gameRoot / 玩家同层
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
  private _timer = 0

  /** 生成结果放到哪个父节点下：默认生成到本节点所在父节点（需与玩家/敌机世界同层） */
  @property(Node)
  spawnParent: Node | null = null

  update(deltaTime: number): void {
    if (!this.enemyPrefab) return

    this._timer += deltaTime
    if (this._timer >= this.spawnInterval) {
      this._timer -= this.spawnInterval
      this.spawnEnemy()
    }
  }

  /** 在屏幕上方随机横向位置生成一架敌机 */
  private spawnEnemy(): void {
    const enemy = instantiate(this.enemyPrefab)
    if (!enemy) return

    // 放到生成父节点下（默认取挂载节点同层）
    const parent = this.spawnParent || this.node.parent
    if (parent) enemy.parent = parent

    // 出生位置：x 随机在玩家横向范围内，y 固定在屏幕上方界外（从屏外滑入）
    const randX = math.randomRange(
      GameConfig.BOUND_MIN_X,
      GameConfig.BOUND_MAX_X,
    )
    const spawnY = GameConfig.BOUND_MAX_Y + 50
    enemy.setPosition(randX, spawnY)
  }
}
