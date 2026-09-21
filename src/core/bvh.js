import * as THREE from "three";
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "three-mesh-bvh";

let installed = false;

export function installBvh() {
  if (installed) return;
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  installed = true;
}

export function computeObjectBoundsTrees(root) {
  installBvh();
  const seen = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const geometry = object.geometry;
    if (seen.has(geometry) || geometry.boundsTree) return;
    seen.add(geometry);
    geometry.computeBoundsTree();
  });
}
