import * as THREE from 'three'

export type LandscapeAssetStatus = 'loading' | 'ready' | 'failed'

/** Existing images are material inputs, never a screen-space replacement world. */
export function createLandscapeAssets(lowTier:boolean, onChange: () => void) {
  let alive = true
  let status: LandscapeAssetStatus = 'loading'
  let loaded = 0
  const fail = () => {
    if (!alive || status !== 'loading') return
    status = 'failed'
    clearTimeout(timeout)
    onChange()
  }
  const timeout = setTimeout(fail, 5000)
  const loader = new THREE.TextureLoader()
  const load = (path: string, colorSpace: THREE.ColorSpace) => {
    const texture = loader.load(path, () => {
      if (!alive || status !== 'loading') return
      if (++loaded === 2) { status = 'ready'; clearTimeout(timeout) }
      onChange()
    }, undefined, fail)
    texture.colorSpace = colorSpace
    texture.anisotropy = 4
    return texture
  }
  const photo = load(lowTier?'/3d/c7/backdrop/correction-world-1280-v4.webp':'/3d/c7/backdrop/correction-world-2560-v4.webp', THREE.SRGBColorSpace)
  const control = load('/3d/c7/backdrop/correction-control-1280-v4.webp', THREE.NoColorSpace)
  return {
    photo, control,
    status: () => status,
    ready: () => status === 'ready',
    dispose: () => { alive = false; clearTimeout(timeout); photo.dispose(); control.dispose() },
  }
}
