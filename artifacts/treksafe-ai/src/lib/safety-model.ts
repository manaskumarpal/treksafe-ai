/**
 * In-browser Random Forest proof of concept trained on deterministic synthetic data.
 * This is for demonstration only; it is not calibrated or validated for real-world safety.
 */

export type SafetyLabel = 'SAFE' | 'CAUTION' | 'DANGER';
export type ObjectCategory = 'none' | 'wildlife' | 'obstacle';
export type TerrainType = 'easy' | 'rocky' | 'steep' | 'wet';
export type EnvironmentalCondition = 'clear' | 'rain' | 'wind' | 'fog';

export interface SafetyFeatures {
  objectDistanceM: number;
  objectCategory: ObjectCategory;
  terrainType: TerrainType;
  slopeDegrees: number;
  visibilityM: number;
  temperatureC: number;
  animalProximity: boolean;
  obstacleDensity: number;
  environmentalCondition: EnvironmentalCondition;
}

export interface Prediction {
  label: SafetyLabel;
  /** Share of trees voting for the winning label, as a fraction from 0 to 1. */
  confidence: number;
  /** Tree vote shares, each a fraction from 0 to 1. These are not calibrated probabilities. */
  voteShares: Record<SafetyLabel, number>;
  reasons: string[];
}

export interface SafetySample {
  features: SafetyFeatures;
  label: SafetyLabel;
}

type Vector = number[];
type TreeNode =
  | { prediction: SafetyLabel; leaf: true }
  | { feature: number; threshold: number; left: TreeNode; right: TreeNode; leaf: false };

const LABELS: SafetyLabel[] = ['SAFE', 'CAUTION', 'DANGER'];
const TERRAIN_CODES: Record<TerrainType, number> = { easy: 0, rocky: 1, wet: 2, steep: 3 };
const OBJECT_CODES: Record<ObjectCategory, number> = { none: 0, obstacle: 1, wildlife: 2 };
const WEATHER_CODES: Record<EnvironmentalCondition, number> = {
  clear: 0,
  wind: 1,
  rain: 2,
  fog: 3,
};

const FEATURE_NAMES = [
  'objectDistanceM',
  'objectCategory',
  'terrainType',
  'slopeDegrees',
  'visibilityM',
  'temperatureC',
  'animalProximity',
  'obstacleDensity',
  'environmentalCondition',
] as const;

