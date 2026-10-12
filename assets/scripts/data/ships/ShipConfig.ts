// 仅用于类型标注：契约层不 import cc，也不 import 任何运行时资源
import type { Emitter } from '../../entities/emitters/Emitter'
import type { SpriteFrame, Prefab, AudioClip } from 'cc'

/**
 * 机型 id 字面量联合（编译期唯一的机型标识）。
 *
 * 三种机型各自是一个可声明、不可拼错的唯一值；写错（如 'ship_rad'）tsc 直接拦截，
 * 不必等到运行时 getShip 返回 null 才暴露。它仍是 string 的子集，所以传给
 * getShip(id: ShipId) / Map 等一律合法，且与项目"字符串 id"约定完全兼容。
 */
export type ShipId = 'ship_red' | 'ship_green' | 'ship_blue'

/**
 * 资源路径 —— 写在飞船文件里的【静态字符串】，不涉及任何异步。
 *
 * 【为什么用可选字段，而不是全部必填】
 *   机型之间资源种类本来就不一样：激光机没有子弹 prefab，散射机没有光束 prefab。
 *   "没有"就用 `?` 表达，比塞一个假资源或空字符串干净 ——
 *   加载侧统一回落 null，消费侧判空即可。
 *
 * 【为什么保留成一个对象，而不是摊平成 spritePath / bulletPath】
 *   ① 加一种资源只加一行，ShipConfig 的字段数恒定；
 *   ② 整个对象一次性交给加载器，加字段不用改加载器签名；
 *   ③ 将来做皮肤可整体替换（`assetPaths = SKIN_XMAS`）。
 */
export interface ShipAssetPath {
  /**
   * 机身贴图【外观档】：与发射器的火力档【同索引】。
   *
   *   sprites[0] / [1] / [2] …  ⟷  火力第 1 / 2 / 3 档时的样子
   *
   * 【为什么是数组，而不是 sprite / sprite2 / sprite3】
   *   档位数是【逻辑】，已经由发射器的 levels.length 表达；外观只是跟着它走。
   *   写死三个字段等于把"上限 3 档"焊进契约，将来加到 6 档要改接口。
   *
   * ⚠️ **数组长度不必等于火力档数** ——
   *   现在两者都是 3（1:1，每级一张图），但美术出图通常跟不上升档位速度：
   *   将来"4 档火力只配 3 张图"时，映射加在 ShipRegistry.getShip(id).asset.sprites 里（对外取图统一走 getShip），
   *   这里只负责"有哪些图"，不负责"哪档用哪张"。
   */
  readonly sprites: readonly string[]
  /** 子弹 prefab：实体弹机型才有，激光机型不写 */
  readonly bullet?: string
  /** 光束 prefab：激光机型才有 */
  readonly beam?: string
  /** 射击音效（可选） */
  readonly shoot?: string
  /** 选机界面图标（可选，将来用） */
  readonly icon?: string
}

/**
 * 加载之后的真实资源对象。
 * 与上面的路径是一一对应的关系：路径是静态配置，这里是运行时产物。
 *
 * ⚠️ `sprites` 用【数组】而不是 `Map<路径, 图>`：
 *    `sprites[i]` 对应第 i 档外观，**下标本身就是语义**、天然带顺序；
 *    Map 会把这个语义丢掉（想取第 2 档还得先知道它的路径）。
 *    某一档没加载出来时该位为 null，由消费侧决定回落哪一张。
 */
export interface ShipAsset {
  /**
   * 机身贴图列表（可为稀疏）。
   * ✅ **第 0 项必定非 null** —— 加载侧保证：连第一张都取不到就整架算失败，
   *    不会往缓存里塞一个"有 config 但没图"的半成品。
   */
  readonly sprites: readonly (SpriteFrame | null)[]
  readonly bulletPrefab: Prefab | null
  readonly beamPrefab: Prefab | null
  readonly shootSfx: AudioClip | null
}

/**
 * 单架飞机的配置（只读模板）。
 *
 * ⚠️ 这里【不含任何发射逻辑】，只有"装配声明" ——
 *    弹道的实现住在 entities/emitters/ 下，由各机型文件引用组装。
 */
