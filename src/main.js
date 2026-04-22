import {
  GESTURES,
  PRESET_MESSAGES,
  classifyGesture as classifyTrackedGesture,
  createHoldTracker,
  getLeftActionSpec,
  getUserHandLabel as resolveHandLabel,
  toDisplayX as mapDisplayX
} from './gestures.js';
import { sendChat } from './api.js';

const MEDIAPIPE_VERSION = '0.10.22-rc.20250304';
const MEDIAPIPE_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;

// ── State ──────────────────────────────────────────────────────────────────
let handLandmarker = null;
let FilesetResolver = null;
let HandLandmarker = null;
let camera = null;
let msgCount = 0;
let conversationHistory = [];
let lastLeftGesture = null;
let leftActionHoldTime = 0;
let leftActionCompleted = false;
let lastRightPromptGesture = null;
const leftActionHoldThreshold = 2000; // ms
let animFrame = null;
let fingerTrails = [];
let isGenerating = false;
let lastLandmarks = null;
let mouseX = 0, mouseY = 0;

const mirrorCamera = true;
let handLabelsSwapped = false;
let trackingPaused = false;
let debugMode = false;
let calibrationTarget = null;
let latestHands = [];
const cursor = document.getElementById('cursor');
const trailCanvas = document.getElementById('trailCanvas');
const trailCtx = trailCanvas.getContext('2d');
const presetMessages = JSON.parse(JSON.stringify(PRESET_MESSAGES));
const leftHoldTracker = createHoldTracker({ threshold: leftActionHoldThreshold });
let selectedPresetGesture = null;

// ── Boot sequence ──────────────────────────────────────────────────────────
async function runBoot() {
  const lines = ['bl1','bl2','bl3','bl4','bl5'];
  for (let i = 0; i < lines.length; i++) {
    await sleep(400 + Math.random() * 300);
    document.getElementById(lines[i]).className = 'boot-line active';
    if (i > 0) document.getElementById(lines[i-1]).className = 'boot-line done';
  }
  await sleep(400);
  document.getElementById('apiKeySection').style.display = 'flex';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

window.initSystem = function() {
  const bootScreen = document.getElementById('bootScreen');
  if (window.gsap) {
    gsap.to('#bootScreen', { opacity: 0, duration: 0.8, onComplete: () => {
      bootScreen.style.display = 'none';
    }});
  } else {
    bootScreen.style.transition = 'opacity 0.8s';
    bootScreen.style.opacity = '0';
    setTimeout(() => {
      bootScreen.style.display = 'none';
    }, 800);
  }
  startClock();
  resizeTrail();
  initTrailLoop();
  initControls();
  initPresetEditor();
  document.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
    fingerTrails.push({ x: e.clientX, y: e.clientY, life: 1, color: '0,255,255' });
  });
}

runBoot();

// ── Clock ──────────────────────────────────────────────────────────────────
function startClock() {
  setInterval(() => {
    const d = new Date();
    document.getElementById('clockDisplay').textContent =
      d.toTimeString().split(' ')[0];
  }, 1000);
}

// ── Trail canvas ───────────────────────────────────────────────────────────
function resizeTrail() {
  trailCanvas.width = window.innerWidth;
  trailCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeTrail);

function initTrailLoop() {
  function loop() {
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    fingerTrails = fingerTrails.filter(t => t.life > 0);
    fingerTrails.forEach(t => {
      trailCtx.beginPath();
      trailCtx.arc(t.x, t.y, 3 * t.life, 0, Math.PI * 2);
      trailCtx.fillStyle = `rgba(${t.color},${t.life * 0.4})`;
      trailCtx.fill();
      t.life -= 0.04;
    });
    requestAnimationFrame(loop);
  }
  loop();
}

