import * as THREE from 'three';
import { joinRoom, selfId } from 'trystero';

// --- UI Elements ---
const statusDiv = document.getElementById('status');
const roomForm = document.getElementById('roomForm');
const roomInput = document.getElementById('roomInput');

let room = null;
let isHost = false;
let peers = [];
let myId = null;
let playerStates = {}; // { peerId: { x, y, z, color } }
let myColor = '#' + Math.floor(Math.random()*16777215).toString(16);

// --- Room/UUID Logic ---
function getOrCreateRoomId() {
  // Try to get from URL hash or search param
  let roomId = null;
  const url = new URL(window.location.href);
  if (url.hash && url.hash.length > 1) {
    roomId = url.hash.slice(1);
  } else if (url.searchParams.has('room')) {
    roomId = url.searchParams.get('room');
  }
  if (!roomId) {
    // Generate uuid
    if (window.crypto && crypto.randomUUID) {
      roomId = crypto.randomUUID();
    } else {
      // Fallback uuid
      roomId = 'xxxxxxxxyxxxxyxxxyxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }
    // Update URL (use hash)
    url.hash = '#' + roomId;
    window.history.replaceState({}, '', url);
    if (window.updateShareUrl) window.updateShareUrl();
  }
  return roomId;
}

// --- Three.js Setup ---
let scene, camera, renderer, controls, landscape;
const sphereRadius = 1;
const moveSpeed = 0.15;
const worldSize = 400;

function createLandscape() {
  const geometry = new THREE.PlaneGeometry(worldSize, worldSize, 64, 64);
  geometry.rotateX(-Math.PI / 2);
  // Dune-like height
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const x = geometry.attributes.position.getX(i);
    const z = geometry.attributes.position.getZ(i);
    const y = Math.sin(x * 0.3) * 1.5 + Math.cos(z * 0.2) * 1.2 + Math.random() * 0.5;
    geometry.attributes.position.setY(i, y);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0xe2c290 });
  return new THREE.Mesh(geometry, material);
}

function setupThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaa88ff);
  scene.fog = new THREE.Fog(0xaa88ff, 40, worldSize * 0.5);
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 15, 20);
  camera.lookAt(0, 0, 0);
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 50;
  dirLight.shadow.camera.left = -worldSize / 2;
  dirLight.shadow.camera.right = worldSize / 2;
  dirLight.shadow.camera.top = worldSize / 2;
  dirLight.shadow.camera.bottom = -worldSize / 2;
  camera.add(dirLight);
  camera.add(dirLight.target);

  // Landscape
  landscape = createLandscape();
  landscape.receiveShadow = true;
  scene.add(landscape);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// --- Game State ---
let keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

function handleKey(e, down) {
  if (e.code in keys) {
    keys[e.code] = down;
    e.preventDefault();
  }
}
window.addEventListener('keydown', e => handleKey(e, true));
window.addEventListener('keyup', e => handleKey(e, false));

function getNextPosition(pos, keys) {
  let { x, y, z } = pos;
  if (keys.ArrowUp)    z -= moveSpeed;
  if (keys.ArrowDown)  z += moveSpeed;
  if (keys.ArrowLeft)  x -= moveSpeed;
  if (keys.ArrowRight) x += moveSpeed;
  // Clamp to world
  x = Math.max(-worldSize/2+1, Math.min(worldSize/2-1, x));
  z = Math.max(-worldSize/2+1, Math.min(worldSize/2-1, z));
  // Y from landscape
  y = getLandscapeY(x, z) + sphereRadius;
  return { x, y, z };
}

function getLandscapeY(x, z) {
  // Same formula as in createLandscape
  return Math.sin(x * 0.3) * 1.5 + Math.cos(z * 0.2) * 1.2 + 1;
}

// --- Multiplayer Logic ---
let sendKeyEvent, getKeyEvent, sendPositions, getPositions;
let myPos = { x: 0, y: getLandscapeY(0,0)+sphereRadius, z: 0 };

