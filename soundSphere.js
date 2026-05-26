import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SPHERE_RADIUS = 1;
const DOT_RADIUS = 0.11;
const DOT_COUNT = 5;
const OUTWARD = new THREE.Vector3(0, 0, 1);

const COLORS = {
  idle: 0x8b7d72,
  correct: 0x2d8a5e,
  wrong: 0xc94c4c,
};

/** Evenly distribute n points on a sphere (Fibonacci lattice). */
function spherePoint(i, n, radius) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (i / (n - 1 || 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const theta = golden * i;
  return new THREE.Vector3(
    Math.cos(theta) * r * radius,
    y * radius,
    Math.sin(theta) * r * radius,
  );
}

/** Flat disc on the sphere surface, facing outward. */
function createSurfaceDot(position) {
  const geom = new THREE.CircleGeometry(DOT_RADIUS, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: COLORS.idle,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(position);

  const normal = position.clone().normalize();
  mesh.quaternion.setFromUnitVectors(OUTWARD, normal);
  mesh.renderOrder = 2;

  return mesh;
}

/**
 * @param {HTMLElement} container
 * @returns {{ updateState: (state: { activeIndex: number, answers: Array<{correct: boolean}|null> }) => void, dispose: () => void }}
 */
export function createSoundSphere(container) {
  const width = Math.max(container.clientWidth, 280);
  const height = Math.max(container.clientHeight, 280);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 0, 3.4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.classList.add('sound-sphere__canvas');

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const sphereGroup = new THREE.Group();
  scene.add(sphereGroup);

  // Transparent glass shell
  const shellGeom = new THREE.SphereGeometry(SPHERE_RADIUS, 48, 48);
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8b89a,
    metalness: 0.02,
    roughness: 0.2,
    transparent: true,
    opacity: 0.18,
    transmission: 0.75,
    thickness: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(shellGeom, shellMat);
  sphereGroup.add(shell);

  // Subtle latitude/longitude lines only (no solid 2D backdrop)
  const wireGeom = new THREE.WireframeGeometry(
    new THREE.SphereGeometry(SPHERE_RADIUS * 1.001, 20, 12),
  );
  const wire = new THREE.LineSegments(
    wireGeom,
    new THREE.LineBasicMaterial({
      color: 0xb8a090,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  sphereGroup.add(wire);

  const dots = [];

  for (let i = 0; i < DOT_COUNT; i++) {
    const pos = spherePoint(i, DOT_COUNT, SPHERE_RADIUS * 1.002);
    const mesh = createSurfaceDot(pos);
    mesh.userData.index = i;
    sphereGroup.add(mesh);
    dots.push(mesh);
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.rotateSpeed = 0.65;
  controls.minDistance = 2.5;
  controls.maxDistance = 4.5;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;

  let animationId = null;

  function applyDotState(mesh, index, state) {
    const answered = state.answers[index];
    const isActive = index === state.activeIndex;

    let color = COLORS.idle;
    let scale = 1;
    let ringOpacity = 0;

    if (answered) {
      color = answered.correct ? COLORS.correct : COLORS.wrong;
      scale = 1.08;
    } else if (isActive) {
      // Same dot color as idle; ring indicates selection
      scale = 1.2;
      ringOpacity = 0.45;
    }

    mesh.material.color.setHex(color);
    mesh.scale.setScalar(scale);

    if (mesh.userData.ring) {
      mesh.userData.ring.material.opacity = ringOpacity;
      mesh.userData.ring.scale.setScalar(scale * 1.35);
    }
  }

  // Optional soft ring behind active dot (flat, same orientation)
  dots.forEach((mesh) => {
    const ringGeom = new THREE.RingGeometry(DOT_RADIUS * 1.1, DOT_RADIUS * 1.55, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: COLORS.idle,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.z = -0.002;
    ring.renderOrder = 1;
    mesh.add(ring);
    mesh.userData.ring = ring;
  });

  function updateState(state) {
    dots.forEach((mesh, i) => applyDotState(mesh, i, state));
  }

  function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();
    sphereGroup.rotation.y += 0.0008;
    renderer.render(scene, camera);
  }
  animate();

  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(container);

  function dispose() {
    cancelAnimationFrame(animationId);
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();
    shellGeom.dispose();
    shellMat.dispose();
    wireGeom.dispose();
    dots.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.userData.ring?.geometry.dispose();
      mesh.userData.ring?.material.dispose();
    });
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return { updateState, dispose };
}
