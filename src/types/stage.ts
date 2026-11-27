export type Vec3Tuple = [number, number, number];

export interface MainStageDimensions {
  widthFt: number; // Back / full width
  frontWidthFt: number; // Narrower front lip width
  depthFt: number; // Total front-to-back depth
  sideDepthFt: number; // Length of straight side walls before chamfering inward
  heightFt: number;
}

export interface RiserDimensions {
  enabled: boolean;
  widthFt: number;
  frontWidthFt: number;
  depthFt: number;
  sideDepthFt: number;
  heightFt: number;
  /** Distance from the rear edge of the main stage forward (+Z) in feet. 0 = flush with back edge. */
  backOffsetFt: number;
}

export interface StageDimensions {
  main: MainStageDimensions;
  riser: RiserDimensions;
}

export interface WireRun {
  id: string;
  name: string;
  color: string;
  points: Vec3Tuple[];
  totalFeet: number;
  visible: boolean;
}

export interface DimensionLine {
  id: string;
  label: string;
  color: string;
  start: Vec3Tuple;
  end: Vec3Tuple;
  distanceFeet: number;
  visible: boolean;
}

export interface StageMarker {
  id: string;
  label: string;
  color: string;
  center: Vec3Tuple;
  radiusFt: number;
  heightFt?: number;
  visible: boolean;
}

export type ToolMode = 'orbit' | 'wire' | 'measure' | 'circle';
export type SnapMode = 'smart' | 'grid' | 'free';
export type ViewMode = 'studio' | 'blueprint';
export type CameraPreset = 'perspective' | 'top' | 'front' | 'left' | 'right';
export type SnapKind = 'corner' | 'edge' | 'grid' | 'surface';

export interface HoverPreviewState {
  point: Vec3Tuple;
  snapKind: SnapKind;
  segmentFeet: number | null;
  totalFeet: number | null;
}

export interface StagePlannerDocument {
  version: 3;
  stageName?: string;
  dimensions: StageDimensions;
  wires: WireRun[];
  measures: DimensionLine[];
  markers: StageMarker[];
}
