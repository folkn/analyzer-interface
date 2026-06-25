export interface SParamPoint {
  freq: number; // Hz
  re: number;
  im: number;
}

export interface TraceData {
  id: string;
  label: string;
  points: SParamPoint[];
  enabled: boolean;
  color: string;
}

export type MarkerMode = 'global' | 'trace';
export type MarkerType = 'normal' | 'reference' | 'delta';

export interface MarkerValues {
  s11MagDb?: number;
  s11PhaseDeg?: number;
  s21MagDb?: number;
  s21PhaseDeg?: number;
  s11Re?: number;
  s11Im?: number;
  vswr?: number;
}

export interface Marker {
  id: string;
  name: string;
  freq: number; // Hz
  visible: boolean;
  color: string;
  type: MarkerType;
  mode: MarkerMode;
  assignedTraceId: string | null; // null = global
  referenceMarkerId?: string; // for delta markers
  values: MarkerValues;
}

export type PlotType = 's11mag' | 's21mag' | 's11phase' | 's21phase' | 'smith';
