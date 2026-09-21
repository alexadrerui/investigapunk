import * as THREE from "three";
import { CAR } from "../config.js";
import { ASSETS } from "../assets.js";
import { enableShadows, getGltfLoader } from "../core/gltf.js";
import { computeObjectBoundsTrees } from "../core/bvh.js";
import { replaceMeshMaterials, setBloomOutput, toPhysicalNode } from "../materials/toNodeMaterial.js";
import { isGlowing } from "../postfx/bloomSources.js";

const COLLIDER_SHRINK = -0.5;
const COLLIDER_MIN_HEIGHT = 2.2;

function makeColliderBox(size, center) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial());
  mesh.name = "quadra-collider";
  mesh.visible = false;
  mesh.position.copy(center);
  computeObjectBoundsTrees(mesh);
  return mesh;
}

export function createCarCollider(car) {
  car.updateWorldMatrix(true, true);

  const localBox = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const meshToLocal = new THREE.Matrix4();
  const worldToLocal = new THREE.Matrix4().copy(car.matrixWorld).invert();

  car.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geometry = child.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    meshBox.copy(geometry.boundingBox);
    meshToLocal.multiplyMatrices(worldToLocal, child.matrixWorld);
    meshBox.applyMatrix4(meshToLocal);
    localBox.union(meshBox);
  });

  if (localBox.isEmpty()) {
    const worldBox = new THREE.Box3().setFromObject(car);
    const size = worldBox.getSize(new THREE.Vector3());
    const center = worldBox.getCenter(new THREE.Vector3());
    size.x += COLLIDER_SHRINK * 1.5;
    size.z += COLLIDER_SHRINK * 1.5;
    size.y = Math.max(size.y + 0.2, COLLIDER_MIN_HEIGHT);
    center.y = worldBox.min.y + size.y * 0.5;
    return makeColliderBox(size, center);
  }

  const size = localBox.getSize(new THREE.Vector3());
  const center = localBox.getCenter(new THREE.Vector3());
  size.x += COLLIDER_SHRINK * 2;
  size.z += COLLIDER_SHRINK * 2;
  size.y = Math.max(size.y + 0.2, COLLIDER_MIN_HEIGHT);
  center.y = localBox.min.y + size.y * 0.5;
  center.applyMatrix4(car.matrixWorld);

  const mesh = makeColliderBox(size, center);
  mesh.quaternion.copy(car.getWorldQuaternion(new THREE.Quaternion()));
  mesh.scale.copy(car.scale);
  mesh.updateMatrixWorld(true);
  return mesh;
}

export async function loadCar(renderer) {
  const gltf = await getGltfLoader(renderer).loadAsync(ASSETS.car);
  const car = gltf.scene;
  car.name = "Quadra";
  car.position.set(...CAR.position);
  car.rotation.y = CAR.rotationY;
  car.scale.setScalar(CAR.scale);
  car.updateWorldMatrix(true, true);
  enableShadows(car);
  replaceMeshMaterials(car, toPhysicalNode);
  // Lanternas/faróis (materiais emissivos) alimentam o bloom seletivo, como os letreiros.
  car.traverse((child) => {
    if (!child.isMesh) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      if (material && isGlowing(material)) setBloomOutput(material, true, CAR.lightBloom);
    }
  });
  const collider = createCarCollider(car);
  return { car, collider };
}
