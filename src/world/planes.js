import * as THREE from "three";
import { PLANES } from "../config.js";
import { ASSETS } from "../assets.js";
import { enableShadows, getGltfLoader } from "../core/gltf.js";
import { LAYERS, setLayer } from "../core/layers.js";
import { replaceMeshMaterials, toStandardNode } from "../materials/toNodeMaterial.js";

export async function createPlanes(scene, renderer) {
  const source = (await getGltfLoader(renderer).loadAsync(ASSETS.plane)).scene;
  source.updateWorldMatrix(true, true);
  const center = new THREE.Box3().setFromObject(source).getCenter(new THREE.Vector3());
  source.position.sub(center);
  enableShadows(source);
  replaceMeshMaterials(source, toStandardNode);

  const group = new THREE.Group();
  group.name = "flying-planes";
  scene.add(group);

  const lookTarget = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const fleet = PLANES.map((path, index) => {
    const curve = new THREE.CatmullRomCurve3(
      path.curvePoints.map((p) => new THREE.Vector3(...p)),
      false,
      "catmullrom",
      0.5,
    );
    const mesh = source.clone(true);
    mesh.name = `plane-${index}`;
    group.add(mesh);
    return {
      mesh,
      curve,
      progress: path.startOffset,
      wait: 0,
      yawOffset: path.yawOffset,
      speed: path.speed,
      loopDelay: path.loopDelay,
    };
  });

  setLayer(group, LAYERS.fx);

  const meshes = fleet.map((plane) => plane.mesh);

  return {
    group,
    meshes,
    primary: meshes[0] ?? null,
    update(delta) {
      for (const plane of fleet) {
        if (plane.wait > 0) {
          plane.wait -= delta;
          plane.mesh.visible = false;
          continue;
        }
        plane.mesh.visible = true;
        plane.progress += delta * plane.speed * 0.1;
        if (plane.progress > 1) {
          plane.progress = 0;
          plane.wait = plane.loopDelay;
          plane.mesh.visible = false;
          continue;
        }
        plane.curve.getPointAt(plane.progress, plane.mesh.position);
        plane.curve.getTangentAt(plane.progress, tangent);
        lookTarget.copy(plane.mesh.position).add(tangent);
        plane.mesh.lookAt(lookTarget);
        plane.mesh.rotateY(plane.yawOffset);
      }
    },
  };
}