function encode(features: SafetyFeatures): Vector {
  return [
    clamp(features.objectDistanceM, 0, 200),
    OBJECT_CODES[features.objectCategory],
    TERRAIN_CODES[features.terrainType],
    clamp(features.slopeDegrees, 0, 70),
    clamp(features.visibilityM, 0, 1000),
    clamp(features.temperatureC, -20, 55),
    features.animalProximity ? 1 : 0,
    clamp(features.obstacleDensity, 0, 100),
    WEATHER_CODES[features.environmentalCondition],
  ];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function syntheticFeatures(random: () => number): SafetyFeatures {
  const weather = pick(random, ['clear', 'wind', 'rain', 'fog'] as const);
  const visibilityM =
    weather === 'fog'
      ? 25 + random() * 180
      : weather === 'rain'
        ? 80 + random() * 360
        : 180 + random() * 820;
  const objectCategory = pick(random, ['none', 'none', 'none', 'wildlife', 'obstacle'] as const);
  const terrainType = pick(random, ['easy', 'rocky', 'steep', 'wet'] as const);

  return {
    objectDistanceM:
      objectCategory === 'none' ? 60 + random() * 140 : 3 + random() * 115,
    objectCategory,
    terrainType,
    slopeDegrees:
      terrainType === 'steep'
        ? 24 + random() * 40
        : terrainType === 'rocky' || terrainType === 'wet'
          ? 8 + random() * 34
          : random() * 24,
    visibilityM,
    temperatureC: -5 + random() * 40,
    animalProximity: objectCategory === 'wildlife' && random() > 0.22,
    obstacleDensity:
      objectCategory === 'obstacle' ? 28 + random() * 72 : random() * 48,
    environmentalCondition: weather,
  };
}

function syntheticLabel(features: SafetyFeatures, random: () => number): SafetyLabel {
  const wildlifeRisk =
    features.objectCategory === 'wildlife' &&
    (features.objectDistanceM < 30 || features.animalProximity);
  const closeObstacle =
    features.objectCategory === 'obstacle' &&
    (features.objectDistanceM < 10 || features.obstacleDensity > 78);
  const severeTerrain =
    features.slopeDegrees >= 42 ||
    (features.terrainType === 'steep' && features.slopeDegrees >= 32);
  const unsafeVisibility = features.visibilityM < 55;
  const compoundingConditions = [
    features.terrainType === 'wet' && features.slopeDegrees > 26,
    features.environmentalCondition === 'fog' && features.visibilityM < 140,
    features.environmentalCondition === 'rain' && features.obstacleDensity > 55,
  ].filter(Boolean).length;

  if (wildlifeRisk || closeObstacle || severeTerrain || unsafeVisibility || compoundingConditions >= 2) {
    return 'DANGER';
  }

  const cautionFactors = [
    features.objectCategory !== 'none' && features.objectDistanceM < 70,
    features.slopeDegrees >= 24,
    features.visibilityM < 240,
    features.environmentalCondition === 'rain' || features.environmentalCondition === 'fog',
    features.terrainType === 'rocky' || features.terrainType === 'wet',
    features.obstacleDensity >= 48,
    features.temperatureC < 0 || features.temperatureC > 35,
  ].filter(Boolean).length;
  const boundaryNoise = random() < 0.035;

  if (cautionFactors >= 2 || boundaryNoise) return 'CAUTION';
  return 'SAFE';
}

function pick<T>(random: () => number, options: readonly T[]): T {
  return options[Math.floor(random() * options.length)];
}

/** Return reproducible, labeled synthetic examples for the demo and analytics page. */
export function generateSyntheticDataset(count = 720): SafetySample[] {
  const random = seededRandom(20260418);
  return Array.from({ length: count }, () => {
    const features = syntheticFeatures(random);
    return { features, label: syntheticLabel(features, random) };
  });
}

const TRAINING_DATA = generateSyntheticDataset();

function entropy(rows: Array<{ vector: Vector; label: SafetyLabel }>): number {
  if (rows.length === 0) return 0;
  const counts = new Map<SafetyLabel, number>();
  for (const row of rows) counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => {
    const probability = count / rows.length;
    return sum - probability * Math.log2(probability);
  }, 0);
}

function majorityLabel(rows: Array<{ vector: Vector; label: SafetyLabel }>): SafetyLabel {
  const counts: Record<SafetyLabel, number> = { SAFE: 0, CAUTION: 0, DANGER: 0 };
  for (const row of rows) counts[row.label] += 1;
  return LABELS.reduce((best, label) => (counts[label] > counts[best] ? label : best), 'SAFE');
}

function trainTree(
  rows: Array<{ vector: Vector; label: SafetyLabel }>,
  random: () => number,
  depth = 0,
): TreeNode {
  const label = majorityLabel(rows);
  if (depth >= 7 || rows.length < 12 || entropy(rows) < 0.08) {
    return { leaf: true, prediction: label };
  }

  const featureIndexes = Array.from({ length: FEATURE_NAMES.length }, (_, index) => index);
  for (let i = featureIndexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [featureIndexes[i], featureIndexes[j]] = [featureIndexes[j], featureIndexes[i]];
  }
  const candidateIndexes = featureIndexes.slice(0, 3);
  const parentEntropy = entropy(rows);
  let bestGain = 0.012;
  let bestSplit: { feature: number; threshold: number; left: typeof rows; right: typeof rows } | null =
    null;

  for (const feature of candidateIndexes) {
    const values = rows.map((row) => row.vector[feature]).sort((a, b) => a - b);
    const uniqueValues = [...new Set(values)];
    const thresholds =
      uniqueValues.length <= 8
        ? uniqueValues.slice(1).map((value, index) => (uniqueValues[index] + value) / 2)
        : [0.2, 0.4, 0.6, 0.8].map((quantile) => values[Math.floor(values.length * quantile)]);

    for (const threshold of thresholds) {
      const left = rows.filter((row) => row.vector[feature] <= threshold);
      const right = rows.filter((row) => row.vector[feature] > threshold);
      if (left.length < 5 || right.length < 5) continue;
      const gain =
        parentEntropy -
        (left.length / rows.length) * entropy(left) -
        (right.length / rows.length) * entropy(right);
      if (gain > bestGain) {
        bestGain = gain;
        bestSplit = { feature, threshold, left, right };
      }
    }
  }

  if (!bestSplit) return { leaf: true, prediction: label };
  return {
    leaf: false,
    feature: bestSplit.feature,
    threshold: bestSplit.threshold,
    left: trainTree(bestSplit.left, random, depth + 1),
    right: trainTree(bestSplit.right, random, depth + 1),
  };
}

