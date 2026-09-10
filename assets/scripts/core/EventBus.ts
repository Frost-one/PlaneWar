/**
 * 事件回调类型
 * 采用 unknown[] + void 的宽松签名，便于在不同事件间复用
 */
type EventCallback = (...args: unknown[]) => void

/**
 * 全局事件总线（发布-订阅 / 观察者模式）
 * 用于跨组件、跨模块之间的松散耦合通信：
 * 逻辑方只管 emit 广播，UI/其他模块通过 on 订阅、off 退订，互不直接引用。
 *
 * 采用懒加载单例模式，任何位置都能通过 `EventBus.getInstance()` 获取同一实例。
 *
 * @example
 * // 订阅（回调若需 this，建议用箭头函数属性，或显式传 context）
 * EventBus.getInstance().on('game_over', this.onGameOver)
 *
 * // 广播
 * EventBus.getInstance().emit('game_over', { score: 100 })
 *
 * // 退订（推荐用与 on 相同的函数引用，可精确移除）
 * EventBus.getInstance().off('game_over', this.onGameOver)
 */
export class EventBus {
  private static instance: EventBus | null = null

  /** 事件名 -> 回调列表 */
  private eventMap = new Map<string, EventCallback[]>()

  /** 事件名 -> (回调 -> 上下文对象)，记录绑定关系以支持按上下文精确移除 */
  private contextMap = new Map<string, Map<EventCallback, object | null>>()

  /** 私有构造函数，确保单例（只能通过 getInstance 获取） */
  private constructor() {}

  /**
   * 获取事件总线的单例实例
   * 首次调用时创建实例，之后始终返回同一个实例。
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus()
    }
    return EventBus.instance
  }

  /**
   * 订阅事件监听
   * 同一事件、同一回调只会被注册一次（自动判重，避免重复订阅导致回调被执行多次）。
   *
   * @param event 事件名称
   * @param callback 事件触发时的回调函数
   * @param context 回调的 this 上下文（可选）。传入了才会被记录，
   *                之后可用 off(event, callback, context) 精确移除。
   */
  public on(event: string, callback: EventCallback, context?: object): void {
    const list = this.eventMap.get(event) ?? []
    // 同一事件、同一回调不重复添加（indexOf 兼容 es5 及其以上的编译目标）
    // 如果 event 事件没有订阅 callback 回调函数的话
    if (list.indexOf(callback) === -1) {
      list.push(callback)
      this.eventMap.set(event, list)

      // 记录上下文关系，便于精确移除
      this.contextMap.set(event, (this.contextMap.get(event) ?? new Map()).set(callback, context ?? null))
    }
  }

  /**
   * 订阅一次性事件监听：触发一次后自动移除
   * 常用于只关心"第一次"发生的信号（如一次性引导、一次性成就等）。
   *
   * @param event 事件名称
   * @param callback 事件触发时的回调函数
   * @param context 回调的 this 上下文（可选）
   */
  public once(event: string, callback: EventCallback, context?: object): void {
    const wrapper: EventCallback = (...args: unknown[]) => {
      // 先用回调本身或上下文绑定 this 后执行
      ;(callback as (...a: unknown[]) => void).apply(context ?? undefined, args)
      // 执行完毕后移除包装函数自身，实现"仅触发一次"
      this.off(event, wrapper)
    }
    this.on(event, wrapper, context)
  }

  /**
   * 移除事件监听
   *
   * @param event 事件名称
   * @param callback 要移除的回调函数。
   *                 不传时移除该事件的全部监听；
   *                 传入时仅移除该回调（若传入 context 则进一步限定只移除相匹配的那条）。
   * @param context 若传了 context，则仅移除"回调与上下文都匹配"的那条监听。
   */
  public off(event: string, callback?: EventCallback, context?: object): void {
    const list = this.eventMap.get(event)
    if (!list || list.length === 0) {
      return
    }

    // 未传回调：移除该事件的所有监听
    if (!callback) {
      this.eventMap.delete(event)
      this.contextMap.delete(event)
      return
    }

    const ctxMap = this.contextMap.get(event)
    // 从后往前遍历，避免删除元素导致索引错位
    for (let i = list.length - 1; i >= 0; i--) {
      const match = list[i] === callback
      const ctxMatch = !context || (ctxMap?.get(callback) === context)
      if (match && ctxMatch) {
        list.splice(i, 1)
        ctxMap?.delete(callback)
        break
      }
    }

    // 该事件已无任何监听时，清理空的映射项
    if (list.length === 0) {
      this.eventMap.delete(event)
      this.contextMap.delete(event)
    }
  }

  /**
   * 广播事件：依次调用该事件的所有已订阅回调
   * 遍历前会拷贝一份列表，防止回调内部再 on/off 修改原数组导致遍历错乱；
   * 并对单个回调做 try/catch，避免某一个回调抛错阻断后续回调执行。
   *
   * @param event 事件名称
   * @param args 透传给各回调的参数
   */
  public emit(event: string, ...args: unknown[]): void {
    const list = this.eventMap.get(event)
    if (!list || list.length === 0) {
      return
    }
    // 拷贝一份再遍历，防止回调中增删监听干扰本轮广播
    const copy = list.slice()
    const ctxMap = this.contextMap.get(event)
    for (const cb of copy) {
      try {
        // 用订阅时记录的 context 绑定 this 调用，避免丢失上下文导致回调里 this 为 undefined
        const ctx = ctxMap?.get(cb) ?? null
        if (ctx) {
          ;(cb as (...a: unknown[]) => void).call(ctx, ...args)
        } else {
          cb(...args)
        }
      } catch (e) {
        // 单个回调出错不阻断其余回调
        console.error(`[EventBus] 事件 "${event}" 的回调执行出错：`, e)
      }
    }
  }

  /**
   * 清空所有事件的所有监听
   * 通常用于场景切换或整局重置时，避免旧监听残留导致的内存泄漏与重复回调。
   */
  public clear(): void {
    this.eventMap.clear()
    this.contextMap.clear()
  }

  /**
   * 检查某个事件当前是否还有监听者
   * @param event 事件名称
   * @returns 该事件存在至少一个监听者时返回 true
   */
  public has(event: string): boolean {
    const list = this.eventMap.get(event)
    return list !== undefined && list.length > 0
  }

  /**
   * 获取某个事件的监听者数量
   * @param event 事件名称
   * @returns 该事件当前注册的回调数量
   */
  public listenerCount(event: string): number {
    const list = this.eventMap.get(event)
    return list ? list.length : 0
  }

  /**
   * 销毁单例：清空所有监听并释放实例
   * 一般用于测试或确保彻底重置的场景，日常使用无需调用。
   */
  public static destroy(): void {
    if (EventBus.instance) {
      EventBus.instance.clear()
      EventBus.instance = null
    }
  }
}

export const eventBus = EventBus.getInstance()