// ── Camera & MediaPipe ─────────────────────────────────────────────────────
window.startCamera = async function() {
  const btn = document.getElementById('startCamBtn');
  btn.textContent = 'INITIALIZING...';
  btn.disabled = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    const video = document.getElementById('video');
    video.srcObject = stream;
    video.style.display = 'none';

    await new Promise(r => video.onloadedmetadata = r);

    const canvas = document.getElementById('handCanvas');
    const panel = document.getElementById('camera-panel');
    canvas.width = panel.offsetWidth;
    canvas.height = panel.offsetHeight;

    btn.textContent = 'LOADING VISION MODEL...';
    await loadHandTracking();

    const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_BASE_URL}/wasm`);

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    });

    btn.style.display = 'none';
    document.getElementById('noCamMsg').style.display = 'block';
    document.getElementById('camDot').classList.add('active');

    camera = video;
    detectLoop();
  } catch (err) {
    btn.textContent = '✗ CAMERA ERROR';
    btn.disabled = false;
    btn.style.display = 'block';
    document.getElementById('noCamMsg').style.display = 'none';
    document.getElementById('camDot').classList.remove('active');
    console.error(err);
  }
}

async function loadHandTracking() {
  if (FilesetResolver && HandLandmarker) return;

  const vision = await import(`${MEDIAPIPE_BASE_URL}/vision_bundle.mjs`);
  FilesetResolver = vision.FilesetResolver;
  HandLandmarker = vision.HandLandmarker;
}

// ── Detection loop ─────────────────────────────────────────────────────────
function detectLoop() {
  const video = camera;
  const canvas = document.getElementById('handCanvas');
  const ctx = canvas.getContext('2d');

  function detect() {
    if (video.readyState >= 2) {
      const result = handLandmarker.detectForVideo(video, performance.now());
      drawHands(ctx, canvas, result);
      if (trackingPaused) {
        resetGestureUI();
        setActionState('PAUSED');
      } else {
        processGestures(result);
      }
    }
    animFrame = requestAnimationFrame(detect);
  }
  detect();
}

// ── Hand drawing ───────────────────────────────────────────────────────────
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

function drawHands(ctx, canvas, result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Subtle grid
  ctx.strokeStyle = 'rgba(0,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  if (!result.landmarks || result.landmarks.length === 0) {
    document.getElementById('handCount').textContent = '0';
    return;
  }

  document.getElementById('handCount').textContent = result.landmarks.length;

  result.landmarks.forEach((landmarks, hi) => {
    const color = hi === 0 ? '0,255,255' : '0,255,136';
    const px = landmarks.map(lm => ({
      x: toDisplayX(lm.x) * canvas.width,
      y: lm.y * canvas.height
    }));

    // Bones
    CONNECTIONS.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(px[a].x, px[a].y);
      ctx.lineTo(px[b].x, px[b].y);
      ctx.strokeStyle = `rgba(${color},0.4)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Glow bones
    CONNECTIONS.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(px[a].x, px[a].y);
      ctx.lineTo(px[b].x, px[b].y);
      ctx.strokeStyle = `rgba(${color},0.1)`;
      ctx.lineWidth = 6;
      ctx.stroke();
    });

    // Joints
    px.forEach((p, i) => {
      const isTip = [4,8,12,16,20].includes(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, isTip ? 6 : 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${isTip ? 1 : 0.7})`;
      ctx.fill();
      if (isTip) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},0.15)`;
        ctx.fill();
        // Fingertip trails
        fingerTrails.push({ x: p.x + canvas.getBoundingClientRect().left, y: p.y + canvas.getBoundingClientRect().top, life: 0.8, color });
      }
    });

    lastLandmarks = px;
  });
}

// ── Gesture recognition ────────────────────────────────────────────────────
function toDisplayX(x) {
  return mapDisplayX(x, { mirrorCamera });
}

function classifyGesture(landmarks) {
  return classifyTrackedGesture(landmarks);
}

function getHands(result) {
  return result.landmarks.map((landmarks, index) => {
    const pixels = landmarksToCanvasPixels(landmarks);
    return {
      landmarks,
      pixels,
      index,
      label: getUserHandLabel(result, index, landmarks),
      gesture: classifyGesture(landmarks)
    };
  });
}

function getUserHandLabel(result, index, landmarks) {
  return resolveHandLabel(result, index, landmarks, {
    mirrorCamera,
    swapHandLabels: handLabelsSwapped
  });
}

function landmarksToCanvasPixels(landmarks) {
  const canvas = document.getElementById('handCanvas');
  return landmarks.map(lm => ({
    x: toDisplayX(lm.x) * canvas.width,
    y: lm.y * canvas.height
  }));
}

