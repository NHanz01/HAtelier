let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let drawing = false;
let visualAidSphere = null;
let bunnyCompleted = false;

// Bunny parts configuration
const faceCenter = new THREE.Vector2(0, 1.5);
const faceRadius = 0.5;

const ears = [
  new THREE.Vector2(-0.3, 2.3),
  new THREE.Vector2(0.3, 2.3),
];

const earRadiusX = 0.15;
const earRadiusY = 0.4;

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
  const verticalThreshold = 0.1;
  const spacingThreshold = 0.04;
  const allFingersExtended = [8, 12, 16, 20].every(i =>
    landmarks[i - 2].y - landmarks[i].y > verticalThreshold
  );
  const fingersSpaced =
    Math.abs(landmarks[8].x - landmarks[12].x) > spacingThreshold &&
    Math.abs(landmarks[12].x - landmarks[16].x) > spacingThreshold &&
    Math.abs(landmarks[16].x - landmarks[20].x) > spacingThreshold;
  return allFingersExtended && fingersSpaced;
}
function isClosedPalm(landmarks) {
  const buffer = 0.02;
  return [8, 12, 16, 20].every(tipIndex => {
    const dipIndex = tipIndex - 1;
    return landmarks[tipIndex].y > landmarks[dipIndex].y - buffer;
  });
}

function nearCircleEdge(pos, center, radius, tolerance = 0.2) {
  return Math.abs(pos.distanceTo(center) - radius) <= tolerance;
}

function nearEllipseEdge(pos, center, rx, ry, tolerance = 0.25) {
  const dx = pos.x - center.x;
  const dy = pos.y - center.y;
  const ellipseDist = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  return Math.abs(ellipseDist - 1) <= tolerance;
}

// Instead of booleans, store counts
const coverage = {
  face: 0,       // count of hits on face edge
  ears: [0, 0],  // counts of hits on each ear edge
};

// Thresholds for Success Coverage
const coverageThreshold = {
  face: 50,   
  ears: [20, 20], 
};

function checkDrawingTarget(pos) {
  // returns part name and increments coverage count if not reached threshold yet
  if (coverage.face < coverageThreshold.face && nearCircleEdge(pos, faceCenter, faceRadius)) {
    coverage.face++;
    return "face";
  }
  for (let i = 0; i < ears.length; i++) {
    if (coverage.ears[i] < coverageThreshold.ears[i] && nearEllipseEdge(pos, ears[i], earRadiusX, earRadiusY)) {
      coverage.ears[i]++;
      return `ear${i}`;
    }
  }
  return null;
}

function isBunnyComplete() {
  return coverage.face >= coverageThreshold.face &&
         coverage.ears.every((count, i) => count >= coverageThreshold.ears[i]);
}

function drawBunnySphere(pos) {
  if (bunnyCompleted) return;

  const part = checkDrawingTarget(pos);
  if (part) {
    // Mark coverage and draw sphere only if near an edge
    if (isBunnyComplete()) {
      showSuccessBunny();
      return;
    }

    const sphere = document.createElement("a-sphere");
    sphere.setAttribute("position", `${pos.x} ${pos.y} -4`);
    sphere.setAttribute("color", "Hotpink");
    sphere.setAttribute("radius", "0.09");
    sphere.classList.add("spawned-sphere");
    document.querySelector("a-scene").appendChild(sphere);
    locationText.innerHTML = `🎨 Drawing bunny`;
  } else {
    locationText.innerHTML = "👉 Move closer to bunny edges to draw";
  }
}

