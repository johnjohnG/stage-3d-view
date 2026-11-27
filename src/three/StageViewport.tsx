import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  CameraPreset,
  DimensionLine,
  HoverPreviewState,
  SnapKind,
  SnapMode,
  StageDimensions,
  StageMarker,
  ToolMode,
  Vec3Tuple,
  ViewMode,
  WireRun,
} from '../types/stage';
import {
  calculateDistanceFeet,
  calculatePolylineFeet,
  formatFeetInches,
} from '../utils/imperial';
import {
  buildStageDimensionDescriptors,
  buildTwoTierStage,
  createStageTextures,
  disposeGroupResources,
  extractStageSnapData,
  type StageSnapData,
  type StageTextures,
} from './stageGeometry';

interface StageViewportProps {
  dimensions: StageDimensions;
  wires: WireRun[];
  measures: DimensionLine[];
  markers: StageMarker[];
  toolMode: ToolMode;
  snapMode: SnapMode;
  activeColor: string;
  viewMode: ViewMode;
  showStageDims: boolean;
  showFloorGrid: boolean;
  selectedItemId: string | null;
  draftPoints: Vec3Tuple[];
  measureStart: Vec3Tuple | null;
  circleStart: Vec3Tuple | null;
  cameraRequest: { preset: CameraPreset; seq: number } | null;
  onAddDraftPoint: (pt: Vec3Tuple) => void;
  onCommitWire: () => void;
  onSetMeasureStart: (pt: Vec3Tuple | null) => void;
  onCommitMeasure: (start: Vec3Tuple, end: Vec3Tuple) => void;
  onSetCircleStart: (pt: Vec3Tuple | null) => void;
  onCommitCircle: (center: Vec3Tuple, radiusFt: number) => void;
  onSelectItem: (id: string | null) => void;
  onUpdateWirePoints: (id: string, points: Vec3Tuple[]) => void;
}

