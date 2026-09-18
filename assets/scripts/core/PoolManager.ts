import { Node, Prefab } from 'cc'
import { ObjectPool } from './ObjectPool'

/**
 * 对象池管理器 —— 对象池分层中的【第④层：运行时结构的顶层】，也是 Map 的存放处。
 *
 * 持有 Map<prefab, ObjectPool>，按 prefab 把「所有类型的池」集中管理：
 *   - 子弹、敌机、特效都通过它借 / 还，调用方根本无需知道 Map 的存在
 *   - 每个 prefab 的 ObjectPool 在第一次 acquire 时【懒创建】并缓存
 *
 * 文件末尾直接导出全局单例 `poolManager`，全项目共用。
 */
export class PoolManager {
  /** prefab → 该 prefab 专属的 ObjectPool；这就是所有「类型→池」映射的存放处 */
  private readonly pools = new Map<Prefab, ObjectPool>()

  /** 取某 prefab 对应的池：没有就当场 new 一个缓存起来（懒创建，调用方无感知） */
  private poolFor(prefab: Prefab, capacity = 300): ObjectPool {
    let pool = this.pools.get(prefab)
    if (!pool) {
      pool = new ObjectPool(prefab, capacity)
      this.pools.set(prefab, pool)
    }
    return pool
  }

  /** 借出一个 prefab 节点，挂到 parent 下 */
  acquire(prefab: Prefab, parent: Node, capacity = 300): Node {
    return this.poolFor(prefab, capacity).acquire(parent)
  }

  /**
   * 归还一个 prefab 节点（必须传它所属的 prefab，才能 put 回对的池）。
   * 若 prefab 从未借过（对应池不存在），此调用安全无操作。
   */
  release(prefab: Prefab, node: Node): void {
    this.pools.get(prefab)?.release(node)
  }

  /** 场景切换 / 回菜单时清空所有池，释放所有残留节点 */
  clearAll(): void {
    this.pools.forEach((pool) => pool.clear())
    this.pools.clear()
  }
}

/** 全局单例：全项目统一通过它借 / 还节点 */
export const poolManager = new PoolManager()