function processGestures(result) {
  if (!result.landmarks || result.landmarks.length === 0) {
    resetGestureUI();
    if (calibrationTarget) {
      showOverlay('RAISE LEFT HAND');
      setActionState('CALIBRATE');
    }
    return;
  }

  const hands = getHands(result);
  const leftHand = hands.find(hand => hand.label === 'LEFT');
  const rightHand = hands.find(hand => hand.label === 'RIGHT');
  latestHands = hands;
  lastLandmarks = leftHand?.pixels || rightHand?.pixels || null;

  if (calibrationTarget) {
    finishCalibration(hands);
    return;
  }

  updateGestureUI(hands, leftHand, rightHand);
  renderDebug(hands);

  if (rightHand) {
    handleRightPrompt(rightHand);
  } else {
    lastRightPromptGesture = null;
  }

  if (leftHand) {
    handleLeftAction(leftHand);
  } else {
    resetLeftHoldUI();
  }
}

function updateGestureUI(hands, leftHand, rightHand) {
  [
    { side: 'left', hand: leftHand },
    { side: 'right', hand: rightHand }
  ].forEach(({ side, hand }) => {
    GESTURES.forEach(g => {
      const isActive = hand?.gesture.name.toLowerCase() === g;
      const confidence = isActive ? hand.gesture.confidence : 0;

      document.querySelectorAll(`[data-side="${side}"][data-confidence="${g}"]`).forEach(el => {
        el.style.width = (confidence * 100) + '%';
      });
      document.querySelectorAll(`[data-side="${side}"][data-gesture="${g}"]`).forEach(item => {
        item.classList.toggle('active-gesture', isActive);
      });
    });
  });

  const activeParts = [];
  if (leftHand && leftHand.gesture.name !== 'NONE') activeParts.push(`LEFT ${leftHand.gesture.name}`);
  if (rightHand && rightHand.gesture.name !== 'NONE') activeParts.push(`RIGHT ${rightHand.gesture.name}`);

  document.getElementById('activeGestureName').textContent = activeParts.join(' / ') || 'NONE';

  const overlay = document.getElementById('gestureOverlay');
  if (activeParts.length) {
    overlay.textContent = activeParts.join(' / ');
    overlay.style.opacity = '1';
  } else {
    overlay.style.opacity = '0';
  }
}

function handleRightPrompt(hand) {
  const preset = presetMessages[hand.gesture.name];
  if (!preset) {
    lastRightPromptGesture = null;
    return;
  }

  if (isGenerating || hand.gesture.name === lastRightPromptGesture) return;

  const queued = queuePresetMessage(hand.gesture.name);
  lastRightPromptGesture = hand.gesture.name;
  if (!queued) {
    showOverlay('MANUAL PROMPT ACTIVE');
    setActionState('MANUAL');
    return;
  }
  setActionState(`QUEUED ${preset.label}`);
  showOverlay(`RIGHT ${preset.label} QUEUED`);
}

function handleLeftAction(hand) {
  const action = getLeftAction(hand.gesture.name);
  if (!action) {
    resetLeftHoldUI();
    if (!selectedPresetGesture) setActionState('READY');
    return;
  }

  const sendBtn = document.getElementById('sendBtn');
  if (action.name === 'SEND') {
    sendBtn.classList.add('pinch-ready');
    cursor.classList.add('pinch');
  } else {
    sendBtn.classList.remove('pinch-ready');
    cursor.classList.remove('pinch');
  }

  if (action.name === 'SEND') {
    const input = document.getElementById('gestureInput');
    if (!input.value.trim()) {
      showOverlay('TYPE OR RIGHT-HAND PROMPT FIRST');
      setActionState('NO PROMPT');
      resetLeftHoldUI();
      return;
    }

    if (isGenerating) {
      showOverlay('WAITING FOR RESPONSE');
      setActionState('SENDING');
      resetLeftHoldUI();
      return;
    }
  }

  handleLeftHold(hand.gesture.name, hand.pixels[action.pointIndex], action.run);

  const remaining = Math.ceil(Math.max(0, leftActionHoldThreshold - leftActionHoldTime) / 1000);
  showOverlay(leftActionCompleted ? `LEFT ${action.name} COMPLETE` : `HOLD LEFT ${action.name} ${remaining}S`);
  setActionState(leftActionCompleted ? `${action.name} DONE` : `HOLD ${action.name}`);
}

function getLeftAction(gestureName) {
  const spec = getLeftActionSpec(gestureName);
  if (!spec) return null;

  const runners = {
    SEND: () => window.sendMessage(),
    'SCROLL UP': () => scrollMessages(-220),
    'SCROLL DOWN': () => scrollMessages(220),
    CLEAR: clearConversation
  };

  return { ...spec, run: runners[spec.name] };
}

