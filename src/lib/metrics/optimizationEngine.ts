import type { AnesthetistAssignment, Reservation, ResourceId, Shift } from "@/lib/types";
import { ASSIGNMENT_FULL_SHIFT } from "@/lib/types";

/**
 * Motor de optimización quirúrgica (simulación):
 * - NO modifica reservas ni ejecuta cambios automáticos.
 * - Las métricas y score son aproximaciones operativas, no margen contable final.
 * - Requiere validación manual antes de aplicar decisiones reales.
 */
export const UMBRAL_SOLAPAMIENTO_OPTIMO = 0.25;
export const UMBRAL_SOLAPAMIENTO_MODERADO = 0.45;
export const LIMITE_SOLAPAMIENTO_CRITICO = 0.6;
export const UMBRAL_GANANCIA_SCORE = 20;
const DEFAULT_SHARED_STAFF_EQUIVALENT = 1;

export type EfficiencyBand = "positiva" | "neutra" | "negativa";

export interface OptimizationWeights {
  alpha: number;
  beta: number;
  gamma: number;
  delta: number;
  epsilon: number;
  zeta: number;
}

export const DEFAULT_OPTIMIZATION_WEIGHTS: OptimizationWeights = {
  alpha: 1,
  beta: 120,
  gamma: 30,
  delta: 30,
  epsilon: 60,
  zeta: 80,
};

export interface BlockOptimizationInput {
  date: string;
  shift: Shift;
  reservations: Reservation[];
  assignments: AnesthetistAssignment[];
  operatingRoomIds: ResourceId[];
  ingresosTurno: number;
  margenTurno: number;
  ocupacionGlobal: number;
  confidence?: number;
  sharedStaffEquivalent?: number;
  totalOperatingRoomsInBlock?: number;
  overlapOptimalThreshold?: number;
  overlapModerateThreshold?: number;
  overlapCriticalLimit?: number;
  weights?: Partial<OptimizationWeights>;
}

export interface BlockOptimizationOutput {
  recursosCriticos: number;
  anestesistasActivos: number;
  numeroQuirofanosActivos: number;
  simultaneidad: number;
  minutosTotalesBloque: number;
  minutosSolapados: number;
  nivelSolapamiento: number;
  eficienciaSolapamiento: number;
  eficienciaBand: EfficiencyBand;
  riesgo: number;
  dispersion: number;
  score: number;
  mejoraEficienciaAnestesia: boolean;
}

export interface RecommendationImpact {
  margenDelta: number;
  ocupacionDelta: number;
  simultaneidadBefore: number;
  simultaneidadAfter: number;
  solapamientoBefore: number;
  solapamientoAfter: number;
  mejoraEficienciaAnestesia: boolean;
}

export interface SimulatedMoveDecision {
  allowed: boolean;
  scoreGain: number;
  exceededCriticalOverlap: boolean;
  impact: RecommendationImpact;
  message: string;
}

type Interval = { start: number; end: number };

export interface StructuralSimulationInput {
  date: string;
  shift: Shift;
  reservations: Reservation[];
  assignments: AnesthetistAssignment[];
  operatingRoomIds: ResourceId[];
  ingresosActuales: number;
  margenActual: number;
  minutosProgramadosActuales: number;
  capacidadPorQuirofano: number;
  confianza?: number;
  sharedStaffEquivalent?: number;
  weights?: Partial<OptimizationWeights>;
}

export interface BlockConfigurationScenario {
  openedOperatingRooms: number;
  ingresosTotales: number;
  margen: number;
  minutosProgramados: number;
  capacidadTotal: number;
  ocupacion: number;
  simultaneidad: number;
  densidad: number;
  dispersion: number;
  riesgo: number;
  eficienciaAnestesia: number;
  score: number;
}

export interface StructuralSimulationOutput {
  current: BlockConfigurationScenario;
  optimal: BlockConfigurationScenario;
  scenarios: BlockConfigurationScenario[];
  marginDeltaOptimalVsCurrent: number;
  recommendation: string;
}

export type RecommendationConfidenceLevel = "alta" | "media" | "baja";

export interface TemporalLoadInput {
  date: string;
  shift: Shift;
  reservations: Reservation[];
  assignments: AnesthetistAssignment[];
  operatingRoomIds: ResourceId[];
  tramoMinutes?: number;
  peakThreshold?: number;
}

