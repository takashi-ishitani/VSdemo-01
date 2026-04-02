<template>
  <div class="page-shell">
    <header>
      <div class="brand">
        <h1>Nuxt Graphical Demo</h1>
        <p>Google Cloud 想定のシンプル Web アプリケーション</p>
      </div>
      <nav>
        <a href="#hello">Hello</a>
        <a href="#button">Button</a>
        <a href="#animation">3D Animation</a>
      </nav>
    </header>

    <main>
      <section id="hello" class="panel">
        <h2>ようこそ</h2>
        <p>ここは Nuxt 4 と Three.js を使ったグラフィカルデモです。3D アニメボタンを押すと、下のエリアで立体図形がジャンプします。</p>
      </section>

      <section id="button" class="panel action-panel">
        <div>
          <h2>Button</h2>
          <p>下のボタンで3Dアニメーションの色やサイズを変えてみましょう。</p>
        </div>
        <div class="button-group">
          <button class="primary-button" @click="playJump">3D Animation</button>
          <button class="secondary-button" @click="changeBasicColor">基本色変更</button>
          <button class="secondary-button" @click="changeActiveColor">アクティブカラー変更</button>
          <button class="secondary-button" @click="changeSize(-1)">小さくする</button>
          <button class="secondary-button" @click="changeSize(1)">大きくする</button>
        </div>
      </section>

      <section id="animation" class="panel animation-panel">
        <div class="animation-header">
          <div>
            <h2>3D Animation</h2>
            <p>{{ actionMessage }}</p>
          </div>
        </div>
        <ClientOnly>
          <div ref="canvasContainer" class="scene-container">
            <div v-if="!loaded" class="placeholder">Loading 3D scene…</div>
          </div>
        </ClientOnly>
      </section>
    </main>

    <footer>
      <p>Run with <code>npm install</code> and <code>npm run dev</code></p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const canvasContainer = ref<HTMLElement | null>(null)
const actionMessage = ref('ボタンを押すと、立方体が拡縮しながらジャンプします。')
const loaded = ref(false)
const isJumping = ref(false)
const shapeNames = ['Box', 'Sphere', 'Torus', 'Cylinder', 'Octahedron']
let shapeIndex = 0
let velocity = new THREE.Vector3(0, 0, 0)
const gravity = -7
const rebound = 0.65
const groundY = 0.5
const maxX = 2.2
const minScale = 0.55
const maxScale = 2.1
const scaleStep = 0.08
const basicColors = [0x7c3aed, 0x22d3ee, 0xf59e0b, 0x10b981, 0xef4444]
const activeStyles = ['blue', 'red', 'rainbow']
let basicColorIndex = 0
let activeStyleIndex = 0
const activeColorMode = ref(false)
const baseScale = ref(1)
let lastTime = 0
let animationFrameId = 0
let time = 0
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let cube: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null
let edgeLines: THREE.LineSegments | null = null
let raycaster: THREE.Raycaster | null = null
let dragPlane: THREE.Plane | null = null
let dragOffset = new THREE.Vector3()
const lastPointer = new THREE.Vector2()
const lastWorldPoint = new THREE.Vector3()
const dragVelocity = new THREE.Vector3()
let isDragging = false
const maxZ = 2.2
let rainbowTexture: THREE.Texture | null = null

const getPointerNDC = (event: PointerEvent) => {
  if (!renderer) return new THREE.Vector2()
  const rect = renderer.domElement.getBoundingClientRect()
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )
}

const startDrag = (event: PointerEvent) => {
  if (!renderer || !camera || !cube) return
  const pointer = getPointerNDC(event)
  raycaster?.setFromCamera(pointer, camera)
  const intersects = raycaster?.intersectObject(cube, true)
  if (!intersects || intersects.length === 0) return

  isDragging = true
  lastPointer.copy(pointer)
  const currentY = cube.position.y
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -currentY)

  const worldPoint = new THREE.Vector3()
  raycaster!.ray.intersectPlane(dragPlane, worldPoint)
  dragOffset.copy(worldPoint).sub(cube.position)
  lastWorldPoint.copy(worldPoint)
  dragVelocity.set(0, 0, 0)
  if (isJumping.value) {
    isJumping.value = false
    velocity.set(0, 0, 0)
    actionMessage.value = 'キャッチ！そのままドラッグで放します。'
  } else {
    actionMessage.value = 'ドラッグ中…離すと跳ねます。'
  }
  renderer.domElement.setPointerCapture(event.pointerId)
}