function queuePresetMessage(gestureName) {
  const preset = presetMessages[gestureName];
  const input = document.getElementById('gestureInput');
  const manualInputActive = input.value.trim() && !selectedPresetGesture;

  if (manualInputActive) return false;

  input.value = preset.text;
  selectedPresetGesture = gestureName;
  return true;
}

function handleLeftHold(gestureName, point, onComplete) {
  const state = leftHoldTracker.update(gestureName);
  lastLeftGesture = gestureName;
  leftActionHoldTime = state.elapsed;
  leftActionCompleted = state.completed;
  showHoldProgress(point, state.progress);

  if (state.shouldFire) {
    fireRipple();
    onComplete();
  }
}

function showHoldProgress(point, progress) {
  const pinchRing = document.getElementById('pinchRing');
  const pinchProgress = document.getElementById('pinchProgress');
  const canvas = document.getElementById('handCanvas');
  const rect = canvas.getBoundingClientRect();

  pinchRing.style.display = 'block';
  pinchRing.style.left = (rect.left + point.x) + 'px';
  pinchRing.style.top = (rect.top + point.y) + 'px';
  pinchProgress.style.strokeDashoffset = 157 * (1 - progress);
}

function resetLeftHoldUI() {
  document.getElementById('pinchRing').style.display = 'none';
  document.getElementById('sendBtn').classList.remove('pinch-ready');
  cursor.classList.remove('pinch');
  leftActionHoldTime = 0;
  leftActionCompleted = false;
  lastLeftGesture = null;
  leftHoldTracker.reset();
}

function resetGestureUI() {
  document.getElementById('activeGestureName').textContent = 'NONE';
  document.getElementById('gestureOverlay').style.opacity = '0';
  GESTURES.forEach(g => {
    document.querySelectorAll(`[data-confidence="${g}"]`).forEach(el => {
      el.style.width = '0%';
    });
    document.querySelectorAll(`[data-gesture="${g}"]`).forEach(item => {
      item.classList.remove('active-gesture');
    });
  });
  document.getElementById('handCount').textContent = '0';
  resetLeftHoldUI();
  lastRightPromptGesture = null;
  latestHands = [];
  renderDebug([]);
  setActionState('READY');
}

function scrollMessages(amount) {
  document.getElementById('messages').scrollBy({ top: amount, behavior: 'smooth' });
}

function showOverlay(text) {
  const overlay = document.getElementById('gestureOverlay');
  overlay.textContent = text;
  overlay.style.opacity = '1';
}

function setActionState(text) {
  const el = document.getElementById('actionState');
  if (el) el.textContent = text;
}

function updateModelLatency(latencyMs) {
  const el = document.getElementById('modelLatency');
  if (el) el.textContent = `${latencyMs}MS`;
}

function initControls() {
  document.getElementById('pauseTrackingBtn')?.addEventListener('click', () => {
    trackingPaused = !trackingPaused;
    document.getElementById('pauseTrackingBtn').classList.toggle('active', trackingPaused);
    setActionState(trackingPaused ? 'PAUSED' : 'READY');
  });

  document.getElementById('swapHandsBtn')?.addEventListener('click', () => {
    handLabelsSwapped = !handLabelsSwapped;
    document.getElementById('swapHandsBtn').classList.toggle('active', handLabelsSwapped);
    showOverlay(handLabelsSwapped ? 'HAND LABELS SWAPPED' : 'HAND LABELS NORMAL');
  });

  document.getElementById('debugToggleBtn')?.addEventListener('click', () => {
    debugMode = !debugMode;
    document.getElementById('debugToggleBtn').classList.toggle('active', debugMode);
    document.getElementById('debugPanel').hidden = !debugMode;
    renderDebug(latestHands);
  });

  document.getElementById('calibrateBtn')?.addEventListener('click', () => {
    startCalibration();
  });
}

function initPresetEditor() {
  document.querySelectorAll('[data-preset-input]').forEach(input => {
    const key = input.dataset.presetInput;
    input.value = presetMessages[key]?.text || '';
    input.addEventListener('input', () => {
      if (presetMessages[key]) presetMessages[key].text = input.value.trim();
    });
  });
}

function startCalibration() {
  calibrationTarget = 'LEFT';
  document.getElementById('calibrateBtn')?.classList.add('active');
  showOverlay('RAISE LEFT HAND');
  setActionState('CALIBRATE');
}

