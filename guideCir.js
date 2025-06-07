let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let drawing = false;
let visualAidSphere = null;
let circleCompleted = false;

const center = new THREE.Vector2(0, 2);
const radius = 0.65;
const segments = 30;
const angleStep = (2 * Math.PI) / segments;

const circlePoints = [];
const coverage = new Array(segments).fill(false);

for (let i = 0; i < segments; i++) {
  const angle = i * angleStep;
  const x = center.x + radius * Math.cos(angle);
  const y = center.y + radius * Math.sin(angle);
  circlePoints.push(new THREE.Vector2(x, y));
}

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      initialLatitude = pos.coords.latitude;
      initialLongitude = pos.coords.longitude;
      locationText.innerHTML = `✅ Location ready<br>Lat: ${initialLatitude.toFixed(6)}<br>Lon: ${initialLongitude.toFixed(6)}`;
    },
    (err) => {
      console.error("Failed to get location", err);
      locationText.innerHTML = `❌ Location error`;
    },
    { enableHighAccuracy: true }
  );
}

window.addEventListener("deviceorientationabsolute", (evt) => {
  if (evt.absolute && evt.alpha !== null) currentHeading = 360 - evt.alpha;
});
window.addEventListener("deviceorientation", (evt) => {
  if (!evt.absolute && evt.alpha !== null) currentHeading = 360 - evt.alpha;
});

function isFingerExtended(tip, pip) {
  return tip.y < pip.y;
}
function isPeaceSign(landmarks) {
  return isFingerExtended(landmarks[8], landmarks[6]) &&
         isFingerExtended(landmarks[12], landmarks[10]) &&
         !isFingerExtended(landmarks[16], landmarks[14]) &&
         !isFingerExtended(landmarks[20], landmarks[18]);
}

function isOpenPalm(landmarks) {
  const verticalThreshold = 0.1; // Require significant upward extension
  const spacingThreshold = 0.04; // Minimum horizontal spacing between adjacent fingers

  // Check if all fingers (excluding thumb) are clearly extended
  const allFingersExtended = [8, 12, 16, 20].every(i =>
    landmarks[i - 2].y - landmarks[i].y > verticalThreshold
  );

  // Check if fingers are spaced apart horizontally
  const fingersSpaced =
    Math.abs(landmarks[8].x - landmarks[12].x) > spacingThreshold &&
    Math.abs(landmarks[12].x - landmarks[16].x) > spacingThreshold &&
    Math.abs(landmarks[16].x - landmarks[20].x) > spacingThreshold;

  return allFingersExtended && fingersSpaced;
}

function isClosedPalm(landmarks) {
  const buffer = 0.02; // Looseness margin to make detection easier

  return [8, 12, 16, 20].every(tipIndex => {
    const dipIndex = tipIndex - 1;
    return landmarks[tipIndex].y > landmarks[dipIndex].y - buffer;
  });
}

function markCircleCoverage(p) {
  for (let i = 0; i < segments; i++) {
    if (!coverage[i] && p.distanceTo(circlePoints[i]) < 0.2) {
      coverage[i] = true;
    }
  }
}

function isCircleCovered() {
  const count = coverage.filter(v => v).length;
  return count / segments >= 0.6;
}

function drawCircleSphere(p) {
  if (circleCompleted) return;

  const z = -4;
  const sphere = document.createElement("a-sphere");
  sphere.setAttribute("position", `${p.x} ${p.y} ${z}`);
  sphere.setAttribute("color", "Red");
  sphere.setAttribute("radius", "0.2");
  sphere.classList.add("spawned-sphere");
  document.querySelector("a-scene").appendChild(sphere);
  locationText.innerHTML = `🎨 Drawing on circle`;
  markCircleCoverage(p);

  if (isCircleCovered()) showSuccessCircle();
}

function deleteAllSpheres() {
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  for (let i = 0; i < coverage.length; i++) coverage[i] = false;
  locationText.innerHTML = `✅ All Drawings Cleared`;
  setTimeout(() => { locationText.innerHTML = ""; }, 1000);
}

