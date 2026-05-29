import * as THREE from "three";

export class MeshCutter {
  public static slice(
    object: THREE.Object3D,
    worldPlane: THREE.Plane
  ): { partA: THREE.Object3D; partB: THREE.Object3D } {
    object.updateMatrixWorld(true);

    const partA = object.clone();
    const partB = object.clone();

    partA.position.copy(object.position);
    partA.rotation.copy(object.rotation);
    partA.scale.copy(object.scale);
    partA.name = `${object.name || "sliced"}_partA`;

    partB.position.copy(object.position);
    partB.rotation.copy(object.rotation);
    partB.scale.copy(object.scale);
    partB.name = `${object.name || "sliced"}_partB`;

    this.applyClippingPlanesToTree(partA, object, worldPlane.clone());

    this.applyClippingPlanesToTree(partB, object, worldPlane.clone().negate());

    return { partA, partB };
  }

  private static applyClippingPlanesToTree(
    clonedRoot: THREE.Object3D,
    originalRoot: THREE.Object3D,
    worldPlane: THREE.Plane
  ) {
    const originalMeshes: THREE.Mesh[] = [];
    originalRoot.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        originalMeshes.push(child as THREE.Mesh);
      }
    });

    let meshIndex = 0;
    clonedRoot.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const clonedMesh = child as THREE.Mesh;
        const originalMesh = originalMeshes[meshIndex++];

        if (originalMesh) {
          originalMesh.updateMatrixWorld(true);
          const invMatrix = originalMesh.matrixWorld.clone().invert();

          const localPlane = worldPlane.clone().applyMatrix4(invMatrix);

          const originalPlanes = originalMesh.userData?.localPlanes;
          const newLocalPlanes: THREE.Plane[] = [];
          if (Array.isArray(originalPlanes)) {
            originalPlanes.forEach((p: any) => {
              if (p) {
                if (typeof p.clone === "function") {
                  newLocalPlanes.push(p.clone());
                } else if (p.normal !== undefined && p.constant !== undefined) {
                  newLocalPlanes.push(
                    new THREE.Plane(
                      new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z),
                      p.constant
                    )
                  );
                }
              }
            });
          }
          newLocalPlanes.push(localPlane);
          clonedMesh.userData.localPlanes = newLocalPlanes;

          if (Array.isArray(clonedMesh.material)) {
            clonedMesh.material = clonedMesh.material.map((mat) => {
              const m = mat.clone();
              m.clippingPlanes = m.clippingPlanes ? [...m.clippingPlanes] : [];
              m.clipShadows = true;
              return m;
            });
          } else if (clonedMesh.material) {
            const m = clonedMesh.material.clone();
            m.clippingPlanes = m.clippingPlanes ? [...m.clippingPlanes] : [];
            m.clipShadows = true;
            clonedMesh.material = m;
          }
        }
      }
    });
  }

  public static updateClippingPlanes(object: THREE.Object3D) {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.userData.localPlanes && mesh.userData.localPlanes.length > 0) {
          mesh.updateMatrixWorld(true);
          const meshMatrixWorld = mesh.matrixWorld;

          const worldPlanes = mesh.userData.localPlanes.map((localPlane: THREE.Plane) => {
            const wp = localPlane.clone();
            wp.applyMatrix4(meshMatrixWorld);
            return wp;
          });

          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => {
              mat.clippingPlanes = worldPlanes;
            });
          } else if (mesh.material) {
            mesh.material.clippingPlanes = worldPlanes;
          }
        }
      }
    });
  }
}
