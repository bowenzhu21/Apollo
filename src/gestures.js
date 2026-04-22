export const GESTURES = ['open', 'pinch', 'fist', 'peace', 'three'];

export const PRESET_MESSAGES = {
  OPEN: {
    label: 'PROMPT 1',
    text: 'Brief me on the current situation and identify the most important next move.'
  },
  PEACE: {
    label: 'PROMPT 2',
    text: 'Compare the best options, include tradeoffs, and recommend one.'
  },
  THREE: {
    label: 'PROMPT 3',
    text: 'Turn this into a concrete step-by-step plan with checkpoints.'
  },
  FIST: {
    label: 'PROMPT 4',
    text: 'Critique the current approach: risks, weak assumptions, and a stronger alternative.'
  }
};

export function toDisplayX(x, { mirrorCamera = true } = {}) {
  return mirrorCamera ? 1 - x : x;
}

export function classifyGesture(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) {
    return { name: 'NONE', confidence: 0 };
  }

  const lm = landmarks;
  const thumbTip = lm[4], indexTip = lm[8], middleTip = lm[12], ringTip = lm[16], pinkyTip = lm[20];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp01 = value => Math.max(0, Math.min(1, value));

  const indexUp = indexTip.y < lm[6].y;
  const middleUp = middleTip.y < lm[10].y;
  const ringUp = ringTip.y < lm[14].y;
  const pinkyUp = pinkyTip.y < lm[18].y;
  const allFingersDown = !indexUp && !middleUp && !ringUp && !pinkyUp;

  const pinchDist = dist(thumbTip, indexTip);
  const palmSize = Math.max(dist(lm[5], lm[17]), dist(lm[0], lm[9]), 0.001);
  const pinchRatio = pinchDist / palmSize;

  if (!allFingersDown && pinchRatio < 0.45) {
    return { name: 'PINCH', confidence: clamp01((0.45 - pinchRatio) / 0.25) };
  }

  if (allFingersDown) return { name: 'FIST', confidence: 0.9 };
  if (indexUp && middleUp && ringUp && pinkyUp) return { name: 'OPEN', confidence: 0.85 };
  if (indexUp && middleUp && ringUp && !pinkyUp) return { name: 'THREE', confidence: 0.85 };
  if (indexUp && middleUp && !ringUp && !pinkyUp) return { name: 'PEACE', confidence: 0.85 };

  return { name: 'NONE', confidence: 0 };
}

export function getUserHandLabel(result, index, landmarks, options = {}) {
  const rawLabel = getRawHandLabel(result, index);
  if (rawLabel === 'UNKNOWN') return inferHandFromPosition(landmarks, options);
  return options.swapHandLabels ? swapHandLabel(rawLabel) : rawLabel;
}

export function getRawHandLabel(result, index) {
  const handedness =
    result.handednesses?.[index]?.[0] ||
    result.handedness?.[index]?.[0] ||
    result.handednesses?.[index] ||
    result.handedness?.[index];

  const label = handedness?.categoryName || handedness?.displayName || handedness?.label;
  return typeof label === 'string' ? label.toUpperCase() : 'UNKNOWN';
}

export function swapHandLabel(label) {
  if (label === 'LEFT') return 'RIGHT';
  if (label === 'RIGHT') return 'LEFT';
  return label;
}

export function inferHandFromPosition(landmarks, options = {}) {
  return toDisplayX(landmarks[0].x, options) >= 0.5 ? 'RIGHT' : 'LEFT';
}

export function getLeftActionSpec(gestureName) {
  switch (gestureName) {
    case 'PINCH':
      return { name: 'SEND', pointIndex: 8 };
    case 'PEACE':
      return { name: 'SCROLL UP', pointIndex: 12 };
    case 'OPEN':
      return { name: 'SCROLL DOWN', pointIndex: 9 };
    case 'FIST':
      return { name: 'CLEAR', pointIndex: 0 };
    default:
      return null;
  }
}

export function createHoldTracker({ threshold = 2000, now = () => Date.now() } = {}) {
  let activeGesture = null;
  let startedAt = 0;
  let completed = false;

  return {
    update(gestureName) {
      const currentTime = now();
      if (activeGesture !== gestureName) {
        activeGesture = gestureName;
        startedAt = currentTime;
        completed = false;
      }

      const elapsed = currentTime - startedAt;
      const progress = Math.min(elapsed / threshold, 1);
      const shouldFire = elapsed >= threshold && !completed;
      if (shouldFire) completed = true;

      return { elapsed, progress, shouldFire, completed };
    },
    reset() {
      activeGesture = null;
      startedAt = 0;
      completed = false;
    },
    get activeGesture() {
      return activeGesture;
    }
  };
}
