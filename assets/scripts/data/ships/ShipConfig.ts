// 仅用于类型标注：契约层不 import cc，也不 import 任何运行时资源
import type { Emitter } from '../../entities/emitters/Emitter'

/**
 * 单架飞机的配置（只读模板）。
 *
 * ⚠️ 这里【不含任何发射逻辑】，只有"装配声明" ——
 *    弹道的实现住在 entities/emitters/ 下，由各机型文件引用组装。
 */
export interface ShipConfig {
  readonly id: string
  readonly name: string
  /** 基础血量：开局写入 PlayerData.maxHp / hp */
  readonly maxHp: number
  /** 移动速度（px/s）—— 机型手感差异的来源 */
  readonly speed: number

  /**
   * 开火装配：这架飞机有哪些发射器【同时】工作。
   *
   * 这就是方案 C（发射器组合）的全部形态 —— **组合只是个数组**。
   * 想加僚机：`[主机, 僚机]`；想加副武器：再放一个导弹发射器。
   * 三者互不认识，各自管各自的冷却。
   *
   * 【注意：这里是"一套"发射器，不是"每档一套"】
   *   火力等级是运行时读的一个数（FireContext.fireLevel），不是用来换对象的。
   *   早期版本做成了 `fireLevels[level-1]`，结果换档会丢冷却进度 ——
   *   玩家体感"升级瞬间卡一下才继续射击"。详见 Emitter.ts 里 fireLevel 的注释。
   *
   * - 想改火力上限 → 改发射器自己的 levels 数组长度
   * - 想让"升级改变形态" → 给某个发射器设 `minLevel`（如僚机 minLevel: 3）
   */
  readonly emitters: readonly Emitter[]

  /** 开火风格显示名（UI 展示用，不参与任何逻辑） */
  readonly fireStyleName: string

  /**
   * 外观序号：对应 ShipSelectView / Player 上 @property([SpriteFrame]) 的下标。
   *
   * ⚠️ 临时保留：按《飞船模块重构设计》，资源的对应关系应下沉到 ShipAssetTable
   *    （用 shipId 做键），届时本字段删除。
   *    本次（发射器组合重构）不动外观链路，以免牵连选机界面。
   */
  readonly spriteIndex: number
}
