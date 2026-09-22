# 节点挂载脚本 & @property 拖拽引用一览

> 由脚本自动解析 `.prefab` / `.scene` + `.meta` 生成（uuid 经 Cocos 压缩算法还原）。

## assets/prefabs/entites/Bullet_1.prefab

### 节点 `Bullet_1`
- 内置组件：UITransform、Sprite、BoxCollider2D、RigidBody2D
- **脚本：`assets/scripts/entities/Bullet.ts`**
  - Inspector 里没有拖任何引用（全空）


## assets/prefabs/entites/Enemy.prefab

### 节点 `Enemy`
- 内置组件：UITransform、Sprite、BoxCollider2D、RigidBody2D
- **脚本：`assets/scripts/entities/Enemy.ts`**
  - Inspector 里没有拖任何引用（全空）


## assets/prefabs/entites/Enemy_Boss.prefab

### 节点 `Enemy_Boss`
- 内置组件：UITransform、Sprite、BoxCollider2D、RigidBody2D
- **脚本：`assets/scripts/entities/Enemy.ts`**
  - Inspector 里没有拖任何引用（全空）


## assets/prefabs/entites/Enemy_Elite.prefab

### 节点 `Enemy_Elite`
- 内置组件：UITransform、Sprite、BoxCollider2D、RigidBody2D
- **脚本：`assets/scripts/entities/Enemy.ts`**
  - Inspector 里没有拖任何引用（全空）


## assets/prefabs/entites/Enemy_Normal.prefab

### 节点 `Enemy_Normal`
- 内置组件：UITransform、Sprite、BoxCollider2D、RigidBody2D
- **脚本：`assets/scripts/entities/Enemy.ts`**
  - Inspector 里没有拖任何引用（全空）


## assets/prefabs/entites/Player.prefab

### 节点 `Player`
- 内置组件：UITransform、Sprite、BoxCollider2D、RigidBody2D
- **脚本：`assets/scripts/entities/Player.ts`**
  - `bulletManager` = null
  - `beamLayer` = null


## assets/prefabs/ui/GamePause.prefab

### 节点 `GamePause`
- 内置组件：UITransform、Widget
- **脚本：`assets/scripts/ui/GamePauseView.ts`**
  - `titleLabel` = `Label` 组件 @ GamePause/TitleLabel
  - `resumeBtn` = `Button` 组件 @ GamePause/ResumeButton

### 节点 `GamePause/ModalOverlay`
- 内置组件：UITransform、Sprite、Widget
- 无自定义脚本

### 节点 `GamePause/ResumeButton`
- 内置组件：UITransform、Sprite、Button
- 无自定义脚本

### 节点 `GamePause/ResumeButton/Label`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `GamePause/TitleLabel`
- 内置组件：UITransform、Label
- 无自定义脚本


## assets/prefabs/ui/GameResult.prefab

### 节点 `GameResult`
- 内置组件：UITransform、Widget
- **脚本：`assets/scripts/ui/GameResultView.ts`**
  - `titleLabel` = `Label` 组件 @ GameResult/Layout/TitleLabel
  - `finalScoreLabel` = `Label` 组件 @ GameResult/Layout/FinalScoreLabel
  - `result` = "NONE"
  - `restartBtn` = `Button` 组件 @ GameResult/Layout/RestartButton
  - `menuBtn` = `Button` 组件 @ GameResult/Layout/MenuButton

### 节点 `GameResult/Layout`
- 内置组件：UITransform、Widget
- 无自定义脚本

### 节点 `GameResult/Layout/FinalScoreLabel`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `GameResult/Layout/MenuButton`
- 内置组件：UITransform、Sprite、Button
- 无自定义脚本

### 节点 `GameResult/Layout/MenuButton/Label`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `GameResult/Layout/RestartButton`
- 内置组件：UITransform、Sprite、Button、Layout
- 无自定义脚本

### 节点 `GameResult/Layout/RestartButton/Label`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `GameResult/Layout/TitleLabel`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `GameResult/ModalOverlay`
- 内置组件：UITransform、Sprite、Widget
- 无自定义脚本


