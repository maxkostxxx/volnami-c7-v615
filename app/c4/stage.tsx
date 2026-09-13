'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import type { Material, Texture, WebGLRenderer } from 'three'
import { site } from '@/content/site'

const fallback = site.cases.list[0].visuals[0]

export function C4Stage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (motion.matches || connection?.saveData) return

    let disposed = false
    let teardown: (() => void) | undefined

    void import('three').then((THREE) => {
      if (disposed) return

    let renderer: WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
    } catch {
      setReady(false)
      return
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe7ecf3)
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40)
    camera.position.set(0, 0.2, 10.2)

    const stage = new THREE.Group()
    stage.position.set(0.65, -0.35, 0)
    stage.rotation.set(-0.06, -0.28, 0.025)
    scene.add(stage)

    const shape = new THREE.Shape()
    shape.moveTo(-1.42, 1.4)
    shape.lineTo(1.42, 1.4)
    shape.lineTo(0.73, -1.55)
    shape.lineTo(-0.73, -1.55)
    shape.closePath()
    const packGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.5,
      bevelEnabled: true,
      bevelSize: 0.035,
      bevelThickness: 0.035,
      bevelSegments: 2,
      steps: 1,
    })
    packGeometry.translate(0, 0, -0.25)

    const sideMaterial = new THREE.MeshStandardMaterial({ color: 0x4d145c, roughness: 0.62, metalness: 0.02 })
    const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.54, metalness: 0.01 })
    const pack = new THREE.Mesh(packGeometry, sideMaterial)
    pack.castShadow = true
    pack.receiveShadow = true
    stage.add(pack)

    const frontGeometry = new THREE.BufferGeometry()
    frontGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1.42, 1.4, 0.291,
      1.42, 1.4, 0.291,
      0.73, -1.55, 0.291,
      -0.73, -1.55, 0.291,
    ], 3))
    frontGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 1,
      1, 1,
      1, 0,
      0, 0,
    ], 2))
    frontGeometry.setIndex([0, 2, 1, 0, 3, 2])
    frontGeometry.computeVertexNormals()
    const front = new THREE.Mesh(frontGeometry, faceMaterial)
    front.castShadow = true
    stage.add(front)

    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xf1bd16 })
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(packGeometry, 24), edgeMaterial)
    edges.renderOrder = 3
    stage.add(edges)

    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xf1bd16, roughness: 0.42 })
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.11, 0.58), rimMaterial)
    rim.position.set(0, 1.42, 0)
    rim.castShadow = true
    stage.add(rim)

    const fryGeometry = new THREE.BoxGeometry(0.15, 1.38, 0.15)
    const fryMaterial = new THREE.MeshStandardMaterial({ color: 0xf2be18, roughness: 0.75 })
    const fryData = [
      [-0.94, 1.98, -0.12, -0.17], [-0.7, 2.14, 0.03, 0.08], [-0.45, 2.02, 0.12, -0.05],
      [-0.18, 2.2, -0.03, 0.12], [0.08, 2.04, 0.1, -0.04], [0.34, 2.18, -0.11, 0.07],
      [0.58, 2.01, 0.08, -0.1], [0.82, 2.12, -0.02, 0.13], [1.02, 1.96, 0.06, -0.08],
    ] as const
    for (const [x, y, z, rotation] of fryData) {
      const fry = new THREE.Mesh(fryGeometry, fryMaterial)
      fry.position.set(x, y, z)
      fry.rotation.z = rotation
      fry.castShadow = true
      stage.add(fry)
    }

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0xd5dce6, roughness: 0.88, metalness: 0 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1.68
    floor.receiveShadow = true
    scene.add(floor)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x546177, 2.25))
    const key = new THREE.DirectionalLight(0xffffff, 5.2)
    key.position.set(-4, 7, 6)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const edgeLight = new THREE.DirectionalLight(0x96b7ff, 2.6)
    edgeLight.position.set(5, 2, -3)
    scene.add(edgeLight)

    let texture: Texture | undefined
    let reduced = motion.matches
    let raf = 0
    let targetX = stage.rotation.y
    let targetY = stage.rotation.x
    let currentX = targetX
    let currentY = targetY

    const render = (reveal = false) => {
      if (disposed) return
      renderer.render(scene, camera)
      if (reveal) setReady(true)
    }

    const loader = new THREE.TextureLoader()
    loader.load(
      '/cases/kulek/kulek-dieline.webp',
      (loaded) => {
        if (disposed) {
          loaded.dispose()
          return
        }
        texture = loaded
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        texture.repeat.set(0.49, 0.78)
        texture.offset.set(0.47, 0.03)
        faceMaterial.map = texture
        faceMaterial.needsUpdate = true
        render(true)
      },
      undefined,
      () => setReady(false),
    )

    const animateTowardPointer = () => {
      currentX += (targetX - currentX) * 0.12
      currentY += (targetY - currentY) * 0.12
      stage.rotation.y = currentX
      stage.rotation.x = currentY
      renderer.render(scene, camera)
      if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.001) {
        raf = requestAnimationFrame(animateTowardPointer)
      } else {
        raf = 0
      }
    }

    const schedule = () => {
      if (!reduced && !raf) raf = requestAnimationFrame(animateTowardPointer)
    }

    const point = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const bounds = host.getBoundingClientRect()
      const x = (event.clientX - bounds.left) / bounds.width - 0.5
      const y = (event.clientY - bounds.top) / bounds.height - 0.5
      targetX = -0.28 + x * 0.34
      targetY = -0.06 + y * 0.2
      schedule()
    }
    const reset = () => {
      targetX = -0.28
      targetY = -0.06
      schedule()
    }

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      const mobile = width < 700
      const dprCap = mobile ? 1.25 : 1.65
      renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap))
      renderer.shadowMap.enabled = !mobile
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.position.z = mobile ? 9 : 10.2
      camera.updateProjectionMatrix()
      stage.position.set(mobile ? 0 : 0.65, mobile ? -0.55 : -0.35, 0)
      stage.scale.setScalar(mobile ? 1.18 : 0.9)
      render(Boolean(texture))
    }

    const contextLost = (event: Event) => {
      event.preventDefault()
      setReady(false)
    }
    const contextRestored = () => resize()
    const motionChanged = (event: MediaQueryListEvent) => {
      reduced = event.matches
      if (!reduced) return
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      targetX = -0.28
      targetY = -0.06
      currentX = targetX
      currentY = targetY
      stage.rotation.set(targetY, targetX, 0.025)
      render(Boolean(texture))
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    motion.addEventListener('change', motionChanged)
    host.addEventListener('pointermove', point)
    host.addEventListener('pointerleave', reset)
    canvas.addEventListener('webglcontextlost', contextLost)
    canvas.addEventListener('webglcontextrestored', contextRestored)
    resize()

    teardown = () => {
      if (raf) cancelAnimationFrame(raf)
      observer.disconnect()
      motion.removeEventListener('change', motionChanged)
      host.removeEventListener('pointermove', point)
      host.removeEventListener('pointerleave', reset)
      canvas.removeEventListener('webglcontextlost', contextLost)
      canvas.removeEventListener('webglcontextrestored', contextRestored)
      texture?.dispose()
      packGeometry.dispose()
      frontGeometry.dispose()
      fryGeometry.dispose()
      sideMaterial.dispose()
      faceMaterial.dispose()
      edgeMaterial.dispose()
      edges.geometry.dispose()
      rim.geometry.dispose()
      rimMaterial.dispose()
      floor.geometry.dispose()
      ;(floor.material as Material).dispose()
      fryMaterial.dispose()
      renderer.forceContextLoss()
      renderer.dispose()
    }

    if (disposed) teardown()
    }).catch(() => { if (!disposed) setReady(false) })

    return () => {
      disposed = true
      teardown?.()
    }
  }, [])

  return <div ref={hostRef} className={`c4-stage${ready ? ' is-ready' : ''}`} aria-hidden="true">
    <Image className="c4-stage-fallback" src={fallback.src} alt="" width={fallback.width} height={fallback.height} priority sizes="(max-width: 700px) 100vw, 62vw" />
    <canvas ref={canvasRef} />
  </div>
}
