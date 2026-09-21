import * as THREE from "three";
import { float, positionWorld, uniform, vec2, vec4 } from "three/tsl";
import { PERF } from "../config.js";

export function createCollisionHeight({
  scene,
  renderer,
  width = 100,
  height = 100,
  depth = 80,
  resolution = PERF.collisionRainResolution ?? 512,
  cameraHeight = 50,
} = {}) {
  const halfW = width / 2;
  const halfH = height / 2;
  const position = new THREE.Vector3();
  const positionUniform = uniform(position);

  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, depth);
  camera.layers.set(0);

  const renderTarget = new THREE.RenderTarget(resolution, resolution, {
    type: THREE.FloatType,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
  });
  renderTarget.texture.colorSpace = THREE.NoColorSpace;
  renderTarget.texture.name = "CollisionHeight";

  const material = new THREE.NodeMaterial();
  material.name = "CollisionHeightMaterial";
  material.outputNode = vec4(positionWorld, 1);

  let frame = 0;

  function getUV(worldPos) {
    const u = worldPos.x.sub(positionUniform.x).add(float(halfW)).div(float(width));
    const v = worldPos.z.sub(positionUniform.z).add(float(halfH)).div(float(height));
    return vec2(u, v);
  }

  return {
    collision: { position, camera, renderTarget, material },
    renderTarget,
    getUV,
    update({ camera: viewCamera, hideObjects = [] } = {}) {
      if (!viewCamera) return;
      frame += 1;
      const skip = Math.max(1, PERF.collisionRainFrameSkip ?? 1);
      if (frame % skip !== 0) return;

      position.set(viewCamera.position.x, cameraHeight, viewCamera.position.z);
      camera.position.copy(position);
      camera.lookAt(position.x, 0, position.z);
      camera.updateMatrixWorld(true);

      const hidden = hideObjects.filter(Boolean).map((object) => ({
        object,
        visible: object.visible,
      }));
      for (const { object } of hidden) object.visible = false;

      const previousTarget = renderer.getRenderTarget();
      const previousMrt = renderer.getMRT?.() ?? null;
      const previousOverride = scene.overrideMaterial;

      scene.overrideMaterial = material;
      renderer.setMRT?.(null);
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setMRT?.(previousMrt);
      renderer.setRenderTarget(previousTarget);
      scene.overrideMaterial = previousOverride;

      for (const { object, visible } of hidden) object.visible = visible;
    },
    dispose() {
      renderTarget.dispose();
      material.dispose();
    },
  };
}
