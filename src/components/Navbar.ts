export type AppMode = "idle" | "cut" | "drag";

export function createNavbar(
  onImportGLTF: (files: FileList) => void,
  onModeChange: (mode: AppMode | "reset") => void,
  onShapeChange: (shape: string) => void,
): HTMLElement {
  const element = document.createElement("nav");
  element.className =
    "w-full h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-center px-8 shrink-0 z-10 select-none shadow-sm";
  element.id = "navbar";

  element.innerHTML = `
    
 

    <div class="flex items-center gap-4 text-sm font-semibold text-slate-700">
      <a href="#" id="cut-btn" class="px-5 py-2 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-all duration-200">
        Cut Mode
      </a>
      <a href="#" id="drag-btn" class="px-5 py-2 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-all duration-200">
        Drag Mode
      </a>
      <a href="#" id="reset-btn" class="px-5 py-2 rounded-full bg-slate-50 border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all duration-200">
        Reset
      </a>
    </div>

    <div class="flex items-center gap-4 mx-4">
      <div class="flex items-center gap-2">
        <label for="shape-switcher" class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Shape:</label>
        <select id="shape-switcher" class="bg-white border border-slate-200 text-slate-800 text-xs font-medium rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none transition-all duration-200 cursor-pointer">
          <option value="cube">Cube</option>
          <option value="sphere">Sphere</option>
          <option value="torus">Torus</option>
          <option value="cylinder">Cylinder</option>
        </select>
      </div>

      <a href="#" id="import-btn" class="text-xs text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm px-4 py-2 rounded-lg font-medium tracking-wide transition-all duration-200">
        Import GLB/GLTF
      </a>
    </div>
  `;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".glb,.gltf,.bin,.png,.jpg,.jpeg";
  fileInput.multiple = true;
  fileInput.className = "hidden";
  element.appendChild(fileInput);

  const shapeSwitcher =
    element.querySelector<HTMLSelectElement>("#shape-switcher")!;
  shapeSwitcher.addEventListener("change", (e) => {
    const selectedShape = (e.target as HTMLSelectElement).value;
    onShapeChange(selectedShape);
  });

  const importBtn = element.querySelector("#import-btn")!;
  importBtn.addEventListener("click", (e) => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      onImportGLTF(files);
      const customOpt = document.createElement("option");
      customOpt.value = "custom";
      customOpt.textContent = "Custom Model";
      customOpt.selected = true;
      const exists = Array.from(shapeSwitcher.options).some(
        (o) => o.value === "custom",
      );
      if (!exists) {
        shapeSwitcher.appendChild(customOpt);
      }
    }
  });

  let activeMode: AppMode = "idle";

  const cutBtn = element.querySelector("#cut-btn")!;
  const dragBtn = element.querySelector("#drag-btn")!;
  const resetBtn = element.querySelector("#reset-btn")!;

  const updateStyles = () => {
    if (activeMode === "cut") {
      cutBtn.className =
        "px-5 py-2 rounded-full text-white bg-indigo-600 border border-indigo-500/80 shadow-sm transition-all duration-200 scale-102 font-bold";
    } else {
      cutBtn.className =
        "px-5 py-2 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-all duration-200";
    }

    if (activeMode === "drag") {
      dragBtn.className =
        "px-5 py-2 rounded-full text-white bg-indigo-600 border border-indigo-500/80 shadow-sm transition-all duration-200 scale-102 font-bold";
    } else {
      dragBtn.className =
        "px-5 py-2 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-all duration-200";
    }
  };

  cutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    activeMode = activeMode === "cut" ? "idle" : "cut";
    updateStyles();
    onModeChange(activeMode);
  });

  dragBtn.addEventListener("click", (e) => {
    e.preventDefault();
    activeMode = activeMode === "drag" ? "idle" : "drag";
    updateStyles();
    onModeChange(activeMode);
  });

  resetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    onModeChange("reset");

    shapeSwitcher.value = "cube";
    const customOpt = Array.from(shapeSwitcher.options).find(
      (o) => o.value === "custom",
    );
    if (customOpt) {
      shapeSwitcher.removeChild(customOpt);
    }

    activeMode = "idle";
    updateStyles();
  });

  updateStyles();

  return element;
}