export interface ShipConfig {
  /** 唯一标识：选机界面 / 存档 / 波次表用它查表；类型收窄为 ShipId 字面量联合 */
  readonly id: ShipId
  readonly name: string
  /** 基础血量：开局写入 PlayerData.maxHp / hp */
  readonly maxHp: number
  /** 移动速度（px/s）—— 机型手感差异的来源 */
  readonly speed: number

  /**
   * 基础体型缩放（1 = 原始大小）。
   * 升级后体型随火力等级【略微变大】：实际缩放 = scale + (weaponLevel-1) · scalePerLevel。
   * 放在机型配置里（而非 Player），是因为"多大"是机型属性，将来不同机型可配不同成长。
   */
  readonly scale: number
  /** 每升 1 级体型增量（"略微变大"的来源）。设为 0 则该机型升级不变大 */
  readonly scalePerLevel: number

  /**
   * 开火装配：这架飞机有哪些发射器【同时】工作。
   *
   * 这就是方案 C（发射器组合）的全部形态，也是「角色能力组合」思路的直接落地 ——
   * **组合只是个数组**（直接借鉴大型游戏里一个角色由一组互不相关的能力模块拼装出来的做法）。
   * 每个发射器就是一个自包含的能力模块：自带档位表、自带冷却、自带开火逻辑；
   * 角色文件只负责"列清单"——想加僚机：`[主机, 僚机]`；想加副武器：再放一个导弹/激光发射器。
   * 三者互不认识，各自管各自的冷却与开火。
   *
   * 【为什么是"组合"而非"继承"】
   *   若用继承/子类（每种子弹一套 PerShipWeapon、PerEnemyWeapon），每加一种开火方式
   *   就要新建子类、还得到处 if-else 分发；组合把"开火能力"做成可插拔的数组元素，
   *   加能力只改配置清单、不动 Player/Enemy 的 tick 循环、也不动 LaneEmitter/BeamEmitter
   *   基类 —— 符合开闭原则（对扩展开放、对修改封闭）。
   *
   * ⚠️ **与 EnemyConfig.emitters 同形**（敌机在 `emitters` 能力目录里也是工厂闭包数组）：都是【工厂闭包数组】
   *   （每项是 `() => new XxxEmitter(...)`）。
   *   实体（Player / Enemy）在装配时调用闭包生成真正的发射器实例 ——
   *   写法统一，再无 `createEmitters` 这种特殊写法，多架同型实体也不会共享冷却。
   *   省略 = 该单位不开火。
   *
   * 【为什么用箭头函数闭包，而不是把 `new XxxEmitter` 直接写在配置里】
   *   闭包把 `new` 延迟到实体生成的那一刻才执行；配置模块加载时只创建函数、
   *   不创建发射器实例。这样既消灭了"只为被 clone 而存在的死模板实例"，
   *   又不必引入 `EmitterSpec` 之类的中心分发文件——"哪种发射器"直接写死在
   *   闭包里的 `new` 上，实体侧只需 `emitters.map((make) => make())` 一句（玩家在装备时、敌机经 AI 调 setWeapons 装配时）。
   *
   * 【注意：这里是"一套"发射器，不是"每档一套"】
   *   火力等级是运行时读的一个数（FireContext.fireLevel），不是用来换对象的。
   *   早期版本做成了 `fireLevels[level-1]`，结果换档会丢冷却进度 ——
   *   玩家体感"升级瞬间卡一下才继续射击"。详见 Emitter.ts 里 fireLevel 的注释。
   *
   * - 想改火力上限 → 改发射器自己的 levels 数组长度
   * - 想让"升级改变形态" → 给某个发射器设 `minLevel`（如僚机 minLevel: 3）
   */
  readonly emitters?: readonly (() => Emitter)[]

  /** 开火风格显示名（UI 展示用，不参与任何逻辑） */
  readonly fireStyleName: string

  /**
   * 资源路径：与数值写在同一个文件里（"一架飞机一套文件"）。
   *
   * ⚠️ 这里是【路径字符串】，不是资源本身 —— 资源对象是运行时的，
   *    由 ShipRegistry 在启动阶段加载并缓存，之后全局同步取用。
   */
  readonly assetPaths: ShipAssetPath
}
