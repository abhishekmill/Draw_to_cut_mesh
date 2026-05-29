import "./style.css";
import { createNavbar } from "./components/Navbar";
import { createScene } from "./scene";

const appElement = document.querySelector<HTMLDivElement>("#app")!;
appElement.className =
  "w-screen h-screen flex flex-col overflow-hidden bg-[#f8fafc] text-slate-800 font-sans relative";

const sceneContainer = document.createElement("div");
sceneContainer.className = "w-full flex-1 relative overflow-hidden";
sceneContainer.id = "scene-container";

const sceneContext = createScene(sceneContainer);

console.log("count", sceneContext.cutManager.activeModels.length);
console.log("mode", sceneContext.cutManager.activeMode);

const navbar = createNavbar(
  (files) => {
    sceneContext.importModel(files);
  },
  (mode) => {
    if (mode === "reset") {
      sceneContext.resetScene();
    } else {
      sceneContext.setMode(mode);
    }
  },
  (shape) => {
    sceneContext.spawnPrimitiveShape(shape);
  },
);

appElement.appendChild(navbar);
appElement.appendChild(sceneContainer);