export interface TemporalLoadBucket {
  index: number;
  rangeLabel: string;
  startMinute: number;
  endMinute: number;
  minutosOcupados: number;
  intervencionesSimultaneas: number;
  quirofanosActivos: number;
  anestesistasDisponibles: number;
  isPeak: boolean;
  hasStaffDeficit: boolean;
}

export interface TemporalLoadAnalysis {
  buckets: TemporalLoadBucket[];
  hasPeak: boolean;
  hasStaffDeficit: boolean;
  peakRangeLabel: string | null;
  recommendation: string;
  estimatedImpact: {
    mejoraOcupacionPct: number;
    mejoraSimultaneidadPct: number;
    evitaAperturaExtra: boolean;
  };
  /** Penalización [0..1] por carga mal distribuida entre tramos (variabilidad alta). */
  peakPenalty: number;
}

export interface StructuralOptimizationStep {
  iteration: number;
  fromOpenedRooms: number;
  toOpenedRooms: number;
  scoreBefore: number;
  scoreAfter: number;
  scoreGain: number;
  marginBefore: number;
  marginAfter: number;
  marginDelta: number;
  occupancyBefore: number;
  occupancyAfter: number;
  anesthesiaEfficiencyBefore: number;
  anesthesiaEfficiencyAfter: number;
  reason: string;
}

export interface StructuralOptimizationResult {
  initial: BlockConfigurationScenario;
  final: BlockConfigurationScenario;
  best: BlockConfigurationScenario;
  steps: StructuralOptimizationStep[];
  iterationsUsed: number;
  converged: boolean;
  reason: string;
  confidenceLevel: RecommendationConfidenceLevel;
  confidenceReasons: string[];
}

export interface IncrementalMarginInput {
  interventionMinutes?: number | null;
  estimatedRevenuePerMinute?: number | null;
  estimatedVariableCostPerMinute?: number | null;
  assignmentMarginalCost?: number | null;
}

export interface IncrementalMarginResult {
  ingresoEstimado: number;
  costeVariableEstimado: number;
  costeMarginalAsignacion: number;
  margenIncremental: number;
  confidenceLevel: RecommendationConfidenceLevel;
}

function shiftDurationMinutes(shift: Shift): number {
  return shift === "morning" ? 300 : 300;
}

function toShiftInterval(reservation: Reservation): Interval {
  const slotBase = reservation.shift === "morning" ? 60 : 60;
  const start = Math.max(0, reservation.slotIndex * slotBase);
  const duration = Math.max(
    0,
    (reservation.patients ?? [])
      .filter((p) => p.scheduleStatus !== "CANCELLED")
      .reduce((sum, p) => sum + Math.max(0, p.estimatedDurationMinutes ?? 0), 0)
  );
  return { start, end: start + duration };
}

function overlapMinutes(intervals: Interval[]): number {
  const events: Array<{ minute: number; delta: number }> = [];
  for (const i of intervals) {
    if (i.end <= i.start) continue;
    events.push({ minute: i.start, delta: 1 });
    events.push({ minute: i.end, delta: -1 });
  }
  if (events.length === 0) return 0;
  events.sort((a, b) => (a.minute === b.minute ? b.delta - a.delta : a.minute - b.minute));

  let active = 0;
  let prev = events[0]!.minute;
  let overlap = 0;
  for (const e of events) {
    if (active > 1 && e.minute > prev) {
      overlap += e.minute - prev;
    }
    active += e.delta;
    prev = e.minute;
  }
  return overlap;
}

function resolveAnesthetistForReservation(
  reservation: Reservation,
  assignments: AnesthetistAssignment[],
  operatingRoomIds: ResourceId[]
): string | null {
  const byReservation = reservation.anesthetistId?.trim();
  if (byReservation) return byReservation;

  const assignment = assignments.find((a) => {
    if (a.assignmentType !== "OR") return false;
    if (a.date !== reservation.date || a.shift !== reservation.shift) return false;
    if (a.resourceId === ASSIGNMENT_FULL_SHIFT) return true;
    return a.resourceId === reservation.resourceId;
  });
  if (!assignment) return null;
  if (assignment.resourceId === ASSIGNMENT_FULL_SHIFT && !operatingRoomIds.includes(reservation.resourceId)) {
    return null;
  }
  return assignment.anesthetistId;
}

