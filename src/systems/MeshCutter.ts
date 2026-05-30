import * as THREE from "three";

interface Vertex {
  pos: THREE.Vector3;
  normal?: THREE.Vector3;
  uv?: THREE.Vector2;
}

interface GeometryBuffers {
  position: number[];
  normal: number[];
  uv: number[];
}

function interpolateVertex(v1: Vertex, v2: Vertex, t: number): Vertex {
  const pos = new THREE.Vector3().lerpVectors(v1.pos, v2.pos, t);
  let normal: THREE.Vector3 | undefined;
  if (v1.normal && v2.normal) {
    normal = new THREE.Vector3()
      .lerpVectors(v1.normal, v2.normal, t)
      .normalize();
  }

  let uv: THREE.Vector2 | undefined;
  if (v1.uv && v2.uv) {
    uv = new THREE.Vector2().lerpVectors(v1.uv, v2.uv, t);
  }
  return { pos, normal, uv };
}

function buildLoopsFromSegments(
  segments: { p1: THREE.Vector3; p2: THREE.Vector3 }[],
): THREE.Vector3[][] {
  const loops: THREE.Vector3[][] = [];
  const remaining = [...segments];
  const tolerance = 1e-4;

  while (remaining.length > 0) {
    const first = remaining.shift()!;
    const loop = [first.p1, first.p2];
    let currentPoint = first.p2;
    let closed = false;

    while (remaining.length > 0) {
      let foundIndex = -1;
      let reverse = false;

      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        if (seg.p1.distanceTo(currentPoint) < tolerance) {
          foundIndex = i;
          reverse = false;
          break;
        } else if (seg.p2.distanceTo(currentPoint) < tolerance) {
          foundIndex = i;
          reverse = true;
          break;
        }
      }

      if (foundIndex !== -1) {
        const nextSeg = remaining.splice(foundIndex, 1)[0];
        const nextPoint = reverse ? nextSeg.p1 : nextSeg.p2;

        if (nextPoint.distanceTo(loop[0]) < tolerance) {
          closed = true;
          break;
        }

        loop.push(nextPoint);
        currentPoint = nextPoint;
      } else {
        break;
      }
    }

    if (!closed && loop[0].distanceTo(currentPoint) > tolerance) {
      if (loop[0].distanceTo(currentPoint) < 1e-2) {
        closed = true;
      }
    }

    if (loop.length >= 3) {
      loops.push(loop);
    }
  }

  return loops;
}

export class MeshCutter {
  public static slice(
    object: THREE.Object3D,
    worldPlane: THREE.Plane,
  ): { partA: THREE.Object3D; partB: THREE.Object3D } {
    const { partA, partB } = this.sliceObject(object, worldPlane);

    return {
      partA: partA || new THREE.Object3D(),
      partB: partB || new THREE.Object3D(),
    };
  }

  private static sliceObject(
    object: THREE.Object3D,
    worldPlane: THREE.Plane,
  ): { partA: THREE.Object3D | null; partB: THREE.Object3D | null } {
    if ((object as THREE.Mesh).isMesh) {
      const mesh = object as THREE.Mesh;
      mesh.updateMatrixWorld(true);

      const localPlane = worldPlane
        .clone()
        .applyMatrix4(mesh.matrixWorld.clone().invert());

      const { geomA, geomB } = this.sliceGeometry(mesh.geometry, localPlane);
      console.log("cutted geometries", geomA, geomB);

      let partA: THREE.Mesh | null = null;
      let partB: THREE.Mesh | null = null;

      if (geomA) {
        partA = new THREE.Mesh(geomA, mesh.material);
        partA.name = `${mesh.name}_partA`;
        partA.castShadow = mesh.castShadow;
        partA.receiveShadow = mesh.receiveShadow;
        partA.position.copy(mesh.position);
        partA.rotation.copy(mesh.rotation);
        partA.scale.copy(mesh.scale);
      }

      if (geomB) {
        partB = new THREE.Mesh(geomB, mesh.material);
        partB.name = `${mesh.name}_partB`;
        partB.castShadow = mesh.castShadow;
        partB.receiveShadow = mesh.receiveShadow;
        partB.position.copy(mesh.position);
        partB.rotation.copy(mesh.rotation);
        partB.scale.copy(mesh.scale);
      }

      return { partA, partB };
    }

    const partA = object.clone(false);
    const partB = object.clone(false);

    let hasChildrenA = false;
    let hasChildrenB = false;

    for (const child of object.children) {
      const { partA: childA, partB: childB } = this.sliceObject(
        child,
        worldPlane,
      );
      if (childA) {
        partA.add(childA);
        hasChildrenA = true;
      }
      if (childB) {
        partB.add(childB);
        hasChildrenB = true;
      }
    }

    return {
      partA: hasChildrenA ? partA : null,
      partB: hasChildrenB ? partB : null,
    };
  }

