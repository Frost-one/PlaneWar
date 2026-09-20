# PlaneWar

一款基于 Cocos Creator 的纵版卷轴射击游戏（飞机大战），玩法参照《雷霆战机》。

## 游戏是什么

玩家在菜单中选一架机型，进入战斗后操控飞机在向上滚动的地图上躲避并击落敌机。
地图由 WFC（波函数坍缩）算法程序化生成，每次开局的水面 / 草地 / 沙地分布都不同。
击杀敌机得分，被撞或中弹扣血，血尽结算。有暂停、继续、重开。

**三种机型**（数值、武器、外观各不相同）：

| 机型 | 定位 | 武器 |
|---|---|---|
| 赤焰 | 中血中速 | 散射 |
| 苍岩 | 高血低速 | 贯穿 |
| 湛影 | 低血高速 | 激光 |

**三类敌机**：普通、精英、BOSS。支持火力等级提升（1~5 级）。

## 技术栈

- **引擎**：Cocos Creator 3.8.7
- **语言**：TypeScript
- **场景**：单场景 `assets/scenes/Game.scene`
- **物理**：2D 物理系统（RigidBody2D + Collider2D）驱动子弹与敌机
- **构建**：无 npm scripts，编译与运行全部在 Cocos Creator 编辑器内完成

## 怎么跑起来

1. 用 Cocos Creator 3.8.7 打开本工程目录。
2. 确认 2D 物理系统已开启（项目设置 → 物理，或 `GameEntry` 中启用）。
3. 打开 `assets/scenes/Game.scene` 并预览。
4. 若机型预览图或子弹缺失，检查 `assets/resources/ships/<shipId>/` 下资源是否就位。

## 文档导航

| 文档 | 内容 |
|---|---|
| **项目结构.md** | 代码地图：脚本清单、分层、启动时序、数据流、接线清单 |
| **架构决策.md** | 设计决策与约束：为什么这么设计、改代码必须遵守什么 |
| **提示词模板.md** | 与 AI 协作时可直接复制的常用提示词 |

开发时的强制规范（组件生命周期、Cocos 引擎规则、编码约定）不在本目录，
放在 `.workbuddy/memory/` 与 `.workbuddy/skills/cocos-planewar/` —— 那里是行动准则，本目录是说明。

## 目录速览

```
assets/
├── scenes/      场景
├── scripts/     全部 TypeScript（35 个）
├── resources/   运行时按 id 动态加载的资源
├── prefabs/     飞船 / 敌机 / 子弹 / UI 预制体
└── scripts/ 之外的 Tilemap、Tiles 为地图瓦片图集
```