window.addEventListener('DOMContentLoaded', () => {
  const videoElement = document.getElementById("input_video");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const statusText = document.getElementById("statusText");

  const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });

  // Render transparent circle outline
  const circleEntity = document.createElement("a-ring");
  circleEntity.setAttribute("position", `0 2 -4.1`);
  circleEntity.setAttribute("radius-inner", "0.5");
  circleEntity.setAttribute("radius-outer", "0.8");
  circleEntity.setAttribute("color", "yellow");
  circleEntity.setAttribute("opacity", "0.5");
  circleEntity.setAttribute("rotation", "0 0 0");
  circleEntity.setAttribute("id", "drawing-circle");
  document.querySelector("a-scene").appendChild(circleEntity);

  const label = document.createElement("a-text");
  label.setAttribute("value", "Try to complete this Circle!");
  label.setAttribute("align", "center");
  label.setAttribute("color", "Red");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 0.5 -4.5");
  label.setAttribute("id", "label-circle");
  document.querySelector("a-scene").appendChild(label);

  function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks?.length) {
      const landmarks = results.multiHandLandmarks[0];
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: "#BDF2FB", lineWidth: 5 });
      drawLandmarks(canvasCtx, landmarks, { color: "#007FFF", lineWidth: 2 });

      const fingerX = (landmarks[8].x - 0.5) * 1.5;
      const fingerY = (0.5 - landmarks[8].y) * 1.5 + 2;
      const fingerPos = new THREE.Vector2(fingerX, fingerY);
      const fixedZ = -4;

      const distFromCenter = fingerPos.distanceTo(center);

      if (!visualAidSphere) {
        visualAidSphere = document.createElement("a-sphere");
        visualAidSphere.setAttribute("id", "visual-aid");
        visualAidSphere.setAttribute("radius", "0.05");
        visualAidSphere.setAttribute("opacity", "0.5");
        visualAidSphere.setAttribute("transparent", "true");
        document.querySelector("a-scene").appendChild(visualAidSphere);
      }

      const isInRing = Math.abs(distFromCenter - 0.65) < 0.03;
      visualAidSphere.setAttribute("position", `${fingerX} ${fingerY} ${fixedZ}`);
      visualAidSphere.setAttribute("color", isInRing ? "red" : "yellow");
      visualAidSphere.setAttribute("visible", "true");

      if (isPeaceSign(landmarks)) {
        statusText.textContent = "Gesture: Peace Sign ✌️";
        document.getElementById("menu").style.display = "none";
        drawing = true;
        if (isInRing) {
          drawCircleSphere(fingerPos);
        } else {
          locationText.innerHTML = `👉 Move finger closer to circle edge`;
        }
      } else {
        if (drawing) {
          drawing = false;
          locationText.innerHTML = `Drawing stopped`;
        }

        if (isOpenPalm(landmarks)) {
          statusText.textContent = "Gesture: Menu Opened 🖐️";
          document.getElementById("menu").style.display = "block";
        } else if (isClosedPalm(landmarks)) {
          statusText.textContent = "Gesture: Menu Closed ✊";
          document.getElementById("menu").style.display = "none";
        } else {
          statusText.textContent = "Gesture: None";
        }
      }
    } else {
      statusText.textContent = "Gesture: None";
      if (visualAidSphere) visualAidSphere.setAttribute("visible", "false");
      if (drawing) drawing = false;
      locationText.innerHTML = "";
    }

    canvasCtx.restore();
  }

  const camera = new Camera(videoElement, {
    onFrame: async () => await hands.send({ image: videoElement }),
    width: 1280,
    height: 720,
    facingMode: { ideal: "environment" },
  });
  camera.start();

  videoElement.addEventListener("loadedmetadata", () => {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
  });

  hands.onResults(onResults);
});

function showSuccessCircle() {
  circleCompleted = true;

  // Remove all spawned spheres
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());

  // Hide the old 2D ring
  const ring = document.getElementById("drawing-circle");
  if (ring) ring.setAttribute("visible", "false");

  // Update label
  const label = document.getElementById("label-circle");
  if (label) label.setAttribute("value", "Amazing! Circle Drawn! \nOpen Menu To Go Back To Homepage!");

  // Create an A-Frame entity to hold the torus
  const torusEntity = document.createElement("a-entity");

  // Position it
  torusEntity.setAttribute("position", "0 2 -4");

  // Create the torus geometry with Three.js
  torusEntity.setObject3D('mesh', new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.2, 16, 100), // (radius, tube diameter, radial segments, tubular segments)
    new THREE.MeshStandardMaterial({ color: 'red' })
  ));

  // Add animation to rotate the torus on Y axis
  torusEntity.setAttribute('animation', {
    property: 'rotation',
    to: '0 360 0',
    loop: true,
    dur: 3000,
    easing: 'linear'
  });

  // Append to the scene
  document.querySelector("a-scene").appendChild(torusEntity);
  
  document.getElementById("clear-button").style.display = "none";

}

// HOME
document.getElementById("home-button").addEventListener("click", () => {
  const confirmLeave = confirm("Back To Main Menu?");
  if (confirmLeave) {
    window.location.href = "./index.html";
  }
});

// CLEAR ALL
document.getElementById("clear-button").addEventListener("click", () => {
  const confirmClear = confirm("Clear Drawings?");
  if (confirmClear) {
    deleteAllSpheres();
  }
});