interface LabelDescriptor {
  id: string;
  kind: 'stage-dim' | 'custom-dim' | 'wire' | 'marker';
  text: string;
  color: string;
  worldPos: THREE.Vector3;
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _lineTest = new THREE.Line3();
const _closestPt = new THREE.Vector3();

function createSegmentCylinder(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh | null {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 0.002) return null;

  _mid.addVectors(a, b).multiplyScalar(0.5);
  _dir.normalize();
  _quat.setFromUnitVectors(UP_AXIS, _dir);

  const geo = new THREE.CylinderGeometry(radius, radius, len, 10, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(_mid);
  mesh.quaternion.copy(_quat);
  return mesh;
}

export const StageViewport: React.FC<StageViewportProps> = ({
  dimensions,
  wires,
  measures,
  markers,
  toolMode,
  snapMode,
  activeColor,
  viewMode,
  showStageDims,
  showFloorGrid,
  selectedItemId,
  draftPoints,
  measureStart,
  circleStart,
  cameraRequest,
  onAddDraftPoint,
  onCommitWire,
  onSetMeasureStart,
  onCommitMeasure,
  onSetCircleStart,
  onCommitCircle,
  onSelectItem,
  onUpdateWirePoints,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelContainerRef = useRef<HTMLDivElement | null>(null);
  const labelNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const cursorBadgeRef = useRef<HTMLDivElement | null>(null);

  const [webglError, setWebglError] = useState<string | null>(null);

  // Latest props stored in refs so the single WebGL lifecycle never tears down on state changes
  const propsRef = useRef({
    dimensions,
    wires,
    measures,
    markers,
    toolMode,
    snapMode,
    activeColor,
    viewMode,
    showStageDims,
    showFloorGrid,
    selectedItemId,
    draftPoints,
    measureStart,
    circleStart,
    onAddDraftPoint,
    onCommitWire,
    onSetMeasureStart,
    onCommitMeasure,
    onSetCircleStart,
    onCommitCircle,
    onSelectItem,
    onUpdateWirePoints,
  });
  propsRef.current = {
    dimensions,
    wires,
    measures,
    markers,
    toolMode,
    snapMode,
    activeColor,
    viewMode,
    showStageDims,
    showFloorGrid,
    selectedItemId,
    draftPoints,
    measureStart,
    circleStart,
    onAddDraftPoint,
    onCommitWire,
    onSetMeasureStart,
    onCommitMeasure,
    onSetCircleStart,
    onCommitCircle,
    onSelectItem,
    onUpdateWirePoints,
  };

  // Internal imperative Three.js handles exposed to reactive effect hooks
  const engineRef = useRef<{
    requestRender: () => void;
    rebuildStage: () => void;
    rebuildLines: () => void;
    rebuildPreview: () => void;
    applyCameraPreset: (preset: CameraPreset) => void;
    updateFloorVisibility: () => void;
    hoverState: HoverPreviewState | null;
  } | null>(null);

  // Mount Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL probe
    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param) ?? '');
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL rendering is unavailable in this browser context.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('3D graphics context was lost. Reload or restore GPU access.');
    };
    const handleContextRestored = () => {
      setWebglError(null);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // 2. Scene, Fog & Environment IBL
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x0e1217);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0x0e1217, 0.0085);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // 3. Camera & OrbitControls
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.25, 400);
    camera.position.set(18, 15, 28);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // prevent going under floor
    controls.minDistance = 4;
    controls.maxDistance = 120;
    controls.target.set(0, 2, 0);
    controls.update();

    // 4. Three-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.85);
    keyLight.position.set(22, 34, 24);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 100;
    keyLight.shadow.camera.left = -26;
    keyLight.shadow.camera.right = 26;
    keyLight.shadow.camera.top = 26;
    keyLight.shadow.camera.bottom = -26;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.75);
    rimLight.position.set(-24, 18, -26);
    scene.add(rimLight);

    // 5. Procedural Textures & Studio Floor
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures: StageTextures = createStageTextures(maxAniso);

    const floorPlaneGeo = new THREE.PlaneGeometry(90, 90);
    floorPlaneGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x11161d,
      roughness: 0.92,
      metalness: 0.04,
    });
    const floorMesh = new THREE.Mesh(floorPlaneGeo, floorMat);
    floorMesh.receiveShadow = true;
    floorMesh.userData.surfaceName = 'floor';
    scene.add(floorMesh);

    const floorGridGeo = new THREE.PlaneGeometry(90, 90);
    floorGridGeo.rotateX(-Math.PI / 2);
    const floorGridMat = new THREE.MeshBasicMaterial({
      map: textures.floorGridMap,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const floorGridMesh = new THREE.Mesh(floorGridGeo, floorGridMat);
    floorGridMesh.position.y = 0.002;
    scene.add(floorGridMesh);

    // 6. Scene Groups
    const stageGroup = new THREE.Group();
    const stageDimsGroup = new THREE.Group();
    const wiresGroup = new THREE.Group();
    const measuresGroup = new THREE.Group();
    const markersGroup = new THREE.Group();
    const previewGroup = new THREE.Group();
    const reticleGroup = new THREE.Group();
    reticleGroup.visible = false;

    scene.add(stageGroup);
    scene.add(stageDimsGroup);
    scene.add(wiresGroup);
    scene.add(measuresGroup);
    scene.add(markersGroup);
    scene.add(previewGroup);
    scene.add(reticleGroup);

    // Build reusable snap reticle (ring + center dot)
    const reticleRingGeo = new THREE.RingGeometry(0.14, 0.22, 24);
    reticleRingGeo.rotateX(-Math.PI / 2);
    const reticleRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const reticleRing = new THREE.Mesh(reticleRingGeo, reticleRingMat);
    reticleRing.renderOrder = 20;

    const reticleDotGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const reticleDotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
    });
    const reticleDot = new THREE.Mesh(reticleDotGeo, reticleDotMat);
    reticleDot.renderOrder = 21;

    reticleGroup.add(reticleRing);
    reticleGroup.add(reticleDot);

    // Raycast & Label state
    const stageRaycastTargets: THREE.Object3D[] = [];
    const clickableLineObjects: THREE.Object3D[] = [];
    const selectedWireMeshes: THREE.Object3D[] = [];
    let snapData: StageSnapData = extractStageSnapData(propsRef.current.dimensions);
    let labelDescriptors: LabelDescriptor[] = [];
    let hoverState: HoverPreviewState | null = null;
    let lastPointerPx: { x: number; y: number } | null = null;

    type WireDragState =
      | {
          kind: 'wire';
          wireId: string;
          startPoint: Vec3Tuple;
          originalPoints: Vec3Tuple[];
          latestPoints: Vec3Tuple[];
        }
      | {
          kind: 'vertex';
          wireId: string;
          vertexIndex: number;
          originalPoints: Vec3Tuple[];
          latestPoints: Vec3Tuple[];
        };
    let dragState: WireDragState | null = null;
    let orbitHoverCursor: 'grab' | 'pointer' | 'move' | 'grabbing' = 'grab';

    // Smooth camera transition state
    let camTransition: {
      active: boolean;
      targetPos: THREE.Vector3;
      targetLook: THREE.Vector3;
      lastTime: number;
    } = {
      active: false,
      targetPos: new THREE.Vector3(),
      targetLook: new THREE.Vector3(),
      lastTime: 0,
    };

    // On-demand coalesced rendering + software WebGL fence pacing
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function updateProjectedDomLabels() {
      const w = renderer.domElement.clientWidth || 1;
      const h = renderer.domElement.clientHeight || 1;
      const showStageDimsNow = propsRef.current.showStageDims;

      // Sync descriptor DOM elements cleanly
      const activeIds = new Set<string>();

      for (const desc of labelDescriptors) {
        if (desc.kind === 'stage-dim' && !showStageDimsNow) continue;
        activeIds.add(desc.id);

        let el = labelNodesRef.current.get(desc.id);
        if (!el && labelContainerRef.current) {
          el = document.createElement('div');
          el.className =
            'absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[11px] font-mono-tabular whitespace-nowrap border pointer-events-none transition-opacity duration-75';
          labelContainerRef.current.appendChild(el);
          labelNodesRef.current.set(desc.id, el);
        }
        if (!el) continue;

        _proj.copy(desc.worldPos).project(camera);
        const inFront = _proj.z >= -1 && _proj.z <= 1;
        const sx = ((_proj.x + 1) / 2) * w;
        const sy = ((-_proj.y + 1) / 2) * h;

        if (!inFront || sx < -40 || sx > w + 40 || sy < -30 || sy > h + 30) {
          el.style.opacity = '0';
          continue;
        }

        el.style.opacity = '1';
        el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        el.textContent = desc.text;

        if (desc.kind === 'stage-dim') {
          el.style.backgroundColor = 'rgba(15, 20, 27, 0.88)';
          el.style.borderColor = 'rgba(148, 163, 184, 0.25)';
          el.style.color = '#cbd5e1';
        } else {
          el.style.backgroundColor = 'rgba(12, 16, 22, 0.92)';
          el.style.borderColor = desc.color;
          el.style.color = '#f8fafc';
        }
      }

      // Remove stale DOM tags
      for (const [id, el] of labelNodesRef.current.entries()) {
        if (!activeIds.has(id)) {
          el.remove();
          labelNodesRef.current.delete(id);
        }
      }

      // Live cursor badge when drawing/measuring/marking or moving a wire
      const badge = cursorBadgeRef.current;
      if (badge) {
        const mode = propsRef.current.toolMode;
        if (dragState && hoverState && lastPointerPx) {
          const snapLabel =
            hoverState.snapKind === 'corner'
              ? 'Corner'
              : hoverState.snapKind === 'edge'
                ? 'Edge'
                : hoverState.snapKind === 'grid'
                  ? '6" Grid'
                  : 'Surface';
          const len = calculatePolylineFeet(dragState.latestPoints);
          const actionLabel = dragState.kind === 'vertex' ? 'Move Joint' : 'Move Wire';
          badge.textContent = `${actionLabel} (${snapLabel}) · Total ${formatFeetInches(len)}`;
          badge.style.opacity = '1';
          badge.style.transform = `translate3d(${(lastPointerPx.x + 14).toFixed(0)}px, ${(lastPointerPx.y - 28).toFixed(0)}px, 0)`;
        } else if ((mode === 'wire' || mode === 'measure' || mode === 'circle') && hoverState && lastPointerPx) {
          const snapLabel =
            hoverState.snapKind === 'corner'
              ? 'Corner'
              : hoverState.snapKind === 'edge'
                ? 'Edge'
                : hoverState.snapKind === 'grid'
                  ? '6" Grid'
                  : 'Surface';

          let readout = snapLabel;
          if (mode === 'wire' && hoverState.segmentFeet !== null && hoverState.totalFeet !== null) {
            readout = `${snapLabel} · +${formatFeetInches(hoverState.segmentFeet)} (Total ${formatFeetInches(hoverState.totalFeet)})`;
          } else if (mode === 'measure' && hoverState.segmentFeet !== null) {
            readout = `${snapLabel} · ${formatFeetInches(hoverState.segmentFeet)}`;
          } else if (mode === 'circle' && hoverState.segmentFeet !== null) {
            readout = `${snapLabel} · R: ${formatFeetInches(hoverState.segmentFeet)} (Ø ${formatFeetInches(hoverState.segmentFeet * 2)})`;
          } else if (mode === 'wire') {
            readout = `${snapLabel} · Click start point`;
          } else if (mode === 'measure') {
            readout = `${snapLabel} · Click Point A`;
          } else if (mode === 'circle') {
            readout = `${snapLabel} · Click circle center`;
          }

          badge.textContent = readout;
          badge.style.opacity = '1';
          badge.style.transform = `translate3d(${(lastPointerPx.x + 14).toFixed(0)}px, ${(lastPointerPx.y - 28).toFixed(0)}px, 0)`;
        } else {
          badge.style.opacity = '0';
        }
      }
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        renderDirty = false;

        let needsMoreFrames = false;

        if (camTransition.active) {
          const dt = Math.min(0.05, Math.max(0.001, (now - camTransition.lastTime) / 1000));
          camTransition.lastTime = now;
          const lambda = 9;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, camTransition.targetPos.x, lambda, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, camTransition.targetPos.y, lambda, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, camTransition.targetPos.z, lambda, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, camTransition.targetLook.x, lambda, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, camTransition.targetLook.y, lambda, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, camTransition.targetLook.z, lambda, dt);

          const posDist = camera.position.distanceTo(camTransition.targetPos);
          const lookDist = controls.target.distanceTo(camTransition.targetLook);
          if (posDist < 0.03 && lookDist < 0.03) {
            camera.position.copy(camTransition.targetPos);
            controls.target.copy(camTransition.targetLook);
            camTransition.active = false;
          } else {
            needsMoreFrames = true;
          }
        }

        const dampingActive = controls.update();
        if (dampingActive && controls.enableDamping && !isSoftwareGl) {
          // OrbitControls damping returns true while settling
        }

        renderer.render(scene, camera);
        updateProjectedDomLabels();

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsMoreFrames) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    // Cancel camera transitions immediately on manual orbit start
    controls.addEventListener('start', () => {
      camTransition.active = false;
    });
    controls.addEventListener('change', () => {
      requestRender();
    });

    function rebuildStage() {
      const { dimensions: dims, viewMode: vMode } = propsRef.current;
      buildTwoTierStage(stageGroup, dims, textures, vMode, stageRaycastTargets);
      snapData = extractStageSnapData(dims);
      rebuildStageDimensionGraphics();
      rebuildLabelDescriptors();
      requestRender();
    }

    function rebuildStageDimensionGraphics() {
      disposeGroupResources(stageDimsGroup, textures);
      const { dimensions: dims, showStageDims: visible } = propsRef.current;
      stageDimsGroup.visible = visible;
      if (!visible) return;

      const descs = buildStageDimensionDescriptors(dims);
      const dimMat = new THREE.LineBasicMaterial({
        color: 0x64748b,
        transparent: true,
        opacity: 0.78,
      });

      const pts: number[] = [];
      for (const d of descs) {
        pts.push(...d.start, ...d.end);
        // End ticks
        pts.push(
          d.start[0] - d.tickDir[0],
          d.start[1] - d.tickDir[1],
          d.start[2] - d.tickDir[2],
          d.start[0] + d.tickDir[0],
          d.start[1] + d.tickDir[1],
          d.start[2] + d.tickDir[2],
        );
        pts.push(
          d.end[0] - d.tickDir[0],
          d.end[1] - d.tickDir[1],
          d.end[2] - d.tickDir[2],
          d.end[0] + d.tickDir[0],
          d.end[1] + d.tickDir[1],
          d.end[2] + d.tickDir[2],
        );
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lines = new THREE.LineSegments(geo, dimMat);
      stageDimsGroup.add(lines);
    }

    function rebuildLines() {
      disposeGroupResources(wiresGroup, textures);
      disposeGroupResources(measuresGroup, textures);
      disposeGroupResources(markersGroup, textures);
      clickableLineObjects.length = 0;
      selectedWireMeshes.length = 0;

      const {
        wires: allWires,
        measures: allMeasures,
        markers: allMarkers,
        selectedItemId: selId,
      } = propsRef.current;

      // 1. Render Wire Runs
      for (const wire of allWires) {
        if (!wire.visible || wire.points.length < 2) continue;
        const isSelected = selId === wire.id;
        const wireMat = new THREE.MeshStandardMaterial({
          color: wire.color,
          emissive: wire.color,
          emissiveIntensity: isSelected ? 0.62 : 0.24,
          roughness: 0.35,
          metalness: 0.15,
        });

        const cableRadius = isSelected ? 0.072 : 0.05;
        const jointRadius = isSelected ? 0.095 : 0.068;

        for (let i = 0; i < wire.points.length; i += 1) {
          const p = wire.points[i];
          const isEnd = i === 0 || i === wire.points.length - 1;
          const jointGeo = new THREE.SphereGeometry(isEnd ? jointRadius * 1.25 : jointRadius, 12, 12);
          const jointMesh = new THREE.Mesh(jointGeo, wireMat);
          jointMesh.position.set(p[0], p[1] + 0.035, p[2]);
          jointMesh.castShadow = true;
          jointMesh.userData.itemId = wire.id;
          jointMesh.userData.wireVertexIndex = i;
          wiresGroup.add(jointMesh);
          clickableLineObjects.push(jointMesh);
          if (isSelected) {
            selectedWireMeshes.push(jointMesh);

            // Visual grab ring around each joint when selected
            const haloGeo = new THREE.RingGeometry(jointRadius * 1.55, jointRadius * 2.25, 20);
            haloGeo.rotateX(-Math.PI / 2);
            const haloMat = new THREE.MeshBasicMaterial({
              color: 0xf8fafc,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.9,
              depthTest: false,
            });
            const haloMesh = new THREE.Mesh(haloGeo, haloMat);
            haloMesh.position.set(p[0], p[1] + 0.04, p[2]);
            haloMesh.renderOrder = 12;
            haloMesh.userData.itemId = wire.id;
            haloMesh.userData.wireVertexIndex = i;
            wiresGroup.add(haloMesh);
            clickableLineObjects.push(haloMesh);
            selectedWireMeshes.push(haloMesh);
          }

          if (i > 0) {
            const prev = wire.points[i - 1];
            _vA.set(prev[0], prev[1] + 0.035, prev[2]);
            _vB.set(p[0], p[1] + 0.035, p[2]);
            const seg = createSegmentCylinder(_vA, _vB, cableRadius, wireMat);
            if (seg) {
              seg.castShadow = true;
              seg.userData.itemId = wire.id;
              seg.userData.wireSegmentIndex = i - 1;
              wiresGroup.add(seg);
              clickableLineObjects.push(seg);
              if (isSelected) {
                selectedWireMeshes.push(seg);
              }
            }
          }
        }
      }

      // 2. Render Custom Point-to-Point Dimension Lines
      for (const m of allMeasures) {
        if (!m.visible) continue;
        const isSelected = selId === m.id;
        const mMat = new THREE.MeshBasicMaterial({
          color: m.color,
        });

        _vA.set(m.start[0], m.start[1] + 0.03, m.start[2]);
        _vB.set(m.end[0], m.end[1] + 0.03, m.end[2]);

        const mainBar = createSegmentCylinder(_vA, _vB, isSelected ? 0.032 : 0.022, mMat);
        if (mainBar) {
          mainBar.userData.itemId = m.id;
          measuresGroup.add(mainBar);
          clickableLineObjects.push(mainBar);
        }

        const endGeo = new THREE.SphereGeometry(isSelected ? 0.08 : 0.06, 10, 10);
        const startDot = new THREE.Mesh(endGeo, mMat);
        startDot.position.copy(_vA);
        startDot.userData.itemId = m.id;
        measuresGroup.add(startDot);
        clickableLineObjects.push(startDot);

        const endDot = new THREE.Mesh(endGeo.clone(), mMat);
        endDot.position.copy(_vB);
        endDot.userData.itemId = m.id;
        measuresGroup.add(endDot);
        clickableLineObjects.push(endDot);

        _dir.subVectors(_vB, _vA);
        if (_dir.lengthSq() > 0.0001) {
          _dir.normalize();
          const tickAxis = new THREE.Vector3().crossVectors(_dir, UP_AXIS);
          if (tickAxis.lengthSq() < 0.01) {
            tickAxis.set(1, 0, 0);
          } else {
            tickAxis.normalize();
          }
          const tickHalf = 0.24;
          const t1a = _vA.clone().addScaledVector(tickAxis, -tickHalf);
          const t1b = _vA.clone().addScaledVector(tickAxis, tickHalf);
          const t2a = _vB.clone().addScaledVector(tickAxis, -tickHalf);
          const t2b = _vB.clone().addScaledVector(tickAxis, tickHalf);

          const tick1 = createSegmentCylinder(t1a, t1b, 0.018, mMat);
          const tick2 = createSegmentCylinder(t2a, t2b, 0.018, mMat);
          if (tick1) measuresGroup.add(tick1);
          if (tick2) measuresGroup.add(tick2);
        }
      }

      // 3. Render Stage Circle Markers (Singers / Instruments)
      for (const mk of allMarkers) {
        if (!mk.visible || mk.radiusFt <= 0.05) continue;
        const isSelected = selId === mk.id;
        const markerY = mk.center[1] + 0.025;

        // Translucent inner zone disc
        const fillGeo = new THREE.CircleGeometry(mk.radiusFt, 48);
        fillGeo.rotateX(-Math.PI / 2);
        const fillMat = new THREE.MeshBasicMaterial({
          color: mk.color,
          transparent: true,
          opacity: isSelected ? 0.3 : 0.16,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const fillMesh = new THREE.Mesh(fillGeo, fillMat);
        fillMesh.position.set(mk.center[0], markerY, mk.center[2]);
        fillMesh.userData.itemId = mk.id;
        markersGroup.add(fillMesh);
        clickableLineObjects.push(fillMesh);

        // Crisp outer ring
        const innerR = Math.max(0.05, mk.radiusFt - (isSelected ? 0.12 : 0.08));
        const ringGeo = new THREE.RingGeometry(innerR, mk.radiusFt, 48);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: mk.color,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(mk.center[0], markerY + 0.004, mk.center[2]);
        ringMesh.userData.itemId = mk.id;
        markersGroup.add(ringMesh);
        clickableLineObjects.push(ringMesh);

        // Center pin
        const pinGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14);
        const pinMat = new THREE.MeshBasicMaterial({ color: mk.color });
        const pinMesh = new THREE.Mesh(pinGeo, pinMat);
        pinMesh.position.set(mk.center[0], markerY + 0.025, mk.center[2]);
        pinMesh.userData.itemId = mk.id;
        markersGroup.add(pinMesh);
        clickableLineObjects.push(pinMesh);
      }

      rebuildLabelDescriptors();
      requestRender();
    }

    function rebuildLabelDescriptors() {
      const {
        dimensions: dims,
        wires: allWires,
        measures: allMeasures,
        markers: allMarkers,
      } = propsRef.current;
      const next: LabelDescriptor[] = [];

      // Built-in stage edge dimensions
      for (const sd of buildStageDimensionDescriptors(dims)) {
        next.push({
          id: sd.id,
          kind: 'stage-dim',
          text: sd.label,
          color: '#64748b',
          worldPos: new THREE.Vector3(sd.mid[0], sd.mid[1] + 0.12, sd.mid[2]),
        });
      }

      // Wire run labels (placed at midpoint of path)
      for (const w of allWires) {
        if (!w.visible || w.points.length < 2) continue;
        const midIdx = Math.floor((w.points.length - 1) / 2);
        const a = w.points[midIdx];
        const b = w.points[Math.min(w.points.length - 1, midIdx + 1)];
        next.push({
          id: `lbl-wire-${w.id}`,
          kind: 'wire',
          text: `${w.name}: ${formatFeetInches(w.totalFeet)}`,
          color: w.color,
          worldPos: new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.28, (a[2] + b[2]) / 2),
        });
      }

      // Custom dimension line labels
      for (const m of allMeasures) {
        if (!m.visible) continue;
        const prefix = m.label.trim() ? `${m.label.trim()}: ` : '';
        next.push({
          id: `lbl-measure-${m.id}`,
          kind: 'custom-dim',
          text: `${prefix}${formatFeetInches(m.distanceFeet)}`,
          color: m.color,
          worldPos: new THREE.Vector3(
            (m.start[0] + m.end[0]) / 2,
            (m.start[1] + m.end[1]) / 2 + 0.25,
            (m.start[2] + m.end[2]) / 2,
          ),
        });
      }

      // Stage circle marker labels
      for (const mk of allMarkers) {
        if (!mk.visible) continue;
        const name = mk.label.trim() || 'Marker';
        next.push({
          id: `lbl-marker-${mk.id}`,
          kind: 'marker',
          text: `${name} · Ø ${formatFeetInches(mk.radiusFt * 2)}`,
          color: mk.color,
          worldPos: new THREE.Vector3(mk.center[0], mk.center[1] + 0.26, mk.center[2]),
        });
      }

      labelDescriptors = next;
    }

    function rebuildPreview() {
      disposeGroupResources(previewGroup, textures);
      syncCursorStyle();
      const {
        toolMode: mode,
        activeColor: color,
        draftPoints: pts,
        measureStart: mStart,
        circleStart: cStart,
      } = propsRef.current;

      if (mode !== 'wire' && mode !== 'measure' && mode !== 'circle') {
        if (dragState && hoverState) {
          reticleGroup.visible = true;
          reticleGroup.position.set(hoverState.point[0], hoverState.point[1] + 0.025, hoverState.point[2]);
          reticleRingMat.color.set(
            hoverState.snapKind === 'corner'
              ? '#38bdf8'
              : hoverState.snapKind === 'edge'
                ? '#fbbf24'
                : '#e2e8f0',
          );
        } else {
          reticleGroup.visible = false;
        }
        requestRender();
        return;
      }

      const previewMat = new THREE.MeshBasicMaterial({ color });
      const rubberMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.65,
      });

      if (mode === 'wire') {
        for (let i = 0; i < pts.length; i += 1) {
          const p = pts[i];
          const dotGeo = new THREE.SphereGeometry(0.075, 12, 12);
          const dot = new THREE.Mesh(dotGeo, previewMat);
          dot.position.set(p[0], p[1] + 0.04, p[2]);
          previewGroup.add(dot);

          if (i > 0) {
            const prev = pts[i - 1];
            _vA.set(prev[0], prev[1] + 0.04, prev[2]);
            _vB.set(p[0], p[1] + 0.04, p[2]);
            const seg = createSegmentCylinder(_vA, _vB, 0.045, previewMat);
            if (seg) previewGroup.add(seg);
          }
        }

        if (pts.length > 0 && hoverState) {
          const last = pts[pts.length - 1];
          _vA.set(last[0], last[1] + 0.04, last[2]);
          _vB.set(hoverState.point[0], hoverState.point[1] + 0.04, hoverState.point[2]);
          const rubber = createSegmentCylinder(_vA, _vB, 0.032, rubberMat);
          if (rubber) previewGroup.add(rubber);
        }
      } else if (mode === 'measure' && mStart) {
        const dotGeo = new THREE.SphereGeometry(0.075, 12, 12);
        const dot = new THREE.Mesh(dotGeo, previewMat);
        dot.position.set(mStart[0], mStart[1] + 0.035, mStart[2]);
        previewGroup.add(dot);

        if (hoverState) {
          _vA.set(mStart[0], mStart[1] + 0.035, mStart[2]);
          _vB.set(hoverState.point[0], hoverState.point[1] + 0.035, hoverState.point[2]);
          const rubber = createSegmentCylinder(_vA, _vB, 0.024, rubberMat);
          if (rubber) previewGroup.add(rubber);
        }
      } else if (mode === 'circle' && cStart) {
        const dotGeo = new THREE.SphereGeometry(0.08, 12, 12);
        const dot = new THREE.Mesh(dotGeo, previewMat);
        dot.position.set(cStart[0], cStart[1] + 0.035, cStart[2]);
        previewGroup.add(dot);

        if (hoverState) {
          const r = Math.hypot(hoverState.point[0] - cStart[0], hoverState.point[2] - cStart[2]);
          if (r > 0.08) {
            const fillGeo = new THREE.CircleGeometry(r, 48);
            fillGeo.rotateX(-Math.PI / 2);
            const fillMat = new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: 0.18,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const fillMesh = new THREE.Mesh(fillGeo, fillMat);
            fillMesh.position.set(cStart[0], cStart[1] + 0.025, cStart[2]);
            previewGroup.add(fillMesh);

            const ringGeo = new THREE.RingGeometry(Math.max(0.04, r - 0.08), r, 48);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMesh = new THREE.Mesh(ringGeo, rubberMat);
            ringMesh.position.set(cStart[0], cStart[1] + 0.03, cStart[2]);
            previewGroup.add(ringMesh);

            _vA.set(cStart[0], cStart[1] + 0.035, cStart[2]);
            _vB.set(hoverState.point[0], cStart[1] + 0.035, hoverState.point[2]);
            const radLine = createSegmentCylinder(_vA, _vB, 0.02, rubberMat);
            if (radLine) previewGroup.add(radLine);
          }
        }
      }

      if (hoverState) {
        reticleGroup.visible = true;
        reticleGroup.position.set(hoverState.point[0], hoverState.point[1] + 0.025, hoverState.point[2]);
        reticleRingMat.color.set(
          hoverState.snapKind === 'corner'
            ? '#38bdf8'
            : hoverState.snapKind === 'edge'
              ? '#fbbf24'
              : '#e2e8f0',
        );
      } else {
        reticleGroup.visible = false;
      }

      requestRender();
    }

    function applyCameraPreset(preset: CameraPreset) {
      const dims = propsRef.current.dimensions;
      const span = Math.max(dims.main.widthFt, dims.main.depthFt, 16);
      const centerY = dims.main.heightFt * 0.65;

      camTransition.lastTime = performance.now();
      camTransition.targetLook.set(0, centerY, 0);

      switch (preset) {
        case 'perspective':
          camTransition.targetPos.set(span * 0.78, span * 0.62, span * 1.15);
          break;
        case 'top':
          camTransition.targetLook.set(0, dims.main.heightFt, 0);
          camTransition.targetPos.set(0, span * 1.45, 0.01);
          break;
        case 'front':
          camTransition.targetPos.set(0, centerY + 3.5, span * 1.35);
          break;
        case 'left':
          camTransition.targetPos.set(-span * 1.35, centerY + 4, 0);
          break;
        case 'right':
          camTransition.targetPos.set(span * 1.35, centerY + 4, 0);
          break;
      }

      camTransition.active = true;
      requestRender();
    }

    function updateFloorVisibility() {
      floorGridMesh.visible = propsRef.current.showFloorGrid;
      requestRender();
    }

    // Raycasting & Smart Snapping
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const fallbackPlane = new THREE.Plane(UP_AXIS, 0);
    const fallbackPlaneHit = new THREE.Vector3();

    function computeSnapPoint(
      clientX: number,
      clientY: number,
      ignoreWireId?: string,
      fallbackY?: number,
    ): HoverPreviewState | null {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      const targets = [...stageRaycastTargets, floorMesh];
      const hits = raycaster.intersectObjects(targets, false);

      let rawPt: THREE.Vector3 | null = null;
      if (hits.length > 0) {
        rawPt = hits[0].point.clone();
      } else if (fallbackY !== undefined) {
        fallbackPlane.constant = -fallbackY;
        if (raycaster.ray.intersectPlane(fallbackPlane, fallbackPlaneHit)) {
          rawPt = fallbackPlaneHit.clone();
        }
      }
      if (!rawPt) return null;

      const sMode = propsRef.current.snapMode;

      let snapped = rawPt.clone();
      let snapKind: SnapKind = 'surface';

      if (sMode === 'smart') {
        const camDist = camera.position.distanceTo(rawPt);
        const cornerThreshold = Math.max(0.45, Math.min(1.25, camDist * 0.022));
        const edgeThreshold = cornerThreshold * 0.72;

        // Collect corners + existing wire/measure endpoints
        let bestCornerDist = cornerThreshold;
        let bestCorner: THREE.Vector3 | null = null;

        for (const c of snapData.corners) {
          const d = rawPt.distanceTo(c);
          if (d < bestCornerDist) {
            bestCornerDist = d;
            bestCorner = c;
          }
        }
        for (const w of propsRef.current.wires) {
          if (!w.visible || (ignoreWireId && w.id === ignoreWireId)) continue;
          for (const wp of w.points) {
            _vA.set(wp[0], wp[1], wp[2]);
            const d = rawPt.distanceTo(_vA);
            if (d < bestCornerDist) {
              bestCornerDist = d;
              bestCorner = _vA.clone();
            }
          }
        }
        for (const dp of propsRef.current.draftPoints) {
          _vA.set(dp[0], dp[1], dp[2]);
          const d = rawPt.distanceTo(_vA);
          if (d < bestCornerDist) {
            bestCornerDist = d;
            bestCorner = _vA.clone();
          }
        }
        for (const mk of propsRef.current.markers) {
          if (!mk.visible) continue;
          _vA.set(mk.center[0], mk.center[1], mk.center[2]);
          const d = rawPt.distanceTo(_vA);
          if (d < bestCornerDist) {
            bestCornerDist = d;
            bestCorner = _vA.clone();
          }
        }

        if (bestCorner) {
          snapped.copy(bestCorner);
          snapKind = 'corner';
        } else {
          // Check stage edge segments
          let bestEdgeDist = edgeThreshold;
          let bestEdgePt: THREE.Vector3 | null = null;
          for (const edge of snapData.edges) {
            _lineTest.set(edge.a, edge.b);
            _lineTest.closestPointToPoint(rawPt, true, _closestPt);
            const d = rawPt.distanceTo(_closestPt);
            if (d < bestEdgeDist) {
              bestEdgeDist = d;
              bestEdgePt = _closestPt.clone();
            }
          }
          if (bestEdgePt) {
            snapped.copy(bestEdgePt);
            snapKind = 'edge';
          } else {
            // 6-inch (0.5 ft) grid snap on X & Z
            snapped.x = Math.round(rawPt.x * 2) / 2;
            snapped.z = Math.round(rawPt.z * 2) / 2;
            snapKind = 'grid';
          }
        }
      } else if (sMode === 'grid') {
        snapped.x = Math.round(rawPt.x * 2) / 2;
        snapped.z = Math.round(rawPt.z * 2) / 2;
        snapKind = 'grid';
      }

      const ptTuple: Vec3Tuple = [
        Math.round(snapped.x * 100) / 100,
        Math.round(snapped.y * 100) / 100,
        Math.round(snapped.z * 100) / 100,
      ];

      const mode = propsRef.current.toolMode;
      let segmentFeet: number | null = null;
      let totalFeet: number | null = null;

      if (mode === 'wire' && propsRef.current.draftPoints.length > 0) {
        const pts = propsRef.current.draftPoints;
        const last = pts[pts.length - 1];
        segmentFeet = calculateDistanceFeet(last, ptTuple);
        totalFeet = calculatePolylineFeet([...pts, ptTuple]);
      } else if (mode === 'measure' && propsRef.current.measureStart) {
        segmentFeet = calculateDistanceFeet(propsRef.current.measureStart, ptTuple);
        totalFeet = segmentFeet;
      } else if (mode === 'circle' && propsRef.current.circleStart) {
        const cs = propsRef.current.circleStart;
        segmentFeet = Math.hypot(ptTuple[0] - cs[0], ptTuple[2] - cs[2]);
        totalFeet = segmentFeet * 2;
      }

      return {
        point: ptTuple,
        snapKind,
        segmentFeet,
        totalFeet,
      };
    }

    function computeMovedPoints(state: WireDragState, snap: HoverPreviewState): Vec3Tuple[] {
      if (state.kind === 'vertex') {
        return state.originalPoints.map((pt, idx) => (idx === state.vertexIndex ? snap.point : pt));
      }
      const dx = snap.point[0] - state.startPoint[0];
      const dy = snap.point[1] - state.startPoint[1];
      const dz = snap.point[2] - state.startPoint[2];
      return state.originalPoints.map((pt): Vec3Tuple => [
        Math.round((pt[0] + dx) * 100) / 100,
        Math.max(0, Math.round((pt[1] + dy) * 100) / 100),
        Math.round((pt[2] + dz) * 100) / 100,
      ]);
    }

    function syncCursorStyle() {
      const mode = propsRef.current.toolMode;
      if (mode === 'wire' || mode === 'measure' || mode === 'circle') {
        renderer.domElement.style.cursor = 'crosshair';
      } else if (dragState) {
        renderer.domElement.style.cursor = dragState.kind === 'vertex' ? 'grabbing' : 'move';
      } else {
        renderer.domElement.style.cursor = orbitHoverCursor;
      }
    }

    // Pointer interaction: cleanly distinguish clicks, selected wire drags, and OrbitControls drags
    let downX = 0;
    let downY = 0;
    let downButton = -1;
    let lastMoveCheck = 0;

    const handlePointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downButton = e.button;

      if (propsRef.current.toolMode === 'orbit' && e.button === 0 && selectedWireMeshes.length > 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);
          const hits = raycaster.intersectObjects(selectedWireMeshes, false);
          if (hits.length > 0) {
            const hitObj = hits[0].object;
            const wireId = hitObj.userData.itemId as string | undefined;
            const wire = wireId ? propsRef.current.wires.find((w) => w.id === wireId) : undefined;
            if (wire) {
              const vertexIdx = hitObj.userData.wireVertexIndex as number | undefined;
              const anchorSnap = computeSnapPoint(e.clientX, e.clientY, wire.id, hits[0].point.y);
              if (anchorSnap) {
                const originalPoints = wire.points.map((pt): Vec3Tuple => [pt[0], pt[1], pt[2]]);
                dragState =
                  vertexIdx !== undefined
                    ? {
                        kind: 'vertex',
                        wireId: wire.id,
                        vertexIndex: vertexIdx,
                        originalPoints,
                        latestPoints: originalPoints,
                      }
                    : {
                        kind: 'wire',
                        wireId: wire.id,
                        startPoint: anchorSnap.point,
                        originalPoints,
                        latestPoints: originalPoints,
                      };
                controls.enabled = false;
                hoverState = anchorSnap;
                lastPointerPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                syncCursorStyle();
                rebuildPreview();
              }
            }
          }
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      lastPointerPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      const now = performance.now();
      if (dragState) {
        if (now - lastMoveCheck < 24) return;
        lastMoveCheck = now;

        const fallbackY =
          dragState.kind === 'wire'
            ? dragState.startPoint[1]
            : (dragState.originalPoints[dragState.vertexIndex]?.[1] ?? 0);
        const snap = computeSnapPoint(e.clientX, e.clientY, dragState.wireId, fallbackY);
        if (snap) {
          const nextPts = computeMovedPoints(dragState, snap);
          dragState.latestPoints = nextPts;
          hoverState = snap;
          propsRef.current.onUpdateWirePoints(dragState.wireId, nextPts);
          rebuildPreview();
        }
        return;
      }

      const mode = propsRef.current.toolMode;
      if (mode !== 'wire' && mode !== 'measure' && mode !== 'circle') {
        if (hoverState !== null) {
          hoverState = null;
          rebuildPreview();
        }
        if (now - lastMoveCheck >= 32 && rect.width > 0 && rect.height > 0) {
          lastMoveCheck = now;
          pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);
          const selHits =
            selectedWireMeshes.length > 0 ? raycaster.intersectObjects(selectedWireMeshes, false) : [];
          if (selHits.length > 0) {
            orbitHoverCursor =
              selHits[0].object.userData.wireVertexIndex !== undefined ? 'grab' : 'move';
          } else {
            const hits = raycaster.intersectObjects(clickableLineObjects, false);
            orbitHoverCursor = hits.length > 0 ? 'pointer' : 'grab';
          }
          syncCursorStyle();
        }
        return;
      }

      if (now - lastMoveCheck < 24) return;
      lastMoveCheck = now;

      hoverState = computeSnapPoint(e.clientX, e.clientY);
      syncCursorStyle();
      rebuildPreview();
    };

    const finishWireDrag = (clientX?: number, clientY?: number) => {
      if (!dragState) return;
      if (clientX !== undefined && clientY !== undefined) {
        const fallbackY =
          dragState.kind === 'wire'
            ? dragState.startPoint[1]
            : (dragState.originalPoints[dragState.vertexIndex]?.[1] ?? 0);
        const snap = computeSnapPoint(clientX, clientY, dragState.wireId, fallbackY);
        if (snap) {
          const finalPts = computeMovedPoints(dragState, snap);
          dragState.latestPoints = finalPts;
          propsRef.current.onUpdateWirePoints(dragState.wireId, finalPts);
        }
      }
      dragState = null;
      hoverState = null;
      controls.enabled = true;
      syncCursorStyle();
      rebuildPreview();
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (dragState) {
        finishWireDrag(e.clientX, e.clientY);
        return;
      }

      if (downButton !== 0 || e.button !== 0) return;
      const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moveDist > 5) return; // User was orbiting with mouse drag

      const {
        toolMode: mode,
        measureStart: mStart,
        circleStart: cStart,
        onAddDraftPoint: addDraft,
        onSetMeasureStart: setMStart,
        onCommitMeasure: commitMeasure,
        onSetCircleStart: setCStart,
        onCommitCircle: commitCircle,
        onSelectItem: selectItem,
      } = propsRef.current;

      if (mode === 'orbit') {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects(clickableLineObjects, false);
        if (hits.length > 0 && hits[0].object.userData.itemId) {
          selectItem(hits[0].object.userData.itemId as string);
        } else {
          selectItem(null);
        }
        return;
      }

      const snap = computeSnapPoint(e.clientX, e.clientY);
      if (!snap) return;
      hoverState = snap;

      if (mode === 'wire') {
        addDraft(snap.point);
      } else if (mode === 'measure') {
        if (!mStart) {
          setMStart(snap.point);
        } else {
          if (calculateDistanceFeet(mStart, snap.point) > 0.05) {
            commitMeasure(mStart, snap.point);
          } else {
            setMStart(null);
          }
        }
      } else if (mode === 'circle') {
        if (!cStart) {
          setCStart(snap.point);
        } else {
          const radiusFt = Math.hypot(snap.point[0] - cStart[0], snap.point[2] - cStart[2]);
          commitCircle(cStart, Math.max(0.5, Math.round(radiusFt * 4) / 4));
        }
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      if (dragState) {
        finishWireDrag(e.clientX, e.clientY);
      }
    };

    const handleWindowPointerCancel = () => {
      if (dragState) {
        finishWireDrag();
      }
    };

    const handleDoubleClick = () => {
      if (propsRef.current.toolMode === 'wire' && propsRef.current.draftPoints.length >= 2) {
        propsRef.current.onCommitWire();
      }
    };

    const handlePointerLeave = () => {
      if (dragState) return;
      hoverState = null;
      lastPointerPx = null;
      orbitHoverCursor = 'grab';
      syncCursorStyle();
      rebuildPreview();
    };

    // Capture phase on pointerdown so we can disable OrbitControls before it handles the down event
    renderer.domElement.addEventListener('pointerdown', handlePointerDown, { capture: true });
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    const handleResize = () => {
      const rw = container.clientWidth || window.innerWidth;
      const rh = container.clientHeight || window.innerHeight;
      if (rw <= 0 || rh <= 0) return;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
      requestRender();
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    engineRef.current = {
      requestRender,
      rebuildStage,
      rebuildLines,
      rebuildPreview,
      applyCameraPreset,
      updateFloorVisibility,
      hoverState,
    };

    // Initial build & pre-warm shaders on GPU
    rebuildStage();
    rebuildLines();
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);

      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      controls.dispose();
      disposeGroupResources(stageGroup, textures);
      disposeGroupResources(stageDimsGroup, textures);
      disposeGroupResources(wiresGroup, textures);
      disposeGroupResources(measuresGroup, textures);
      disposeGroupResources(markersGroup, textures);
      disposeGroupResources(previewGroup, textures);
      disposeGroupResources(reticleGroup, textures);

      floorPlaneGeo.dispose();
      floorMat.dispose();
      floorGridGeo.dispose();
      floorGridMat.dispose();
      textures.deckMap.dispose();
      textures.floorGridMap.dispose();
      textures.contactShadowMap.dispose();
      envTex.dispose();

      for (const el of labelNodesRef.current.values()) {
        el.remove();
      }
      labelNodesRef.current.clear();

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      engineRef.current = null;
    };
  }, []);

  // Reactive updates without resetting WebGL or camera
  useEffect(() => {
    engineRef.current?.rebuildStage();
  }, [dimensions, viewMode, showStageDims]);

  useEffect(() => {
    engineRef.current?.rebuildLines();
  }, [wires, measures, markers, selectedItemId]);

  useEffect(() => {
    engineRef.current?.rebuildPreview();
  }, [toolMode, activeColor, draftPoints, measureStart, circleStart]);

  useEffect(() => {
    engineRef.current?.updateFloorVisibility();
  }, [showFloorGrid]);

  useEffect(() => {
    if (cameraRequest) {
      engineRef.current?.applyCameraPreset(cameraRequest.preset);
    }
  }, [cameraRequest]);

  const cursorClass =
    toolMode === 'wire' || toolMode === 'measure' || toolMode === 'circle'
      ? 'cursor-crosshair'
      : 'cursor-grab active:cursor-grabbing';

  return (
    <div className={`relative w-full h-full overflow-hidden bg-[#0e1217] ${cursorClass}`}>
      {/* Dedicated WebGL Mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Projected 2D-over-3D Imperial Labels Layer */}
      <div ref={labelContainerRef} className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        <div
          ref={cursorBadgeRef}
          className="absolute top-0 left-0 px-2 py-1 rounded bg-[#0c1016]/95 border border-sky-400/50 text-[11px] font-mono-tabular text-slate-100 whitespace-nowrap opacity-0 pointer-events-none"
        />
      </div>

      {/* Graceful Fallback if WebGL unavailable */}
      {webglError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0e1217] p-6">
          <div className="max-w-md rounded-lg border border-slate-700/80 bg-[#151a22] p-6 text-center">
            <h2 className="text-base font-semibold text-slate-100">3D Viewport Unavailable</h2>
            <p className="mt-2 text-sm text-slate-400">{webglError}</p>
          </div>
        </div>
      )}
    </div>
  );
};