## assets/prefabs/ui/HUD.prefab

### 节点 `HUD`
- 内置组件：UITransform、Widget
- **脚本：`assets/scripts/ui/GameHUD.ts`**
  - `scoreLabel` = `Label` 组件 @ HUD/Layout/ScoreLabel
  - `hpLabel` = `Label` 组件 @ HUD/Layout/HpLabel
  - `levelLabel` = `Label` 组件 @ HUD/Layout/LevelLabel
  - `pauseBtn` = `Button` 组件 @ HUD/Layout/PauseButton

### 节点 `HUD/Layout`
- 内置组件：UITransform、Layout
- 无自定义脚本

### 节点 `HUD/Layout/HpLabel`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `HUD/Layout/LevelLabel`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `HUD/Layout/PauseButton`
- 内置组件：UITransform、Sprite、Button
- 无自定义脚本

### 节点 `HUD/Layout/PauseButton/Label`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `HUD/Layout/ScoreLabel`
- 内置组件：UITransform、Label
- 无自定义脚本


## assets/prefabs/ui/Menu.prefab

### 节点 `Menu`
- 内置组件：UITransform、Widget
- **脚本：`assets/scripts/ui/MenuView.ts`**
  - `panel` = 节点 `Menu`
  - `startBtn` = `Button` 组件 @ Menu/Layout/StartButton

### 节点 `Menu/Bg`
- 内置组件：UITransform、Sprite、Widget
- 无自定义脚本

### 节点 `Menu/Layout`
- 内置组件：UITransform、Layout
- 无自定义脚本

### 节点 `Menu/Layout/SelectLabel`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `Menu/Layout/ShipPanel`
- 内置组件：UITransform
- **脚本：`assets/scripts/ui/ShipSelectView.ts`**
  - `previewSprite` = `Sprite` 组件 @ Menu/Layout/ShipPanel/PreviewSprite
  - `nameLabel` = `Label` 组件 @ Menu/Layout/ShipPanel/NameLabel
  - `weaponLabel` = `Label` 组件 @ Menu/Layout/ShipPanel/WeaponLabel
  - `infoLabel` = `Label` 组件 @ Menu/Layout/ShipPanel/InfoLabel
  - `leftButton` = `Button` 组件 @ Menu/Layout/ShipPanel/LeftButton
  - `rightButton` = `Button` 组件 @ Menu/Layout/ShipPanel/RightButton

### 节点 `Menu/Layout/ShipPanel/InfoLabel`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `Menu/Layout/ShipPanel/LeftButton`
- 内置组件：UITransform、Sprite、Button
- 无自定义脚本

### 节点 `Menu/Layout/ShipPanel/LeftButton/Label`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `Menu/Layout/ShipPanel/NameLabel`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `Menu/Layout/ShipPanel/PreviewSprite`
- 内置组件：UITransform、Sprite
- 无自定义脚本

### 节点 `Menu/Layout/ShipPanel/RightButton`
- 内置组件：UITransform、Sprite、Button
- 无自定义脚本

### 节点 `Menu/Layout/ShipPanel/RightButton/Label`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `Menu/Layout/ShipPanel/WeaponLabel`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `Menu/Layout/StartButton`
- 内置组件：UITransform、Sprite、Button
- 无自定义脚本

### 节点 `Menu/Layout/StartButton/Label`
- 内置组件：UITransform、Label
- 无自定义脚本

### 节点 `Menu/Layout/TitleLabel`
- 内置组件：UITransform、Label
- 无自定义脚本


## assets/resources/ships/ship_green/Bullet_1.prefab

### 节点 `Bullet_1`
- 内置组件：UITransform、Sprite、BoxCollider2D、RigidBody2D
- **脚本：`assets/scripts/entities/Bullet.ts`**
  - Inspector 里没有拖任何引用（全空）


## assets/resources/ships/ship_red/Bullet_1.prefab