const moveDrag = (event: PointerEvent) => {
  if (!isDragging || !renderer || !camera || !cube || !dragPlane || !raycaster) return
  const pointer = getPointerNDC(event)
  raycaster.setFromCamera(pointer, camera)

  const worldPoint = new THREE.Vector3()
  if (raycaster.ray.intersectPlane(dragPlane, worldPoint)) {
    const target = worldPoint.clone().sub(dragOffset)
    cube.position.x = THREE.MathUtils.clamp(target.x, -maxX, maxX)
    cube.position.z = THREE.MathUtils.clamp(target.z, -maxZ, maxZ)
    cube.position.y = dragPlane.constant * -1
    dragVelocity.copy(worldPoint).sub(lastWorldPoint).multiplyScalar(12)
    lastWorldPoint.copy(worldPoint)
  }
}

const endDrag = (event: PointerEvent) => {
  if (!isDragging) return
  isDragging = false
  isJumping.value = true
  const speed = Math.min(dragVelocity.length(), 1.3)
  velocity.set(dragVelocity.x * 7.5, 5.6 + speed * 4.5, dragVelocity.z * 7.5)
  actionMessage.value = '離した！ドラッグした方向に跳ねました。'
  if (renderer) renderer.domElement.releasePointerCapture(event.pointerId)
}

const createGeometry = (index: number) => {
  switch (index % shapeNames.length) {
    case 1:
      return new THREE.SphereGeometry(0.85, 28, 22)
    case 2:
      return new THREE.TorusGeometry(0.65, 0.22, 24, 64)
    case 3:
      return new THREE.CylinderGeometry(0.75, 0.75, 1.2, 32)
    case 4:
      return new THREE.OctahedronGeometry(0.9, 0)
    default:
      return new THREE.BoxGeometry(1.3, 1.3, 1.3)
  }
}

const applyShape = (index: number) => {
  if (!cube) return
  const geometry = createGeometry(index)
  cube.geometry.dispose()
  cube.geometry = geometry
  if (edgeLines) {
    cube.remove(edgeLines)
    edgeLines.geometry.dispose()
  }
  edgeLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xc4b5fd })
  )
  cube.add(edgeLines)
  actionMessage.value = `地面タッチで ${shapeNames[index % shapeNames.length]} に変形！`
}

const nextShape = () => {
  shapeIndex = (shapeIndex + 1) % shapeNames.length
  applyShape(shapeIndex)
}

const setupScene = () => {
  if (!canvasContainer.value) return

  const width = canvasContainer.value.clientWidth
  const height = canvasContainer.value.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b1220)

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(0, 1.8, 4.4)
  camera.lookAt(0, 0.5, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height, false)
  renderer.shadowMap.enabled = true
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.position = 'absolute'
  renderer.domElement.style.inset = '0'
  renderer.domElement.style.zIndex = '0'

  canvasContainer.value.innerHTML = ''
  canvasContainer.value.appendChild(renderer.domElement)
  loaded.value = true

  raycaster = new THREE.Raycaster()

  renderer.domElement.addEventListener('pointerdown', startDrag)
  renderer.domElement.addEventListener('pointermove', moveDrag)
  renderer.domElement.addEventListener('pointerup', endDrag)
  renderer.domElement.addEventListener('pointercancel', endDrag)

  const material = new THREE.MeshStandardMaterial({
    color: basicColors[basicColorIndex],
    roughness: 0.35,
    metalness: 0.5,
    emissive: 0x1f1848,
    emissiveIntensity: 0.3
  })

  const geometry = createGeometry(shapeIndex)
  cube = new THREE.Mesh(geometry, material)
  cube.position.set(0, groundY, 0)
  cube.castShadow = true
  scene.add(cube)

  edgeLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xc4b5fd })
  )
  cube.add(edgeLines)

  const light = new THREE.HemisphereLight(0xcce0ff, 0x202040, 1.2)
  scene.add(light)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(3, 4, 2)
  scene.add(directionalLight)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({ color: 0x111a2b, roughness: 0.95, metalness: 0.05 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0
  scene.add(floor)

  window.addEventListener('resize', handleResize)
  rainbowTexture = createRainbowTexture()
  lastTime = performance.now()
  animate()
}

const createRainbowTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((30 * Math.PI) / 180)
  ctx.translate(-canvas.width / 2, -canvas.height / 2)

  const gradient = ctx.createLinearGradient(-canvas.width, canvas.height / 2, canvas.width * 2, canvas.height / 2)
  gradient.addColorStop(0.0, '#ff0000')
  gradient.addColorStop(0.16, '#ff7f00')
  gradient.addColorStop(0.33, '#ffff00')
  gradient.addColorStop(0.50, '#00ff00')
  gradient.addColorStop(0.66, '#0000ff')
  gradient.addColorStop(0.83, '#4b0082')
  gradient.addColorStop(1.0, '#8b00ff')

  ctx.fillStyle = gradient
  ctx.fillRect(-canvas.width, 0, canvas.width * 3, canvas.height)
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  texture.needsUpdate = true
  return texture
}

