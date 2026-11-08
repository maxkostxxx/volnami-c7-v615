import { Tree } from './vendor/ez-tree/tree.js';

/** Runtime-only lifecycle for already constructed C7 geometry.
 * Authoring uses the original Tree unless explicitly opted in. GPU attributes,
 * materials and options remain available for rendering and context recovery.
 */
export class RuntimeTree extends Tree {
  releaseConstructionData() {
    this.branches = null;
    this.leaves = null;
    this.skeleton = null;
    return this;
  }

  get vertexCount() {
    if (this.branches && this.leaves) return super.vertexCount;
    return [this.branchesMesh, this.leavesMesh].reduce(
      (sum, mesh) => sum + (mesh.geometry.getAttribute('position')?.count ?? 0), 0);
  }

  get triangleCount() {
    if (this.branches && this.leaves) return super.triangleCount;
    return [this.branchesMesh, this.leavesMesh].reduce(
      (sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3, 0);
  }

  // Rebuilding from discarded arrays cannot reproduce a previously deformed
  // runtime mesh. Require an explicit new generation; do not dispose live data
  // before reporting the unsupported operation. generate()/generateLODs()
  // create fresh buffers first, and createGeometry() regenerates its skeleton.
  createBranchesGeometry() {
    if (!this.branches) throw new Error('Tree source data released; call generate() or generateLODs() before rebuilding branches.');
    return super.createBranchesGeometry();
  }

  createLeavesGeometry() {
    if (!this.leaves) throw new Error('Tree source data released; call generate() or generateLODs() before rebuilding leaves.');
    return super.createLeavesGeometry();
  }
}
