let gazeEnabled = false;
let currentElement = null;
const SCALE = 1.5;
const DURATION = 200;

// --- smoothing เพื่อลด jitter ---
let lastX = null, lastY = null;
function smoothGaze(x, y, alpha = 0.2) {
  if (lastX === null || lastY === null) {
    lastX = x; lastY = y;
    return { x, y };
  }
  lastX = lastX + alpha * (x - lastX);
  lastY = lastY + alpha * (y - lastY);
  return { x: lastX, y: lastY };
}

// --- ขยาย element ตาม gaze ---
function enlargeElementByGaze(el, gazeX, gazeY) {
  const rect = el.getBoundingClientRect();
  if (
    gazeX >= rect.left && gazeX <= rect.right &&
    gazeY >= rect.top && gazeY <= rect.bottom
  ) {
    if (currentElement && currentElement !== el) resetElement(currentElement);

    const offsetX = ((gazeX - rect.left) / rect.width) * 100;
    const offsetY = ((gazeY - rect.top) / rect.height) * 100;

    el.style.transition = `transform ${DURATION}ms ease`;
    el.style.transformOrigin = `${offsetX}% ${offsetY}%`;
    el.style.transform = `scale(${SCALE})`;
    el.style.zIndex = 999;

    currentElement = el;
  } else if (currentElement === el) {
    resetElement(el);
  }
}

function resetElement(el) {
  el.style.transform = 'scale(1)';
  el.style.transformOrigin = 'center center';
  el.style.zIndex = '';
  el.style.transition = `transform ${DURATION}ms ease`;
  if (currentElement === el) currentElement = null;
}

// --- ฟัง message จาก popup ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "ENABLE_GAZE") {
    gazeEnabled = true;
    startGazeTracking();
    startAgeEstimation(); // เริ่มฟังก์ชันวัดอายุพร้อมกัน
  }
  if (msg.type === "DISABLE_GAZE") {
    gazeEnabled = false;
    if (currentElement) resetElement(currentElement);
  }
  if (msg.type === "CALIBRATE") {
    setupCalibration();
  }
});

// --- ตรวจ mirror ของ video ---
function getCorrectedX(x) {
  const video = document.querySelector('video');
  if (!video) return x;

  const isMirrored = video.style.transform.includes('scaleX(-1)');
  return isMirrored ? window.innerWidth - x : x;
}

// --- เริ่ม gaze tracking ---
function startGazeTracking() {
  if (window.webgazerInitialized) return;
  window.webgazerInitialized = true;

  webgazer.setGazeListener((data) => {
    if (!gazeEnabled || !data) return;

    let { x, y } = smoothGaze(data.x, data.y);
    x = getCorrectedX(x);

    document.querySelectorAll("img, p, span, h1, h2, h3, h4, h5, h6").forEach(el => {
      enlargeElementByGaze(el, x, y);
    });
  }).begin();
}

// --- Calibration 9 จุด (3x3) ---
function setupCalibration() {
  webgazer.showVideo(true);
  webgazer.showFaceOverlay(true);
  webgazer.showPredictionPoints(true);

  const grid = 3;
  const points = [];
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      points.push([i / (grid - 1), j / (grid - 1)]);
    }
  }

  let index = 0;
  let sampleCount = 0;
  const maxSamples = 5;

  const calibrationDot = document.createElement("div");
  calibrationDot.style.position = "fixed";
  calibrationDot.style.width = "40px";
  calibrationDot.style.height = "40px";
  calibrationDot.style.borderRadius = "50%";
  calibrationDot.style.background = "red";
  calibrationDot.style.zIndex = 9999;
  calibrationDot.style.cursor = "pointer";
  calibrationDot.style.transition = "all 0.2s ease";
  document.body.appendChild(calibrationDot);

  function showNextDot() {
    if (index >= points.length) {
      calibrationDot.remove();
      alert("✅ Calibration เสร็จสมบูรณ์\nตอนนี้ gaze tracking จะทำงานได้แม่นขึ้น");
      return;
    }
    const [px, py] = points[index];
    calibrationDot.style.left = (px * window.innerWidth - 20) + "px";
    calibrationDot.style.top = (py * window.innerHeight - 20) + "px";
    sampleCount = 0;
  }

  calibrationDot.addEventListener("click", () => {
    const [px, py] = points[index];
    webgazer.recordScreenPosition(
      px * window.innerWidth,
      py * window.innerHeight,
      "click"
    );

    sampleCount++;
    if (sampleCount < maxSamples) {
      calibrationDot.style.background = sampleCount % 2 === 0 ? "red" : "orange";
    } else {
      index++;
      showNextDot();
    }
  });

  showNextDot();
}

// --- Overlay แสดงขนาดหน้าจอ ---
const screenSizeOverlay = document.createElement("div");
screenSizeOverlay.style.position = "fixed";
screenSizeOverlay.style.right = "10px";
screenSizeOverlay.style.top = "10px";
screenSizeOverlay.style.padding = "5px 10px";
screenSizeOverlay.style.background = "rgba(0,0,0,0.6)";
screenSizeOverlay.style.color = "white";
screenSizeOverlay.style.fontSize = "14px";
screenSizeOverlay.style.fontFamily = "monospace";
screenSizeOverlay.style.zIndex = 10000;
screenSizeOverlay.style.borderRadius = "5px";
screenSizeOverlay.style.pointerEvents = "none";
document.body.appendChild(screenSizeOverlay);

// --- Overlay แสดงอายุ/เพศ (ใต้ขนาดหน้าจอ) ---
const ageOverlay = document.createElement("div");
ageOverlay.style.position = "fixed";
ageOverlay.style.right = "10px";
ageOverlay.style.top = "35px"; // อยู่ใต้ screenSizeOverlay
ageOverlay.style.padding = "5px 10px";
ageOverlay.style.background = "rgba(0,0,0,0.6)";
ageOverlay.style.color = "white";
ageOverlay.style.fontSize = "14px";
ageOverlay.style.fontFamily = "monospace";
ageOverlay.style.zIndex = 10000;
ageOverlay.style.borderRadius = "5px";
ageOverlay.style.pointerEvents = "none";
document.body.appendChild(ageOverlay);

function updateScreenSizeOverlay() {
  screenSizeOverlay.textContent = `${window.innerWidth} x ${window.innerHeight}`;
}

updateScreenSizeOverlay();
window.addEventListener("resize", updateScreenSizeOverlay);

// --- ฟังก์ชันวัดอายุจาก video (CDN, ไม่ต้องโหลด /models) ---
async function startAgeEstimation() {
  const video = document.querySelector('video');
  if (!video) return;

  // โหลด model จาก CDN
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);

  async function detect() {
    const detections = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withAgeAndGender();

    if (detections) {
      const age = Math.round(detections.age);
      const gender = detections.gender;
      ageOverlay.textContent = `ประมาณอายุ: ${age} ปี | เพศ: ${gender}`;
    } else {
      ageOverlay.textContent = "ไม่พบใบหน้า";
    }

    requestAnimationFrame(detect);
  }

  detect();
}