function setupTrystero(roomName) {
  const config = { appId: 'dune-sandbox' };
  room = joinRoom(config, roomName);
  myId = selfId;
  playerStates[myId] = { ...myPos, color: myColor };

  // Host is first peer to join
  peers = [];
  isHost = true;

  // Setup actions
  [sendKeyEvent, getKeyEvent] = room.makeAction('keyEvent');
  [sendPositions, getPositions] = room.makeAction('positions');

  // Peer join/leave
  room.onPeerJoin(peerId => {
    peers.push(peerId);
    if (myId === getHostId()) isHost = true;
    else isHost = false;
    statusDiv.textContent = `Friends: ${peers.length}`;
  });
  room.onPeerLeave(peerId => {
    peers = peers.filter(p => p !== peerId);
    delete playerStates[peerId];
    // Remove sphere from scene
    const sphere = scene.getObjectByName('sphere_' + peerId);
    if (sphere) scene.remove(sphere);
    if (myId === getHostId()) isHost = true;
    else isHost = false;
    statusDiv.textContent = `Friends: ${peers.length}`;
  });

  // Receive key events (host only)
  getKeyEvent((data, peerId) => {
    if (!isHost) return;
    if (!playerStates[peerId]) playerStates[peerId] = { x: 0, y: 1, z: 0, color: '#fff' };
    playerStates[peerId].keys = data;
  });

  // Receive positions (clients)
  getPositions((positions) => {
    if (isHost) return;
    playerStates = positions;
  });
}

function getHostId() {
  // Host is lowest peerId (including self)
  return [myId, ...peers].sort()[0];
}

// Add a map to store previous positions and roll state for each player
let prevPositions = {};
let rollAngles = {};

function animate() {
  requestAnimationFrame(animate);

  // Host: update all positions
  if (isHost) {
    // Update my own
    playerStates[myId] = { ...getNextPosition(playerStates[myId] || myPos, keys), color: myColor };
    // Update others
    for (const peerId of peers) {
      if (!playerStates[peerId]) playerStates[peerId] = { x: 0, y: 1, z: 0, color: '#fff' };
      const k = playerStates[peerId].keys || {};
      playerStates[peerId] = { ...getNextPosition(playerStates[peerId], k), color: playerStates[peerId].color || '#fff' };
    }
    // Broadcast
    sendPositions(playerStates);
  } else {
    // Client: send my key state
    sendKeyEvent(keys);
  }

  // Render all spheres
  let mySpherePos = null;
  for (const [peerId, state] of Object.entries(playerStates)) {
    let sphere = scene.getObjectByName('sphere_' + peerId);
    if (!sphere) {
      sphere = new THREE.Mesh(
        new THREE.IcosahedronGeometry(sphereRadius, 0),
        new THREE.MeshStandardMaterial({ color: state.color || 0xffffff })
      );
      sphere.name = 'sphere_' + peerId;
      scene.add(sphere);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
    }
    // Store previous position and rolling quaternion
    if (!prevPositions[peerId]) {
      prevPositions[peerId] = new THREE.Vector3(state.x, state.y, state.z);
      rollAngles[peerId] = new THREE.Quaternion();
    }
    const prev = prevPositions[peerId];
    const curr = new THREE.Vector3(state.x, state.y, state.z);
    const delta = new THREE.Vector3().subVectors(curr, prev);

    // Only roll if moving
    if (delta.lengthSq() > 1e-6) {
      // Project delta onto XZ plane
      delta.y = 0;
      const distance = delta.length();
      delta.normalize();

      // Axis to roll around: perpendicular to movement and up
      const up = new THREE.Vector3(0, 1, 0);
      const axis = new THREE.Vector3().crossVectors(up, delta).normalize();

      // Angle to roll: distance / radius
      const angle = distance / sphereRadius;

      // Create a quaternion for this frame's roll
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);

      // Accumulate the roll
      rollAngles[peerId].multiplyQuaternions(q, rollAngles[peerId]);
      sphere.quaternion.copy(rollAngles[peerId]);
    }
    prev.copy(curr);
    sphere.position.set(state.x, state.y, state.z);
    if (peerId === myId) mySpherePos = sphere.position;
  }

  // Camera and shadow light follow logic
  if (mySpherePos) {
    // Camera follow
    const camTarget = new THREE.Vector3(
      mySpherePos.x + 0,
      mySpherePos.y + 10,
      mySpherePos.z + 18
    );
    camera.position.lerp(camTarget, 0.1);
    camera.lookAt(mySpherePos.x, mySpherePos.y + 2, mySpherePos.z);
  }

  renderer.render(scene, camera);
}

