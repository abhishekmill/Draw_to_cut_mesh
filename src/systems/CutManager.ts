import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MeshCutter } from "./MeshCutter";

export class CutManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;

  public activeModels: THREE.Object3D[] = [];

  public activeMode: "idle" | "cut" | "drag" = "idle";

  private svg: SVGElement;
  private isDrawing = false;
  private startPoint = { x: 0, y: 0 };
  private activeLine: SVGLineElement | null = null;

  private raycaster = new THREE.Raycaster();
  private dragPlane = new THREE.Plane();
  private draggedObject: THREE.Object3D | null = null;
  private initialObjectPosition = new THREE.Vector3();
  private initialHitPoint = new THREE.Vector3();

  private onStateChangeCallback: (() => void) | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    container: HTMLElement,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.container = container;

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.assign(this.svg.style, {
      position: "absolute",
      color: "white",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "5",
    });
    this.container.appendChild(this.svg);

    this.setupEventListeners();
  }

  public registerStateChangeCallback(callback: () => void) {
    this.onStateChangeCallback = callback;
  }

  private notifyStateChange() {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  public setMode(mode: "idle" | "cut" | "drag") {
    this.activeMode = mode;
    this.notifyStateChange();

    if (mode === "cut") {
      this.controls.enabled = false;
      this.container.style.cursor = "crosshair";
    } else if (mode === "drag") {
      this.controls.enabled = false;
      this.container.style.cursor = "grab";
    } else {
      this.controls.enabled = true;
      this.container.style.cursor = "default";
    }
  }

  private setupEventListeners() {
    this.container.addEventListener("mousedown", this.onMouseDown.bind(this));
    window.addEventListener("mousemove", this.onMouseMove.bind(this));
    window.addEventListener("mouseup", this.onMouseUp.bind(this));
  }


  private getMousePosition(e: MouseEvent) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      clientX: e.clientX,
      clientY: e.clientY,
      rect,
    };
  }

  private onMouseDown(e: MouseEvent) {
    const pos = this.getMousePosition(e);
    console.log("mouse pos", pos);
    if (this.activeMode === "cut") {
      this.isDrawing = true;
      this.startPoint = { x: pos.x, y: pos.y };

      this.activeLine = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      this.activeLine.setAttribute("stroke", "#4f46e5");
      this.activeLine.setAttribute("stroke-width", "2");
      this.activeLine.setAttribute("stroke-dasharray", "4 4");
      this.activeLine.setAttribute("x1", pos.x.toString());
      this.activeLine.setAttribute("y1", pos.y.toString());
      this.activeLine.setAttribute("x2", pos.x.toString());
      this.activeLine.setAttribute("y2", pos.y.toString());
      this.svg.appendChild(this.activeLine);
    } else if (this.activeMode === "drag") {
      const ndc = new THREE.Vector2(
        (pos.x / pos.rect.width) * 2 - 1,
        -(pos.y / pos.rect.height) * 2 + 1,
      );

      this.raycaster.setFromCamera(ndc, this.camera);

      const intersects = this.raycaster.intersectObjects(
        this.activeModels,
        true,
      );

      console.log("intersects objects", intersects);

      const firstValidIntersect: THREE.Intersection | null = intersects[0] || null;
      console.log("firstValidIntersect", firstValidIntersect);
      if (firstValidIntersect) {
        const hit = firstValidIntersect;
        let clickedRoot: THREE.Object3D | null = null;
        let current: THREE.Object3D | null = hit.object;

        while (current) {
          if (this.activeModels.includes(current)) {
            clickedRoot = current;
            break;
          }
          current = current.parent;
        }

        if (clickedRoot) {
          this.draggedObject = clickedRoot;
          this.container.style.cursor = "grabbing";

          this.initialObjectPosition.copy(clickedRoot.position);
          this.initialHitPoint.copy(hit.point);

          const cameraDir = new THREE.Vector3();
          this.camera.getWorldDirection(cameraDir);
          this.dragPlane.setFromNormalAndCoplanarPoint(
            cameraDir.negate(),
            hit.point,
          );
        }
      }
    }
  }

  private onMouseMove(e: MouseEvent) {
    const pos = this.getMousePosition(e);

    if (this.activeMode === "cut" && this.isDrawing && this.activeLine) {
      this.activeLine.setAttribute("x2", pos.x.toString());
      this.activeLine.setAttribute("y2", pos.y.toString());
    } else if (this.activeMode === "drag" && this.draggedObject) {
      const ndc = new THREE.Vector2(
        (pos.x / pos.rect.width) * 2 - 1,
        -(pos.y / pos.rect.height) * 2 + 1,
      );

      this.raycaster.setFromCamera(ndc, this.camera);

      const intersection = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
        const displacement = intersection.clone().sub(this.initialHitPoint);
        this.draggedObject.position
          .copy(this.initialObjectPosition)
          .add(displacement);
      }
    }
  }

  private onMouseUp(e: MouseEvent) {
    if (this.activeMode === "cut" && this.isDrawing) {
      this.isDrawing = false;

      if (this.activeLine) {
        this.svg.removeChild(this.activeLine);
        this.activeLine = null;
      }

      const pos = this.getMousePosition(e);
      const endPoint = { x: pos.x, y: pos.y };

      const dist = Math.hypot(
        endPoint.x - this.startPoint.x,
        endPoint.y - this.startPoint.y,
      );

      if (dist > 15) {
        this.executeCutting(this.startPoint, endPoint, pos.rect);
      }
    } else if (this.activeMode === "drag" && this.draggedObject) {
      this.draggedObject = null;
      this.container.style.cursor = "grab";
    }
  }

  private executeCutting(
    start: { x: number; y: number },
    end: { x: number; y: number },
    rect: DOMRect,
  ) {
    const startNDC = new THREE.Vector2(
      (start.x / rect.width) * 2 - 1,
      -(start.y / rect.height) * 2 + 1,
    );
    const endNDC = new THREE.Vector2(
      (end.x / rect.width) * 2 - 1,
      -(end.y / rect.height) * 2 + 1,
    );
    const midNDC = new THREE.Vector2(
      ((start.x + end.x) / (2 * rect.width)) * 2 - 1,
      -((start.y + end.y) / (2 * rect.height)) * 2 + 1,
    );

    const targetCenter = new THREE.Vector3(0, 0, 0);
    const distance = this.camera.position.distanceTo(targetCenter);

    const tempRaycaster = new THREE.Raycaster();

    tempRaycaster.setFromCamera(startNDC, this.camera);
    const startDir = tempRaycaster.ray.direction.clone();

    tempRaycaster.setFromCamera(endNDC, this.camera);
    const endDir = tempRaycaster.ray.direction.clone();

    tempRaycaster.setFromCamera(midNDC, this.camera);
    const planeCenter = new THREE.Vector3();
    tempRaycaster.ray.at(distance, planeCenter);

    const planeNormal = new THREE.Vector3()
      .crossVectors(startDir, endDir)
      .normalize();

    if (planeNormal.dot(this.camera.position) < 0) {
      planeNormal.negate();
    }

    const slicePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormal,
      planeCenter,
    );

    const modelsToSlice: THREE.Object3D[] = [];

    this.activeModels.forEach((model) => {
      const box = new THREE.Box3().setFromObject(model);
      if (!slicePlane.intersectsBox(box)) {
        return;
      }

      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      const numSamples = Math.max(10, Math.floor(dist / 5));
      let intersectsModel = false;
      const segmentRaycaster = new THREE.Raycaster();

      for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t;

        const ndc = new THREE.Vector2(
          (x / rect.width) * 2 - 1,
          -(y / rect.height) * 2 + 1
        );

        segmentRaycaster.setFromCamera(ndc, this.camera);
        const intersects = segmentRaycaster.intersectObject(model, true);

        const hasValidHit = intersects.length > 0;
        if (hasValidHit) {
          intersectsModel = true;
          break;
        }
      }

      if (intersectsModel) {
        modelsToSlice.push(model);
      }
    });

    if (modelsToSlice.length === 0) return;

    modelsToSlice.forEach((model) => {
      const { partA, partB } = MeshCutter.slice(model, slicePlane);

      this.scene.remove(model);
      const index = this.activeModels.indexOf(model);
      if (index > -1) {
        this.activeModels.splice(index, 1);
      }

      this.scene.add(partA);
      this.scene.add(partB);
      this.activeModels.push(partA, partB);

    });

    this.notifyStateChange();

    this.spawnTemporaryPlaneMesh(start, end, rect, planeNormal, planeCenter);
  }

  private spawnTemporaryPlaneMesh(
    start: { x: number; y: number },
    end: { x: number; y: number },
    rect: DOMRect,
    planeNormal: THREE.Vector3,
    planeCenter: THREE.Vector3,
  ) {
    const tempRay = new THREE.Raycaster();
    const distance = this.camera.position.distanceTo(
      new THREE.Vector3(0, 0, 0),
    );

    tempRay.setFromCamera(
      new THREE.Vector2(
        (start.x / rect.width) * 2 - 1,
        -(start.y / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const startWorld = new THREE.Vector3();
    tempRay.ray.at(distance, startWorld);

    tempRay.setFromCamera(
      new THREE.Vector2(
        (end.x / rect.width) * 2 - 1,
        -(end.y / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const endWorld = new THREE.Vector3();
    tempRay.ray.at(distance, endWorld);

    const planeWidth = startWorld.distanceTo(endWorld);
    const planeHeight = Math.max(planeWidth * 1.5, 8);

    const planeGeom = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const planeMat = new THREE.MeshBasicMaterial({
      color: "#6366f1",
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const planeMesh = new THREE.Mesh(planeGeom, planeMat);
    planeMesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      planeNormal,
    );
    planeMesh.position.copy(planeCenter);

    this.scene.add(planeMesh);

    let startOpacity = 0.5;
    const fade = () => {
      startOpacity -= 0.02;
      if (startOpacity <= 0) {
        this.scene.remove(planeMesh);
        planeGeom.dispose();
        planeMat.dispose();
      } else {
        planeMat.opacity = startOpacity;
        requestAnimationFrame(fade);
      }
    };
    fade();
  }

  public clearActiveModels() {
    this.activeModels.forEach((model) => {
      this.scene.remove(model);
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
    this.activeModels = [];
    this.notifyStateChange();
  }

  public destroy() {
    this.svg.remove();
    this.container.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
  }
}