### 节点 `Bullet_1`
- 内置组件：UITransform、Sprite、BoxCollider2D、RigidBody2D
- **脚本：`assets/scripts/entities/Bullet.ts`**
  - Inspector 里没有拖任何引用（全空）


## assets/scenes/Game.scene

### 节点 `Canvas`
- 内置组件：UITransform、Canvas、Widget
- 无自定义脚本

### 节点 `Canvas/Camera`
- 内置组件：Camera
- 无自定义脚本

### 节点 `Canvas/GameRoot`
- 内置组件：UITransform
- 无自定义脚本

### 节点 `Canvas/GameRoot/?`
- 内置组件：无
- **脚本：`assets/scripts/managers/BulletManager.ts`**
  - `bulletContainer` = null
- **脚本：`assets/scripts/managers/BulletManager.ts`**
  - `bulletContainer` = null
- **脚本：`assets/scripts/managers/BulletManager.ts`**
  - `bulletContainer` = null

### 节点 `Canvas/GameRoot/BulletContainer`
- 内置组件：UITransform
- **脚本：`assets/scripts/managers/BulletManager.ts`**
  - `bulletContainer` = 节点 `Canvas/GameRoot/BulletContainer`

### 节点 `Canvas/GameRoot/Enemies`
- 内置组件：UITransform
- **脚本：`assets/scripts/managers/EnemyManager.ts`**
  - `spawnInterval` = 1
  - `enemyPrefab` = assets/prefabs/entites/Enemy.prefab [Prefab]
  - `enemyContainer` = 节点 `Canvas/GameRoot/Enemies`

### 节点 `Canvas/GameRoot/MapRoot`
- 内置组件：UITransform
- **脚本：`assets/scripts/managers/MapManager.ts`**
  - `waterFrame` = assets/resources/Tiles/tile_0042.png [SpriteFrame]
  - `grassFrames` = [9 项] assets/resources/Tiles/tile_0037.png [SpriteFrame]; assets/resources/Tiles/tile_0038.png [SpriteFrame]; assets/resources/Tiles/tile_0039.png [SpriteFrame] …
  - `sandFrames` = [9 项] assets/resources/Tiles/tile_0043.png [SpriteFrame]; assets/resources/Tiles/tile_0044.png [SpriteFrame]; assets/resources/Tiles/tile_0045.png [SpriteFrame] …
  - `tileSize` = 64
  - `scrollSpeed` = 80
  - `waterWeight` = 5
  - `blockRows` = 12
  - `lookaheadRows` = 8

### 节点 `Canvas/UI`
- 内置组件：UITransform、Widget
- 无自定义脚本

### 节点 `Canvas/UI/GamePausePanel`
- 内置组件：UITransform、Widget
- 无自定义脚本

### 节点 `Canvas/UI/GameResultPanel`
- 内置组件：UITransform、Widget
- 无自定义脚本

### 节点 `Canvas/UI/HUDLayer`
- 内置组件：UITransform、Widget
- 无自定义脚本

### 节点 `Canvas/UI/MenuLayer`
- 内置组件：UITransform、Widget
- 无自定义脚本

### 节点 `Canvas/UIManager`
- 内置组件：UITransform
- **脚本：`assets/scripts/managers/UIManager.ts`**
  - `menuLayer` = 节点 `Canvas/UI/MenuLayer`
  - `gamePausePanel` = 节点 `Canvas/UI/GamePausePanel`
  - `HUDLayer` = 节点 `Canvas/UI/HUDLayer`
  - `gameResultPanel` = 节点 `Canvas/UI/GameResultPanel`
  - `menuPrefab` = assets/prefabs/ui/Menu.prefab [Prefab]
  - `gamePausePrefab` = assets/prefabs/ui/GamePause.prefab [Prefab]
  - `HUDPrefab` = assets/prefabs/ui/HUD.prefab [Prefab]
  - `gameResultPrefab` = assets/prefabs/ui/GameResult.prefab [Prefab]

