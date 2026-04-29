export type UnifiedRecommendationCategory =
  | "BOTTLENECK"
  | "DIRECT_LOSS"
  | "STRUCTURAL_INEFFICIENCY"
  | "ECONOMIC_OPPORTUNITY"
  | "DATA_QUALITY"
  | "RISK_CONTAINMENT";

export type UnifiedRecommendationConfidence = "alta" | "media" | "baja";
export type UnifiedRecommendationUrgency = "inmediata" | "revisar_hoy" | "oportunidad";
export type UnifiedRecommendationIntent =
  | "evitar_perdida"
  | "mejorar_eficiencia"
  | "aumentar_margen"
  | "mejorar_datos";
export type UnifiedRecommendationDecisionOutcome =
  | "FAVORABLE"
  | "CONDICIONAL"
  | "NO_RECOMENDADO"
  | "NO_CONCLUYENTE";

export interface UnifiedRecommendation {
  id: string;
  category: UnifiedRecommendationCategory;
  title: string;
  action: string;
  mainReason: string;
  grossImpactEuro: number;
  incrementalCostEuro: number;
  avoidedLossEuro: number;
  netImpactEuro: number;
  confidenceLevel: UnifiedRecommendationConfidence;
  confidenceFactor: number;
  adjustedImpactEuro: number;
  urgency: UnifiedRecommendationUrgency;
  decisionIntent: UnifiedRecommendationIntent;
  decisionOutcome: UnifiedRecommendationDecisionOutcome;
  affectedDate: string | null;
  affectedShift: "morning" | "afternoon" | null;
  affectedResources: string[];
  costOfInaction: number;
  isMisleadingRisk: boolean;
  explanationShort: string;
  explanationForManager: string;
  technicalDetails: string;
  requiresManualValidation: true;
  priorityScore: number;
}

export interface UnifiedRecommendationBuildInput {
  structural: Array<{
    date: string;
    shift: "morning" | "afternoon";
    currentRooms: number;
    optimalRooms: number;
    marginDelta: number;
    confidenceLevel: UnifiedRecommendationConfidence;
    recommendation: string;
  }>;
  temporal: Array<{
    date: string;
    shift: "morning" | "afternoon";
    hasPeak: boolean;
    hasStaffDeficit: boolean;
    peakRangeLabel: string | null;
    estimatedImpact: {
      mejoraOcupacionPct: number;
      mejoraSimultaneidadPct: number;
      evitaAperturaExtra: boolean;
    };
    recommendation: string;
  }>;
  mapEconomic: Array<{
    date: string;
    shift: "morning" | "afternoon";
    resourceId: string;
    estado: "sin_actividad" | "rentable" | "dudoso" | "infrautilizado" | "no_rentable";
    margin: number;
    minutosProgramados: number;
  }>;
  surgeonDynamics?: Array<{
    surgeonId: string;
    surgeonName: string;
    numeroReservas: number;
    tasaCancelacion: number;
    antelacionMediaDias: number | null;
    variabilidadDuracion: number | null;
  }>;
}

function confidenceFactor(level: UnifiedRecommendationConfidence): number {
  if (level === "alta") return 1.0;
  if (level === "media") return 0.7;
  return 0.4;
}

function urgencyFactor(urgency: UnifiedRecommendationUrgency): number {
  if (urgency === "inmediata") return 1.3;
  if (urgency === "revisar_hoy") return 1.0;
  return 0.8;
}

function categoryFactor(category: UnifiedRecommendationCategory): number {
  if (category === "BOTTLENECK") return 1.2;
  if (category === "DIRECT_LOSS") return 1.2;
  if (category === "RISK_CONTAINMENT") return 1.1;
  if (category === "STRUCTURAL_INEFFICIENCY") return 1.0;
  if (category === "ECONOMIC_OPPORTUNITY") return 0.9;
  return 0.5;
}

