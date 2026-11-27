import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cable,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Eye,
  EyeOff,
  Grid,
  MousePointer,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import type {
  CameraPreset,
  DimensionLine,
  SnapMode,
  StageDimensions,
  StageMarker,
  ToolMode,
  Vec3Tuple,
  ViewMode,
  WireRun,
} from '../types/stage';
import { formatFeetInches, LINE_COLORS } from '../utils/imperial';
import { ImperialInput } from './ImperialInput';

type PanelTab = 'dimensions' | 'lines' | 'camera';

interface ControlDockProps {
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
  onUpdateDimensions: (next: StageDimensions) => void;
  onSetToolMode: (mode: ToolMode) => void;
  onSetSnapMode: (mode: SnapMode) => void;
  onSetActiveColor: (hex: string) => void;
  onSetViewMode: (mode: ViewMode) => void;
  onToggleStageDims: () => void;
  onToggleFloorGrid: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onCommitWire: () => void;
  onUndoDraftPoint: () => void;
  onCancelDrawing: () => void;
  onSelectItem: (id: string | null) => void;
  onUpdateWire: (id: string, patch: Partial<WireRun>) => void;
  onDeleteWire: (id: string) => void;
  onUpdateMeasure: (id: string, patch: Partial<DimensionLine>) => void;
  onDeleteMeasure: (id: string) => void;
  onUpdateMarker: (id: string, patch: Partial<StageMarker>) => void;
  onDeleteMarker: (id: string) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onClearAllLines: () => void;
  onResetSample: () => void;
}