### 节点 `GameEntry`
- 内置组件：无
- **脚本：`assets/scripts/GameEntry.ts`**
  - Inspector 里没有拖任何引用（全空）


## 附：没有挂到任何节点上的脚本（纯数据/逻辑层）

- `assets/scripts/core/EventBus.ts`
- `assets/scripts/core/ObjectPool.ts`
- `assets/scripts/core/PoolManager.ts`
- `assets/scripts/core/WFCGenerator.ts`
- `assets/scripts/core/utils/asset.ts`
- `assets/scripts/core/utils/common.ts`
- `assets/scripts/data/DataManager.ts`
- `assets/scripts/data/GameState.ts`
- `assets/scripts/data/PlayerData.ts`
- `assets/scripts/data/SettingsData.ts`
- `assets/scripts/data/config/GameConfig.ts`
- `assets/scripts/data/config/PhysicsGroups.ts`
- `assets/scripts/data/enemies/EnemyBoss.ts`
- `assets/scripts/data/enemies/EnemyConfig.ts`
- `assets/scripts/data/enemies/EnemyElite.ts`
- `assets/scripts/data/enemies/EnemyNormal.ts`
- `assets/scripts/data/enemies/EnemyRegistry.ts`
- `assets/scripts/data/ships/ShipBlue.ts`
- `assets/scripts/data/ships/ShipConfig.ts`
- `assets/scripts/data/ships/ShipGreen.ts`
- `assets/scripts/data/ships/ShipRed.ts`
- `assets/scripts/data/ships/ShipRegistry.ts`
- `assets/scripts/entities/emitters/BeamEmitter.ts`
- `assets/scripts/entities/emitters/Emitter.ts`
- `assets/scripts/entities/emitters/LaneEmitter.ts`
- `assets/scripts/managers/GameManager.ts`

## 附：脚本 → 挂载位置

- `assets/scripts/GameEntry.ts` ：assets/scenes/Game.scene → GameEntry
- `assets/scripts/entities/Bullet.ts` ：assets/prefabs/entites/Bullet_1.prefab → Bullet_1；assets/resources/ships/ship_green/Bullet_1.prefab → Bullet_1；assets/resources/ships/ship_red/Bullet_1.prefab → Bullet_1
- `assets/scripts/entities/Enemy.ts` ：assets/prefabs/entites/Enemy.prefab → Enemy；assets/prefabs/entites/Enemy_Boss.prefab → Enemy_Boss；assets/prefabs/entites/Enemy_Elite.prefab → Enemy_Elite；assets/prefabs/entites/Enemy_Normal.prefab → Enemy_Normal
- `assets/scripts/entities/Player.ts` ：assets/prefabs/entites/Player.prefab → Player
- `assets/scripts/managers/BulletManager.ts` ：assets/scenes/Game.scene → Canvas/GameRoot/?；assets/scenes/Game.scene → Canvas/GameRoot/?；assets/scenes/Game.scene → Canvas/GameRoot/?；assets/scenes/Game.scene → Canvas/GameRoot/BulletContainer
- `assets/scripts/managers/EnemyManager.ts` ：assets/scenes/Game.scene → Canvas/GameRoot/Enemies
- `assets/scripts/managers/MapManager.ts` ：assets/scenes/Game.scene → Canvas/GameRoot/MapRoot
- `assets/scripts/managers/UIManager.ts` ：assets/scenes/Game.scene → Canvas/UIManager
- `assets/scripts/ui/GameHUD.ts` ：assets/prefabs/ui/HUD.prefab → HUD
- `assets/scripts/ui/GamePauseView.ts` ：assets/prefabs/ui/GamePause.prefab → GamePause
- `assets/scripts/ui/GameResultView.ts` ：assets/prefabs/ui/GameResult.prefab → GameResult
- `assets/scripts/ui/MenuView.ts` ：assets/prefabs/ui/Menu.prefab → Menu
- `assets/scripts/ui/ShipSelectView.ts` ：assets/prefabs/ui/Menu.prefab → Menu/Layout/ShipPanel