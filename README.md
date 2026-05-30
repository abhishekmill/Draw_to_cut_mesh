# Draw to Cut Mesh

An interactive 3D web application that allows users to slice meshes in real time by drawing 2D cutting strokes directly on the screen. The application supports standard geometric primitives (cube, cylinder, sphere, torus) as well as custom 3D models imported via GLTF/GLB formats. Sliced parts can be dragged and separated in 3D space to inspect the resulting cross-sections.

---

## Tech Stack & Approach

* **Core Engine:** [Three.js](https://threejs.org/) (WebGL-based 3D library) using TypeScript for complete type safety and structural clarity.
* **Build System:** [Vite](https://vite.dev/) for instantaneous hot module replacement (HMR) and optimized packaging.
* **Styling:** [TailwindCSS v4](https://tailwindcss.com/) for the HUD overlay, loading indicators, and interaction mode controllers.
* **Interaction:** A combination of a responsive SVG overlay (for drawing 2D cutting lines) and a 3D raycaster (for selecting and moving the sliced components).

---

## Rendering & Shading Model

* **PBR Shading:** The application utilizes Three's Physically Based Rendering (PBR) shading model via `THREE.MeshStandardMaterial`. It is configured with moderate roughness (`0.4`) and subtle metalness (`0.15`) to react realistically to dynamic lighting.
* **Double-Sided Rendering:** Materials are configured with `side: THREE.DoubleSide` so that when a mesh is cut open, the interior backing walls are immediately visible rather than being culled by the GPU.
* **Shadow Mapping:** Realistic spatial depth is maintained using a directional light source combined with soft shadow maps (`THREE.PCFSoftShadowMap`) projected onto a ground helper grid.

---

## Third-Party Libraries

Apart from the build tooling, the application intentionally limits external dependencies to keep the bundle size small and maintain strict control over performance:

1. **`three`**: Used as the foundational 3D graphics library. Rather than writing raw WebGL shader pipelines, buffer configurations, and matrix math from scratch, Three.js provides reliable scene graph structures, standard PBR material shaders, lighting, and math utilities.
2. **`three/examples/jsm/controls/OrbitControls`**: Handles viewport navigation (orbit, pan, and zoom) seamlessly, enabling users to examine their mesh cuts from any angle.
3. **`three/examples/jsm/loaders/GLTFLoader` & `DRACOLoader`**: Integrated to allow users to load their own custom models (including heavily compressed Draco models) directly into the sandbox.

---

## Slicing Algorithm & Mathematics

Slicing is performed directly on the CPU by mathematically modifying the underlying vertex buffers of the 3D geometry. The cutting process is broken down into four distinct phases:



### 1. Deriving the 3D Slicing Plane
When the user drags their cursor in "Cut" mode, we record the start and end coordinates in screen space.
1. The 2D coordinates are transformed into Normalized Device Coordinates (NDC) in the $[-1, 1]$ range.
2. We cast a ray from the camera through the midpoint of the stroke to find the center point of our slicing plane in the 3D world (`planeCenter`).
3. We cast rays through the start and end NDC coordinates to obtain two 3D camera-direction vectors, `startDir` and `endDir`.
4. The cross product of these two direction vectors defines the exact normal of our slicing plane:
   $$\vec{n} = \text{normalize}(\vec{v}_{\text{start}} \times \vec{v}_{\text{end}})$$
5. The slicing plane is defined in world coordinates by this normal $\vec{n}$ and the coplanar point `planeCenter`.

### 2. Vertex Classification
To slice a mesh, the world plane is converted into the local coordinate system of the target mesh by multiplying it by the inverse of the mesh's world matrix:
$$\text{localPlane} = \text{worldPlane} \cdot \mathbf{M}_{\text{world}}^{-1}$$

We retrieve the non-indexed triangle list from the `THREE.BufferGeometry` and evaluate the signed distance of each vertex to the local plane using the dot product:
$$d = \vec{n}_{\text{local}} \cdot \vec{p}_{\text{vertex}} + C$$

* **Positive Distance ($d \ge 0$):** The vertex lies on the positive side (Part A).
* **Negative Distance ($d < 0$):** The vertex lies on the negative side (Part B).

For every individual triangle (composed of three vertices `vA`, `vB`, and `vC`):
* **All Positive:** The entire triangle is pushed directly to the buffer for **Part A**.
* **All Negative:** The entire triangle is pushed directly to the buffer for **Part B**.
* **Mixed Signs:** The triangle intersects the plane. 

### 3. Triangle Interpolation & Splitting
When a triangle is intersected by the cutting plane, one vertex will be isolated on one side, and the other two vertices will sit on the opposite side. 
1. We sort the vertices so that the single isolated vertex is labeled `v0`, and the other two are `v1` and `v2`.
2. We calculate the interpolation factors $t_1$ and $t_2$ along the edges connecting `v0` to `v1` and `v0` to `v2`:
   $$t_1 = \frac{d_0}{d_0 - d_1}, \quad t_2 = \frac{d_0}{d_0 - d_2}$$
3. We linearly interpolate the position, normal, and UV attributes at $t_1$ and $t_2$ to generate two new intersection vertices, `i1` and `i2`.
4. The intersection segment `i1 -> i2` is recorded for cap generation.
5. The single triangle is split into three:
   * A single triangle on `v0`'s side: `(v0, i1, i2)`.
   * A quad split into two triangles on the opposite side: `(v1, v2, i2)` and `(v1, i2, i1)`.

### 4. Cap Generation
Slicing a closed mesh leaves a hollow gap where the interior is exposed. To seal this gap and make the mesh appear solid, the system generates custom caps:
1. **Loop Building:** All recorded intersection segments are gathered and stitched together. The algorithm matches end-points of segments within a tolerance of `1e-4` to form closed 3D loops representing the outer boundaries of the cut.
2. **2D Projection:** For each closed loop, we construct a 2D coordinate system on the cutting plane using two perpendicular tangent vectors ($\vec{u}$ and $\vec{v}$). Each 3D vertex in the loop is projected into this 2D space:
   $$x_{2D} = (\vec{p} - \vec{p}_{\text{origin}}) \cdot \vec{u}, \quad y_{2D} = (\vec{p} - \vec{p}_{\text{origin}}) \cdot \vec{v}$$
3. **Triangulation:** The 2D points are triangulated using `THREE.ShapeUtils.triangulateShape`. If the triangulation fails (e.g., due to self-intersection or numerical instability), the engine falls back to a robust center-fan triangulation.
4. **Buffering Caps:** The resulting 2D triangulation indices are mapped back to their original 3D positions. We add these new triangles to **Part A** and **Part B** with their face normals set to face outwards relative to each respective half, creating a solid closed volume.

---

## Known Issues & Incomplete Areas

While the cutting algorithm is highly responsive and functional, there are several boundary cases and limitations:

1. **Non-Manifold or Open Geometries:** The cap generation process relies on finding fully closed loops of intersection segments. If the input mesh has open holes, missing faces, or non-manifold topology, the loop builder cannot close the path. This leads to missing capping faces or irregular triangulation.
2. **Concave Triangulation Fallback:** If `THREE.ShapeUtils.triangulateShape` fails to resolve highly complex or convoluted boundary loops, the fallback fan triangulation is triggered. Since a fan triangulation assumes convex boundaries, it can produce overlapping or self-intersecting faces on highly concave cross-sections.
3. **Internal Material and Texture Mapping:** Currently, the generated cap faces are assigned to the primary material index (`0`). They do not support custom internal textures or colors (such as a wood-grain pattern or a solid red interior), which would require configuring secondary multi-material groups on the cap.
4. **Performance on High-Poly Count Meshes:** Because the vertex sorting, interpolation, and loop stitching are calculated entirely on the CPU main thread, meshes with extremely high triangle counts (e.g., above 150k triangles) can experience a brief block (typically 100–300ms) during the slice execution.