function classify(tree: TreeNode, vector: Vector): SafetyLabel {
  if (tree.leaf) return tree.prediction;
  return classify(vector[tree.feature] <= tree.threshold ? tree.left : tree.right, vector);
}

const FOREST = (() => {
  const random = seededRandom(89017);
  const rows = TRAINING_DATA.map((sample) => ({
    vector: encode(sample.features),
    label: sample.label,
  }));
  return Array.from({ length: 13 }, () => {
    const bootstrap = Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)]);
    return trainTree(bootstrap, random);
  });
})();

/** Classify one simulated sensor reading using 13 bootstrapped decision trees. */
export function predictSafety(features: SafetyFeatures): Prediction {
  const vector = encode(features);
  const counts: Record<SafetyLabel, number> = { SAFE: 0, CAUTION: 0, DANGER: 0 };
  for (const tree of FOREST) counts[classify(tree, vector)] += 1;
  const label = majorityLabel(
    LABELS.flatMap((candidate) =>
      Array.from({ length: counts[candidate] }, () => ({ vector: [], label: candidate })),
    ),
  );
  const voteShares = Object.fromEntries(
    LABELS.map((candidate) => [candidate, counts[candidate] / FOREST.length]),
  ) as Record<SafetyLabel, number>;
  const reasons = buildReasons(features, label);

  return {
    label,
    confidence: counts[label] / FOREST.length,
    voteShares,
    reasons,
  };
}

function buildReasons(features: SafetyFeatures, label: SafetyLabel): string[] {
  const reasons: string[] = [];
  if (features.objectCategory === 'wildlife' && features.animalProximity) {
    reasons.push(`Simulated wildlife signal at ${Math.round(features.objectDistanceM)} m`);
  }
  if (features.objectCategory === 'obstacle') {
    reasons.push(`Simulated obstacle ${Math.round(features.objectDistanceM)} m away`);
  }
  if (features.slopeDegrees >= 24 || features.terrainType === 'steep') {
    reasons.push(`Terrain slope: ${Math.round(features.slopeDegrees)}°`);
  }
  if (features.visibilityM < 240) {
    reasons.push(`Reduced visibility: ${Math.round(features.visibilityM)} m`);
  }
  if (features.environmentalCondition !== 'clear') {
    reasons.push(`Environmental condition: ${features.environmentalCondition}`);
  }
  if (features.obstacleDensity >= 48) {
    reasons.push(`Elevated obstacle density: ${Math.round(features.obstacleDensity)}%`);
  }
  if (reasons.length === 0) {
    reasons.push(label === 'SAFE' ? 'No elevated demo risk features' : 'Combined simulated conditions');
  }
  return reasons.slice(0, 4);
}

export const SYNTHETIC_DATASET_INFO = {
  samples: TRAINING_DATA.length,
  algorithm: 'Random Forest (13 bootstrapped decision trees)',
  featureCount: FEATURE_NAMES.length,
  labels: LABELS,
  isSynthetic: true,
} as const;

