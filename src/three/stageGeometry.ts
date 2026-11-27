import * as THREE from 'three';
import type { StageDimensions, Vec3Tuple, ViewMode } from '../types/stage';
import { formatFeetInches } from '../utils/imperial';

export interface StageSnapData {
  corners: THREE.Vector3[];
  edges: Array<{ a: THREE.Vector3; b: THREE.Vector3 }>;
  riserCenterZ: number;
}

export interface BuiltInStageDimension {
  id: string;
  label: string;
  start: Vec3Tuple;
  end: Vec3Tuple;
  mid: Vec3Tuple;
  tickDir: Vec3Tuple;
}

export interface StageTextures {
  deckMap: THREE.CanvasTexture;
  floorGridMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
}

/**
 * Generates procedural textures for the stage deck (4'x4' stage-ply/Marley seams),
 * the 1-foot Imperial studio floor grid, and the soft grounding contact shadow.
 */
export function createStageTextures(maxAnisotropy: number): StageTextures {
  const deckCanvas = document.createElement('canvas');
  deckCanvas.width = 512;
  deckCanvas.height = 512;
  const dCtx = deckCanvas.getContext('2d')!;

  dCtx.fillStyle = '#20262f';
  dCtx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 3600; i += 1) {
    const x = (i * 73) % 512;
    const y = (i * 137) % 512;
    const alpha = (i % 5) * 0.008;
    dCtx.fillStyle = i % 2 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.4})`;
    dCtx.fillRect(x, y, 2, 2);
  }

  dCtx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  dCtx.lineWidth = 1;
  for (let g = 128; g < 512; g += 128) {
    dCtx.beginPath();
    dCtx.moveTo(g, 0);
    dCtx.lineTo(g, 512);
    dCtx.stroke();
    dCtx.beginPath();
    dCtx.moveTo(0, g);
    dCtx.lineTo(512, g);
    dCtx.stroke();
  }

  dCtx.strokeStyle = 'rgba(9, 12, 16, 0.72)';
  dCtx.lineWidth = 4;
  dCtx.strokeRect(0, 0, 512, 512);

  dCtx.fillStyle = 'rgba(148, 163, 184, 0.14)';
  const inset = 16;
  [
    [inset, inset],
    [512 - inset, inset],
    [inset, 512 - inset],
    [512 - inset, 512 - inset],
  ].forEach(([cx, cy]) => {
    dCtx.beginPath();
    dCtx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    dCtx.fill();
  });

  const deckMap = new THREE.CanvasTexture(deckCanvas);
  deckMap.colorSpace = THREE.SRGBColorSpace;
  deckMap.wrapS = THREE.RepeatWrapping;
  deckMap.wrapT = THREE.RepeatWrapping;
  deckMap.repeat.set(0.25, 0.25); // ExtrudeGeometry WorldUVs are in feet -> 4 ft per tile
  deckMap.anisotropy = maxAnisotropy;

  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = 512;
  gridCanvas.height = 512;
  const gCtx = gridCanvas.getContext('2d')!;
  gCtx.clearRect(0, 0, 512, 512);

  gCtx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  gCtx.lineWidth = 1;
  for (let step = 128; step < 512; step += 128) {
    if (step === 256) continue;
    gCtx.beginPath();
    gCtx.moveTo(step, 0);
    gCtx.lineTo(step, 512);
    gCtx.stroke();
    gCtx.beginPath();
    gCtx.moveTo(0, step);
    gCtx.lineTo(512, step);
    gCtx.stroke();
  }

  gCtx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  gCtx.lineWidth = 1.5;
  gCtx.beginPath();
  gCtx.moveTo(256, 0);
  gCtx.lineTo(256, 512);
  gCtx.moveTo(0, 256);
  gCtx.lineTo(512, 256);
  gCtx.stroke();

  gCtx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
  gCtx.lineWidth = 2;
  gCtx.strokeRect(0, 0, 512, 512);

  const floorGridMap = new THREE.CanvasTexture(gridCanvas);
  floorGridMap.colorSpace = THREE.SRGBColorSpace;
  floorGridMap.wrapS = THREE.RepeatWrapping;
  floorGridMap.wrapT = THREE.RepeatWrapping;
  floorGridMap.repeat.set(45, 45);
  floorGridMap.anisotropy = maxAnisotropy;

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(128, 128, 24, 128, 128, 126);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.24)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 256, 256);

  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;

  return { deckMap, floorGridMap, contactShadowMap };
}

export function getRiserCenterZ(dims: StageDimensions): number {
  const mainBackZ = -dims.main.depthFt / 2;
  return mainBackZ + dims.riser.backOffsetFt + dims.riser.depthFt / 2;
}

/**
 * Computes the 6-sided chamfered polygon (x, z) footprint for any stage tier.
 */
export function getChamferedPolygonXZ(
  widthFt: number,
  frontWidthFt: number,
  depthFt: number,
  sideDepthFt: number,
  centerZ: number,
): Array<[number, number]> {
  const halfBackW = widthFt / 2;
  const safeFrontW = Math.min(frontWidthFt, widthFt);
  const halfFrontW = Math.max(0.5, safeFrontW / 2);
  const halfD = depthFt / 2;
  const zBack = centerZ - halfD;
  const zFront = centerZ + halfD;
  const safeSideD = Math.min(Math.max(0.1, sideDepthFt), depthFt - 0.1);
  const zChamfer = zBack + safeSideD;

  return [
    [-halfBackW, zBack],
    [halfBackW, zBack],
    [halfBackW, zChamfer],
    [halfFrontW, zFront],
    [-halfFrontW, zFront],
    [-halfBackW, zChamfer],
  ];
}

export function getMainStagePolygonXZ(dims: StageDimensions): Array<[number, number]> {
  return getChamferedPolygonXZ(
    dims.main.widthFt,
    dims.main.frontWidthFt,
    dims.main.depthFt,
    dims.main.sideDepthFt,
    0,
  );
}

export function getRiserPolygonXZ(dims: StageDimensions): Array<[number, number]> {
  return getChamferedPolygonXZ(
    dims.riser.widthFt,
    dims.riser.frontWidthFt,
    dims.riser.depthFt,
    dims.riser.sideDepthFt,
    getRiserCenterZ(dims),
  );
}

function insetPolygonXZ(poly: Array<[number, number]>, inset: number): Array<[number, number]> {
  const n = poly.length;
  const result: Array<[number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const prev = poly[(i - 1 + n) % n];
    const curr = poly[i];
    const next = poly[(i + 1) % n];

    const e1x = curr[0] - prev[0];
    const e1z = curr[1] - prev[1];
    const l1 = Math.hypot(e1x, e1z) || 1;
    const n1x = -e1z / l1;
    const n1z = e1x / l1;

    const e2x = next[0] - curr[0];
    const e2z = next[1] - curr[1];
    const l2 = Math.hypot(e2x, e2z) || 1;
    const n2x = -e2z / l2;
    const n2z = e2x / l2;

    const avgX = n1x + n2x;
    const avgZ = n1z + n2z;
    const avgLen = Math.hypot(avgX, avgZ) || 1;
    const bx = avgX / avgLen;
    const bz = avgZ / avgLen;
    const dot = Math.max(0.4, bx * n1x + bz * n1z);
    const miter = inset / dot;

    result.push([curr[0] + bx * miter, curr[1] + bz * miter]);
  }
  return result;
}

function createPolygonPrismGeometry(
  polyXZ: Array<[number, number]>,
  height: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(polyXZ[0][0], -polyXZ[0][1]);
  for (let i = 1; i < polyXZ.length; i += 1) {
    shape.lineTo(polyXZ[i][0], -polyXZ[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Extracts all corner vertices and edge segments of both chamfered stage tiers for snapping.
 */
export function extractStageSnapData(dims: StageDimensions): StageSnapData {
  const corners: THREE.Vector3[] = [];
  const edges: Array<{ a: THREE.Vector3; b: THREE.Vector3 }> = [];

  const addPolySnaps = (poly: Array<[number, number]>, baseY: number, topY: number) => {
    const topPts = poly.map(([x, z]) => new THREE.Vector3(x, topY, z));
    const botPts = poly.map(([x, z]) => new THREE.Vector3(x, baseY, z));
    corners.push(...topPts, ...botPts);

    for (let i = 0; i < poly.length; i += 1) {
      const next = (i + 1) % poly.length;
      edges.push({ a: topPts[i], b: topPts[next] });
      edges.push({ a: botPts[i], b: botPts[next] });
      edges.push({ a: botPts[i], b: topPts[i] });
    }
  };

  const mh = dims.main.heightFt;
  addPolySnaps(getMainStagePolygonXZ(dims), 0, mh);
  corners.push(
    new THREE.Vector3(0, mh, dims.main.depthFt / 2),
    new THREE.Vector3(0, mh, -dims.main.depthFt / 2),
    new THREE.Vector3(0, mh, 0),
  );

  const rCenterZ = getRiserCenterZ(dims);
  if (dims.riser.enabled) {
    const rh = mh + dims.riser.heightFt;
    addPolySnaps(getRiserPolygonXZ(dims), mh, rh);
    corners.push(
      new THREE.Vector3(0, rh, rCenterZ + dims.riser.depthFt / 2),
      new THREE.Vector3(0, rh, rCenterZ - dims.riser.depthFt / 2),
      new THREE.Vector3(0, rh, rCenterZ),
    );
  }

  return {
    corners,
    edges,
    riserCenterZ: rCenterZ,
  };
}

/**
 * Builds the built-in stage dimension descriptors for 3D CAD callouts.
 */
export function buildStageDimensionDescriptors(dims: StageDimensions): BuiltInStageDimension[] {
  const halfBackW = dims.main.widthFt / 2;
  const safeFrontW = Math.min(dims.main.frontWidthFt, dims.main.widthFt);
  const halfFrontW = Math.max(0.5, safeFrontW / 2);
  const halfD = dims.main.depthFt / 2;
  const mh = dims.main.heightFt;
  const safeSideD = Math.min(Math.max(0.1, dims.main.sideDepthFt), dims.main.depthFt - 0.1);
  const zChamfer = -halfD + safeSideD;

  const offsetMain = 1.45;

  const list: BuiltInStageDimension[] = [
    {
      id: 'stage-main-back-width',
      label: `Back W: ${formatFeetInches(dims.main.widthFt)}`,
      start: [-halfBackW, 0.04, -halfD - offsetMain],
      end: [halfBackW, 0.04, -halfD - offsetMain],
      mid: [0, 0.04, -halfD - offsetMain],
      tickDir: [0, 0, 0.35],
    },
    {
      id: 'stage-main-front-width',
      label: `Front W: ${formatFeetInches(safeFrontW)}`,
      start: [-halfFrontW, 0.04, halfD + offsetMain],
      end: [halfFrontW, 0.04, halfD + offsetMain],
      mid: [0, 0.04, halfD + offsetMain],
      tickDir: [0, 0, -0.35],
    },
    {
      id: 'stage-main-depth',
      label: `Total D: ${formatFeetInches(dims.main.depthFt)}`,
      start: [halfBackW + offsetMain, 0.04, -halfD],
      end: [halfBackW + offsetMain, 0.04, halfD],
      mid: [halfBackW + offsetMain, 0.04, 0],
      tickDir: [-0.35, 0, 0],
    },
    {
      id: 'stage-main-side-depth',
      label: `Side D: ${formatFeetInches(safeSideD)}`,
      start: [-halfBackW - offsetMain, 0.04, -halfD],
      end: [-halfBackW - offsetMain, 0.04, zChamfer],
      mid: [-halfBackW - offsetMain, 0.04, (-halfD + zChamfer) / 2],
      tickDir: [0.35, 0, 0],
    },
    {
      id: 'stage-main-height',
      label: `Main H: ${formatFeetInches(mh)}`,
      start: [-halfFrontW - 0.65, 0, halfD],
      end: [-halfFrontW - 0.65, mh, halfD],
      mid: [-halfFrontW - 0.65, mh / 2, halfD],
      tickDir: [0.3, 0, 0],
    },
  ];

  if (dims.riser.enabled) {
    const rw = dims.riser.widthFt / 2;
    const rSafeFrontW = Math.min(dims.riser.frontWidthFt, dims.riser.widthFt);
    const rHalfFrontW = Math.max(0.5, rSafeFrontW / 2);
    const rd = dims.riser.depthFt / 2;
    const rCenterZ = getRiserCenterZ(dims);
    const rMinZ = rCenterZ - rd;
    const rMaxZ = rCenterZ + rd;
    const rh = mh + dims.riser.heightFt;
    const offsetRiser = 0.85;

    list.push(
      {
        id: 'stage-riser-back-width',
        label: `Riser Back W: ${formatFeetInches(dims.riser.widthFt)}`,
        start: [-rw, rh + 0.03, rMinZ - offsetRiser],
        end: [rw, rh + 0.03, rMinZ - offsetRiser],
        mid: [0, rh + 0.03, rMinZ - offsetRiser],
        tickDir: [0, 0, 0.3],
      },
      {
        id: 'stage-riser-front-width',
        label: `Riser Front W: ${formatFeetInches(rSafeFrontW)}`,
        start: [-rHalfFrontW, rh + 0.03, rMaxZ + offsetRiser],
        end: [rHalfFrontW, rh + 0.03, rMaxZ + offsetRiser],
        mid: [0, rh + 0.03, rMaxZ + offsetRiser],
        tickDir: [0, 0, -0.3],
      },
      {
        id: 'stage-riser-depth',
        label: `Riser D: ${formatFeetInches(dims.riser.depthFt)}`,
        start: [rw + offsetRiser, rh + 0.03, rMinZ],
        end: [rw + offsetRiser, rh + 0.03, rMaxZ],
        mid: [rw + offsetRiser, rh + 0.03, rCenterZ],
        tickDir: [-0.3, 0, 0],
      },
      {
        id: 'stage-riser-height',
        label: `Riser H: ${formatFeetInches(dims.riser.heightFt)}`,
        start: [-rHalfFrontW - 0.55, mh, rMaxZ],
        end: [-rHalfFrontW - 0.55, rh, rMaxZ],
        mid: [-rHalfFrontW - 0.55, mh + dims.riser.heightFt / 2, rMaxZ],
        tickDir: [0.28, 0, 0],
      },
    );

    if (Math.abs(dims.riser.backOffsetFt) >= 0.05) {
      list.push({
        id: 'stage-riser-offset',
        label: `Setback: ${formatFeetInches(dims.riser.backOffsetFt)}`,
        start: [-rw, mh + 0.03, -halfD],
        end: [-rw, mh + 0.03, rMinZ],
        mid: [-rw, mh + 0.03, (-halfD + rMinZ) / 2],
        tickDir: [-0.3, 0, 0],
      });
    }
  }

  return list;
}

/**
 * Recursively disposes all geometries and materials inside a Three.js Group.
 */
export function disposeGroupResources(group: THREE.Group, sharedTextures?: StageTextures): void {
  const sharedSet = new Set<THREE.Texture | undefined>(
    sharedTextures
      ? [sharedTextures.deckMap, sharedTextures.floorGridMap, sharedTextures.contactShadowMap]
      : [],
  );

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (!m) return;
        const std = m as THREE.MeshStandardMaterial;
        if (std.map && !sharedSet.has(std.map)) {
          std.map.dispose();
        }
        m.dispose();
      });
    }
  });
  group.clear();
}

/**
 * Builds the composite multi-part chamfered main stage and matching chamfered upper riser.
 */
export function buildTwoTierStage(
  targetGroup: THREE.Group,
  dims: StageDimensions,
  textures: StageTextures,
  viewMode: ViewMode,
  raycastTargets: THREE.Object3D[],
): void {
  disposeGroupResources(targetGroup, textures);
  raycastTargets.length = 0;

  const isBlueprint = viewMode === 'blueprint';

  const mainDeckMat = isBlueprint
    ? new THREE.MeshStandardMaterial({
        color: 0x111923,
        roughness: 0.9,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
    : new THREE.MeshStandardMaterial({
        map: textures.deckMap,
        color: 0xffffff,
        roughness: 0.72,
        metalness: 0.06,
      });

  const riserDeckMat = isBlueprint
    ? new THREE.MeshStandardMaterial({
        color: 0x15202e,
        roughness: 0.9,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
    : new THREE.MeshStandardMaterial({
        map: textures.deckMap,
        color: 0xe2e8f0,
        roughness: 0.68,
        metalness: 0.06,
      });

  const fasciaMat = isBlueprint
    ? new THREE.MeshStandardMaterial({
        color: 0x0d131b,
        roughness: 0.95,
        metalness: 0.02,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x14181f,
        roughness: 0.88,
        metalness: 0.04,
      });

  const trimMat = isBlueprint
    ? new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.6,
        metalness: 0.3,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.28,
        metalness: 0.85,
      });

  const legMat = new THREE.MeshStandardMaterial({
    color: isBlueprint ? 0x263445 : 0x475569,
    roughness: 0.36,
    metalness: 0.76,
  });

  const edgeLineMat = new THREE.LineBasicMaterial({
    color: isBlueprint ? 0x38bdf8 : 0x64748b,
    transparent: true,
    opacity: isBlueprint ? 0.95 : 0.4,
  });

  const buildChamferedTier = (
    name: string,
    polyXZ: Array<[number, number]>,
    baseY: number,
    height: number,
    supportBaseY: number,
    deckMat: THREE.MeshStandardMaterial,
    legRadius: number,
  ) => {
    const tierGroup = new THREE.Group();
    tierGroup.name = name;

    const topY = baseY + height;
    const deckThickness = Math.min(0.24, Math.max(0.1, height * 0.16));

    // a. Deck Slab
    const deckGeo = createPolygonPrismGeometry(polyXZ, deckThickness);
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.y = topY - deckThickness;
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    deckMesh.userData.surfaceName = name;
    tierGroup.add(deckMesh);
    raycastTargets.push(deckMesh);

    // b. Recessed Perimeter Fascia / Skirting
    const skirtHeight = Math.max(0.05, height - deckThickness - 0.06);
    const insetPoly = insetPolygonXZ(polyXZ, 0.08);
    const skirtGeo = createPolygonPrismGeometry(insetPoly, skirtHeight);
    const skirtMesh = new THREE.Mesh(skirtGeo, fasciaMat);
    skirtMesh.position.y = baseY + 0.06;
    skirtMesh.castShadow = true;
    skirtMesh.receiveShadow = true;
    skirtMesh.userData.surfaceName = `${name}-fascia`;
    tierGroup.add(skirtMesh);
    raycastTargets.push(skirtMesh);

    // c. Brushed Aluminum Perimeter Edge Nosing along all 6 edges
    const nosingH = deckThickness + 0.03;
    const nosingT = 0.06;
    for (let i = 0; i < polyXZ.length; i += 1) {
      const a = polyXZ[i];
      const b = polyXZ[(i + 1) % polyXZ.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;

      const nx = dz / len;
      const nz = -dx / len;
      const midX = (a[0] + b[0]) / 2 + nx * (nosingT / 2);
      const midZ = (a[1] + b[1]) / 2 + nz * (nosingT / 2);

      const barGeo = new THREE.BoxGeometry(len + nosingT * 1.4, nosingH, nosingT);
      const barMesh = new THREE.Mesh(barGeo, trimMat);
      barMesh.position.set(midX, topY - nosingH / 2 + 0.004, midZ);
      barMesh.rotation.y = -Math.atan2(dz, dx);
      barMesh.castShadow = true;
      barMesh.receiveShadow = true;
      tierGroup.add(barMesh);
    }

    // d. Steel Support Legs + Leveling Feet
    const legSpanY = topY - deckThickness - supportBaseY;
    if (legSpanY > 0.05) {
      const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legSpanY, 10);
      const footGeo = new THREE.CylinderGeometry(legRadius * 1.75, legRadius * 1.95, 0.05, 12);
      const legPoly = insetPolygonXZ(polyXZ, 0.28);

      const legPoints: Array<[number, number]> = [...legPoly];
      const backSpan = Math.abs(legPoly[1][0] - legPoly[0][0]);
      if (backSpan > 11) {
        legPoints.push([0, legPoly[0][1]]);
        if (backSpan > 20) {
          legPoints.push([legPoly[0][0] * 0.5, legPoly[0][1]], [legPoly[1][0] * 0.5, legPoly[1][1]]);
        }
      }
      const frontSpan = Math.abs(legPoly[3][0] - legPoly[4][0]);
      if (frontSpan > 11) {
        legPoints.push([0, legPoly[3][1]]);
      }

      for (const [lx, lz] of legPoints) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, supportBaseY + legSpanY / 2, lz);
        leg.castShadow = true;
        tierGroup.add(leg);

        const foot = new THREE.Mesh(footGeo, trimMat);
        foot.position.set(lx, supportBaseY + 0.025, lz);
        tierGroup.add(foot);
      }
    }

    // e. Crisp CAD / Blueprint Silhouette Edges
    const silhouetteGeo = createPolygonPrismGeometry(polyXZ, height);
    const edgesGeo = new THREE.EdgesGeometry(silhouetteGeo, 15);
    silhouetteGeo.dispose();
    const edgeSegs = new THREE.LineSegments(edgesGeo, edgeLineMat);
    edgeSegs.position.y = baseY + 0.003;
    tierGroup.add(edgeSegs);

    return tierGroup;
  };

  // 1. Main Stage
  const mainPoly = getMainStagePolygonXZ(dims);
  targetGroup.add(
    buildChamferedTier('main-stage', mainPoly, 0, dims.main.heightFt, 0, mainDeckMat, 0.09),
  );

  // Downstage Center Mark
  const centerMarkGeo = new THREE.BoxGeometry(0.35, 0.015, 0.14);
  const centerMarkMat = new THREE.MeshStandardMaterial({
    color: isBlueprint ? 0x38bdf8 : 0xf59e0b,
    roughness: 0.4,
    metalness: 0.2,
  });
  const centerMark = new THREE.Mesh(centerMarkGeo, centerMarkMat);
  centerMark.position.set(0, dims.main.heightFt + 0.008, dims.main.depthFt / 2 - 0.12);
  targetGroup.add(centerMark);

  // 2. Upper Riser (Matching 6-sided Chamfered Shape!)
  if (dims.riser.enabled) {
    const riserPoly = getRiserPolygonXZ(dims);
    const rCenterZ = getRiserCenterZ(dims);
    const rBackZ = rCenterZ - dims.riser.depthFt / 2;
    const rFrontZ = rCenterZ + dims.riser.depthFt / 2;
    const overlapsMain =
      rBackZ >= -dims.main.depthFt / 2 - 0.05 && rFrontZ <= dims.main.depthFt / 2 + 0.05;
    const supportBaseY = overlapsMain ? dims.main.heightFt : 0;

    targetGroup.add(
      buildChamferedTier(
        'upper-riser',
        riserPoly,
        dims.main.heightFt,
        dims.riser.heightFt,
        supportBaseY,
        riserDeckMat,
        0.075,
      ),
    );
  }

  // Soft Grounding Contact Shadow
  const shadowW = dims.main.widthFt * 1.28;
  const shadowD = dims.main.depthFt * 1.28;
  const contactGeo = new THREE.PlaneGeometry(shadowW, shadowD);
  contactGeo.rotateX(-Math.PI / 2);
  const contactMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadowMap,
    transparent: true,
    depthWrite: false,
    opacity: isBlueprint ? 0.2 : 0.65,
  });
  const contactPlane = new THREE.Mesh(contactGeo, contactMat);
  contactPlane.position.set(0, 0.001, 0);
  targetGroup.add(contactPlane);
}
