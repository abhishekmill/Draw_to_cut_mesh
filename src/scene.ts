import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadModel } from "./loader";
import { CutManager } from "./systems/CutManager";
import { MeshCutter } from "./systems/MeshCutter";

export type SceneContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  cutManager: CutManager;
  importModel: (files: FileList | File[] | File) => void;
  spawnPrimitiveShape: (type: string) => void;
  setMode: (mode: "idle" | "cut" | "drag") => void;
  resetScene: () => void;
  destroy: () => void;
};

export function createScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f1f5f9");

  const getSizes = () => ({
    width: container.clientWidth || window.innerWidth,
    height: container.clientHeight || window.innerHeight,
  });

  const { width, height } = getSizes();

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 3, 7);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.localClippingEnabled = true;

  Object.assign(renderer.domElement.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
  });
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.8);
  directionalLight.position.set(6, 12, 6);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.bias = -0.001;
  scene.add(directionalLight);

  const gridHelper = new THREE.GridHelper(20, 20, 0x4f46e5, 0xcbd5e1);
  scene.add(gridHelper);

  const cutManager = new CutManager(scene, camera, controls, container);

  const spawnPrimitiveShape = (type: string) => {
    cutManager.clearActiveModels();

    let geom: THREE.BufferGeometry;
    let color = "#4f8cff";

    switch (type.toLowerCase()) {
      case "sphere":
        geom = new THREE.SphereGeometry(1.2, 32, 32);
        color = "#10b981";
        break;
      case "torus":
        geom = new THREE.TorusGeometry(1, 0.35, 16, 100);
        color = "#f59e0b";
        break;
      case "cylinder":
        geom = new THREE.CylinderGeometry(0.8, 0.8, 2.2, 32);
        color = "#ec4899";
        break;
      case "cube":
      default:
        geom = new THREE.BoxGeometry(2, 2, 2);
        color = "#6366f1";
        break;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.15,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = `primitive_${type.toLowerCase()}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(0, 1, 0);

    scene.add(mesh);
    cutManager.activeModels.push(mesh);
  };

  spawnPrimitiveShape("cube");

  let rafId = 0;
  const animate = () => {
    rafId = requestAnimationFrame(animate);

    controls.update();

    cutManager.activeModels.forEach((model) => {
      MeshCutter.updateClippingPlanes(model);
    });

    renderer.render(scene, camera);
  };
  animate();

  const onResize = () => {
    const { width, height } = getSizes();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  window.addEventListener("resize", onResize);

  const importModel = (files: FileList | File[] | File) => {
    const primitivesToRemove = cutManager.activeModels.filter(
      (model) => model.name && model.name.startsWith("primitive_"),
    );

    primitivesToRemove.forEach((model) => {
      scene.remove(model);
      const index = cutManager.activeModels.indexOf(model);
      if (index > -1) {
        cutManager.activeModels.splice(index, 1);
      }
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    });

    loadModel(
      files,
      (model) => {
        model.name = `imported_${Date.now()}`;

        model.position.set(0, 1.5, 0);

        scene.add(model);
        cutManager.activeModels.push(model);

        cutManager.setMode(cutManager.activeMode);
      },
      (error) => {
        console.error("Failed to load custom GLTF/GLB model:", error);
      },
    );
  };

  const setMode = (mode: "idle" | "cut" | "drag") => {
    cutManager.setMode(mode);
  };

  const resetScene = () => {
    spawnPrimitiveShape("cube");
    setMode("idle");
  };

  const destroy = () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);

    cutManager.clearActiveModels();
    cutManager.destroy();

    gridHelper.geometry.dispose();
    (gridHelper.material as THREE.Material).dispose();

    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    scene,
    camera,
    renderer,
    controls,
    cutManager,
    importModel,
    spawnPrimitiveShape,
    setMode,
    resetScene,
    destroy,
  };
}