function deleteAllSpheres() {
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  coverage.face = 0;
  coverage.ears = [0, 0];
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

  const label = document.createElement("a-text");
  label.setAttribute("value", "Try To Draw The Bunny!");
  label.setAttribute("align", "center");
  label.setAttribute("color", "Hotpink");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 0.5 -4");
  label.setAttribute("id", "label-bunny");
  document.querySelector("a-scene").appendChild(label);

  // Face guide
  const faceRing = document.createElement("a-torus");
  faceRing.setAttribute("position", "0 1.5 -4.5");
  faceRing.setAttribute("radius", faceRadius.toString());
  faceRing.setAttribute("radius-tubular", "0.05");
  faceRing.setAttribute("color", "yellow");
  faceRing.setAttribute("opacity", "0.3");
  faceRing.classList.add("bunny-guide");
  document.querySelector("a-scene").appendChild(faceRing);

  // Ear guides
  for (let i = 0; i < ears.length; i++) {
    const earGuide = document.createElement("a-torus");
    earGuide.setAttribute("position", `${ears[i].x} ${ears[i].y} -4.5`);
    earGuide.setAttribute("radius", earRadiusX.toString());
    earGuide.setAttribute("radius-tubular", "0.015");
    earGuide.setAttribute("rotation", "0 0 0");
    earGuide.setAttribute("scale", `1 ${earRadiusY / earRadiusX} 1`);
    earGuide.setAttribute("color", "yellow");
    earGuide.setAttribute("opacity", "0.3");
    earGuide.classList.add("bunny-guide");
    document.querySelector("a-scene").appendChild(earGuide);
  }

  function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks?.length) {
      const landmarks = results.multiHandLandmarks[0];
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: "#BDF2FB", lineWidth: 5 });
      drawLandmarks(canvasCtx, landmarks, { color: "#007FFF", lineWidth: 2 });

      const fingerX = (landmarks[8].x - 0.5) * 2;
      const fingerY = (0.5 - landmarks[8].y) * 2 + 1.5;
      const fingerPos = new THREE.Vector2(fingerX, fingerY);
      const fixedZ = -4;

      if (!visualAidSphere) {
        visualAidSphere = document.createElement("a-sphere");
        visualAidSphere.setAttribute("id", "visual-aid");
        visualAidSphere.setAttribute("radius", "0.06");
        visualAidSphere.setAttribute("opacity", "0.7");
        visualAidSphere.setAttribute("transparent", "true");
        document.querySelector("a-scene").appendChild(visualAidSphere);
      }

      visualAidSphere.setAttribute("position", `${fingerX} ${fingerY} ${fixedZ}`);
      visualAidSphere.setAttribute("visible", "true");

      const nearEdge =
        nearCircleEdge(fingerPos, faceCenter, faceRadius) ||
        ears.some(ear => nearEllipseEdge(fingerPos, ear, earRadiusX, earRadiusY));
      
      visualAidSphere.setAttribute("color", nearEdge ? "hotpink" : "red");



      if (isPeaceSign(landmarks)) {
        statusText.textContent = "Gesture: Peace Sign ✌️";
        document.getElementById("menu").style.display = "none";
        drawing = true;
        drawBunnySphere(fingerPos);
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

function showSuccessBunny() {
  bunnyCompleted = true;
  
  // Remove all drawn spheres
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  
  // Hide all guides
  document.querySelectorAll(".bunny-guide").forEach(g => g.setAttribute("visible", "false"));

  document.getElementById("label-bunny").setAttribute("value", "Cute! Bunny Completed! \nOpen Menu To Go Back To Homepage!");

  const spinBunny = document.createElement("a-entity");
  spinBunny.setAttribute("position", "0 1.5 -4");

  // Face ring (torus)
  const faceRing = document.createElement("a-torus");
  faceRing.setAttribute("radius", faceRadius.toString());
  faceRing.setAttribute("radius-tubular", "0.05");
  faceRing.setAttribute("color", "Hotpink");
  faceRing.setAttribute("opacity", "1");
  faceRing.setAttribute("rotation", "0 0 0");
  faceRing.setAttribute("position", "0 0 0");
  spinBunny.appendChild(faceRing);

  for (let i = 0; i < ears.length; i++) {
    const relX = ears[i].x - faceCenter.x;
    const relY = ears[i].y - faceCenter.y;

    const earGuide = document.createElement("a-torus");
    earGuide.setAttribute("radius", earRadiusX.toString());
    earGuide.setAttribute("radius-tubular", "0.02");
    earGuide.setAttribute("rotation", "0 0 0");
    earGuide.setAttribute("scale", `1 ${earRadiusY / earRadiusX} 1`);
    earGuide.setAttribute("color", "Hotpink");
    earGuide.setAttribute("opacity", "1");
    earGuide.setAttribute("position", `${relX} ${relY} 0`);

    spinBunny.appendChild(earGuide);
  }

  // Spin animation
  spinBunny.setAttribute("animation", {
    property: "rotation",
    to: "0 360 0",
    loop: true,
    dur: 3000,
    easing: "linear"
  });

  document.querySelector("a-scene").appendChild(spinBunny);
  document.getElementById("clear-button").style.display = "none";
}


// Home button
document.getElementById("home-button").addEventListener("click", () => {
  if (confirm("Back To Main Menu?")) window.location.href = "./index.html";
});
// Clear button
document.getElementById("clear-button").addEventListener("click", () => {
  if (confirm("Clear Drawings?")) deleteAllSpheres();
});
