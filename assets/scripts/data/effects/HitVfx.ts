import { Node, Prefab, Sprite, SpriteFrame, Vec3, tween } from 'cc'
import { loadAsset } from '../../core/utils/asset'
import { IVfx, VfxId, VfxHandle } from './VfxConfig'

/**
 * 层2：命中火花（模型 A——代码 tween 演出，不烤进 prefab）。
 *
 * 子弹打中敌机的瞬间火花：复用一张 tile 图（tile_0007，迸散感），在命中点快速放大后消失。
 * 与爆炸（模型 B）走同一条 IVfx 契约——只是演出由代码 tween 完成、prefab 只是带 Sprite 的空壳。
 * 自己的池模板 common/vfx/Hit（Sprite 空壳，spriteFrame 由 play 设置）。
 */
export interface HitParams {
  /** 命中点（世界坐标） */
  x: number
  y: number
}

export class HitVfx implements IVfx<HitParams> {
  readonly id: VfxId = 'hit'
  readonly type: VfxId = 'hit'
  /** 带 Sprite 的空壳 prefab（用户需在编辑器建，spriteFrame 由 play 赋值） */
  readonly prefabPath = 'common/vfx/Hit'
  prefab: Prefab | null = null
  private frame: SpriteFrame | null = null

  async load(): Promise<void> {
    try {
      const [prefab, frame] = await Promise.all([
        loadAsset(this.prefabPath, Prefab),
        loadAsset('common/vfx/tile_0007/spriteFrame', SpriteFrame),
      ])
      this.prefab = prefab
      this.frame = frame
    } catch (err) {
      console.error('[HitVfx] 加载失败:', err)
      this.prefab = null
      throw err // 让 registry 知道这个特效没好
    }
  }

  play(node: Node, params: HitParams, done: () => void): VfxHandle {
    node.setWorldPosition(params.x, params.y, 0)
    node.setScale(0.8, 0.8, 1)

    const sprite = node.getComponent(Sprite)
    if (!sprite || !this.frame) {
      console.error('[HitVfx] 缺 Sprite 组件或帧未加载，跳过')
      done()
      return { pause() {}, resume() {}, cancel() {} }
    }
    sprite.spriteFrame = this.frame

    // 快速放大一下即消失：短促的命中感
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      done()
    }
    const tw = tween(node).to(0.12, { scale: new Vec3(2.2, 2.2, 1) }).call(finish).start()

    return {
      pause: () => tw.pause(),
      resume: () => tw.resume(),
      // 只停 tween，不调 done（节点回收归 manager 的 clearAll / recycle）
      cancel: () => tw.stop(),
    }
  }
}

/** 导出实例引用（与 explosionVfx 同款） */
export const hitVfx = new HitVfx()