const handleResize = () => {
  if (!canvasContainer.value || !camera || !renderer) return
  const width = canvasContainer.value.clientWidth
  const height = canvasContainer.value.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
}

const animate = () => {
  if (!renderer || !scene || !camera || !cube) return

  const now = performance.now()
  const delta = Math.min((now - lastTime) / 1000, 0.035)
  lastTime = now
  time += delta

  const axis = new THREE.Vector3(
    Math.sin(time * 1.1),
    Math.cos(time * 0.6),
    Math.sin(time * 0.4)
  ).normalize()
  cube.rotateOnAxis(axis, delta * 2.4)

  if (isJumping.value) {
    velocity.y += gravity * delta
    cube.position.y += velocity.y * delta
    cube.position.x += velocity.x * delta
    cube.position.z += velocity.z * delta

    const pull = new THREE.Vector3(-cube.position.x, 0, -cube.position.z).multiplyScalar(2.4 * delta)
    velocity.add(pull)

    if (cube.position.x < -maxX || cube.position.x > maxX) {
      velocity.x *= -1
      cube.position.x = THREE.MathUtils.clamp(cube.position.x, -maxX, maxX)
    }
    if (cube.position.z < -maxZ || cube.position.z > maxZ) {
      velocity.z *= -1
      cube.position.z = THREE.MathUtils.clamp(cube.position.z, -maxZ, maxZ)
    }

    if (cube.position.y <= groundY) {
      cube.position.y = groundY
      if (velocity.y < 0) {
        if (Math.abs(velocity.y) < 1.2) {
          isJumping.value = false
          velocity.set(0, 0, 0)
          actionMessage.value = '着地したよ。もう一度押してさらに跳ねさせてね！'
        } else {
          velocity.y *= -rebound
          velocity.x *= 0.86
          velocity.z *= 0.86
          nextShape()
          actionMessage.value = `バウンド！次は ${shapeNames[shapeIndex]} 形状です。`
        }
      }
    }
  }

  if (activeColorMode.value) {
    switch (activeStyles[activeStyleIndex]) {
      case 'blue':
        cube.material.color.setHSL(0.56 + Math.sin(time * 2.2) * 0.03, 0.7, 0.48)
        cube.material.emissive.setHSL(0.56, 0.35, 0.12)
        break
      case 'red':
        cube.material.color.setHSL((0.0 + Math.sin(time * 2.1) * 0.04 + 1) % 1, 0.78, 0.46)
        cube.material.emissive.setHSL(0.0, 0.32, 0.14)
        break
      case 'rainbow':
        if (cube.material.map) {
          cube.material.map.offset.x = (time * 0.18) % 1
          cube.material.map.needsUpdate = true
        }
        cube.material.color.set(0xffffff)
        cube.material.emissive.set(0x111111)
        break
    }
  }

  const idleScale = 1 + Math.sin(time * 1.7) * 0.05
  const wobble = 1 + Math.sin(time * 2.2) * 0.03
  cube.scale.setScalar(baseScale.value * idleScale * wobble)

  renderer.render(scene, camera)
  animationFrameId = requestAnimationFrame(animate)
}

const applyCurrentMaterialColor = () => {
  if (!cube) return
  cube.material.map = null
  cube.material.color.set(basicColors[basicColorIndex])
  cube.material.emissive.setScalar(0.3)
  cube.material.needsUpdate = true
}

