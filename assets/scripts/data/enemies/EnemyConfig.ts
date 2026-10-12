/**
 * 敌机配置契约（类型层）—— 敌机数据的唯一权威来源的类型声明。
 *
 * 设计约定（详见记忆 MEMORY.md「配置表定稿」）：
 * - 只放"换一种敌机就会变"的值；所有敌机共享的参数（受击闪白时长、死亡特效 Prefab 等）
 *   留在 Enemy.prefab 的 @property 上，不要写到这里。
 * - 速度一律写 px/s（设计单位）。转物理单位只在写入 RigidBody2D.linearVelocity 时
 *   除以 PHYSICS_2D_PTM_RATIO(32)，全工程只有那一处转换。
 * - "波次 / 出现时机 / 编队"不属于敌机属性，将来放 WaveConfig，不要加到这里。
 * - 【外观 / 尺寸】三种敌机【共用 1 个 prefab】（合并自 Enemy_Normal / Enemy_Elite / Enemy_Boss），
 *   差异由本契约的 `assetPaths`（贴图）+ `scale`（节点缩放）在运行时表达 —— 落实"角色是数据"。
 *   碰撞体尺寸留在 prefab 内（24×17），节点缩放后自动放大；配置只驱动缩放、不碰尺寸，避免二次放大。
 *   ⚠️ 放大同一张小图一定会糊；原型阶段可接受，最终仍需美术提供大图（届时只换图、不动代码）。
 *   例外：玩家侧不适用（弹幕 STG 的玩家判定框须远小于机体），ShipConfig 里需独立配 hitRadius。
 *
 * 【分层】本文件只声明类型（契约层），不含任何数值常量；
 *   数值写在同目录的 EnemyNormal / EnemyElite / EnemyBoss 里，加载与查询收在 EnemyRegistry。
 *   （镜像 ships：ShipConfig 是契约，ShipRed/Green/Blue 是数据，ShipRegistry 是加载+查询）
 *
 * 【能力目录 vs 策略】
 *   本契约是"能力目录"——只声明敌机【拥有】哪些移动形态(moves)与开火能力(emitters)，
 *   不编排"何时用什么"。编排权交给 EnemyAI（entities/ai/），与玩家读输入调发射器同构。
 */

import type { Node } from 'cc'
import type { Emitter } from '../../entities/emitters/Emitter'

/**
 * 敌机移动所需的上下文（每帧由 Enemy 传入）。
 * 只给移动函数它需要的量；移动函数【只读】这些量、直接写 node 位置。
 */
export interface EnemyMoveState {
  /** 移动相位时间（秒）：阶段切换由 AI 调 resetPhaseTime 归零，供正弦/绕圈从 0 摆相 */
  readonly elapsed: number
  /** 本帧时间步长（秒） */
  readonly dt: number
  /** 出生 x（正弦摆动的基准线） */
  readonly startX: number
  /** 基础下坠速度（px/s），由 cfg.speed 透传 */
  readonly speed: number
  /** 可活动边界，供正弦做"对称夹紧"避免飘出屏外 */
  readonly bounds: EnemyBounds
}

/** 可活动边界 */
export interface EnemyBounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
}

/**
 * 移动轨迹函数：每个敌机文件自己写一个，描述"我这一帧该挪到哪"。
 *
 * 取代原来的 `EnemyMovePattern` 枚举 + sineAmplitude / sineFrequency / hoverY 三段参数 ——
 * 不同敌机轨迹差异很大，用枚举 + 通用参数永远覆盖不全（折线、追踪、突进……），
 * 不如把"轨迹"本身写成函数，专属参数直接写死在函数闭包里，配置表只留 `speed` 这种共性量。
 *
 * ⚠️ 这是"特异逻辑逃生舱"：极特殊的轨迹就在这里写几行，不用回头改 Enemy 的通用骨架。
 * ⚠️ 用 `import type { Node }` 拿类型，运行时不 import cc，保持数据层纯净。
 */
export type EnemyMover = (node: Node, s: EnemyMoveState) => void

/**
 * 资源路径 —— 写进配置里的【静态字符串】，不涉及任何异步（参考 ShipAssetPath）。
 *
 * 为什么只用 `sprite` 一个字段、不做成可扩展对象：敌机目前只有一张机身图，
 * 加字段不如 ships 那样有"多档外观 / 子弹 / 光束"的差异需求；真要扩展时再扩成对象不迟。
 */
export interface EnemyAssetPath {
  /** 机身贴图（SpriteFrame）。路径相对 assets/resources/，取 SpriteFrame 必须带 /spriteFrame 后缀 */
  readonly sprite: string
  /**
   * 子弹 prefab（可选）路径：敌机开火用的实体弹。
   * 路径相对 assets/resources/、不带扩展名（见 core/utils/asset 的说明）。
   * 普通机暂无子弹，省略即可。
   */
  readonly bullet?: string
}

/**
 * 敌机 id 字面量联合（编译期唯一的敌机种类标识）。
 *
 * 三种敌机各自是一个可声明、不可拼错的唯一值；写错（如 'e_norml'）tsc 直接拦截，
 * 不必等到运行时 getEnemy 返回 null 才暴露。它仍是 string 的子集，所以传给
 * getEnemy(id: string) / Map<string> 等一律合法，且与项目"字符串 id"约定完全兼容。
 */