function finishCalibration(hands) {
  if (hands.length !== 1) {
    showOverlay('RAISE ONLY LEFT HAND');
    return;
  }

  const [hand] = hands;
  handLabelsSwapped = hand.label !== calibrationTarget;
  calibrationTarget = null;
  document.getElementById('swapHandsBtn')?.classList.toggle('active', handLabelsSwapped);
  document.getElementById('calibrateBtn')?.classList.remove('active');
  showOverlay(handLabelsSwapped ? 'CALIBRATED: SWAPPED' : 'CALIBRATED: NORMAL');
  setActionState('READY');
}

function renderDebug(hands) {
  if (!debugMode) return;
  const panel = document.getElementById('debugPanel');
  if (!panel) return;

  panel.textContent = JSON.stringify({
    paused: trackingPaused,
    swapped: handLabelsSwapped,
    calibrationTarget,
    hands: hands.map(hand => ({
      label: hand.label,
      gesture: hand.gesture.name,
      confidence: Number(hand.gesture.confidence.toFixed(2)),
      wrist: {
        x: Math.round(hand.pixels[0].x),
        y: Math.round(hand.pixels[0].y)
      }
    }))
  }, null, 2);
}

function fireRipple() {
  const pinchRing = document.getElementById('pinchRing');
  const rect = pinchRing.getBoundingClientRect();
  const ripple = document.createElement('div');
  ripple.className = 'gesture-ripple';
  ripple.style.left = (rect.left + 30) + 'px';
  ripple.style.top = (rect.top + 30) + 'px';
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
}

// ── Chat ───────────────────────────────────────────────────────────────────
window.sendMessage = async function() {
  if (isGenerating) return;
  const input = document.getElementById('gestureInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  selectedPresetGesture = null;
  msgCount++;
  document.getElementById('msgCount').textContent = msgCount;

  appendMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  // Typing indicator
  const typingEl = appendTyping();
  isGenerating = true;
  setActionState('SENDING');

  try {
    const { ok, data, latencyMs } = await sendChat(conversationHistory);
    typingEl.remove();
    updateModelLatency(latencyMs);

    if (ok && data.reply) {
      const reply = data.reply;
      conversationHistory.push({ role: 'assistant', content: reply });
      appendMessage('ai', reply);
      setActionState('READY');
    } else {
      appendMessage('ai', `[ ERROR ] ${data.error || 'Unknown error'}`);
      setActionState('ERROR');
    }
  } catch (err) {
    typingEl.remove();
    appendMessage('ai', `[ SYS ERROR ] ${err.message}`);
    setActionState('ERROR');
  }

  isGenerating = false;
}

function appendMessage(role, text) {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `<span class="msg-tag ${role}">${role === 'user' ? 'YOU' : 'AI'}</span><span class="msg-text">${escapeHtml(text)}</span>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function appendTyping() {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `<span class="msg-tag ai">AI</span><div class="typing"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function clearConversation() {
  conversationHistory = [];
  const messages = document.getElementById('messages');
  messages.innerHTML = '';
  appendMessage('sys', '[ FIST GESTURE ] — Conversation cleared. Memory wiped.');
  msgCount = 0;
  document.getElementById('msgCount').textContent = '0';
}

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Enter key
document.addEventListener('keydown', e => {
  const input = document.getElementById('gestureInput');
  if (e.key === 'Enter' && document.activeElement === input) {
    window.sendMessage();
    return;
  }

  if (document.activeElement === input) return;

  const promptKeys = {
    '1': 'OPEN',
    '2': 'PEACE',
    '3': 'THREE',
    '4': 'FIST'
  };

  if (promptKeys[e.key]) {
    queuePresetMessage(promptKeys[e.key]);
    showOverlay(`${presetMessages[promptKeys[e.key]].label} QUEUED`);
    setActionState(`QUEUED ${presetMessages[promptKeys[e.key]].label}`);
  } else if (e.key === 's' || e.key === 'S') {
    window.sendMessage();
  } else if (e.key === 'PageUp' || e.key === 'ArrowUp') {
    scrollMessages(-220);
  } else if (e.key === 'PageDown' || e.key === 'ArrowDown') {
    scrollMessages(220);
  } else if (e.key === ' ') {
    trackingPaused = !trackingPaused;
    document.getElementById('pauseTrackingBtn')?.classList.toggle('active', trackingPaused);
    setActionState(trackingPaused ? 'PAUSED' : 'READY');
  }
});

document.getElementById('gestureInput').addEventListener('input', () => {
  selectedPresetGesture = null;
});