const applyActiveStyle = () => {
  if (!cube) return
  cube.material.map = null
  switch (activeStyles[activeStyleIndex]) {
    case 'blue':
      cube.material.color.set(0x60a5fa)
      cube.material.emissive.set(0x1e3a8a)
      break
    case 'red':
      cube.material.color.set(0xf43f5e)
      cube.material.emissive.set(0x881337)
      break
    case 'rainbow':
      if (rainbowTexture) {
        cube.material.map = rainbowTexture
        cube.material.needsUpdate = true
      }
      cube.material.color.set(0xffffff)
      cube.material.emissive.set(0x111111)
      break
  }
}

const changeBasicColor = () => {
  if (!cube) return
  activeColorMode.value = false
  basicColorIndex = (basicColorIndex + 1) % basicColors.length
  applyCurrentMaterialColor()
  actionMessage.value = '基本色を順番に変更しました。'
}

const changeActiveColor = () => {
  if (!cube) return
  activeColorMode.value = true
  activeStyleIndex = (activeStyleIndex + 1) % activeStyles.length
  applyActiveStyle()
  const styleLabel = activeStyles[activeStyleIndex] === 'rainbow' ? 'レインボー' : activeStyles[activeStyleIndex] === 'blue' ? 'ブルー系' : 'レッド系'
  actionMessage.value = `アクティブカラーを ${styleLabel} に切り替えました。`
}

const changeSize = (direction: number) => {
  if (!cube) return
  baseScale.value = THREE.MathUtils.clamp(baseScale.value + direction * scaleStep, minScale, maxScale)
  actionMessage.value = direction < 0 ? '少し小さくしました。' : '少し大きくしました。'
}

const playJump = () => {
  if (isJumping.value) {
    actionMessage.value = 'ジャンプ中です！着地するまでお待ちください。'
    return
  }
  isJumping.value = true
  velocity.set((Math.random() > 0.5 ? 1.2 : -1.2), 7.2, (Math.random() - 0.5) * 1.4)
  actionMessage.value = 'スタート！横方向にも斜めジャンプします。'
}

onMounted(() => {
  const initScene = () => {
    if (canvasContainer.value) {
      setupScene()
    } else {
      requestAnimationFrame(initScene)
    }
  }
  initScene()
})

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  window.removeEventListener('resize', handleResize)
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', startDrag)
    renderer.domElement.removeEventListener('pointermove', moveDrag)
    renderer.domElement.removeEventListener('pointerup', endDrag)
    renderer.domElement.removeEventListener('pointercancel', endDrag)
    renderer.dispose()
  }
})
</script>

<style scoped>
.page-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: radial-gradient(circle at top, #0d1b2a 0%, #1b263b 35%, #415a77 100%);
  color: #f8f9fa;
}

header {
  padding: 1.5rem 2rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: rgba(255,255,255,0.05);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.brand h1 {
  margin: 0 0 0.25rem;
  font-size: clamp(1.7rem, 2.5vw, 2.4rem);
}

.brand p {
  margin: 0;
  color: #d8e3ff;
}

nav a {
  color: #a5d8ff;
  margin-left: 1rem;
  text-decoration: none;
  font-weight: 600;
}

nav a:hover {
  color: #fff;
}

main {
  flex: 1;
  padding: 2rem;
  display: grid;
  gap: 1.5rem;
}

.panel {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 1rem;
  padding: 1.75rem;
  box-shadow: 0 16px 40px rgba(0,0,0,0.15);
}

.action-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: flex-end;
}

.primary-button {
  border: none;
  padding: 0.95rem 1.7rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #7c3aed, #22d3ee);
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.secondary-button {
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.08);
  color: #eef2ff;
  padding: 0.85rem 1.25rem;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.secondary-button:hover {
  background: rgba(255,255,255,0.16);
  transform: translateY(-1px);
}

.primary-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(124, 58, 237, 0.25);
}

.animation-panel {
  min-height: 380px;
}

.animation-header {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.scene-container {
  width: 100%;
  min-height: 320px;
  border-radius: 1rem;
  overflow: hidden;
  background: radial-gradient(circle at top, rgba(125, 72, 255, 0.15), transparent 35%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.8));
  position: relative;
}

.scene-container canvas {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(255,255,255,0.72);
  font-size: 1rem;
  z-index: 1;
}

footer {
  padding: 1rem 2rem;
  font-size: 0.95rem;
  background: rgba(0,0,0,0.2);
  text-align: center;
}

code {
  background: rgba(255,255,255,0.12);
  padding: 0.15rem 0.35rem;
  border-radius: 0.35rem;
}
</style>