// --- Auto-join Room on Load ---
function startGame() {
  // Remove/join UI
  if (roomForm) roomForm.style.display = 'none';
  if (statusDiv) statusDiv.textContent = 'Friends: 0';
  setupThree();
  const roomId = getOrCreateRoomId();
  setupTrystero(roomId);
  animate();
}

startGame();

// --- Touch Controls for Mobile ---
let joystickBase = null, joystickStick = null, joystickActive = false, joystickStart = {x:0, y:0};

function createJoystick() {
  joystickBase = document.createElement('div');
  joystickBase.style.position = 'fixed';
  joystickBase.style.left = '30px';
  joystickBase.style.bottom = '30px';
  joystickBase.style.width = '80px';
  joystickBase.style.height = '80px';
  joystickBase.style.background = 'rgba(0,0,0,0.2)';
  joystickBase.style.borderRadius = '50%';
  joystickBase.style.zIndex = 20;
  joystickBase.style.touchAction = 'none';
  joystickBase.style.userSelect = 'none';
  joystickBase.style.display = 'block';

  joystickStick = document.createElement('div');
  joystickStick.style.position = 'absolute';
  joystickStick.style.left = '40px';
  joystickStick.style.top = '40px';
  joystickStick.style.width = '20px';
  joystickStick.style.height = '20px';
  joystickStick.style.background = 'rgba(255,255,255,0.7)';
  joystickStick.style.borderRadius = '50%';
  joystickStick.style.transform = 'translate(-50%, -50%)';
  joystickBase.appendChild(joystickStick);

  document.body.appendChild(joystickBase);

  joystickBase.addEventListener('touchstart', onJoyStart, {passive: false});
  joystickBase.addEventListener('touchmove', onJoyMove, {passive: false});
  joystickBase.addEventListener('touchend', onJoyEnd, {passive: false});
}

function onJoyStart(e) {
  e.preventDefault();
  joystickActive = true;
  const t = e.touches[0];
  joystickStart.x = t.clientX;
  joystickStart.y = t.clientY;
  joystickStick.style.left = '40px';
  joystickStick.style.top = '40px';
}

function onJoyMove(e) {
  if (!joystickActive) return;
  e.preventDefault();
  const t = e.touches[0];
  const dx = t.clientX - joystickStart.x;
  const dy = t.clientY - joystickStart.y;
  const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 30);
  const angle = Math.atan2(dy, dx);
  const stickX = 40 + dist * Math.cos(angle);
  const stickY = 40 + dist * Math.sin(angle);
  joystickStick.style.left = stickX + 'px';
  joystickStick.style.top = stickY + 'px';
  // Reset keys
  keys.ArrowUp = keys.ArrowDown = keys.ArrowLeft = keys.ArrowRight = false;
  // 8-way
  if (dist > 10) {
    const deg = angle * 180 / Math.PI;
    if (deg > -135 && deg < -45) keys.ArrowUp = true;
    if (deg > 45 && deg < 135) keys.ArrowDown = true;
    if (deg > -45 && deg < 45) keys.ArrowRight = true;
    if (deg > 135 || deg < -135) keys.ArrowLeft = true;
  }
}

function onJoyEnd(e) {
  e.preventDefault();
  joystickActive = false;
  joystickStick.style.left = '40px';
  joystickStick.style.top = '40px';
  keys.ArrowUp = keys.ArrowDown = keys.ArrowLeft = keys.ArrowRight = false;
}

// Detect mobile and add joystick
if (/Mobi|Android|iPhone|iPad|iPod|Touch/.test(navigator.userAgent)) {
  createJoystick();
} 