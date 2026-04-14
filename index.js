import * as THREE from "./assets/libraries/three.module.min.js"
import { GLTFLoader } from "./assets/libraries/loaders/GLTFLoader.js"

// base url
const baseURL = window.baseURL ?? ""

// maximum targets to spawn
const MAX_TARGETS = 5
// time duration for targets to be visible
const TARGET_TIME = 2000
// time delay for next targets
const TARGET_DELAY = 400
// distance to the target from player
const TARGET_DISTANCE = 5
// target scale
const TARGET_SCALE = 0.35
// time duration of gun fire
const FIRE_TIME = 300
// time duration of gun fire hit
const FIRE_TIME_HIT = 200
// maximum distance of gun fire
const FIRE_DISTANCE = 15

// get landing elements
const startButton = document.querySelector(".start")
const progressBar = document.querySelector(".progress-value")

// xr session supported status
const isSupported = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')
// set supported status
document.body.setAttribute("data-supported", isSupported)

// loaders
const modelLoader = new GLTFLoader()
const textureLoader = new THREE.TextureLoader()

// method to load audio
const loadAudio = url => {
  // return promise
  return new Promise(resolve => {
    // create audio tag
    const audio = new Audio()
    // resolve audio on metadata loaded
    audio.addEventListener("loadedmetadata", () => resolve(audio))
    // set audio url to load
    audio.src = baseURL + url
  })
}

// load size for each model
const sizes = [2884124, 2916988, 5281600, 16334564]
// total load size
const total = sizes.reduce((total, item) => total + item, 0)

// method to update progress bar
const updateProgress = event => {
  // get previously loaded items
  const previous = sizes.slice(0, sizes.indexOf(event.total))
  // calculate current progress
  const current = event.loaded + previous.reduce((total, item) => total + item, 0)
  // calculate progress
  const progress = 100 * current / total
  // update progress bar value
  progressBar.style.width = progress.toFixed(2) + "%"
}

// create three modules
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, 1.5, 0.1, 300)
const renderer = new THREE.WebGLRenderer({ antialias: true })

// create timer
const timer = new THREE.Timer()

// load audio files
const audio = {
  background: await loadAudio("assets/audio/background.mp3"),
  shoot: [
    await loadAudio("assets/audio/shoot.mp3"),
    await loadAudio("assets/audio/shoot.mp3")
  ],
  success: [
    await loadAudio("assets/audio/success.mp3"),
    await loadAudio("assets/audio/success.mp3")
  ]
}

// loop background music
audio.background.loop = true

// reduce shoot volumes
audio.shoot[0].volume = 0.2
audio.shoot[1].volume = 0.2

// reduce success volumes
audio.success[0].volume = 0.5
audio.success[1].volume = 0.5

// load models
const gun = await modelLoader.loadAsync(baseURL + "assets/models/gun.glb", updateProgress)
const ball = await modelLoader.loadAsync(baseURL + "assets/models/ball.glb", updateProgress)
const target = await modelLoader.loadAsync(baseURL + "assets/models/target.glb", updateProgress)
const jungle = await modelLoader.loadAsync(baseURL + "assets/models/jungle.glb", updateProgress)

// load textures
const texture = await textureLoader.loadAsync(baseURL + "assets/images/message.png")

// create message sprite
const message = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }))

// update message scale and position
message.scale.set(1, 0.13, 1)
message.position.set(0, 0, -1.5)

// add message on camera
camera.add(message)
// add camera to scene
scene.add(camera)

// update gun scale and rotation
gun.scene.scale.set(0.02, 0.02, 0.02)
gun.scene.rotation.set(-0.8, -1.57, 0)

// update ball scale
ball.scene.scale.set(0.4, 0.4, 0.4)

// update target scale, rotation, and position
target.scene.scale.set(0, 0, 0)
target.scene.position.set(0, 2, -TARGET_DISTANCE)

// add jungle to scene
scene.add(jungle.scene)

// set sky blue color on scene
scene.background = new THREE.Color(0x6699ff)

// enable xr features on renderer
renderer.xr.enabled = true

// rendering started state
let isStarted = false

// controller grips array
const grips = []

// create raycaster
const raycaster = new THREE.Raycaster()

// check collision between meshes
function checkCollision(start, end, targets) {
  // get shooting direction
  const direction = end.clone().sub(start).normalize()
  // set raycaster origin and direction
  raycaster.set(start, direction)
  // map targets into intersecting meshes
  const meshes = targets.map(item => item.userData.mesh)
  // get intersect objects results
  const intersects = raycaster.intersectObjects(meshes, true)
  // return intersecting object
  return intersects.length ? intersects[0].object.userData.item : null
}