export const ControlDock: React.FC<ControlDockProps> = ({
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
  onUpdateDimensions,
  onSetToolMode,
  onSetSnapMode,
  onSetActiveColor,
  onSetViewMode,
  onToggleStageDims,
  onToggleFloorGrid,
  onCameraPreset,
  onCommitWire,
  onUndoDraftPoint,
  onCancelDrawing,
  onSelectItem,
  onUpdateWire,
  onDeleteWire,
  onUpdateMeasure,
  onDeleteMeasure,
  onUpdateMarker,
  onDeleteMarker,
  onExportJson,
  onImportJson,
  onClearAllLines,
  onResetSample,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('dimensions');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'h' || e.key === 'H') {
        setIsCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const totalWireFeet = useMemo(
    () => wires.reduce((acc, w) => acc + w.totalFeet, 0),
    [wires],
  );

  const wireTotalsByColor = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of wires) {
      map.set(w.color.toUpperCase(), (map.get(w.color.toUpperCase()) ?? 0) + w.totalFeet);
    }
    return Array.from(map.entries());
  }, [wires]);

  const totalItemCount = wires.length + measures.length + markers.length;

  return (
    <>
      {/* Minimal Top-Left Header */}
      <header className="pointer-events-none fixed top-4 left-5 z-20 flex flex-col gap-0.5">
        <h1 className="text-base font-semibold tracking-tight text-slate-100">StageWire 3D</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-tabular">
          <span>
            {formatFeetInches(dimensions.main.widthFt)} × {formatFeetInches(dimensions.main.depthFt)} Stage
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {wires.length} {wires.length === 1 ? 'Wire' : 'Wires'} ({formatFeetInches(totalWireFeet)})
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {measures.length} {measures.length === 1 ? 'Measure' : 'Measures'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {markers.length} {markers.length === 1 ? 'Circle' : 'Circles'}
          </span>
        </div>
      </header>

      {/* Expand Handle when Right Panel is Collapsed */}
      {isCollapsed && (
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="fixed top-4 right-4 z-30 flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#12161d] px-3 py-2 text-xs font-medium text-slate-200 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xl"
          title="Show Control Panel (H)"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Controls</span>
        </button>
      )}

      {/* Right-Side Control Panel */}
      {!isCollapsed && (
        <aside className="relative z-20 flex h-full w-[368px] shrink-0 flex-col border-l border-slate-800 bg-[#12161d] text-slate-100">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <span className="text-xs font-semibold tracking-wide text-slate-200">Stage &amp; Wire Controls</span>
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="flex items-center gap-1 rounded-md border border-slate-700/70 bg-[#0b0f14] px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Hide Panel (H)"
            >
              <span>Hide</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Drawing Tools, Line Color & Snap Controls */}
          <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3">
            {/* Tool Mode Selector (4 tools) */}
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-[#0b0f14] p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => onSetToolMode('orbit')}
                title="Orbit & Select (V)"
                className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  toolMode === 'orbit'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <MousePointer className="h-3.5 w-3.5 shrink-0" />
                <span>Orbit</span>
              </button>
              <button
                type="button"
                onClick={() => onSetToolMode('wire')}
                title="Draw Wire Path (W)"
                className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  toolMode === 'wire'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Cable className="h-3.5 w-3.5 shrink-0" />
                <span>Wire</span>
              </button>
              <button
                type="button"
                onClick={() => onSetToolMode('measure')}
                title="Point-to-Point Measure (M)"
                className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  toolMode === 'measure'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Ruler className="h-3.5 w-3.5 shrink-0" />
                <span>Measure</span>
              </button>
              <button
                type="button"
                onClick={() => onSetToolMode('circle')}
                title="Draw Circle Marker for Singer / Instrument (C)"
                className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  toolMode === 'circle'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Circle className="h-3.5 w-3.5 shrink-0" />
                <span>Circle</span>
              </button>
            </div>

            {/* Line / Marker Color Picker */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">Color</span>
              <div className="flex items-center gap-1.5">
                {LINE_COLORS.map((swatch) => {
                  const active = activeColor.toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.hex}
                      type="button"
                      onClick={() => onSetActiveColor(swatch.hex)}
                      title={swatch.name}
                      aria-label={`Select ${swatch.name}`}
                      className={`h-5 w-5 rounded-full border transition-transform cursor-pointer ${
                        active ? 'scale-110 border-white ring-2 ring-sky-400/60' : 'border-white/25 hover:scale-105'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    />
                  );
                })}
                <label
                  title="Custom Color"
                  className="relative flex h-5 w-6 items-center justify-center rounded border border-slate-600 bg-[#0b0f14] cursor-pointer overflow-hidden"
                >
                  <input
                    type="color"
                    value={activeColor}
                    onChange={(e) => onSetActiveColor(e.target.value)}
                    aria-label="Custom line color picker"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <span
                    className="h-3 w-4 rounded-xs border border-white/20"
                    style={{ backgroundColor: activeColor }}
                  />
                </label>
              </div>
            </div>

            {/* Snap Mode or Contextual Drawing Controls */}
            {toolMode === 'wire' && draftPoints.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onCommitWire}
                  disabled={draftPoints.length < 2}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-40 whitespace-nowrap cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Finish Wire ({draftPoints.length})</span>
                </button>
                <button
                  type="button"
                  onClick={onUndoDraftPoint}
                  className="flex items-center gap-1 rounded-md border border-slate-700 bg-[#0b0f14] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                  title="Undo Last Point (Backspace)"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={onCancelDrawing}
                  className="flex items-center justify-center rounded-md border border-slate-700 bg-[#0b0f14] px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                  title="Cancel Wire (Esc)"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : toolMode === 'measure' && measureStart ? (
              <button
                type="button"
                onClick={onCancelDrawing}
                className="flex w-full items-center justify-center gap-1 rounded-md border border-slate-700 bg-[#0b0f14] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel Point A</span>
              </button>
            ) : toolMode === 'circle' && circleStart ? (
              <button
                type="button"
                onClick={onCancelDrawing}
                className="flex w-full items-center justify-center gap-1 rounded-md border border-slate-700 bg-[#0b0f14] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel Circle Center</span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#0b0f14] p-1 border border-slate-800">
                {(['smart', 'grid', 'free'] as SnapMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onSetSnapMode(mode)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      snapMode === mode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'smart' ? 'Smart Snap' : mode === 'grid' ? '6" Grid' : 'Free'}
                  </button>
                ))}
              </div>
            )}

            <p className="text-[11px] text-slate-500 leading-snug">
              {toolMode === 'orbit'
                ? 'Drag empty space to orbit · Click a wire to select, then drag cable to move or drag joints to reshape.'
                : toolMode === 'wire'
                  ? 'Click stage points to route wire. Double-click or Enter to finish. Drag still orbits.'
                  : toolMode === 'measure'
                    ? 'Click Point A then Point B to place a dimension line. Drag still orbits.'
                    : 'Click center on stage, then move & click outer edge to mark a singer or instrument.'}
            </p>
          </div>

          {/* Section Tabs */}
          <div className="grid grid-cols-3 gap-1 border-b border-slate-800 px-3 py-2">
            <button
              type="button"
              onClick={() => setActiveTab('dimensions')}
              className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'dimensions' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Stage</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('lines')}
              className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'lines' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cable className="h-3.5 w-3.5" />
              <span>Items ({totalItemCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('camera')}
              className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'camera' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              <span>View</span>
            </button>
          </div>

          {/* Scrollable Tab Content */}
          <div className="dock-scroll flex-1 overflow-y-auto p-4">
            {activeTab === 'dimensions' && (
              <div className="flex flex-col gap-5">
                {/* Main Stage Footprint & Height */}
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-200">Main Stage</h2>
                    <span className="text-[11px] font-mono-tabular text-slate-400">
                      {formatFeetInches(dimensions.main.widthFt)} × {formatFeetInches(dimensions.main.depthFt)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <ImperialInput
                      label="Back Width"
                      valueFeet={dimensions.main.widthFt}
                      minFeet={4}
                      maxFeet={80}
                      onChange={(widthFt) =>
                        onUpdateDimensions({
                          ...dimensions,
                          main: {
                            ...dimensions.main,
                            widthFt,
                            frontWidthFt: Math.min(dimensions.main.frontWidthFt, widthFt),
                          },
                        })
                      }
                    />
                    <ImperialInput
                      label="Front Width"
                      valueFeet={dimensions.main.frontWidthFt}
                      minFeet={2}
                      maxFeet={dimensions.main.widthFt}
                      onChange={(frontWidthFt) =>
                        onUpdateDimensions({
                          ...dimensions,
                          main: {
                            ...dimensions.main,
                            frontWidthFt: Math.min(frontWidthFt, dimensions.main.widthFt),
                          },
                        })
                      }
                    />
                    <ImperialInput
                      label="Total Depth"
                      valueFeet={dimensions.main.depthFt}
                      minFeet={4}
                      maxFeet={60}
                      onChange={(depthFt) =>
                        onUpdateDimensions({
                          ...dimensions,
                          main: {
                            ...dimensions.main,
                            depthFt,
                            sideDepthFt: Math.min(dimensions.main.sideDepthFt, depthFt - 0.5),
                          },
                        })
                      }
                    />
                    <ImperialInput
                      label="Straight Side"
                      valueFeet={dimensions.main.sideDepthFt}
                      minFeet={0.5}
                      maxFeet={Math.max(1, dimensions.main.depthFt - 0.5)}
                      onChange={(sideDepthFt) =>
                        onUpdateDimensions({
                          ...dimensions,
                          main: {
                            ...dimensions.main,
                            sideDepthFt: Math.min(sideDepthFt, dimensions.main.depthFt - 0.25),
                          },
                        })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <ImperialInput
                      label="Deck Height (Floor)"
                      valueFeet={dimensions.main.heightFt}
                      minFeet={0.5}
                      maxFeet={12}
                      onChange={(heightFt) =>
                        onUpdateDimensions({
                          ...dimensions,
                          main: { ...dimensions.main, heightFt },
                        })
                      }
                    />
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateDimensions({
                            ...dimensions,
                            main: {
                              ...dimensions.main,
                              frontWidthFt: dimensions.main.widthFt,
                              sideDepthFt: dimensions.main.depthFt - 0.1,
                            },
                          })
                        }
                        className="w-full rounded-md border border-slate-700/80 bg-[#0b0f14] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Make Rectangular
                      </button>
                    </div>
                  </div>
                </section>

                <hr className="border-slate-800" />

                {/* Upper Riser (Matching Chamfered Shape) */}
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-200">Upper Riser</h2>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateDimensions({
                          ...dimensions,
                          riser: { ...dimensions.riser, enabled: !dimensions.riser.enabled },
                        })
                      }
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                        dimensions.riser.enabled
                          ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                          : 'border-slate-700 bg-[#0b0f14] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {dimensions.riser.enabled ? 'Enabled' : 'Hidden'}
                    </button>
                  </div>

                  {dimensions.riser.enabled && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <ImperialInput
                          label="Back Width"
                          valueFeet={dimensions.riser.widthFt}
                          minFeet={2}
                          maxFeet={60}
                          onChange={(widthFt) =>
                            onUpdateDimensions({
                              ...dimensions,
                              riser: {
                                ...dimensions.riser,
                                widthFt,
                                frontWidthFt: Math.min(dimensions.riser.frontWidthFt, widthFt),
                              },
                            })
                          }
                        />
                        <ImperialInput
                          label="Front Width"
                          valueFeet={dimensions.riser.frontWidthFt}
                          minFeet={1}
                          maxFeet={dimensions.riser.widthFt}
                          onChange={(frontWidthFt) =>
                            onUpdateDimensions({
                              ...dimensions,
                              riser: {
                                ...dimensions.riser,
                                frontWidthFt: Math.min(frontWidthFt, dimensions.riser.widthFt),
                              },
                            })
                          }
                        />
                        <ImperialInput
                          label="Total Depth"
                          valueFeet={dimensions.riser.depthFt}
                          minFeet={2}
                          maxFeet={40}
                          onChange={(depthFt) =>
                            onUpdateDimensions({
                              ...dimensions,
                              riser: {
                                ...dimensions.riser,
                                depthFt,
                                sideDepthFt: Math.min(dimensions.riser.sideDepthFt, depthFt - 0.25),
                              },
                            })
                          }
                        />
                        <ImperialInput
                          label="Straight Side"
                          valueFeet={dimensions.riser.sideDepthFt}
                          minFeet={0.25}
                          maxFeet={Math.max(0.5, dimensions.riser.depthFt - 0.25)}
                          onChange={(sideDepthFt) =>
                            onUpdateDimensions({
                              ...dimensions,
                              riser: {
                                ...dimensions.riser,
                                sideDepthFt: Math.min(sideDepthFt, dimensions.riser.depthFt - 0.25),
                              },
                            })
                          }
                        />
                        <ImperialInput
                          label="Riser Height"
                          valueFeet={dimensions.riser.heightFt}
                          minFeet={0.5}
                          maxFeet={10}
                          onChange={(heightFt) =>
                            onUpdateDimensions({
                              ...dimensions,
                              riser: { ...dimensions.riser, heightFt },
                            })
                          }
                        />
                        <ImperialInput
                          label="Back Offset"
                          valueFeet={dimensions.riser.backOffsetFt}
                          minFeet={-8}
                          maxFeet={24}
                          onChange={(backOffsetFt) =>
                            onUpdateDimensions({
                              ...dimensions,
                              riser: { ...dimensions.riser, backOffsetFt },
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateDimensions({
                              ...dimensions,
                              riser: { ...dimensions.riser, backOffsetFt: 0 },
                            })
                          }
                          className="text-[11px] font-medium text-sky-400 hover:text-sky-300 cursor-pointer"
                        >
                          Flush to Back Edge
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const widthRatio =
                              dimensions.main.frontWidthFt / Math.max(1, dimensions.main.widthFt);
                            const sideRatio =
                              dimensions.main.sideDepthFt / Math.max(1, dimensions.main.depthFt);
                            onUpdateDimensions({
                              ...dimensions,
                              riser: {
                                ...dimensions.riser,
                                frontWidthFt: Math.max(1, dimensions.riser.widthFt * widthRatio),
                                sideDepthFt: Math.max(0.5, dimensions.riser.depthFt * sideRatio),
                              },
                            });
                          }}
                          className="text-[11px] font-medium text-slate-300 hover:text-white cursor-pointer"
                        >
                          Match Main Taper
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'lines' && (
              <div className="flex flex-col gap-3">
                {/* Summary */}
                <div className="rounded-lg border border-slate-800 bg-[#0b0f14] p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Total Wire Length</span>
                    <span className="font-mono-tabular font-semibold text-slate-100">
                      {formatFeetInches(totalWireFeet)}
                    </span>
                  </div>
                  {wireTotalsByColor.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-slate-800/80">
                      {wireTotalsByColor.map(([hex, len]) => (
                        <span
                          key={hex}
                          className="flex items-center gap-1.5 text-[11px] font-mono-tabular text-slate-300"
                        >
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hex }} />
                          <span>{formatFeetInches(len)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* File Actions */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onExportJson}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-[#0b0f14] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-[#0b0f14] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Import JSON</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImportJson(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={onClearAllLines}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-[#0b0f14] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear All</span>
                  </button>
                  <button
                    type="button"
                    onClick={onResetSample}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-[#0b0f14] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset Default</span>
                  </button>
                </div>

                {/* Combined List: Wires, Measures & Circle Markers */}
                {totalItemCount === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-[#0b0f14] p-5 text-center text-xs text-slate-400">
                    No wires, measures, or circles yet. Choose a tool above and click on the 3D stage.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {markers.map((mk) => {
                      const selected = selectedItemId === mk.id;
                      return (
                        <div
                          key={mk.id}
                          onClick={() => onSelectItem(mk.id)}
                          className={`flex flex-col gap-2 rounded-md border p-2.5 text-xs transition-colors cursor-pointer ${
                            selected
                              ? 'border-sky-400/70 bg-sky-500/10'
                              : 'border-slate-800 bg-[#0b0f14] hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <label
                              className="relative h-4 w-4 shrink-0 rounded-full border border-white/30 cursor-pointer"
                              style={{ backgroundColor: mk.color }}
                              title="Change circle color"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="color"
                                value={mk.color}
                                onChange={(e) => onUpdateMarker(mk.id, { color: e.target.value })}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                aria-label={`Color for ${mk.label}`}
                              />
                            </label>
                            <input
                              type="text"
                              value={mk.label}
                              placeholder="Singer / Instrument"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => onUpdateMarker(mk.id, { label: e.target.value })}
                              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-100 outline-none focus:border-b focus:border-sky-400"
                              aria-label="Circle marker label"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono-tabular text-slate-300">
                              Circle · Ø {formatFeetInches(mk.radiusFt * 2)} (R {formatFeetInches(mk.radiusFt)})
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateMarker(mk.id, { visible: !mk.visible });
                                }}
                                className="text-slate-400 hover:text-white cursor-pointer"
                                title={mk.visible ? 'Hide circle' : 'Show circle'}
                              >
                                {mk.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteMarker(mk.id);
                                }}
                                className="text-slate-400 hover:text-rose-400 cursor-pointer"
                                title="Delete circle"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {selected && (
                            <div className="pt-1 border-t border-slate-800/80" onClick={(e) => e.stopPropagation()}>
                              <ImperialInput
                                label="Circle Radius"
                                valueFeet={mk.radiusFt}
                                minFeet={0.5}
                                maxFeet={15}
                                onChange={(radiusFt) => onUpdateMarker(mk.id, { radiusFt })}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {wires.map((w) => {
                      const selected = selectedItemId === w.id;
                      return (
                        <div
                          key={w.id}
                          onClick={() => onSelectItem(w.id)}
                          className={`flex flex-col gap-1.5 rounded-md border p-2.5 text-xs transition-colors cursor-pointer ${
                            selected
                              ? 'border-sky-400/70 bg-sky-500/10'
                              : 'border-slate-800 bg-[#0b0f14] hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <label
                              className="relative h-4 w-4 shrink-0 rounded-full border border-white/30 cursor-pointer"
                              style={{ backgroundColor: w.color }}
                              title="Change wire color"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="color"
                                value={w.color}
                                onChange={(e) => onUpdateWire(w.id, { color: e.target.value })}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                aria-label={`Color for ${w.name}`}
                              />
                            </label>
                            <input
                              type="text"
                              value={w.name}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => onUpdateWire(w.id, { name: e.target.value })}
                              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-100 outline-none focus:border-b focus:border-sky-400"
                              aria-label="Wire name"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono-tabular text-slate-300">
                              Wire · {formatFeetInches(w.totalFeet)} · {w.points.length} pts
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateWire(w.id, { visible: !w.visible });
                                }}
                                className="text-slate-400 hover:text-white cursor-pointer"
                                title={w.visible ? 'Hide wire' : 'Show wire'}
                              >
                                {w.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteWire(w.id);
                                }}
                                className="text-slate-400 hover:text-rose-400 cursor-pointer"
                                title="Delete wire"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {selected && (
                            <p className="pt-1.5 border-t border-slate-800/80 text-[11px] text-sky-300/90 leading-snug">
                              Selected on stage — drag cable to move whole wire, or drag a joint ring to reshape.
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {measures.map((m) => {
                      const selected = selectedItemId === m.id;
                      return (
                        <div
                          key={m.id}
                          onClick={() => onSelectItem(m.id)}
                          className={`flex flex-col gap-1.5 rounded-md border p-2.5 text-xs transition-colors cursor-pointer ${
                            selected
                              ? 'border-sky-400/70 bg-sky-500/10'
                              : 'border-slate-800 bg-[#0b0f14] hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <label
                              className="relative h-4 w-4 shrink-0 rounded-full border border-white/30 cursor-pointer"
                              style={{ backgroundColor: m.color }}
                              title="Change dimension color"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="color"
                                value={m.color}
                                onChange={(e) => onUpdateMeasure(m.id, { color: e.target.value })}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                aria-label={`Color for ${m.label}`}
                              />
                            </label>
                            <input
                              type="text"
                              value={m.label}
                              placeholder="Dimension label"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => onUpdateMeasure(m.id, { label: e.target.value })}
                              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-100 outline-none focus:border-b focus:border-sky-400"
                              aria-label="Dimension label"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono-tabular text-slate-300">
                              Measure · {formatFeetInches(m.distanceFeet)}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateMeasure(m.id, { visible: !m.visible });
                                }}
                                className="text-slate-400 hover:text-white cursor-pointer"
                                title={m.visible ? 'Hide dimension' : 'Show dimension'}
                              >
                                {m.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteMeasure(m.id);
                                }}
                                className="text-slate-400 hover:text-rose-400 cursor-pointer"
                                title="Delete dimension"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'camera' && (
              <div className="flex flex-col gap-5">
                <section className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold text-slate-200">Camera Presets</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['perspective', '3D Perspective'],
                        ['top', 'Top Plan (Bird View)'],
                        ['front', 'Front View'],
                        ['left', 'Side Left'],
                        ['right', 'Side Right'],
                      ] as Array<[CameraPreset, string]>
                    ).map(([preset, title]) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onCameraPreset(preset)}
                        className="rounded-md border border-slate-700 bg-[#0b0f14] px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-400 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                </section>

                <hr className="border-slate-800" />

                <section className="flex flex-col gap-2.5">
                  <h2 className="text-xs font-semibold text-slate-200">Display &amp; Overlays</h2>

                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#0b0f14] p-1 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => onSetViewMode('studio')}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        viewMode === 'studio' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Studio Stage
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetViewMode('blueprint')}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        viewMode === 'blueprint' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Blueprint
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onToggleStageDims}
                      className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        showStageDims
                          ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                          : 'border-slate-700 bg-[#0b0f14] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Ruler className="h-3.5 w-3.5" />
                      <span>Stage Dims</span>
                    </button>

                    <button
                      type="button"
                      onClick={onToggleFloorGrid}
                      className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        showFloorGrid
                          ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                          : 'border-slate-700 bg-[#0b0f14] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Grid className="h-3.5 w-3.5" />
                      <span>Floor Grid</span>
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
};