function decisionOutcomeFrom(
  netImpactEuro: number,
  confidenceLevel: UnifiedRecommendationConfidence,
  dataIncomplete: boolean
): UnifiedRecommendationDecisionOutcome {
  if (dataIncomplete || !Number.isFinite(netImpactEuro)) return "NO_CONCLUYENTE";
  if (netImpactEuro <= 0) return "NO_RECOMENDADO";
  if (confidenceLevel === "alta") return "FAVORABLE";
  return "CONDICIONAL";
}

export function computeRecommendationPriorityScore(recommendation: {
  netImpactEuro: number;
  grossImpactEuro: number;
  confidenceFactor: number;
  urgency: UnifiedRecommendationUrgency;
  category: UnifiedRecommendationCategory;
}): number {
  const hasNet = Number.isFinite(recommendation.netImpactEuro);
  const impactBase = hasNet ? recommendation.netImpactEuro : recommendation.grossImpactEuro * 0.15;
  const raw =
    impactBase *
    recommendation.confidenceFactor *
    recommendation.confidenceFactor *
    urgencyFactor(recommendation.urgency) *
    categoryFactor(recommendation.category);

  // DATA_QUALITY no debe competir por arriba con recomendaciones económicas.
  if (recommendation.category === "DATA_QUALITY") {
    return Math.min(raw, 80);
  }
  // Si el impacto neto es negativo, no puede priorizarse como recomendación económica principal.
  if (hasNet && recommendation.netImpactEuro <= 0) {
    return Math.min(raw, -50);
  }
  return raw;
}

