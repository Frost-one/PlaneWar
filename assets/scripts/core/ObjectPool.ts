import { Node, Prefab, instantiate, NodePool } from 'cc'

/**
 * 通用对象池 —— 对象池分层中的【第②层：单个 prefab 的池】。
 *
 * 一个 ObjectPool 实例只管【一种 prefab】的节点复用：
 *   - acquire（借）：池里有就取出复用，池空才新建（instantiate）
 *   - release（还）：池未满就回收复用，池已满则直接销毁（防止极端弹幕无限堆积）
 *   - clear（清）：销毁池内全部残留节点
 *
 * 底层真正维护「Node[] 复用队列」的是 Cocos 自带的 NodePool，
 * 这里只是在它外面加了一层「容量上限」与「取用约定」，不必自己手搓队列。
 */
export class ObjectPool {
  /** Cocos 原生池，内部已维护一份可复用的 Node 队列 */
  private readonly pool: NodePool
  /** 当前在场（已借出尚未归还）的节点数量 */
  private alive = 0
  /** 当前在池内可复用的节点数量（自己计数，避免依赖 NodePool.size 的版本差异） */
  private freeCount = 0

  constructor(
    /** 池所对应的预制体（决定节点的外观 / 组件 / 碰撞体） */
    private readonly prefab: Prefab,
    /** 池容量上限：池中可用节点超过此值，归还时直接销毁而非入池 */
    private readonly capacity = 300,
  ) {
    this.pool = new NodePool()
  }

  /** 已借出尚未归还的节点数（调试 / 遥测用） */
  get activeCount(): number {
    return this.alive
  }

  /** 池中可立即复用的节点数（调试 / 遥测用） */
  get poolSize(): number {
    return this.freeCount
  }

  /**
   * 借出一个节点：优先复用池中节点，池空才新建。
   * 统一挂到 parent 下并激活（NodePool.put 不会帮你管 active，不设这个会“看不见”）。
   */
  acquire(parent: Node): Node {
    let node = this.pool.get()
    if (node) {
      this.freeCount--
    } else {
      node = instantiate(this.prefab)
    }
    node.parent = parent
    node.active = true
    this.alive++
    return node
  }

  /**
   * 归还一个节点：先脱离父节点；
   * 池未满则入池复用，池已满则直接销毁（避免无限增长）。
   */
  release(node: Node): void {
    if (this.alive > 0) this.alive--
    node.removeFromParent()
    if (this.freeCount < this.capacity) {
      this.freeCount++
      this.pool.put(node)
    } else {
      node.destroy()
    }
  }

  /** 销毁池中全部残留节点（场景切换时调用，防止泄漏） */
  clear(): void {
    this.pool.clear()
    this.alive = 0
    this.freeCount = 0
  }
}