// for each controller grip
for (let i = 0; i < 2; i++) {
  // get controller grip by index
  const grip = renderer.xr.getControllerGrip(i)
  // clone bullet mesh
  const bullet = ball.scene.clone()
  // hide bullet initially
  bullet.visible = false
  // add bullet to scene
  scene.add(bullet)
  // clone and add gun into controller grip
  grip.add(gun.scene.clone())
  // create geometry for laser line
  const geometry = new THREE.BufferGeometry()
  // add position and color
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -5], 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0, 0, 0, 0], 3))
  // create line material
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  // create laser line
  const laser = new THREE.Line(geometry, material)
  // set laser angle
  laser.rotation.x = -0.8
  // transform laser position
  laser.translateZ(-0.2)
  laser.translateY(0.007)
  // add laser line into controller grip
  grip.add(laser)
  // add grip into scene
  scene.add(grip)
  // push to grips array
  grips.push(grip)
  // bullet moving direction
  const direction = new THREE.Vector3()
  // bullet start position
  grip.userData.start = new THREE.Vector3()
  // bullet end position
  grip.userData.end = new THREE.Vector3()
  // bullet mesh shooting out from gun
  grip.userData.bullet = bullet
  // bullet mesh shooting time
  grip.userData.time = null
  // get audios
  const shootAudio = audio.shoot[i]
  const successAudio = audio.success[i]
  // get controller
  const controller = renderer.xr.getController(i)
  // controller trigger down listener
  controller.addEventListener("selectstart", () => {
    // check if not started
    if (!isStarted) {
      // set as started
      isStarted = true
      // remove message
      camera.remove(message)
      // return as no shoot
      return
    }
    // return if already active
    if (grip.userData.active) { return }
    // set as active
    grip.userData.active = true
    // reset shoot sound
    shootAudio.currentTime = 0
    // play shoot sound
    shootAudio.play()
    // get world position of controller
    const start = grip.position.clone()
    // get position by laser
    laser.getWorldPosition(start)
    // get rotation by laser
    laser.getWorldDirection(direction)
    // get distance scalar
    const distance = direction.multiplyScalar(-FIRE_DISTANCE)
    // calculate end position
    const end = start.clone().add(distance)
    // get collision object
    const collision = checkCollision(start, end, targets.children)
    // set collision object
    grip.userData.hit = collision
    // set shooting time
    grip.userData.time = performance.now()
    // set bullet start position
    grip.userData.start = start
    // get rotation by laser
    laser.getWorldDirection(direction)
    // set bullet end position
    grip.userData.end = collision
      // only goes up to target distance when collide
      ? start.clone().add(direction.multiplyScalar(-TARGET_DISTANCE))
      // goes to maximum bullet distance
      : end
    // play success audio if collision
    if (collision) {
      // reset success sound
      successAudio.currentTime = 0
      // play success sound
      successAudio.play()
    }
    // show bullet
    bullet.visible = true
  })
}

// update controller gips and shooting
const updateControllerGrips = currentTime => {
  // for each controller grip
  for (let i = 0; i < grips.length; i++) {
    // current controller grip
    const grip = grips[i]
    // continue if not active
    if (!grip.userData.active) { continue }
    // get grip objects
    const { start, end, time, bullet, hit } = grip.userData
    // calculate elapsed time
    const elapsed = currentTime - time
    // get duration by target hit status
    const duration = hit ? FIRE_TIME_HIT : FIRE_TIME
    // get factor by elapsed time
    const factor = Math.min(elapsed / duration, 1)
    // interpolate bullet from start to end
    bullet.position.lerpVectors(start, end, factor)
    // check if factor exceeded
    if (factor >= 1) {
      // set as inactive
      grip.userData.active = false
      // hide bullet
      bullet.visible = false
      // check if hit
      if (hit) {
        // fade out target if hit
        hit.userData.state = "fade-out"
        // create success material
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 })
        // change target color
        hit.children[0].children[0].material = material
        // mark as hit
        hit.userData.hit = true
      }
    }
  }
}

// targets container
const targets = new THREE.Object3D()
// add container to scene
scene.add(targets)

// last target spawned time
let lastSpawnedTime = 0

// check target rotation confliction
const checkConflict = (child, item, node) => {
  // check if child is conflicted with some other item
  return child !== item && Math.abs(child.rotation[node] - item.rotation[node]) < 0.2
}

