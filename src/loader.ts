import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export function loadModel(
  files: FileList | File[] | File,
  onSuccess: (model: THREE.Group) => void,
  onError: (error: any) => void,
) {
  const fileList =
    files instanceof FileList
       ? Array.from(files)
       : Array.isArray(files)
         ? files
         : [files];
  if (fileList.length === 0) {
    onError(new Error("No files selected"));
    return;
  }

  const mainFile = fileList.find(
    (f) => f.name.endsWith(".gltf") || f.name.endsWith(".glb"),
  );
  if (!mainFile) {
    onError(
      new Error("No valid .gltf or .glb file found among the selected files."),
    );
    return;
  }

  const fileURLs: { [key: string]: string } = {};
  fileList.forEach((file) => {
    fileURLs[file.name] = URL.createObjectURL(file);
    console.log("file", file.name);
    console.log("file", fileURLs[file.name]);
  });

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const fileName = decodeURIComponent(cleanUrl.split("/").pop() || "");
    if (fileURLs[fileName]) {
      return fileURLs[fileName];
    }
    return url;
  });

  const mainURL = fileURLs[mainFile.name];
  const loader = new GLTFLoader(manager);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  loader.setDRACOLoader(dracoLoader);

  loader.load(
    mainURL,
    (gltf) => {
      const boxBefore = new THREE.Box3().setFromObject(gltf.scene);
      const sizeBefore = boxBefore.getSize(new THREE.Vector3());

      const maxDim = Math.max(sizeBefore.x, sizeBefore.y, sizeBefore.z);
      if (maxDim > 0) {
        const scaleFactor = 3 / maxDim;
        gltf.scene.scale.set(scaleFactor, scaleFactor, scaleFactor);
      }

      const boxAfter = new THREE.Box3().setFromObject(gltf.scene);
      const centerAfter = boxAfter.getCenter(new THREE.Vector3());
      gltf.scene.position.set(-centerAfter.x, -centerAfter.y, -centerAfter.z);

      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      Object.values(fileURLs).forEach((url) => URL.revokeObjectURL(url));
      dracoLoader.dispose();

      onSuccess(gltf.scene);
    },
    undefined,
    (error) => {
      Object.values(fileURLs).forEach((url) => URL.revokeObjectURL(url));
      dracoLoader.dispose();
      onError(error);
    },
  );
}
