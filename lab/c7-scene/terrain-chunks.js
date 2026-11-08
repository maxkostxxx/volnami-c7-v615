import * as THREE from 'three';

// Exact topology partition: triangles retain their original three vertex
// indices and every BufferAttribute object is shared, not regenerated.
export function applyTerrainChunks(ground, { tileSize = 100, provenance = false } = {}) {
  if (ground.userData.terrainChunks) throw new Error('Terrain already partitioned');
  const full = ground.geometry, position = full.getAttribute('position');
  if (!full.index || full.groups.length || full.drawRange.start !== 0
    || (Number.isFinite(full.drawRange.count) && full.drawRange.count !== full.index.count)) {
    throw new Error('Expected full, single-material indexed terrain');
  }
  const source = full.index.array, buckets = new Map();
  const beforeRange = { ...full.drawRange };
  for (let i = 0; i < source.length; i += 3) {
    const a = source[i], b = source[i + 1], c = source[i + 2];
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    const key = `${Math.floor(x / tileSize)}:${Math.floor(z / tileSize)}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { key, indices: [], triangles: [], box: new THREE.Box3() }; buckets.set(key, bucket); }
    bucket.indices.push(a, b, c);
    if (provenance) bucket.triangles.push(i / 3);
  }
  const point = new THREE.Vector3(), tiles = [];
  for (const bucket of buckets.values()) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(full.attributes)) geometry.setAttribute(name, attribute);
    geometry.morphAttributes = full.morphAttributes;
    geometry.morphTargetsRelative = full.morphTargetsRelative;
    geometry.setIndex(new THREE.BufferAttribute(new source.constructor(bucket.indices), 1));
    for (const index of bucket.indices) bucket.box.expandByPoint(point.fromBufferAttribute(position, index));
    geometry.boundingBox = bucket.box;
    const center = bucket.box.getCenter(new THREE.Vector3());
    let radiusSquared = 0;
    for (const index of bucket.indices) radiusSquared = Math.max(radiusSquared, center.distanceToSquared(point.fromBufferAttribute(position, index)));
    geometry.boundingSphere = new THREE.Sphere(center, Math.sqrt(radiusSquared));
    const mesh = new THREE.Mesh(geometry, ground.material);
    mesh.name = `terrain-tile-${bucket.key}`;
    mesh.castShadow = false; mesh.receiveShadow = ground.receiveShadow;
    mesh.layers.mask = ground.layers.mask;
    mesh.renderOrder = ground.renderOrder;
    if (provenance) mesh.userData.sourceTriangleIds = Uint32Array.from(bucket.triangles);
    ground.add(mesh); tiles.push(mesh);
  }
  // Keep the original attributes and full bounds on ground.geometry for the
  // established fitSkyShadows API; only its own draw is disabled.
  full.computeBoundingBox(); full.computeBoundingSphere(); full.setDrawRange(0, 0);
  // Colour passes keep the culled tiles. A shadow pass submits the same
  // original index buffer once; onAfterShadow restores the empty parent draw
  // before either main or reflected colour rendering. No topology is merged.
  const previousBeforeShadow = ground.onBeforeShadow;
  const previousAfterShadow = ground.onAfterShadow;
  ground.onBeforeShadow = function (...args) {
    previousBeforeShadow.apply(this, args);
    full.setDrawRange(beforeRange.start, beforeRange.count);
  };
  ground.onAfterShadow = function (...args) {
    full.setDrawRange(0, 0);
    previousAfterShadow.apply(this, args);
  };
  const shadowProperties = {};
  for (const property of ['castShadow', 'receiveShadow']) {
    let value = ground[property]; shadowProperties[property] = value;
    Object.defineProperty(ground, property, { configurable: true, enumerable: true,
      get() { return value; }, set(next) { value = next; for (const tile of tiles) tile[property] = property === 'castShadow' ? false : next; } });
  }
  const stats = { shadowSubmission: 'original full index buffer, one draw per shadow pass', tiles: tiles.length, triangles: source.length / 3,
    vertices: position.count, tileSizeAuthoredMetres: tileSize,
    uniqueSharedAttributeBuffers: Object.keys(full.attributes).length,
    indexBytes: tiles.reduce((sum, tile) => sum + tile.geometry.index.array.byteLength, 0) };
  const study = { tiles, stats, restore() {
    for (const tile of tiles) { ground.remove(tile); tile.geometry.dispose(); }
    full.setDrawRange(beforeRange.start, beforeRange.count);
    ground.onBeforeShadow = previousBeforeShadow;
    ground.onAfterShadow = previousAfterShadow;
    for (const property of Object.keys(shadowProperties)) {
      const value = ground[property];
      Object.defineProperty(ground, property, { configurable: true, enumerable: true, writable: true, value });
    }
    delete ground.userData.terrainChunks;
  } };
  ground.userData.terrainChunks = study;
  return study;
}