// set targets on random rotations
const setRandomRotation = item => {
  // set random rotation
  item.rotation.x = -0.3 + Math.random() * 0.8
  item.rotation.y = -0.8 + Math.random() * 1.6
  // get all targets items
  const items = targets.children
  // check each direction rotation conflict
  const isConflictX = items.some(child => checkConflict(child, item, "x"))
  const isConflictY = items.some(child => checkConflict(child, item, "y"))
  // retry if conflicts with an existing item
  // return to retry if conflicts with an existing item x rotation
  return isConflictX && isConflictY ? setRandomRotation(item) : null
}

// update targets and score
const updateTargets = (currentTime, delta) => {
  // check maximum targets amount
  if (targets.children.length < MAX_TARGETS && currentTime - lastSpawnedTime > TARGET_DELAY) {
    // create target item
    const item = new THREE.Object3D()
    // set random rotation
    setRandomRotation(item)
    // clone target model
    const clone = target.scene.clone()
    // set created time
    item.userData.time = currentTime
    // set item state
    item.userData.state = "fade-in"
    // set intersecting mesh of clone
    item.userData.mesh = clone.children[0]
    // set item on mesh data
    item.userData.mesh.userData.item = item
    // add model into item
    item.add(clone)
    // add item to container
    targets.add(item)
    // update last spawned time
    lastSpawnedTime = currentTime
  }
  // for each target item
  for (let i = 0; i < targets.children.length; i++) {
    // get current item and target
    const item = targets.children[i]
    const target = item.children[0]
    // get item user data
    const { time, state, hit } = item.userData
    // get target scale and rotation
    const scale = target.scale
    const rotation = target.rotation
    // switch by item state
    if (state === "fade-in") {
      // increase target scale if required
      if (scale.x < TARGET_SCALE) { scale.setScalar(scale.x + delta * 0.6) }
      // update target rotation required
      if (rotation.y > -1.57) { rotation.y = rotation.y - delta * 3 }
    } else if (state === "fade-out") {
      // increase target scale if required
      if (scale.x > 0) { scale.setScalar(scale.x - delta * 0.6) }
      // update target rotation required
      if (hit) {
        // fast rotation if hit
        rotation.y = rotation.y + delta * 12
      } else if (rotation.y < 0) {
        // normal rotation if missed
        rotation.y = rotation.y + delta * 3
      }
      // remove item if scaled down
      if (scale.x <= 0) { targets.remove(item) }
    }
    // set as fade out if time exceeded
    if (currentTime - time > TARGET_TIME) { item.userData.state = "fade-out" }
  }
}

// add ambient lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.4))

// add hemisphere lighting
scene.add(new THREE.HemisphereLight(0x88ccff, 0x444433, 0.5))

// add key lighting
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
keyLight.position.set(5, 10, 7)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048, 2048)
keyLight.shadow.camera.near = 0.1
keyLight.shadow.camera.far = 50
scene.add(keyLight)

// add fill lighting
const fillLight = new THREE.DirectionalLight(0x44aaff, 0.6)
fillLight.position.set(-5, 5, 5)
scene.add(fillLight)

// add rim lighting
const rimLight = new THREE.DirectionalLight(0xff55aa, 0.8)
rimLight.position.set(0, 5, -10)
scene.add(rimLight)

// add point lighting
const accentLight = new THREE.PointLight(0xffcc00, 0.4, 10)
accentLight.position.set(2, 2, 2)
scene.add(accentLight)

// add spot lighting
const spotLight = new THREE.SpotLight(0xffffff, 0.3, 15, Math.PI / 7, 0.4)
spotLight.position.set(0, 6, 4)
scene.add(spotLight)

// start animation loop
renderer.setAnimationLoop(() => {
  // get current time
  const time = performance.now()
  // get delta value
  const delta = timer.getDelta()
  // check if game started
  if (isStarted) {
    // update controller grips
    updateControllerGrips(time)
    // update targets
    updateTargets(time, delta)
  }
  // update timer
  timer.update(time)
  // update render
  renderer.render(scene, camera)
})

// xr session options
const sessionOptions = { optionalFeatures: ['local-floor'] }

// start button event
startButton.addEventListener("click", () => {
  // request xr session
  navigator.xr.requestSession('immersive-vr', sessionOptions).then(session => {
    // set session to renderer
    renderer.xr.setSession(session)
    // play background music
    audio.background.play()
  })
})

// enable start button
if (isSupported) { startButton.disabled = false }
