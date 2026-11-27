import { useCallback, useEffect, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { StageViewport } from './three/StageViewport';
import type {
  CameraPreset,
  DimensionLine,
  SnapMode,
  StageDimensions,
  StageMarker,
  StagePlannerDocument,
  ToolMode,
  Vec3Tuple,
  ViewMode,
  WireRun,
} from './types/stage';
import {
  calculateDistanceFeet,
  calculatePolylineFeet,
  LINE_COLORS,
} from './utils/imperial';

const STORAGE_KEY = 'stagewire3d_document_v3';

const DEFAULT_DIMENSIONS: StageDimensions = {
  main: {
    widthFt: 26,
    frontWidthFt: 16,
    depthFt: 12,
    sideDepthFt: 7,
    heightFt: 3,
  },
  riser: {
    enabled: true,
    widthFt: 12,
    frontWidthFt: 7.5,
    depthFt: 5,
    sideDepthFt: 3,
    heightFt: 1.5,
    backOffsetFt: 0,
  },
};

function createSampleWires(): WireRun[] {
  const p1: Vec3Tuple[] = [
    [13, 0, -6],
    [13, 3, -6],
    [13, 3, 1],
    [8, 3, 6],
  ];
  const p2: Vec3Tuple[] = [
    [0, 4.5, -3.5],
    [0, 4.5, -1],
    [0, 3, -1],
    [-13, 3, -1],
  ];
  return [
    {
      id: 'wire-sample-1',
      name: 'Stage Left Power',
      color: LINE_COLORS[1].hex, // Amber
      points: p1,
      totalFeet: calculatePolylineFeet(p1),
      visible: true,
    },
    {
      id: 'wire-sample-2',
      name: 'Riser Audio Snake',
      color: LINE_COLORS[2].hex, // Cyan
      points: p2,
      totalFeet: calculatePolylineFeet(p2),
      visible: true,
    },
  ];
}

function createSampleMeasures(): DimensionLine[] {
  const start: Vec3Tuple = [0, 3, -1];
  const end: Vec3Tuple = [0, 3, 6];
  return [
    {
      id: 'dim-sample-1',
      label: 'Downstage Clear',
      color: LINE_COLORS[3].hex, // Emerald
      start,
      end,
      distanceFeet: calculateDistanceFeet(start, end),
      visible: true,
    },
  ];
}

function createSampleMarkers(): StageMarker[] {
  return [
    {
      id: 'marker-sample-1',
      label: 'Lead Vocal',
      color: LINE_COLORS[5].hex, // Violet
      center: [0, 3, 4],
      radiusFt: 1.5,
      visible: true,
    },
    {
      id: 'marker-sample-2',
      label: 'Drum Kit',
      color: LINE_COLORS[0].hex, // Signal Red
      center: [0, 4.5, -3.5],
      radiusFt: 2,
      visible: true,
    },
  ];
}

function loadSavedDocument(): StagePlannerDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StagePlannerDocument;
      if (parsed && parsed.version === 3 && parsed.dimensions?.main && parsed.dimensions?.riser) {
        return {
          version: 3,
          dimensions: parsed.dimensions,
          wires: Array.isArray(parsed.wires) ? parsed.wires : [],
          measures: Array.isArray(parsed.measures) ? parsed.measures : [],
          markers: Array.isArray(parsed.markers) ? parsed.markers : [],
        };
      }
    }
  } catch {
    // Ignore malformed storage and fall back to starter stage
  }
  return {
    version: 3,
    dimensions: DEFAULT_DIMENSIONS,
    wires: createSampleWires(),
    measures: createSampleMeasures(),
    markers: createSampleMarkers(),
  };
}