export type EnemyId = 'enemy_normal' | 'enemy_elite' | 'enemy_boss'

/** 单种敌机的配置（只读模板）—— 只声明"拥有什么能力"，编排看 EnemyAI */
export interface EnemyConfig {
  /** 唯一标识：波次表 / EnemyManager 用它查表；类型收窄为 EnemyId 字面量联合 */
  readonly id: EnemyId
  /** 显示名（调试与编辑器里辨认用） */
  readonly name: string
  /** 血量模板；运行时 Enemy.hp 表示当前值，由它初始化 */
  readonly maxHp: number
  /** 下坠速度（px/s，设计单位） */
  readonly speed: number
  /** 被击毁时给玩家的分数（由 enemy_die 事件载荷携带，GameManager 不再写死） */
  readonly score: number
  /**
   * 攻击伤害：敌机对玩家造成伤害的【单一真值】（deals）。
   *
   * 双重用途（先撞后射）：
   *   ① 撞到玩家时，作为撞击伤害放进 `player_hit` 事件载荷（取代全局 `COLLIDE_DAMAGE_PLAYER`）；
   *   ② 将来敌机发射子弹时，子弹伤害也读这个值 —— 敌机"攻击力"只有这一个来源。
   *
   * ⚠️ 与玩家侧词汇统一：子弹 / 武器档位 / player_hit 事件都用 `damage`，
   *    这里也用 `damage`；敌机"承受伤害"走 `takeDamage(hp)` 方法，二者不混淆。
   */
  readonly damage: number
  /**
   * 移动能力目录：命名轨迹，AI 按 key 选用（见 Enemy.useMove）。
   * 不同敌机的轨迹差异大，直接写成函数闭包、专属参数写死在函数里。
   */
  readonly moves: Record<string, EnemyMover>
  /**
   * 开火能力目录（可选）：命名发射器工厂，AI 按 key 启用（见 Enemy.setWeapons）。
   * 与 ShipConfig.emitters 同形——都是【箭头函数闭包】 `() => new XxxEmitter(...)`，
   * 模块加载时只创建函数、不创建实例；真正的 new 延迟到敌机生成那一刻（实体侧调用）。
   * 省略 = 该敌机不开火（如普通机）。
   */
  readonly emitters?: Record<string, () => Emitter>
  /**
   * 出生是否【居中对齐】。省略 = false（随机 x）。
   * 用于"悬停 / 不穿屏"的敌机（如 BOSS）：随机 x 会让它永久歪在屏幕一侧。
   */
  readonly spawnCentered?: boolean
  /** 击毁后掉落道具的概率（0 ~ 1） */
  readonly dropChance: number
  /** 是否 BOSS：多阶段、血条、清场例外等行为据此判断 */
  readonly isBoss: boolean
  /**
   * 资源路径：与数值写在同一个文件里（"一种敌机一套数据"）。
   *
   * ⚠️ 这里是【路径字符串】，不是资源本身 —— 资源对象是运行时的，
   *    由 EnemyRegistry 在启动阶段按 id 加载并缓存，之后全局同步取用（参考 ships 的 ShipRegistry）。
   */
  readonly assetPaths: EnemyAssetPath
  /**
   * 节点缩放：单一共享 prefab 的"体型"由这一项驱动（替代原 3 个 prefab 各自的 _lscale）。
   *
   * 为什么放配置里而不是 prefab 里：合并后只有 1 个 prefab，不可能再靠 prefab 区分大小；
   * 节点缩放会等比例作用于节点内容（含碰撞体），不会二次相乘。
   *
   * ⚠️ 碰撞盒尺寸【不再】固定在 prefab 里：换图后由 Enemy.init 现算（见 hitScale），
   *    详见下字段说明与记忆中的"碰撞盒与图片错位"问题。
   */
  readonly scale: number
  /**
   * 命中判定系数（可选，省略 = 1）：碰撞盒尺寸 = 节点 contentSize × hitScale。
   *
   * 为什么需要：合并 1 个 prefab 后，三种敌机【运行时】换 SpriteFrame + setScale，
   * 但 BoxCollider2D.size 是 prefab 里的固定值（24×17），它不监听、也不跟随 spriteFrame。
   * 一旦换到裁剪尺寸不同的图（精英 / BOSS），碰撞盒就和机体错位。
   * 修复在 Enemy.init：设完 SpriteFrame 后把 BoxCollider2D.size 同步成
   * 节点 contentSize（贴图裁剪尺寸）× hitScale —— 尺寸只从贴图派生（派生值现算），
   * 不另存第二份真值，改图也不必改配置。
   * 弹幕 STG 惯例：判定框可略小于机体（如 0.8）手感更宽容；填 1 则与机体同大。
   * contentSize / collider.size 都是节点本地坐标、不受 scale 影响，二者等比例缩放，不会二次放大。
   */
  readonly hitScale?: number

  // TODO(掉落系统)：将来补 dropTable?: DropEntry[]（按权重抽道具）；现在只需要掉 P 道具
}