function normalized(value: number, maxAbs: number): number {
  if (!Number.isFinite(value) || maxAbs <= 0) return 0;
  return Math.max(-1, Math.min(1, value / maxAbs));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Escala robusta para margen: evita que outliers dominen el score.
 * - log1p suaviza extremos
 * - conserva signo del margen
 * - salida acotada en [-1, 1]
 */
function normalizedMarginRobust(margin: number, scaleEur: number = 2000): number {
  if (!Number.isFinite(margin) || scaleEur <= 0) return 0;
  const signed = Math.sign(margin) * Math.log1p(Math.abs(margin)) / Math.log1p(scaleEur);
  return Math.max(-1, Math.min(1, signed));
}

/**
 * Ocupación suavizada para estabilidad numérica. Mantiene [0..1] y reduce
 * variaciones bruscas cerca de los extremos.
 */
function smoothOccupancy(occupancy: number): number {
  const o = clamp01(occupancy);
  return 1 / (1 + Math.exp(-8 * (o - 0.5)));
}

/**
 * Penalización progresiva de simultaneidad asistencial:
 * <=1.5 óptimo, (1.5,2] aceptable, >2 penalización fuerte.
 */
function simultaneityRisk(simultaneity: number): number {
  if (!Number.isFinite(simultaneity) || simultaneity <= 1.5) return 0;
  if (simultaneity <= 2) return ((simultaneity - 1.5) / 0.5) * 0.5;
  return Math.min(1, 0.5 + ((simultaneity - 2) / 1) * 0.5);
}

function minuteToClockLabel(shift: Shift, minute: number): string {
  const baseHour = shift === "morning" ? 8 : 15;
  const total = baseHour * 60 + minute;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function evaluateStructuralConfidence(
  simulation: StructuralSimulationOutput,
  steps: StructuralOptimizationStep[],
  minutesProgrammed: number
): { level: RecommendationConfidenceLevel; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;
  const marginDelta = simulation.marginDeltaOptimalVsCurrent;
  const scoreGain = simulation.optimal.score - simulation.current.score;
  const occupancy = simulation.optimal.ocupacion;
  const risk = simulation.optimal.riesgo;
  const dispersionImproved = simulation.optimal.dispersion < simulation.current.dispersion;
  const overlapHigh = simulation.optimal.simultaneidad > 2 || risk >= 0.6;
  const weakScoreGain = scoreGain < 5;
  const incompleteDataSignals =
    minutesProgrammed <= 0 || !Number.isFinite(simulation.current.margen) || !Number.isFinite(simulation.optimal.margen);

  if (marginDelta >= 1200) {
    points += 2;
    reasons.push("mejora económica clara");
  } else if (marginDelta >= 400) {
    points += 1;
    reasons.push("mejora económica moderada");
  } else {
    points -= 1;
    reasons.push("mejora estimada limitada");
  }

  if (scoreGain >= 15) {
    points += 2;
    reasons.push("score claramente positivo");
  } else if (scoreGain >= 5) {
    points += 1;
    reasons.push("score moderadamente positivo");
  } else {
    points -= 1;
    reasons.push("ganancia de score débil");
  }

  if (occupancy >= 0.65) {
    points += 1;
    reasons.push("ocupación suficiente");
  }
  if (risk <= 0.25) {
    points += 1;
    reasons.push("riesgo operativo bajo");
  } else if (risk >= 0.6) {
    points -= 2;
    reasons.push("riesgo operativo alto");
  }
  if (dispersionImproved) {
    points += 1;
    reasons.push("reduce dispersión");
  }
  if (overlapHigh) {
    points -= 2;
    reasons.push("solapamiento elevado");
  }
  if (minutesProgrammed < 120) {
    points -= 2;
    reasons.push("pocos minutos programados");
  }
  if (steps.length === 0) {
    points -= 1;
    reasons.push("depende de supuestos de personal");
  }
  if (weakScoreGain) {
    points -= 1;
  }
  if (incompleteDataSignals) {
    points -= 2;
    reasons.push("datos incompletos para estimación robusta");
  }

  const level: RecommendationConfidenceLevel = points >= 5 ? "alta" : points >= 2 ? "media" : "baja";
  return { level, reasons: Array.from(new Set(reasons)) };
}

export function analyzeTemporalLoad(input: TemporalLoadInput): TemporalLoadAnalysis {
  const validReservations = input.reservations.filter((r) => {
    if (r.status === "cancelled" || r.status === "released") return false;
    if (r.date !== input.date || r.shift !== input.shift) return false;
    if (!input.operatingRoomIds.includes(r.resourceId)) return false;
    return (r.patients ?? []).some((p) => p.scheduleStatus !== "CANCELLED");
  });

  const tramoMinutes = Math.max(30, input.tramoMinutes ?? 120);
  const shiftTotal = shiftDurationMinutes(input.shift);
  const bucketsCount = Math.max(1, Math.ceil(shiftTotal / tramoMinutes));
  const peakThreshold = input.peakThreshold ?? 0.75;

  const anesthesistsByShift = new Set(
    input.assignments
      .filter((a) => a.assignmentType === "OR" && a.date === input.date && a.shift === input.shift)
      .map((a) => a.anesthetistId)
  );
  const fallbackReservationAnesthesia = new Set(validReservations.map((r) => r.anesthetistId).filter(Boolean));
  const anesthesistasDisponibles = Math.max(
    1,
    anesthesistsByShift.size > 0 ? anesthesistsByShift.size : fallbackReservationAnesthesia.size
  );

  const buckets: TemporalLoadBucket[] = [];
  for (let i = 0; i < bucketsCount; i++) {
    const startMinute = i * tramoMinutes;
    const endMinute = Math.min(shiftTotal, startMinute + tramoMinutes);
    const overlapping = validReservations.filter((r) => {
      const interval = toShiftInterval(r);
      return interval.start < endMinute && interval.end > startMinute;
    });
    const minutosOcupados = overlapping.reduce((sum, r) => {
      const interval = toShiftInterval(r);
      const overlap = Math.max(0, Math.min(interval.end, endMinute) - Math.max(interval.start, startMinute));
      return sum + overlap;
    }, 0);
    const quirofanosActivos = new Set(overlapping.map((r) => r.resourceId)).size;
    const intervencionesSimultaneas = overlapping.length;
    const loadFactor = minutosOcupados / Math.max(1, (endMinute - startMinute) * Math.max(1, quirofanosActivos));
    const highSim = intervencionesSimultaneas >= anesthesistasDisponibles + 1;
    const isPeak = loadFactor >= peakThreshold || highSim;
    const hasStaffDeficit = highSim && quirofanosActivos >= anesthesistasDisponibles;

    buckets.push({
      index: i,
      rangeLabel: `${minuteToClockLabel(input.shift, startMinute)}-${minuteToClockLabel(input.shift, endMinute)}`,
      startMinute,
      endMinute,
      minutosOcupados,
      intervencionesSimultaneas,
      quirofanosActivos,
      anestesistasDisponibles: anesthesistasDisponibles,
      isPeak,
      hasStaffDeficit,
    });
  }

  const peakBuckets = buckets.filter((b) => b.isPeak);
  const deficitBuckets = buckets.filter((b) => b.hasStaffDeficit);
  const hasPeak = peakBuckets.length > 0;
  const hasStaffDeficit = deficitBuckets.length > 0;
  const peakRangeLabel = hasPeak ? `${peakBuckets[0]!.rangeLabel}${peakBuckets.length > 1 ? ` / ${peakBuckets[peakBuckets.length - 1]!.rangeLabel}` : ""}` : null;

  const recommendation = hasPeak
    ? hasStaffDeficit
      ? `Se detecta pico de actividad entre ${peakRangeLabel}. Sugerencia (no aplicada): añadir refuerzo parcial de enfermería en la franja central del turno.`
      : `Se detecta pico de actividad entre ${peakRangeLabel}. Sugerencia (no aplicada): ajustar cobertura parcial para absorber variabilidad intra-turno.`
    : "Carga homogénea en el turno. Sugerencia (no aplicada): mantener dotación actual sin refuerzos parciales.";

  const loadRatios = buckets.map((b) =>
    b.minutosOcupados / Math.max(1, (b.endMinute - b.startMinute) * Math.max(1, b.quirofanosActivos))
  );
  const mean = loadRatios.length > 0 ? loadRatios.reduce((s, v) => s + v, 0) / loadRatios.length : 0;
  const variance =
    loadRatios.length > 0
      ? loadRatios.reduce((s, v) => s + (v - mean) * (v - mean), 0) / loadRatios.length
      : 0;
  const stdDev = Math.sqrt(Math.max(0, variance));
  const peakPenalty = clamp01(stdDev);

  return {
    buckets,
    hasPeak,
    hasStaffDeficit,
    peakRangeLabel,
    recommendation,
    estimatedImpact: {
      mejoraOcupacionPct: hasPeak ? 4 : 1,
      mejoraSimultaneidadPct: hasStaffDeficit ? 8 : hasPeak ? 4 : 1,
      evitaAperturaExtra: hasPeak,
    },
    peakPenalty,
  };
}

/**
 * Cálculo incremental puro para análisis "what-if" sin side-effects.
 * No representa margen contable real; es una aproximación marginal.
 */
export function computeIncrementalMargin(input: IncrementalMarginInput): IncrementalMarginResult | null {
  const minutes = input.interventionMinutes ?? null;
  const revPerMin = input.estimatedRevenuePerMinute ?? null;
  const variableCostPerMin = input.estimatedVariableCostPerMinute ?? null;
  if (minutes == null || revPerMin == null || variableCostPerMin == null) return null;
  if (!Number.isFinite(minutes) || !Number.isFinite(revPerMin) || !Number.isFinite(variableCostPerMin)) return null;
  if (minutes <= 0) return null;

  const ingresoEstimado = minutes * revPerMin;
  const costeVariableEstimado = minutes * variableCostPerMin;
  const costeMarginalAsignacion = Math.max(0, input.assignmentMarginalCost ?? 0);
  const margenIncremental = ingresoEstimado - costeVariableEstimado - costeMarginalAsignacion;

  let confidenceLevel: RecommendationConfidenceLevel = "alta";
  if (minutes < 45 || input.assignmentMarginalCost == null) confidenceLevel = "media";
  if (minutes < 20) confidenceLevel = "baja";

  return {
    ingresoEstimado,
    costeVariableEstimado,
    costeMarginalAsignacion,
    margenIncremental,
    confidenceLevel,
  };
}

export function computeBlockOptimization(input: BlockOptimizationInput): BlockOptimizationOutput {
  const shiftMinutes = shiftDurationMinutes(input.shift);
  const validReservations = input.reservations.filter((r) => {
    if (r.status === "cancelled" || r.status === "released") return false;
    if (r.date !== input.date || r.shift !== input.shift) return false;
    if (!input.operatingRoomIds.includes(r.resourceId)) return false;
    return (r.patients ?? []).some((p) => p.scheduleStatus !== "CANCELLED");
  });

  const activeRooms = new Set<ResourceId>();
  let totalMinutes = 0;
  const intervalsByAnesthetist = new Map<string, Interval[]>();
  for (const r of validReservations) {
    activeRooms.add(r.resourceId);
    const i = toShiftInterval(r);
    totalMinutes += Math.max(0, i.end - i.start);
    const anesthetistId = resolveAnesthetistForReservation(r, input.assignments, input.operatingRoomIds);
    if (!anesthetistId) continue;
    const list = intervalsByAnesthetist.get(anesthetistId) ?? [];
    list.push(i);
    intervalsByAnesthetist.set(anesthetistId, list);
  }

  let overlappedMinutes = 0;
  for (const intervals of intervalsByAnesthetist.values()) {
    overlappedMinutes += overlapMinutes(intervals);
  }

  const anesthetistsActive = intervalsByAnesthetist.size;
  const criticalResources = Math.max(
    1,
    anesthetistsActive + Math.max(0, input.sharedStaffEquivalent ?? DEFAULT_SHARED_STAFF_EQUIVALENT)
  );
  const simultaneity = activeRooms.size / criticalResources;
  const safeTotalMinutes = Math.max(1, totalMinutes);
  const overlapLevel = overlappedMinutes / safeTotalMinutes;
  const optThreshold = input.overlapOptimalThreshold ?? UMBRAL_SOLAPAMIENTO_OPTIMO;
  const modThreshold = input.overlapModerateThreshold ?? UMBRAL_SOLAPAMIENTO_MODERADO;
  const criticalLimit = input.overlapCriticalLimit ?? LIMITE_SOLAPAMIENTO_CRITICO;

  let efficiencyBand: EfficiencyBand = "neutra";
  let overlapEfficiency = 0;
  if (overlapLevel <= optThreshold) {
    efficiencyBand = "positiva";
    overlapEfficiency = 1 - overlapLevel / Math.max(optThreshold, 0.01);
  } else if (overlapLevel <= modThreshold) {
    efficiencyBand = "neutra";
    overlapEfficiency = 0;
  } else {
    efficiencyBand = "negativa";
    const excess = overlapLevel - modThreshold;
    overlapEfficiency = -Math.min(1, excess / Math.max(criticalLimit - modThreshold, 0.01));
  }

  const totalRooms = Math.max(input.totalOperatingRoomsInBlock ?? input.operatingRoomIds.length, 1);
  const dispersion = clamp01(1 - activeRooms.size / totalRooms);
  const overlapRisk =
    overlapLevel >= criticalLimit ? 1 : Math.max(0, (overlapLevel - modThreshold) / Math.max(1 - modThreshold, 0.01));
  const simRisk = simultaneityRisk(simultaneity);
  const risk = clamp01(Math.max(overlapRisk, simRisk));
  const confidence = input.confidence ?? 0.7;
  const weights: OptimizationWeights = { ...DEFAULT_OPTIMIZATION_WEIGHTS, ...(input.weights ?? {}) };
  const marginRobust = normalizedMarginRobust(input.margenTurno);
  const occupancySmooth = smoothOccupancy(input.ocupacionGlobal);

  // Score de simulación (no contable): combinación robusta y acotada para evitar dominancia por outliers.
  const score =
    weights.alpha * marginRobust +
    weights.beta * occupancySmooth +
    weights.gamma * confidence -
    weights.delta * dispersion -
    weights.epsilon * risk +
    weights.zeta * overlapEfficiency;

  return {
    recursosCriticos: criticalResources,
    anestesistasActivos: anesthetistsActive,
    numeroQuirofanosActivos: activeRooms.size,
    simultaneidad: simultaneity,
    minutosTotalesBloque: safeTotalMinutes,
    minutosSolapados: overlappedMinutes,
    nivelSolapamiento: overlapLevel,
    eficienciaSolapamiento: overlapEfficiency,
    eficienciaBand: efficiencyBand,
    riesgo: risk,
    dispersion,
    score,
    mejoraEficienciaAnestesia: overlapEfficiency > 0 && simultaneity >= 1,
  };
}

export function evaluateSimulatedMove(
  before: BlockOptimizationOutput,
  after: BlockOptimizationOutput,
  marginDelta: number,
  occupancyDelta: number,
  scoreGainThreshold: number = UMBRAL_GANANCIA_SCORE,
  criticalOverlapLimit: number = LIMITE_SOLAPAMIENTO_CRITICO
): SimulatedMoveDecision {
  const scoreGain = after.score - before.score;
  const exceededCriticalOverlap = after.nivelSolapamiento > criticalOverlapLimit;
  const allowed = scoreGain > scoreGainThreshold && !exceededCriticalOverlap;
  const impact: RecommendationImpact = {
    margenDelta: marginDelta,
    ocupacionDelta: occupancyDelta,
    simultaneidadBefore: before.simultaneidad,
    simultaneidadAfter: after.simultaneidad,
    solapamientoBefore: before.nivelSolapamiento,
    solapamientoAfter: after.nivelSolapamiento,
    mejoraEficienciaAnestesia: after.eficienciaSolapamiento > before.eficienciaSolapamiento,
  };

  const message = [
    "Movimiento recomendado:",
    `Incrementa simultaneidad de ${before.simultaneidad.toFixed(2)} -> ${after.simultaneidad.toFixed(2)}.`,
    `Nivel de solapamiento ${Math.round(before.nivelSolapamiento * 100)}% -> ${Math.round(after.nivelSolapamiento * 100)}%.`,
    `Impacto margen ${marginDelta >= 0 ? "+" : ""}${Math.round(marginDelta)} EUR.`,
    impact.mejoraEficienciaAnestesia ? "Mejora eficiencia de anestesia compartida." : "Sin mejora clara de eficiencia anestesia.",
    allowed ? "Cumple umbral de ganancia y limite critico." : "No cumple criterios de simulacion para aprobar movimiento.",
  ].join(" ");

  return { allowed, scoreGain, exceededCriticalOverlap, impact, message };
}

export function simulateBlockConfigurations(input: StructuralSimulationInput): StructuralSimulationOutput {
  const validReservations = input.reservations.filter((r) => {
    if (r.status === "cancelled" || r.status === "released") return false;
    if (r.date !== input.date || r.shift !== input.shift) return false;
    if (!input.operatingRoomIds.includes(r.resourceId)) return false;
    return (r.patients ?? []).some((p) => p.scheduleStatus !== "CANCELLED");
  });

  const currentOpenedRooms = Math.max(
    1,
    new Set(validReservations.map((r) => r.resourceId)).size || input.operatingRoomIds.length
  );
  const interventions = validReservations.length;
  const baseOptimization = computeBlockOptimization({
    date: input.date,
    shift: input.shift,
    reservations: input.reservations,
    assignments: input.assignments,
    operatingRoomIds: input.operatingRoomIds,
    ingresosTurno: input.ingresosActuales,
    margenTurno: input.margenActual,
    ocupacionGlobal:
      input.minutosProgramadosActuales > 0
        ? clamp01(input.minutosProgramadosActuales / Math.max(1, currentOpenedRooms * input.capacidadPorQuirofano))
        : 0,
    confidence: input.confianza,
    sharedStaffEquivalent: input.sharedStaffEquivalent,
  });

  const currentCost = Math.max(0, input.ingresosActuales - input.margenActual);
  const fixedCostShare = 0.35;
  const fixedCostCurrent = currentCost * fixedCostShare;
  const variableCostCurrent = currentCost - fixedCostCurrent;
  const fixedCostPerRoom = fixedCostCurrent / currentOpenedRooms;
  const targetInterventionsPerRoom = 2;
  const confidence = input.confianza ?? 0.7;
  const weights: OptimizationWeights = { ...DEFAULT_OPTIMIZATION_WEIGHTS, ...(input.weights ?? {}) };
  const temporal = analyzeTemporalLoad({
    date: input.date,
    shift: input.shift,
    reservations: input.reservations,
    assignments: input.assignments,
    operatingRoomIds: input.operatingRoomIds,
  });

  const scenarios: BlockConfigurationScenario[] = [];
  for (let n = 1; n <= input.operatingRoomIds.length; n++) {
    const capacidadTotal = Math.max(1, n * input.capacidadPorQuirofano);
    const minutosProgramados = input.minutosProgramadosActuales;
    const ocupacion = clamp01(minutosProgramados / capacidadTotal);
    const overflowRatio = Math.max(0, minutosProgramados - capacidadTotal) / capacidadTotal;

    const ingresosPenalty = 1 - Math.min(0.25, overflowRatio * 0.4);
    const ingresosTotales = input.ingresosActuales * ingresosPenalty;
    const fixedCostScenario = fixedCostPerRoom * n;
    const variableCostScenario = variableCostCurrent * (1 + Math.min(0.3, overflowRatio * 0.2));
    const margen = ingresosTotales - (fixedCostScenario + variableCostScenario);

    const densidad = interventions > 0 ? interventions / n : 0;
    const quirofanosNecesarios = Math.max(1, Math.ceil(interventions / targetInterventionsPerRoom));
    const dispersion = Math.max(0, n - quirofanosNecesarios);
    const densidadPenalty = densidad < 1 ? 1 - densidad : 0;

    const simultaneidad = n / Math.max(1, baseOptimization.recursosCriticos);
    const riesgoBase = clamp01(Math.max(overflowRatio, densidadPenalty * 0.7));
    const riesgo = clamp01(Math.max(riesgoBase, simultaneityRisk(simultaneidad)) + temporal.peakPenalty * 0.25);
    const eficienciaAnestesia = baseOptimization.eficienciaSolapamiento - Math.max(0, simultaneidad - 1.4) * 0.15;
    const dispersionNorm = clamp01(dispersion / Math.max(1, input.operatingRoomIds.length - 1));
    const marginRobust = normalizedMarginRobust(margen);
    const occupancySmooth = smoothOccupancy(ocupacion);

    // Score estructural robusto: términos principales normalizados y penalización adicional por picos.
    const score =
      weights.alpha * marginRobust +
      weights.beta * occupancySmooth +
      weights.gamma * confidence +
      weights.zeta * eficienciaAnestesia -
      weights.delta * (dispersionNorm + densidadPenalty + temporal.peakPenalty * 0.5) -
      weights.epsilon * riesgo;

    scenarios.push({
      openedOperatingRooms: n,
      ingresosTotales,
      margen,
      minutosProgramados,
      capacidadTotal,
      ocupacion,
      simultaneidad,
      densidad,
      dispersion,
      riesgo,
      eficienciaAnestesia,
      score,
    });
  }

  scenarios.sort((a, b) => b.score - a.score);
  const optimal = scenarios[0]!;
  const current =
    scenarios.find((s) => s.openedOperatingRooms === currentOpenedRooms) ??
    scenarios[scenarios.length - 1]!;
  const marginDelta = optimal.margen - current.margen;
  const recommendation =
    marginDelta > 0
      ? `Se recomienda concentrar actividad en ${optimal.openedOperatingRooms} quirófano(s): mejora estimada +${Math.round(
          marginDelta
        )} EUR, reduce dispersión y mejora ocupación.`
      : `Mantener ${current.openedOperatingRooms} quirófano(s) abiertos: no se observa mejora económica clara al reconfigurar.`;

  return {
    current,
    optimal,
    scenarios,
    marginDeltaOptimalVsCurrent: marginDelta,
    recommendation,
  };
}

export function optimizeBlockIteratively(
  input: StructuralSimulationInput,
  maxIterations: number = 8
): StructuralOptimizationResult {
  const simulation = simulateBlockConfigurations(input);
  const scenariosByRooms = new Map(simulation.scenarios.map((s) => [s.openedOperatingRooms, s]));
  const steps: StructuralOptimizationStep[] = [];

  let current = simulation.current;
  let best = current;
  let converged = false;
  let reason = "Límite de iteraciones alcanzado.";

  for (let i = 1; i <= Math.max(1, maxIterations); i++) {
    const candidates = simulation.scenarios.filter((s) => s.openedOperatingRooms !== current.openedOperatingRooms);
    if (candidates.length === 0) {
      converged = true;
      reason = "No hay movimientos estructurales disponibles.";
      break;
    }

    const betterCandidates = candidates
      .map((c) => ({ scenario: c, gain: c.score - current.score }))
      .filter((c) => c.gain > 0)
      .sort((a, b) => b.gain - a.gain);

    if (betterCandidates.length === 0) {
      converged = true;
      reason = "No mejora adicional de score.";
      break;
    }

    const chosen = betterCandidates[0]!;
    const previous = current;
    current = scenariosByRooms.get(chosen.scenario.openedOperatingRooms) ?? chosen.scenario;
    if (current.score > best.score) best = current;

    const occupancyReason =
      current.ocupacion > previous.ocupacion
        ? "mejora de ocupación"
        : current.ocupacion < previous.ocupacion
          ? "menor ocupación para reducir saturación"
          : "ocupación estable";
    const anesthesiaReason =
      current.eficienciaAnestesia > previous.eficienciaAnestesia
        ? "mejora de eficiencia anestesia"
        : "eficiencia anestesia estable";

    steps.push({
      iteration: i,
      fromOpenedRooms: previous.openedOperatingRooms,
      toOpenedRooms: current.openedOperatingRooms,
      scoreBefore: previous.score,
      scoreAfter: current.score,
      scoreGain: chosen.gain,
      marginBefore: previous.margen,
      marginAfter: current.margen,
      marginDelta: current.margen - previous.margen,
      occupancyBefore: previous.ocupacion,
      occupancyAfter: current.ocupacion,
      anesthesiaEfficiencyBefore: previous.eficienciaAnestesia,
      anesthesiaEfficiencyAfter: current.eficienciaAnestesia,
      reason: `${
        current.openedOperatingRooms < previous.openedOperatingRooms
          ? "Concentrar actividad reduce dispersión estructural."
          : "Abrir más quirófanos reduce riesgo por saturación."
      } ${occupancyReason}; ${anesthesiaReason}.`,
    });
  }

  const iterationsUsed = steps.length;
  const confidence = evaluateStructuralConfidence(simulation, steps, input.minutosProgramadosActuales);
  return {
    initial: simulation.current,
    final: current,
    best,
    steps,
    iterationsUsed,
    converged,
    reason,
    confidenceLevel: confidence.level,
    confidenceReasons: confidence.reasons,
  };
}