export default function App() {
  const [initialDoc] = useState<StagePlannerDocument>(() => loadSavedDocument());

  const [dimensions, setDimensions] = useState<StageDimensions>(initialDoc.dimensions);
  const [wires, setWires] = useState<WireRun[]>(initialDoc.wires);
  const [measures, setMeasures] = useState<DimensionLine[]>(initialDoc.measures);
  const [markers, setMarkers] = useState<StageMarker[]>(initialDoc.markers);

  const [toolMode, setToolMode] = useState<ToolMode>('orbit');
  const [snapMode, setSnapMode] = useState<SnapMode>('smart');
  const [activeColor, setActiveColor] = useState<string>(LINE_COLORS[0].hex);
  const [viewMode, setViewMode] = useState<ViewMode>('studio');
  const [showStageDims, setShowStageDims] = useState<boolean>(true);
  const [showFloorGrid, setShowFloorGrid] = useState<boolean>(true);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [defaultMarkerHeightFt, setDefaultMarkerHeightFt] = useState<number>(0);
  const [draftPoints, setDraftPoints] = useState<Vec3Tuple[]>([]);
  const [measureStart, setMeasureStart] = useState<Vec3Tuple | null>(null);
  const [circleStart, setCircleStart] = useState<Vec3Tuple | null>(null);
  const [cameraRequest, setCameraRequest] = useState<{ preset: CameraPreset; seq: number } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  // Auto-save to localStorage
  useEffect(() => {
    try {
      const doc: StagePlannerDocument = {
        version: 3,
        dimensions,
        wires,
        measures,
        markers,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      // Ignore storage quota errors
    }
  }, [dimensions, wires, measures, markers]);

  const showTransientNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((cur) => (cur === msg ? null : cur));
    }, 2600);
  }, []);

  const handleSetToolMode = useCallback((nextMode: ToolMode) => {
    setToolMode(nextMode);
    setDraftPoints([]);
    setMeasureStart(null);
    setCircleStart(null);
  }, []);

  const handleAddDraftPoint = useCallback((pt: Vec3Tuple) => {
    setDraftPoints((prev) => {
      if (prev.length > 0 && calculateDistanceFeet(prev[prev.length - 1], pt) < 0.04) {
        return prev;
      }
      return [...prev, pt];
    });
  }, []);

  const handleCommitWire = useCallback(() => {
    setDraftPoints((prev) => {
      if (prev.length < 2) return prev;
      const totalFeet = calculatePolylineFeet(prev);
      const id = `wire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setWires((cur) => [
        ...cur,
        {
          id,
          name: `Wire ${cur.length + 1}`,
          color: activeColor,
          points: prev,
          totalFeet,
          visible: true,
        },
      ]);
      setSelectedItemId(id);
      return [];
    });
  }, [activeColor]);

  const handleUndoDraftPoint = useCallback(() => {
    setDraftPoints((prev) => prev.slice(0, -1));
  }, []);

  const handleCancelDrawing = useCallback(() => {
    setDraftPoints([]);
    setMeasureStart(null);
    setCircleStart(null);
  }, []);

  const handleCommitMeasure = useCallback(
    (start: Vec3Tuple, end: Vec3Tuple) => {
      const id = `dim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const distanceFeet = calculateDistanceFeet(start, end);
      setMeasures((cur) => [
        ...cur,
        {
          id,
          label: `Measure ${cur.length + 1}`,
          color: activeColor,
          start,
          end,
          distanceFeet,
          visible: true,
        },
      ]);
      setMeasureStart(null);
      setSelectedItemId(id);
    },
    [activeColor],
  );

  const handleCommitCircle = useCallback(
    (center: Vec3Tuple, radiusFt: number) => {
      const id = `marker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setMarkers((cur) => [
        ...cur,
        {
          id,
          label: `Position ${cur.length + 1}`,
          color: activeColor,
          center,
          radiusFt,
          ...(defaultMarkerHeightFt > 0.02 ? { heightFt: defaultMarkerHeightFt } : {}),
          visible: true,
        },
      ]);
      setCircleStart(null);
      setSelectedItemId(id);
    },
    [activeColor, defaultMarkerHeightFt],
  );

  // Keyboard shortcuts for drawing & quick tool switching
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        handleCancelDrawing();
      } else if (e.key === 'Enter' && toolMode === 'wire' && draftPoints.length >= 2) {
        handleCommitWire();
      } else if (e.key === 'Backspace' && toolMode === 'wire' && draftPoints.length > 0) {
        e.preventDefault();
        handleUndoDraftPoint();
      } else if (e.key === 'v' || e.key === 'V') {
        handleSetToolMode('orbit');
      } else if (e.key === 'w' || e.key === 'W') {
        handleSetToolMode('wire');
      } else if (e.key === 'm' || e.key === 'M') {
        handleSetToolMode('measure');
      } else if (e.key === 'c' || e.key === 'C') {
        handleSetToolMode('circle');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    toolMode,
    draftPoints.length,
    handleCancelDrawing,
    handleCommitWire,
    handleUndoDraftPoint,
    handleSetToolMode,
  ]);

  const handleUpdateWire = useCallback((id: string, patch: Partial<WireRun>) => {
    setWires((cur) => cur.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }, []);

  const handleUpdateWirePoints = useCallback((id: string, points: Vec3Tuple[]) => {
    const totalFeet = calculatePolylineFeet(points);
    setWires((cur) =>
      cur.map((w) => (w.id === id ? { ...w, points, totalFeet } : w)),
    );
  }, []);

  const handleDeleteWire = useCallback((id: string) => {
    setWires((cur) => cur.filter((w) => w.id !== id));
    setSelectedItemId((cur) => (cur === id ? null : cur));
  }, []);

  const handleUpdateMeasure = useCallback((id: string, patch: Partial<DimensionLine>) => {
    setMeasures((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const handleDeleteMeasure = useCallback((id: string) => {
    setMeasures((cur) => cur.filter((m) => m.id !== id));
    setSelectedItemId((cur) => (cur === id ? null : cur));
  }, []);

  const handleUpdateMarker = useCallback((id: string, patch: Partial<StageMarker>) => {
    setMarkers((cur) => cur.map((mk) => (mk.id === id ? { ...mk, ...patch } : mk)));
  }, []);

  const handleUpdateMarkerCenter = useCallback((id: string, center: Vec3Tuple) => {
    setMarkers((cur) => cur.map((mk) => (mk.id === id ? { ...mk, center } : mk)));
  }, []);

  const handleDeleteMarker = useCallback((id: string) => {
    setMarkers((cur) => cur.filter((mk) => mk.id !== id));
    setSelectedItemId((cur) => (cur === id ? null : cur));
  }, []);

  const handleExportJson = useCallback(() => {
    const doc: StagePlannerDocument = {
      version: 3,
      dimensions,
      wires,
      measures,
      markers,
    };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stage-wire-plan.json';
    a.click();
    URL.revokeObjectURL(url);
    showTransientNotice('Exported stage-wire-plan.json');
  }, [dimensions, wires, measures, markers, showTransientNotice]);

  const handleImportJson = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as StagePlannerDocument;
          if (!parsed?.dimensions?.main || !parsed?.dimensions?.riser) {
            showTransientNotice('Invalid stage plan file.');
            return;
          }
          setDimensions({
            main: parsed.dimensions.main,
            riser: {
              ...DEFAULT_DIMENSIONS.riser,
              ...parsed.dimensions.riser,
            },
          });
          setWires(Array.isArray(parsed.wires) ? parsed.wires : []);
          setMeasures(Array.isArray(parsed.measures) ? parsed.measures : []);
          setMarkers(Array.isArray(parsed.markers) ? parsed.markers : []);
          setDraftPoints([]);
          setMeasureStart(null);
          setCircleStart(null);
          showTransientNotice('Imported stage plan.');
        } catch {
          showTransientNotice('Could not parse JSON file.');
        }
      };
      reader.readAsText(file);
    },
    [showTransientNotice],
  );

  const handleClearAllLines = useCallback(() => {
    setWires([]);
    setMeasures([]);
    setMarkers([]);
    setDraftPoints([]);
    setMeasureStart(null);
    setCircleStart(null);
    setSelectedItemId(null);
    showTransientNotice('Cleared all wires, measures, and circles.');
  }, [showTransientNotice]);

  const handleResetSample = useCallback(() => {
    setDimensions(DEFAULT_DIMENSIONS);
    setWires(createSampleWires());
    setMeasures(createSampleMeasures());
    setMarkers(createSampleMarkers());
    setDraftPoints([]);
    setMeasureStart(null);
    setCircleStart(null);
    setSelectedItemId(null);
    setCameraRequest((prev) => ({ preset: 'perspective', seq: (prev?.seq ?? 0) + 1 }));
    showTransientNotice('Reset to default stage dimensions.');
  }, [showTransientNotice]);

  return (
    <main className="relative flex w-screen h-screen overflow-hidden bg-[#0e1217]">
      <div className="relative flex-1 min-w-0 h-full">
        <StageViewport
          dimensions={dimensions}
          wires={wires}
          measures={measures}
          markers={markers}
          toolMode={toolMode}
          snapMode={snapMode}
          activeColor={activeColor}
          viewMode={viewMode}
          showStageDims={showStageDims}
          showFloorGrid={showFloorGrid}
          selectedItemId={selectedItemId}
          defaultMarkerHeightFt={defaultMarkerHeightFt}
          draftPoints={draftPoints}
          measureStart={measureStart}
          circleStart={circleStart}
          cameraRequest={cameraRequest}
          onAddDraftPoint={handleAddDraftPoint}
          onCommitWire={handleCommitWire}
          onSetMeasureStart={setMeasureStart}
          onCommitMeasure={handleCommitMeasure}
          onSetCircleStart={setCircleStart}
          onCommitCircle={handleCommitCircle}
          onSelectItem={setSelectedItemId}
          onUpdateWirePoints={handleUpdateWirePoints}
          onUpdateMarkerCenter={handleUpdateMarkerCenter}
        />

        {notice && (
          <div className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-30 rounded-md border border-slate-700/80 bg-[#12161d] px-3 py-1.5 text-xs font-medium text-slate-200">
            {notice}
          </div>
        )}
      </div>

      <ControlDock
        dimensions={dimensions}
        wires={wires}
        measures={measures}
        markers={markers}
        toolMode={toolMode}
        snapMode={snapMode}
        activeColor={activeColor}
        viewMode={viewMode}
        showStageDims={showStageDims}
        showFloorGrid={showFloorGrid}
        selectedItemId={selectedItemId}
        defaultMarkerHeightFt={defaultMarkerHeightFt}
        draftPoints={draftPoints}
        measureStart={measureStart}
        circleStart={circleStart}
        onUpdateDimensions={setDimensions}
        onSetToolMode={handleSetToolMode}
        onSetSnapMode={setSnapMode}
        onSetActiveColor={setActiveColor}
        onSetDefaultMarkerHeightFt={setDefaultMarkerHeightFt}
        onSetViewMode={setViewMode}
        onToggleStageDims={() => setShowStageDims((v) => !v)}
        onToggleFloorGrid={() => setShowFloorGrid((v) => !v)}
        onCameraPreset={(preset) =>
          setCameraRequest((prev) => ({ preset, seq: (prev?.seq ?? 0) + 1 }))
        }
        onCommitWire={handleCommitWire}
        onUndoDraftPoint={handleUndoDraftPoint}
        onCancelDrawing={handleCancelDrawing}
        onSelectItem={setSelectedItemId}
        onUpdateWire={handleUpdateWire}
        onDeleteWire={handleDeleteWire}
        onUpdateMeasure={handleUpdateMeasure}
        onDeleteMeasure={handleDeleteMeasure}
        onUpdateMarker={handleUpdateMarker}
        onDeleteMarker={handleDeleteMarker}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onClearAllLines={handleClearAllLines}
        onResetSample={handleResetSample}
      />
    </main>
  );
}