export function buildUnifiedRecommendations(input: UnifiedRecommendationBuildInput): UnifiedRecommendation[] {
  const out: UnifiedRecommendation[] = [];

  for (const s of input.structural) {
    const conf = confidenceFactor(s.confidenceLevel);
    const grossImpactEuro = Math.max(0, s.marginDelta);
    const incrementalCostEuro = Math.max(0, s.currentRooms - s.optimalRooms) * 150;
    const avoidedLossEuro = Math.max(0, grossImpactEuro + Math.max(0, s.currentRooms - s.optimalRooms) * 300);
    const netImpactEuro = grossImpactEuro - incrementalCostEuro;
    const category: UnifiedRecommendationCategory =
      s.marginDelta > 0 ? "STRUCTURAL_INEFFICIENCY" : "RISK_CONTAINMENT";
    const urgency: UnifiedRecommendationUrgency = s.marginDelta > 1000 ? "inmediata" : "revisar_hoy";
    const rec: UnifiedRecommendation = {
      id: `struct-${s.date}-${s.shift}`,
      category,
      title: "Optimización estructural del bloque",
      action: `Reconfigurar de ${s.currentRooms} a ${s.optimalRooms} quirófanos activos`,
      mainReason: "Ineficiencia estructural por dispersión de actividad",
      grossImpactEuro,
      incrementalCostEuro,
      avoidedLossEuro,
      netImpactEuro,
      confidenceLevel: s.confidenceLevel,
      confidenceFactor: conf,
      adjustedImpactEuro: netImpactEuro * conf,
      urgency,
      decisionIntent: "mejorar_eficiencia",
      decisionOutcome: decisionOutcomeFrom(netImpactEuro, s.confidenceLevel, false),
      affectedDate: s.date,
      affectedShift: s.shift,
      affectedResources: [],
      costOfInaction: avoidedLossEuro,
      isMisleadingRisk: grossImpactEuro >= 500 && netImpactEuro <= 100 && s.confidenceLevel === "baja",
      explanationShort: s.recommendation,
      explanationForManager:
        `La simulación sugiere concentrar actividad para reducir dispersión y proteger margen operativo en el bloque. Coste incremental estimado ${incrementalCostEuro.toFixed(
          0
        )} EUR; pérdida evitada ${avoidedLossEuro.toFixed(0)} EUR; impacto neto ${netImpactEuro.toFixed(0)} EUR.`,
      technicalDetails: `deltaMargen=${s.marginDelta.toFixed(2)}; rooms=${s.currentRooms}->${s.optimalRooms}; incCost=${incrementalCostEuro.toFixed(
        2
      )}; avoided=${avoidedLossEuro.toFixed(2)}; net=${netImpactEuro.toFixed(2)}; conf=${s.confidenceLevel}`,
      requiresManualValidation: true,
      priorityScore: 0,
    };
    rec.priorityScore = computeRecommendationPriorityScore(rec);
    out.push(rec);
  }

  for (const t of input.temporal) {
    const confidenceLevel: UnifiedRecommendationConfidence = t.hasStaffDeficit ? "media" : t.hasPeak ? "media" : "baja";
    const conf = confidenceFactor(confidenceLevel);
    const incrementalCostEuro = t.hasPeak ? 220 : 0;
    const avoidedLossEuro = t.hasPeak ? (t.hasStaffDeficit ? 850 : 420) : 0;
    const grossImpactEuro = avoidedLossEuro;
    const netImpactEuro = avoidedLossEuro - incrementalCostEuro;
    const bottleneckPositive = t.hasPeak && avoidedLossEuro > incrementalCostEuro;
    const category: UnifiedRecommendationCategory = t.hasPeak ? "BOTTLENECK" : "DATA_QUALITY";
    const urgency: UnifiedRecommendationUrgency = t.hasStaffDeficit ? "inmediata" : t.hasPeak ? "revisar_hoy" : "oportunidad";
    const rec: UnifiedRecommendation = {
      id: `temp-${t.date}-${t.shift}`,
      category,
      title: "Cobertura por franja horaria",
      action: t.hasPeak
        ? `Añadir refuerzo parcial de enfermería en ${t.peakRangeLabel ?? "franja pico"}`
        : "Mantener cobertura actual y monitorizar",
      mainReason: t.hasPeak ? "Cuello de botella operativo en franja de alta simultaneidad" : "Sin cuello de botella claro",
      grossImpactEuro,
      incrementalCostEuro,
      avoidedLossEuro,
      netImpactEuro,
      confidenceLevel,
      confidenceFactor: conf,
      adjustedImpactEuro: netImpactEuro * conf,
      urgency,
      decisionIntent: t.hasPeak ? "evitar_perdida" : "mejorar_datos",
      decisionOutcome: decisionOutcomeFrom(netImpactEuro, confidenceLevel, !t.hasPeak),
      affectedDate: t.date,
      affectedShift: t.shift,
      affectedResources: [],
      costOfInaction: avoidedLossEuro,
      isMisleadingRisk: grossImpactEuro >= 500 && netImpactEuro <= 100 && confidenceLevel === "baja",
      explanationShort: t.recommendation,
      explanationForManager: t.hasPeak
        ? bottleneckPositive
          ? `El refuerzo se plantea como contención de pérdidas operativas por saturación, no como ahorro directo. Coste incremental ${incrementalCostEuro.toFixed(
              0
            )} EUR; pérdida evitada ${avoidedLossEuro.toFixed(0)} EUR; impacto neto ${netImpactEuro.toFixed(0)} EUR.`
          : `Se detecta cuello de botella, pero con impacto neto no concluyente (coste incremental ${incrementalCostEuro.toFixed(
              0
            )} EUR >= pérdida evitada ${avoidedLossEuro.toFixed(
              0
            )} EUR). Requiere revisión manual antes de priorizar inversión.`
        : "No se detecta saturación crítica; mantener observación operativa.",
      technicalDetails: `peak=${t.hasPeak}; deficit=${t.hasStaffDeficit}; incCost=${incrementalCostEuro.toFixed(
        2
      )}; avoided=${avoidedLossEuro.toFixed(2)}; net=${netImpactEuro.toFixed(2)}; occDelta=${t.estimatedImpact.mejoraOcupacionPct}%`,
      requiresManualValidation: true,
      priorityScore: 0,
    };
    rec.priorityScore = computeRecommendationPriorityScore(rec);
    out.push(rec);
  }

  for (const m of input.mapEconomic) {
    if (m.estado !== "no_rentable" && m.estado !== "infrautilizado") continue;
    const category: UnifiedRecommendationCategory = m.estado === "no_rentable" ? "DIRECT_LOSS" : "ECONOMIC_OPPORTUNITY";
    const confidenceLevel: UnifiedRecommendationConfidence = m.minutosProgramados >= 120 ? "media" : "baja";
    const conf = confidenceFactor(confidenceLevel);
    const grossImpactEuro = Math.max(0, Math.abs(m.margin) * (m.estado === "no_rentable" ? 0.8 : 0.2));
    const incrementalCostEuro = 0;
    const avoidedLossEuro = grossImpactEuro;
    const netImpactEuro = grossImpactEuro;
    const rec: UnifiedRecommendation = {
      id: `map-${m.date}-${m.shift}-${m.resourceId}`,
      category,
      title: "Ajuste económico de turno",
      action: m.estado === "no_rentable" ? "Revisar continuidad o concentración del turno" : "Reagrupar carga para subir densidad",
      mainReason: m.estado === "no_rentable" ? "Pérdida económica directa del turno" : "Oportunidad de margen por mejora de ocupación",
      grossImpactEuro,
      incrementalCostEuro,
      avoidedLossEuro,
      netImpactEuro,
      confidenceLevel,
      confidenceFactor: conf,
      adjustedImpactEuro: netImpactEuro * conf,
      urgency: m.estado === "no_rentable" ? "revisar_hoy" : "oportunidad",
      decisionIntent: m.estado === "no_rentable" ? "evitar_perdida" : "aumentar_margen",
      decisionOutcome: decisionOutcomeFrom(netImpactEuro, confidenceLevel, false),
      affectedDate: m.date,
      affectedShift: m.shift,
      affectedResources: [m.resourceId],
      costOfInaction: avoidedLossEuro,
      isMisleadingRisk: grossImpactEuro >= 500 && netImpactEuro <= 100 && confidenceLevel === "baja",
      explanationShort: m.estado === "no_rentable" ? "Turno con riesgo de pérdida operativa." : "Turno con baja densidad de carga.",
      explanationForManager:
        m.estado === "no_rentable"
          ? `Se prioriza evitar pérdidas mayores del turno. Coste incremental ${incrementalCostEuro.toFixed(
              0
            )} EUR; pérdida evitada ${avoidedLossEuro.toFixed(0)} EUR; impacto neto ${netImpactEuro.toFixed(0)} EUR.`
          : `Se prioriza captura de margen potencial sin cambios automáticos. Coste incremental ${incrementalCostEuro.toFixed(
              0
            )} EUR; pérdida evitada ${avoidedLossEuro.toFixed(0)} EUR; impacto neto ${netImpactEuro.toFixed(0)} EUR.`,
      technicalDetails: `estado=${m.estado}; margen=${m.margin.toFixed(2)}; min=${m.minutosProgramados}; incCost=${incrementalCostEuro.toFixed(
        2
      )}; avoided=${avoidedLossEuro.toFixed(2)}; net=${netImpactEuro.toFixed(2)}`,
      requiresManualValidation: true,
      priorityScore: 0,
    };
    rec.priorityScore = computeRecommendationPriorityScore(rec);
    out.push(rec);
  }

  for (const s of input.surgeonDynamics ?? []) {
    const lowVolume = s.numeroReservas < 3;
    const highCancel = s.tasaCancelacion >= 20 && s.numeroReservas >= 3;
    if (!lowVolume && !highCancel) continue;
    const category: UnifiedRecommendationCategory = lowVolume ? "DATA_QUALITY" : "RISK_CONTAINMENT";
    const confidenceLevel: UnifiedRecommendationConfidence = lowVolume ? "baja" : "media";
    const conf = confidenceFactor(confidenceLevel);
    const grossImpactEuro = lowVolume ? 0 : 280;
    const netImpactEuro = grossImpactEuro;
    const rec: UnifiedRecommendation = {
      id: `dyn-${s.surgeonId}`,
      category,
      title: "Patrón de programación por cirujano",
      action: lowVolume ? "Revisar con más histórico antes de concluir" : "Revisar patrón de cancelaciones y anticipación",
      mainReason: lowVolume ? "Calidad de datos insuficiente" : "Riesgo operativo por patrón inestable",
      grossImpactEuro,
      incrementalCostEuro: 0,
      avoidedLossEuro: grossImpactEuro,
      netImpactEuro,
      confidenceLevel,
      confidenceFactor: conf,
      adjustedImpactEuro: netImpactEuro * conf,
      urgency: lowVolume ? "oportunidad" : "revisar_hoy",
      decisionIntent: lowVolume ? "mejorar_datos" : "evitar_perdida",
      decisionOutcome: decisionOutcomeFrom(netImpactEuro, confidenceLevel, lowVolume),
      affectedDate: null,
      affectedShift: null,
      affectedResources: [],
      costOfInaction: grossImpactEuro,
      isMisleadingRisk: grossImpactEuro >= 500 && netImpactEuro <= 100 && confidenceLevel === "baja",
      explanationShort: lowVolume
        ? `Volumen semanal bajo para ${s.surgeonName}; interpretación con cautela.`
        : `Patrón de cancelaciones elevado en ${s.surgeonName}.`,
      explanationForManager: lowVolume
        ? "La recomendación prioriza calidad de datos antes de decidir ajustes operativos."
        : `Se sugiere revisar causa operativa de cancelaciones para contener riesgo. Coste incremental 0 EUR; pérdida evitada ${grossImpactEuro.toFixed(
            0
          )} EUR; impacto neto ${netImpactEuro.toFixed(0)} EUR.`,
      technicalDetails: `reservas=${s.numeroReservas}; cancel=${s.tasaCancelacion.toFixed(
        1
      )}%; lead=${s.antelacionMediaDias ?? -1}; incCost=0.00; avoided=${grossImpactEuro.toFixed(2)}; net=${netImpactEuro.toFixed(
        2
      )}`,
      requiresManualValidation: true,
      priorityScore: 0,
    };
    rec.priorityScore = computeRecommendationPriorityScore(rec);
    out.push(rec);
  }

  const hasActionable = out.some((r) => r.decisionOutcome === "FAVORABLE" || r.decisionOutcome === "CONDICIONAL");
  if (!hasActionable) {
    const fallback: UnifiedRecommendation = {
      id: "maintain-current-configuration",
      category: "RISK_CONTAINMENT",
      title: "Mantener configuración actual",
      action: "Mantener configuración actual hasta contar con evidencia adicional",
      mainReason: "No se detectan mejoras claras o las opciones actuales son no recomendadas",
      grossImpactEuro: 0,
      incrementalCostEuro: 0,
      avoidedLossEuro: 0,
      netImpactEuro: 0,
      confidenceLevel: "media",
      confidenceFactor: confidenceFactor("media"),
      adjustedImpactEuro: 0,
      urgency: "revisar_hoy",
      decisionIntent: "mejorar_datos",
      decisionOutcome: "NO_CONCLUYENTE",
      affectedDate: null,
      affectedShift: null,
      affectedResources: [],
      costOfInaction: 0,
      isMisleadingRisk: false,
      explanationShort: "No hay base suficiente para recomendar cambios económicos favorables.",
      explanationForManager:
        "Se propone mantener configuración actual y reforzar captura/calidad de datos antes de intervenir.",
      technicalDetails: "fallback=maintain-current; reason=no-actionable-recommendations",
      requiresManualValidation: true,
      priorityScore: 0,
    };
    fallback.priorityScore = computeRecommendationPriorityScore(fallback);
    out.push(fallback);
  }

  out.sort((a, b) => b.priorityScore - a.priorityScore);
  return out;
}
