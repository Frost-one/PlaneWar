# PlaneWar · 飞机大战

一款基于 **Cocos Creator 3.8.7 + TypeScript** 的纵版卷轴射击游戏（飞机大战），玩法参照《雷霆战机》。

> **项目定位**：这是一个**为期约一个月的 Cocos Creator 学习练习项目**。核心玩法闭环已经实现且可在编辑器内跑通（选机 → 战斗 → 胜负结算），但**在完成度与细节上仍是一个严重的半成品**——数值平衡、关卡设计、手感打磨、音效、特效丰富度等几乎没有投入。本仓库主要作为学习笔记与代码样本保留，后续可能回来继续完善。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [架构概览](#架构概览)
- [目录结构](#目录结构)
- [运行与构建](#运行与构建)
- [已知限制 / 未完成](#已知限制--未完成)
- [后续计划](#后续计划)
- [文档导航](#文档导航)
- [许可证](#许可证)

---

## 功能特性

**已实现（核心闭环可玩）：**

- **三种玩家机型**（数值 / 武器 / 外观各异，数据驱动）：
  | 机型 | 定位 | 武器 |
  |---|---|---|
  | 赤焰 (ShipRed) | 中血中速 | 散射 |
  | 苍岩 (ShipGreen) | 高血低速 | 贯穿 |
  | 湛影 (ShipBlue) | 低血高速 | 激光（实时绘制光束，非子弹） |
  - 火力等级 1~5，通过拾取道具升级解锁更高档位。
- **三类敌机 + 敌机 AI**：
  - 普通机（直线下坠，不开火）、精英机（散射）、BOSS（多阶段走位：下降入场 → 顶部横扫 + 扇形弹幕 → 三角移动 + 瞄准弹幕，循环）。
  - 敌机采用 **「能力目录（moves / emitters）+ AI 策略」** 架构：配置只声明"拥有什么能力"，具体何时调用由 AI 决定（与玩家操作同构）。
- **波次 / 关卡系统（WaveManager）**：数据驱动的分波出现节奏，支持按时间 / 清场 / 二者皆可推进；全部波次清空即胜利。
- **掉落 / 升级系统（Pickup）**：敌机死亡按概率掉落，道具磁铁吸附、拾取生效。配置了 4 种道具类型（WEAPON_UP / HEAL / SHIELD / RAMPAGE），**目前仅 `WEAPON_UP`（火力升级）有实际效果**，其余类型数据通路已就位但未实现效果。
- **特效系统（VfxManager，三层架构）**：爆炸（动画烤进 prefab）+ 命中火花（代码 tween 演出），分别接入 `enemy_die` / `enemy_hit` 事件；`player_hit` / `upgrade` / `entry` 已留扩展点。
- **对象池**：按 prefab 分池（`PoolManager`），子弹 / 敌机 / 道具复用，避免运行时频繁实例化。
- **物理驱动子弹**：2D 物理系统（`RigidBody2D` + `Collider2D`），开启连续碰撞检测（CCD）防高速穿透。
- **状态机**：`MENU / PLAYING / PAUSED / OVER`；暂停保留进度，胜 / 负均已接入结算。
- **WFC 程序化滚动地图**：波函数坍缩算法生成水面 / 草地 / 沙地分布。
- **类型安全的事件总线**：集中式 `GameEvent` 载荷类型映射 + 泛型 `EventBus`，事件名与载荷类型编译期约束。
- **UI**：菜单、选机、战斗 HUD、暂停、结算面板。

---

## 技术栈

| 项 | 说明 |
|---|---|
| 引擎 | Cocos Creator **3.8.7** |
| 语言 | TypeScript |
| 场景 | 单场景 `assets/scenes/Game.scene` |
| 物理 | 2D 物理系统（RigidBody2D / Collider2D） |
| 构建 | 无 npm scripts，编译与预览全部在 Cocos Creator 编辑器内完成 |
| 依赖 | 无第三方运行时依赖（纯引擎 + 自写基础设施） |

---

## 架构概览

设计原则（详见 [`docs/架构决策.md`](docs/架构决策.md)）：

1. **角色是数据，不是代码**：加一架飞机 / 一种敌机 = 一个数值文件 + 在 Registry 登记一行 + 放资源，**不写新的逻辑类**。
2. **唯一真源是字符串 id**：所有跨文件关联用 `shipId` / `enemyId` 等字符串键，禁用数组下标（下标错了不报错，只会悄悄换错资源）。
3. **派生值现算**：`maxHp` / `speed` / 外观 / 碰撞盒由 id 或贴图推导出，**禁止在运行时数据里存第二份**。
4. **表现不回写逻辑**：特效、UI 只消费状态，不干预伤害结算。
5. **共享算法，就近数值**：发射器（`emitters/`）收敛通用算法，数值写在各机型 / 敌机文件里。

**分层（依赖只能向上）：**

| 层 | 位置 | 约束 |
|---|---|---|
| L0 纯数据 | `GameState` `config/*` `WFCGenerator` | 不 import `cc` |
| L1 基础设施 | `EventBus` `ObjectPool` `PoolManager` `utils/` | 不依赖业务 |
| L2 数据单例 | `PlayerData` | 只存本局会变的值 |
| L3 逻辑单例 | `GameManager` `ShipRegistry` `EnemyRegistry` `PickupRegistry` | 可依赖 L0~L2 |
| L4 实体 | `entities/`（Player / Enemy / Bullet / Pickup / ai / emitters） | **不得运行时 import L5**，只 `import type` |
| L5 管理器 | `managers/` | 可持有 L4 |
| L6 UI | `ui/` | 只依赖 GameManager / PlayerData / EventBus |
| L7 入口 | `GameEntry` | 只做启动引导 |

**关键子系统：**

- **Registry 模式**（ship / enemy / pickup 同构）：双存储（`configs` 表 + `asset` 缓存）+ 单入口 `getX(id)`，启动期统一并发加载资源并广播 `<x>_assets_ready`。
- **Emitter 管线**（组合优于分派）：玩家、敌机、BOSS 弹幕共用同一条发射链路；一次开火 = 遍历该实体的 `emitters` 逐个 `tick`。激光（BeamEmitter）不产生子弹，走实时矩形命中查询。
- **敌机 AI**：能力目录（`config.moves` / `config.emitters`）+ 策略类（`DefaultEnemyAI` / `BossAI`）。AI 只"设意图"（选移动 / 选武器），`Enemy` 负责"执行"。
- **事件总线**：跨模块通信统一走 `EventBus`，组件之间互不直接持有引用。

---

## 目录结构

```
PlaneWar/
├── assets/
│   ├── scenes/Game.scene         单场景
│   ├── scripts/                  全部 TypeScript（56 个）
│   │   ├── GameEntry.ts          启动入口
│   │   ├── core/                 EventBus / ObjectPool / PoolManager / WFCGenerator / GameEvent / utils
│   │   ├── data/
│   │   │   ├── config/           GameConfig / PhysicsGroups
│   │   │   ├── ships/            ShipConfig / ShipRegistry / ShipRed|Green|Blue
│   │   │   ├── enemies/          EnemyConfig / EnemyRegistry / EnemyNormal|Elite|Boss
│   │   │   ├── pickups/          PickupConfig / PickupRegistry
│   │   │   ├── effects/          VfxConfig / VfxRegistry / ExplosionVfx / HitVfx
│   │   │   └── stages/           StageTypes / StageTable / Stage_1
│   │   ├── entities/             Player / Enemy / Bullet / Pickup
│   │   │   ├── ai/               EnemyAI / BossAI
│   │   │   └── emitters/         Emitter / LaneEmitter / BeamEmitter
│   │   ├── managers/             GameManager / EnemyManager / BulletManager /
│   │   │                        DropManager / MapManager / UIManager / VfxManager / WaveManager
│   │   └── ui/                   MenuView / ShipSelectView / GameHUD / GamePauseView / GameResultView
│   ├── resources/                运行时按 id 动态加载（ships/<id>/、common/vfx/ 等）
│   ├── prefabs/                  被 @property 拖住或被场景引用的预制体
│   └── Tilemap/ Tiles/           地图瓦片图集
├── docs/                         设计文档（为什么这么设计、代码地图、协作提示词）
└── settings/                     引擎工程设置
```

> `library/`、`temp/`、`profiles/` 为 Cocos 编辑器生成物，不纳入版本管理（见下方[建议 `.gitignore`](#许可证)）。

---

## 运行与构建

> ⚠️ **重要**：本项目有相当一部分"接线"是在 Cocos 编辑器里完成的（挂载脚本、拖引用、建 prefab、配物理分组），AI 无法代写。克隆后**必须先在编辑器内完成下列步骤才能跑起来**（代码本身不依赖这些，但缺了它们游戏无法正常运行）。

### 1. 打开工程

用 **Cocos Creator 3.8.7** 打开本工程根目录，打开 `assets/scenes/Game.scene` 预览。

### 2. 开启 2D 物理系统

项目设置 → 物理 → 开启 2D 物理（否则刚体不动、不碰撞）。

### 3. 配置碰撞分组矩阵

按 `assets/scripts/data/config/PhysicsGroups.ts` 中定义的组（如 `PLAYER` / `ENEMY` / `PLAYER_BULLET` / `ENEMY_BULLET`），在 **项目设置 → 2D 物理 → 碰撞矩阵** 中允许：

- `PLAYER_BULLET` ↔ `ENEMY`（玩家子弹打敌机）
- `ENEMY_BULLET` ↔ `PLAYER`（敌弹打玩家）
- `PLAYER` ↔ `ENEMY`（撞机伤害）
- 其余按需

> 子弹命中目标与否完全取决于此矩阵，配错会导致"打不中"或"误伤"。

### 4. 场景节点挂组件 + 拖引用

| 节点 | 挂载脚本 | 需拖入的引用 |
|---|---|---|
| 游戏根 / 常驻节点 | `GameManager` | — |
| `BulletContainer` | `BulletManager` | 无（`bulletPrefab` 由代码注入；节点位置/缩放须为 0/1） |
| `EnemyContainer` | `EnemyManager` | 无（节点位置/缩放须为 0/1） |
| `Map` | `MapManager` | waterFrame / grassFrames / sandFrames |
| `UI` | `UIManager` | 4 个面板 prefab（Menu / HUD / Pause / Result） |
| 常驻节点 | `WaveManager` | — |
| 常驻节点 | `VfxManager` | — |
| 常驻节点 | `DropManager` | `pickupPrefab` + `pickupSprites`（4 张图标，顺序 WEAPON_UP/RAMPAGE/HEAL/SHIELD） |
| `Player` prefab | `Player` | `beamLayer`（激光机不拖则激光不显示） |

> 容器节点（`BulletContainer` / `EnemyContainer` / `Map`）必须**位置 (0,0)、缩放 (1,1,1)**，否则子节点局部坐标被缩放，出生点与边界判定全部错位。

### 5. 准备预制体与资源

- **VFX**：在 `assets/resources/common/vfx/` 下新建 `Explosion.prefab`（根节点 `Sprite` + `Animation`，剪辑名 `explosion`、wrap=Once、~14fps 把 5 张 `tile_*` 排帧）与 `Hit.prefab`（空 `Sprite` 壳）。
- **Pickup**：将原 `PowerUp.prefab` 改名 / 重挂为 `Pickup` 组件；把 `assets/textures/pickups/` 下 4 张 SpriteFrame 按上表顺序拖入 `DropManager.pickupSprites`。
- **机型 / 子弹资源**：`assets/resources/ships/<shipId>/` 下放置机身图、子弹 prefab 等。

完成后预览即可进入菜单 → 选机 → 战斗。

---

## 已知限制 / 未完成

> 这是学习项目的诚实状态，**以下都不是 bug，是明确未做**。

- **仅 1 关（Stage_1）**：没有完整战役 / 难度曲线，后续关卡数据直接加进 `data/stages/` 即可。
- **掉落效果不完整**：4 种道具类型已配置，但只有 `WEAPON_UP` 实现了实际效果；`HEAL` / `SHIELD` / `RAMPAGE` 的数据通路与图标就位，效果未实现（有意砍掉以保持精简）。
- **无音效**：完全没有音频。
- **特效单调**：只有爆炸 + 命中火花；玩家受击反馈（机身染色 / 无敌帧 / hit-stop）、升级、入场特效均未实现（已留扩展点）。
- **手感参数未调**：BOSS / 精英的走位与弹幕参数（如横扫 / 三角时长 7s、悬停线 220）为占位值，需进编辑器实测微调。
- **无设置 / 存档**：`DataManager` / `SettingsData` 为占位空文件。
- **无多语言 / 联网 / 热更新**：单机学习项目，按设计不需要。
- **部分编辑器侧待决策**：瓦片图集是否移出 `resources/`、物理开关的落地方式统一等（见 `docs/架构决策.md` 第九节）。

---

## 后续计划

- [ ] 多关卡 / 难度曲线（`data/stages/` 扩充）
- [ ] 数值与手感平衡（机型 / 敌机 / BOSS 参数实测微调）
- [ ] 玩家受击反馈特效（染色 / 无敌帧 / hit-stop 三选一）
- [ ] 音效接入
- [ ] `HEAL` / `SHIELD` / `RAMPAGE` 效果实现（如重新需要）
- [ ] 更多机型 / 敌机 / 弹幕形态（纯数据扩展）
- [ ] 设置面板与本地存档

---

## 文档导航

| 文档 | 内容 |
|---|---|
| [`docs/架构决策.md`](docs/架构决策.md) | 为什么这么设计、改代码必须遵守的约束 |
| [`docs/项目结构.md`](docs/项目结构.md) | 代码地图：脚本清单、分层、启动时序、数据流、编辑器接线清单 |
| [`docs/README.md`](docs/README.md) | 开发向文档入口与导航 |

开发时的强制规范（组件生命周期、引擎规则、编码约定）与 AI 协作技能不在本目录，放在 `.workbuddy/`（本地 AI 工具数据，无需提交，见下方）。

---

## 许可证

代码以 **MIT** 许可证开源（可自由学习、修改、再发布，请保留版权声明）。

> **建议 `.gitignore`**（Cocos 生成物与本地工具数据无需提交）：
> ```
> library/
> temp/
> profiles/
> .workbuddy/
> ```
> 其中 `library/` 体积可达数百 MB，`temp/` 是构建缓存，`.workbuddy/` 是本项目的 AI 助手记忆与技能（仅本地使用）。

---

*This project is a one-month Cocos Creator learning exercise. The core gameplay loop is complete and runnable; polish, balancing, and content are intentionally minimal.*
