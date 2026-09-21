export const LAYERS = {
  world: 0,
  fx: 1,
  smoke: 3,
};

export function setLayer(root, layer) {
  root.traverse((object) => {
    object.layers.set(layer);
  });
}

export function enableLayer(cameraOrObject, layer) {
  cameraOrObject.layers.enable(layer);
}