  private static sliceGeometry(
    geometry: THREE.BufferGeometry,
    localPlane: THREE.Plane,
  ): {
    geomA: THREE.BufferGeometry | null;
    geomB: THREE.BufferGeometry | null;
  } {
    const nonIndexed = geometry.index
      ? geometry.toNonIndexed()
      : geometry.clone();

    const posAttr = nonIndexed.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const normAttr = nonIndexed.getAttribute("normal") as
      | THREE.BufferAttribute
      | undefined;
    const uvAttr = nonIndexed.getAttribute("uv") as
      | THREE.BufferAttribute
      | undefined;

    const count = posAttr.count;

    const buffersA = new Map<number, GeometryBuffers>();
    const buffersB = new Map<number, GeometryBuffers>();

    const boundarySegments: { p1: THREE.Vector3; p2: THREE.Vector3 }[] = [];

    const getVertex = (idx: number): Vertex => {
      const pos = new THREE.Vector3(
        posAttr.getX(idx),
        posAttr.getY(idx),
        posAttr.getZ(idx),
      );
      let normal: THREE.Vector3 | undefined;
      if (normAttr) {
        normal = new THREE.Vector3(
          normAttr.getX(idx),
          normAttr.getY(idx),
          normAttr.getZ(idx),
        );
      }
      let uv: THREE.Vector2 | undefined;
      if (uvAttr) {
        uv = new THREE.Vector2(uvAttr.getX(idx), uvAttr.getY(idx));
      }
      return { pos, normal, uv };
    };

    const getMaterialIndex = (vertexIndex: number): number => {
      if (!nonIndexed.groups || nonIndexed.groups.length === 0) return 0;
      for (const group of nonIndexed.groups) {
        if (
          vertexIndex >= group.start &&
          vertexIndex < group.start + group.count
        ) {
          return group.materialIndex ?? 0;
        }
      }
      return 0;
    };

    const getBuffers = (
      map: Map<number, GeometryBuffers>,
      matIdx: number,
    ): GeometryBuffers => {
      let buf = map.get(matIdx);
      if (!buf) {
        buf = { position: [], normal: [], uv: [] };
        map.set(matIdx, buf);
      }
      return buf;
    };

    const addVertex = (v: Vertex, buf: GeometryBuffers) => {
      buf.position.push(v.pos.x, v.pos.y, v.pos.z);
      if (normAttr && v.normal) {
        buf.normal.push(v.normal.x, v.normal.y, v.normal.z);
      } else if (normAttr) {
        buf.normal.push(0, 1, 0);
      }
      if (uvAttr && v.uv) {
        buf.uv.push(v.uv.x, v.uv.y);
      } else if (uvAttr) {
        buf.uv.push(0, 0);
      }
    };

    const addTriangle = (
      v1: Vertex,
      v2: Vertex,
      v3: Vertex,
      map: Map<number, GeometryBuffers>,
      matIdx: number,
    ) => {
      const buf = getBuffers(map, matIdx);
      addVertex(v1, buf);
      addVertex(v2, buf);
      addVertex(v3, buf);
    };

    for (let i = 0; i < count; i += 3) {
      const vA = getVertex(i);
      const vB = getVertex(i + 1);
      const vC = getVertex(i + 2);

      const dA = localPlane.distanceToPoint(vA.pos);
      const dB = localPlane.distanceToPoint(vB.pos);
      const dC = localPlane.distanceToPoint(vC.pos);

      const sideA_count =
        (dA >= 0 ? 1 : 0) + (dB >= 0 ? 1 : 0) + (dC >= 0 ? 1 : 0);
      const matIdx = getMaterialIndex(i);

      if (sideA_count === 3) {
        addTriangle(vA, vB, vC, buffersA, matIdx);
      } else if (sideA_count === 0) {
        addTriangle(vA, vB, vC, buffersB, matIdx);
      } else {
        let v0: Vertex, v1: Vertex, v2: Vertex;
        let d0: number, d1: number, d2: number;

        if ((dA >= 0 && dB < 0 && dC < 0) || (dA < 0 && dB >= 0 && dC >= 0)) {
          v0 = vA;
          d0 = dA;
          v1 = vB;
          d1 = dB;
          v2 = vC;
          d2 = dC;
        } else if (
          (dB >= 0 && dA < 0 && dC < 0) ||
          (dB < 0 && dA >= 0 && dC >= 0)
        ) {
          v0 = vB;
          d0 = dB;
          v1 = vC;
          d1 = dC;
          v2 = vA;
          d2 = dA;
        } else {
          v0 = vC;
          d0 = dC;
          v1 = vA;
          d1 = dA;
          v2 = vB;
          d2 = dB;
        }

        const t1 = d0 / (d0 - d1);
        const i1 = interpolateVertex(v0, v1, t1);

        const t2 = d0 / (d0 - d2);
        const i2 = interpolateVertex(v0, v2, t2);

        boundarySegments.push({ p1: i1.pos.clone(), p2: i2.pos.clone() });

        if (d0 >= 0) {
          addTriangle(v0, i1, i2, buffersA, matIdx);
          addTriangle(v1, v2, i2, buffersB, matIdx);
          addTriangle(v1, i2, i1, buffersB, matIdx);
        } else {
          addTriangle(v0, i1, i2, buffersB, matIdx);
          addTriangle(v1, v2, i2, buffersA, matIdx);
          addTriangle(v1, i2, i1, buffersA, matIdx);
        }
      }
    }

    if (boundarySegments.length > 0) {
      const loops = buildLoopsFromSegments(boundarySegments);
      loops.forEach((loop) => {
        if (loop.length < 3) return;

        const normal = localPlane.normal;
        const u = new THREE.Vector3();
        if (Math.abs(normal.x) > 0.9) {
          u.set(0, 1, 0).cross(normal).normalize();
        } else {
          u.set(1, 0, 0).cross(normal).normalize();
        }
        const v = new THREE.Vector3().crossVectors(normal, u).normalize();
        const O = normal.clone().multiplyScalar(-localPlane.constant);

        const pts2D = loop.map((p) => {
          const rel = p.clone().sub(O);
          return new THREE.Vector2(rel.dot(u), rel.dot(v));
        });

        let faces: number[][];
        try {
          faces = THREE.ShapeUtils.triangulateShape(pts2D, []);
        } catch (err) {
          console.warn(
            "Triangulation failed, falling back to fan triangulation",
            err,
          );
          faces = [];
          for (let j = 1; j < loop.length - 1; j++) {
            faces.push([0, j, j + 1]);
          }
        }
        console.log("faces", faces);

        faces.forEach((face) => {
          const p0 = loop[face[0]];
          const p1 = loop[face[1]];
          const p2 = loop[face[2]];

          const faceNormal = new THREE.Vector3()
            .crossVectors(p1.clone().sub(p0), p2.clone().sub(p0))
            .normalize();

          const v0_A: Vertex = {
            pos: p0,
            normal: localPlane.normal.clone().negate(),
            uv: pts2D[face[0]],
          };
          const v1_A: Vertex = {
            pos: p1,
            normal: localPlane.normal.clone().negate(),
            uv: pts2D[face[1]],
          };
          const v2_A: Vertex = {
            pos: p2,
            normal: localPlane.normal.clone().negate(),
            uv: pts2D[face[2]],
          };

          if (faceNormal.dot(localPlane.normal) > 0) {
            addTriangle(v0_A, v2_A, v1_A, buffersA, 0);
          } else {
            addTriangle(v0_A, v1_A, v2_A, buffersA, 0);
          }

          const v0_B: Vertex = {
            pos: p0,
            normal: localPlane.normal.clone(),
            uv: pts2D[face[0]],
          };
          const v1_B: Vertex = {
            pos: p1,
            normal: localPlane.normal.clone(),
            uv: pts2D[face[1]],
          };
          const v2_B: Vertex = {
            pos: p2,
            normal: localPlane.normal.clone(),
            uv: pts2D[face[2]],
          };

          if (faceNormal.dot(localPlane.normal) < 0) {
            addTriangle(v0_B, v2_B, v1_B, buffersB, 0);
          } else {
            addTriangle(v0_B, v1_B, v2_B, buffersB, 0);
          }
        });
      });
    }

    nonIndexed.dispose();

    const buildGeometry = (
      map: Map<number, GeometryBuffers>,
    ): THREE.BufferGeometry | null => {
      if (map.size === 0) return null;

      const finalPos: number[] = [];
      const finalNorm: number[] = [];
      const finalUv: number[] = [];
      let currentVertexIndex = 0;
      let hasVertices = false;

      const geom = new THREE.BufferGeometry();

      for (const [matIdx, buf] of map.entries()) {
        if (buf.position.length === 0) continue;
        const count = buf.position.length / 3;
        geom.addGroup(currentVertexIndex, count, matIdx);

        for (let j = 0; j < buf.position.length; j++) {
          finalPos.push(buf.position[j]);
        }
        if (normAttr) {
          for (let j = 0; j < buf.normal.length; j++) {
            finalNorm.push(buf.normal[j]);
          }
        }
        if (uvAttr) {
          for (let j = 0; j < buf.uv.length; j++) {
            finalUv.push(buf.uv[j]);
          }
        }

        currentVertexIndex += count;
        hasVertices = true;
      }

      if (hasVertices && finalPos.length > 0) {
        geom.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(finalPos, 3),
        );
        if (normAttr && finalNorm.length > 0) {
          geom.setAttribute(
            "normal",
            new THREE.Float32BufferAttribute(finalNorm, 3),
          );
        }
        if (uvAttr && finalUv.length > 0) {
          geom.setAttribute("uv", new THREE.Float32BufferAttribute(finalUv, 2));
        }
        return geom;
      }

      geom.dispose();
      return null;
    };

    const geomA = buildGeometry(buffersA);
    const geomB = buildGeometry(buffersB);

    return { geomA, geomB };
  }

  public static updateClippingPlanes(_object: THREE.Object3D) {
    // No-op since we slice geometry directly
  }
}
