import { Animation, Node, Prefab } from 'cc'
import { loadAsset } from '../../core/utils/asset'
import { IVfx, VfxId, VfxHandle } from './VfxConfig'

/**
 * 层2：具体特效实现（爆炸）—— 模型 B：动画烤进 prefab。
 *
 * 不再用代码切 5 张帧：prefab 自带 Animation 组件 + 一段名为 'explosion' 的剪辑，
 * 剪辑里把 5 张 tile 依次排成帧动画（wrap mode = Once）。本文件只负责：
 *   ① 声明自己的池模板 prefab（common/vfx/Explosion，带 Sprite + Animation）；
 *   ② load() 加载这个 prefab（其引用的帧图随 prefab 依赖一并加载）；
 *   ③ play() 把节点摆到落点、调 anim.play('explosion')，监听 FINISHED 回收。
 *
 * 帧序列、节奏、缩放全部在编辑器剪辑里调，代码零演出逻辑——这就是"实现在 prefab"。
 * 若日后想换成代码驱动（模型 A，便于做小/大/彩色等多变体复用同一套逻辑），
 * 只改本文件 play() 即可，对外接口（IVfx）不变。
 *
 * 任何异常都打日志（不静默降级），方便编辑器里排查"为什么没动画"。
 */
export interface ExplosionParams {
  /** 落点（世界坐标）—— 爆炸出现在哪个位置 */
  x: number
  y: number
}

export class ExplosionVfx implements IVfx<ExplosionParams> {
  readonly id: VfxId = 'explosion'
  readonly type: VfxId = 'explosion'

  /** 本特效自己的池模板：带 Sprite + Animation('explosion') 的预制体（用户需在编辑器建好） */
  readonly prefabPath = 'common/vfx/Explosion'
  /** load() 后填充 */
  prefab: Prefab | null = null

  async load(): Promise<void> {
    try {
      this.prefab = await loadAsset(this.prefabPath, Prefab)
    } catch (err) {
      // 不静默：把路径和原因打出来，开发者立刻知道 prefab 没找到或路径错了
      console.error(`[ExplosionVfx] 加载失败 ${this.prefabPath}:`, err)
      this.prefab = null
      throw err // 让 registry 知道这个特效没好（registry 会记日志但不拖垮其他特效）
    }
  }

  play(node: Node, params: ExplosionParams, done: () => void): VfxHandle {
    // 落点 + 放大（16px 图 → 约 64px；缩放由本特效自己定，manager 只给干净起点）
    node.setWorldPosition(params.x, params.y, 0)
    node.setScale(4, 4, 1)

    const anim = node.getComponent(Animation)
    if (!anim) {
      // prefab 缺 Animation 组件：明确报错，不要默默回收
      console.error(`[ExplosionVfx] prefab 缺 Animation 组件: ${this.prefabPath}`)
      done()
      return { pause() {}, resume() {}, cancel() {} }
    }

    // 剪辑名是否真的在 Animation.clips 里（最常见"没动画"原因：剪辑没挂进 Clips 数组，或名字拼错）
    const clipNames = anim.clips.map((c) => c.name)
    if (!clipNames.includes('explosion')) {
      console.error(`[ExplosionVfx] 找不到剪辑 "explosion"，clips=[${clipNames.join(', ')}]`)
      done()
      return { pause() {}, resume() {}, cancel() {} }
    }

    // 监听剪辑播完 → 回收；用 off 确保只触发一次
    const onFinished = () => {
      anim.off(Animation.EventType.FINISHED, onFinished, this)
      done()
    }
    anim.on(Animation.EventType.FINISHED, onFinished, this)
    // 注意：3.8.7 的 Animation.play() 返回 void（引擎声明如此），不能用返回值判断成败；
    // 成败校验已由上方的 clips 名单检查完成——剪辑存在时 play 必然启动。
    anim.play('explosion')

    return {
      // 游戏暂停：停动画（FINISHED 不会在暂停期间触发，done 不会误回收）
      pause: () => anim.pause(),
      resume: () => anim.resume(),
      // 强制停止：退订 + 停动画（节点回收归 manager）
      cancel: () => {
        anim.off(Animation.EventType.FINISHED, onFinished, this)
        anim.stop()
      },
    }
  }
}

/** 导出实例引用（与 ship/enemy 的 SHIP_RED 等导出配置实例同款） */
export const explosionVfx = new ExplosionVfx()
