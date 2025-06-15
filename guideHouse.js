// guideHouse.js

let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let drawing = false;
let visualAidSphere = null;
let houseCompleted = false;

// House vertices: triangle roof + square body
const houseVertices = [
  new THREE.Vector2(0, 3),    // Roof peak
  new THREE.Vector2(-1, 2),   // Left roof corner
  new THREE.Vector2(1, 2),    // Right roof corner
  new THREE.Vector2(1, 0.5),  // Bottom right body
  new THREE.Vector2(-1, 0.5), // Bottom left body
];

const houseCheckpoints = [
  new THREE.Vector2(0, 3),               // roof peak
  new THREE.Vector2(-1, 2),              // left roof corner
  new THREE.Vector2(1, 2),               // right roof corner
  new THREE.Vector2(1, 0.5),             // bottom right
  new THREE.Vector2(-1, 0.5),            // bottom left
  new THREE.Vector2(0, 2),               // roof base center
  new THREE.Vector2(1, 1.25),          // right mid body
  new THREE.Vector2(-1, 1.25),         // left mid body
  new THREE.Vector2(0, 0.5),             // bottom center
];

let checkpointHits = new Array(houseCheckpoints.length).fill(false);

const roofIndices = [0, 1, 2];
const bodyIndices = [1, 2, 3, 4];
const locationText = document.getElementById("locationText");

function checkCheckpointProximity(pos) {
  const threshold = 0.2;
  houseCheckpoints.forEach((pt, i) => {
    if (!checkpointHits[i]) {
      const dx = pt.x - pos.x;
      const dy = pt.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold) {
        checkpointHits[i] = true;
      }
    }
  });
}

// --- Initialization ---

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    pos => {
      initialLatitude = pos.coords.latitude;
      initialLongitude = pos.coords.longitude;
      locationText.innerHTML = `✅ Location Ready<br>Lat: ${initialLatitude.toFixed(6)}<br>Lon: ${initialLongitude.toFixed(6)}`;
    },
    err => {
      locationText.innerHTML = "❌ Location error";
      console.error("Location error", err);
    },
    { enableHighAccuracy: true }
  );
}

window.addEventListener("deviceorientationabsolute", e => {
  if (e.absolute && e.alpha !== null) currentHeading = 360 - e.alpha;
});
window.addEventListener("deviceorientation", e => {
  if (!e.absolute && e.alpha !== null) currentHeading = 360 - e.alpha;
});

// --- Utility Functions ---

function isPointNearLineSegment(p, v1, v2, threshold = 0.2) {
  const l2 = v1.distanceToSquared(v2);
  if (l2 === 0) return p.distanceTo(v1) < threshold;
  let t = ((p.x - v1.x) * (v2.x - v1.x) + (p.y - v1.y) * (v2.y - v1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = new THREE.Vector2(
    v1.x + t * (v2.x - v1.x),
    v1.y + t * (v2.y - v1.y)
  );
  return p.distanceTo(proj) < threshold;
}

function markNearbyEdgesCovered(pos) {
  const indices = [...roofIndices, roofIndices[0], ...bodyIndices, bodyIndices[0]];
  for (let i = 0; i < indices.length - 1; i++) {
    const a = houseVertices[indices[i]];
    const b = houseVertices[indices[i + 1]];
    if (isPointNearLineSegment(pos, a, b)) {
      const v1 = indices[i];
      const v2 = indices[i + 1];
      markVertexCovered(v1);
      markVertexCovered(v2);
    }
  }
}


function isFingerNearHouseEdge(pos) {
  const indices = [...roofIndices, roofIndices[0], ...bodyIndices, bodyIndices[0]];
  for (let i = 0; i < indices.length - 1; i++) {
    const a = houseVertices[indices[i]];
    const b = houseVertices[indices[i + 1]];
    if (isPointNearLineSegment(pos, a, b)) {
      return true;
    }
  }
  return false;
}

function isNearRoofEdge(pos) {
  const indices = [...roofIndices, roofIndices[0]];
  for (let i = 0; i < indices.length - 1; i++) {
    const a = houseVertices[indices[i]];
    const b = houseVertices[indices[i + 1]];
    if (isPointNearLineSegment(pos, a, b)) {
      return true;
    }
  }
  return false;
}

function isNearBodyEdge(pos) {
  const indices = [...bodyIndices, bodyIndices[0]];
  for (let i = 0; i < indices.length - 1; i++) {
    const a = houseVertices[indices[i]];
    const b = houseVertices[indices[i + 1]];
    if (isPointNearLineSegment(pos, a, b)) {
      return true;
    }
  }
  return false;
}

function isHouseCovered() {
  return checkpointHits.filter(Boolean).length >= 7;
}

// Create a cylinder to represent a line between two 3D points
function createCylinderLine(start, end, color, radius = 0.01) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = (end.z || -4.6) - (start.z || -4.6);
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Midpoint position for the cylinder
  const position = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
    z: ((start.z || -4.6) + (end.z || -4.6)) / 2
  };

  const cylinder = document.createElement("a-cylinder");
  cylinder.setAttribute("position", `${position.x} ${position.y} ${position.z}`);
  cylinder.setAttribute("radius", radius);
  cylinder.setAttribute("height", length);
  cylinder.setAttribute("color", color);
  cylinder.setAttribute("rotation", getRotationFromVector(dx, dy, dz));
  cylinder.classList.add("guide-line");
  return cylinder;
}

// Calculate rotation Euler angles for cylinder to align between points
function getRotationFromVector(x, y, z) {
  const axis = new THREE.Vector3(0, 1, 0); // Y axis, cylinder default direction
  const dir = new THREE.Vector3(x, y, z).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, dir);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return `${THREE.MathUtils.radToDeg(euler.x)} ${THREE.MathUtils.radToDeg(euler.y)} ${THREE.MathUtils.radToDeg(euler.z)}`;
}

// Append all guide lines for roof and body to the scene
function createHouseGuideLines(scene) {

  // Body lines in gold
  for (let i = 0; i < bodyIndices.length; i++) {
    const start = { 
      ...houseVertices[bodyIndices[i]], 
      y: houseVertices[bodyIndices[i]].y - 0.2, // lower y by 0.2
      z: -4.6 
    };
    const end = { 
      ...houseVertices[bodyIndices[(i + 1) % bodyIndices.length]], 
      y: houseVertices[bodyIndices[(i + 1) % bodyIndices.length]].y - 0.2, // lower y by 0.2
      z: -4.6 
    };
    const line = createCylinderLine(start, end, "gold", 0.05);
    line.setAttribute("opacity", "0.5");
    scene.appendChild(line);
  }

  
  // Roof lines in red (slightly bigger by scaling from centroid)
  const scale = 1.1; // 10% bigger
  // Compute roof centroid
  let centroid = { x: 0, y: 0 };
  for (let i = 0; i < roofIndices.length; i++) {
    centroid.x += houseVertices[roofIndices[i]].x;
    centroid.y += houseVertices[roofIndices[i]].y;
  }
  centroid.x /= roofIndices.length;
  centroid.y /= roofIndices.length;

  for (let i = 0; i < roofIndices.length; i++) {
    const origStart = houseVertices[roofIndices[i]];
    const origEnd = houseVertices[roofIndices[(i + 1) % roofIndices.length]];

    // Vector from centroid to vertex
    const start = {
      x: centroid.x + (origStart.x - centroid.x) * scale,
      y: centroid.y + (origStart.y - centroid.y) * scale,
      z: -4.6,
    };

    const end = {
      x: centroid.x + (origEnd.x - centroid.x) * scale,
      y: centroid.y + (origEnd.y - centroid.y) * scale,
      z: -4.6,
    };

    const line = createCylinderLine(start, end, "red", 0.05);
    line.setAttribute("opacity", "0.5");
    scene.appendChild(line);
  }
}

// Draw a spheres at the given position, marking user drawing progress
function drawHouseSphere(pos) {
  if (houseCompleted) return;

  const isNearRoof = isNearRoofEdge(pos);
  const isNearBody = isNearBodyEdge(pos);

  // Only draw if close to either roof or body edge
  if (!isNearRoof && !isNearBody) return;

  const z = -4;
  const sphere = document.createElement("a-sphere");
  sphere.setAttribute("position", `${pos.x} ${pos.y} ${z}`);
  sphere.setAttribute("color", isNearRoof ? "red" : "gold");
  sphere.setAttribute("radius", "0.08");
  sphere.classList.add("spawned-sphere");
  document.querySelector("a-scene").appendChild(sphere);

  locationText.innerHTML = "🏠 Drawing house outline";

  checkCheckpointProximity(pos);

  if (isHouseCovered()) showSuccessHouse();
}

// Clear all drawn spheres and reset coverage state
function deleteAllSpheres() {
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  checkpointHits.fill(false);
  houseCompleted = false;
  locationText.innerHTML = "✅ Drawings cleared";
  setTimeout(() => { locationText.innerHTML = ""; }, 1000);
}


// Gesture helpers
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
  const spacing = 0.04;
  return [8,12,16,20].every(i => landmarks[i - 2].y - landmarks[i].y > 0.1) &&
         Math.abs(landmarks[8].x - landmarks[20].x) > spacing;
}
function isClosedPalm(landmarks) {
  return [8,12,16,20].every(i => landmarks[i].y > landmarks[i - 1].y - 0.02);
}

// ON LOAD
window.addEventListener("DOMContentLoaded", () => {
  const scene = document.querySelector("a-scene");
  createHouseGuideLines(scene);

  const videoElement = document.getElementById("input_video");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const statusText = document.getElementById("statusText");
  
  const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });

        
  const label = document.createElement("a-text");
  label.setAttribute("value", "Try To Draw The House!");
  label.setAttribute("align", "center");
  label.setAttribute("color", "Gold");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 -0.5 -4.5");
  label.setAttribute("id", "label-house");
  document.querySelector("a-scene").appendChild(label);
  
  function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks?.length) {
      const landmarks = results.multiHandLandmarks[0];
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: "#BDF2FB", lineWidth: 5 });
      drawLandmarks(canvasCtx, landmarks, { color: "#007FFF", lineWidth: 2 });

      // Map fingertip position into scene coordinates
      const x = (landmarks[8].x - 0.5) * 2; // Wider horizontal range
      const y = (0.5 - landmarks[8].y) * 2.5 + 1.5; // Higher vertical stretch + offset
      const fingerPos = new THREE.Vector2(x, y);
      const z = -4;
      
      // Show visual aid sphere following fingertip
      if (!visualAidSphere) {
        visualAidSphere = document.createElement("a-sphere");
        visualAidSphere.setAttribute("id", "visual-aid");
        visualAidSphere.setAttribute("radius", "0.05");
        visualAidSphere.setAttribute("opacity", "0.5");
        visualAidSphere.setAttribute("transparent", "true");
        document.querySelector("a-scene").appendChild(visualAidSphere);
      }

      visualAidSphere.setAttribute("position", `${x} ${y} ${z}`);

      // Show a preview sphere and color it based on proximity to house edges
      visualAidSphere.setAttribute("position", `${fingerPos.x} ${fingerPos.y} -4`);
      const nearHouseEdge = isFingerNearHouseEdge(fingerPos);
      visualAidSphere.setAttribute("color", nearHouseEdge ? "green" : "red");
      visualAidSphere.setAttribute("visible", "true");

      const menu = document.getElementById("menu");

      if (landmarks) {
        if (isPeaceSign(landmarks)) {
          statusText.textContent = "Gesture: Peace Sign ✌️";
          menu.style.display = "none";
          if (nearHouseEdge) {
            drawing = true;
            drawHouseSphere(fingerPos);
          } else {
            locationText.innerHTML = `👉 Move finger closer to house`;
            drawing = false;  // explicitly reset drawing
          }
          if (visualAidSphere) visualAidSphere.setAttribute("visible", "true");
        } else {
          if (drawing) {
            drawing = false;
            locationText.innerHTML = `Drawing stopped`;
          }
          if (visualAidSphere) visualAidSphere.setAttribute("visible", "false");

          if (isOpenPalm(landmarks)) {
            statusText.textContent = "Gesture: Menu Opened 🖐️";
            menu.style.display = "block";
          } else if (isClosedPalm(landmarks)) {
            statusText.textContent = "Gesture: Menu Closed ✊";
            menu.style.display = "none";
          } else {
            statusText.textContent = "Gesture: None";
          }
        }
      } else {
        if (visualAidSphere) visualAidSphere.setAttribute("visible", "false");
        drawing = false;
        locationText.innerHTML = "";
      }
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

// On successful house drawing
function showSuccessHouse() {
  houseCompleted = true;

  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  document.querySelectorAll(".guide-line").forEach(l => l.setAttribute("visible", "false"));

  // Update label
  const label = document.getElementById("label-house");
  if (label) label.setAttribute("value", "Nice! House Drawn! \nOpen Menu To Go Back To Homepage!");

  // Show 3D house outline model
  const house = document.createElement("a-entity");
  house.setAttribute("position", "0 1.5 -4");

  // Helper to create a cylinder edge between two points
  function createEdge(start, end, color = "gold") {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const length = Math.sqrt(dx*dx + dy*dy + dz*dz);

    const edge = document.createElement("a-cylinder");
    edge.setAttribute("radius", 0.05);
    edge.setAttribute("height", length);
    edge.setAttribute("color", color);

    // Position midpoint
    const mx = (start[0] + end[0]) / 2;
    const my = (start[1] + end[1]) / 2;
    const mz = (start[2] + end[2]) / 2;
    edge.setAttribute("position", `${mx} ${my} ${mz}`);

    // Rotate to align with the direction vector
    const direction = new THREE.Vector3(dx, dy, dz).normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
    edge.setAttribute("rotation", `${THREE.MathUtils.radToDeg(euler.x)} ${THREE.MathUtils.radToDeg(euler.y)} ${THREE.MathUtils.radToDeg(euler.z)}`);

    return edge;
  }

  // Define roof base (full width)
  const roofLeft = [-1, 0.4, 0];
  const roofRight = [1, 0.4, 0];
  const roofTop = [0, 1.2, 0];

  // Define house body (narrower by 20%)
  const shrink = 0.7;
  const bodyLeft = [-1 * shrink, -1, 0];
  const bodyRight = [1 * shrink, -1, 0];
  const bodyTopLeft = [-1 * shrink, 0.3, 0];
  const bodyTopRight = [1 * shrink, 0.3, 0];

  // House body rectangle
  house.appendChild(createEdge(bodyLeft, bodyRight));         // bottom
  house.appendChild(createEdge(bodyRight, bodyTopRight));     // right
  house.appendChild(createEdge(bodyTopRight, bodyTopLeft));   // top
  house.appendChild(createEdge(bodyTopLeft, bodyLeft));       // left

  // Roof triangle (wider than body)
  house.appendChild(createEdge(roofLeft, roofTop, "red"));
  house.appendChild(createEdge(roofTop, roofRight, "red"));
  house.appendChild(createEdge(roofRight, roofLeft, "red"));

  // Animate rotation
  house.setAttribute("animation", {
    property: "rotation",
    to: "0 360 0",
    loop: true,
    dur: 3000,
    easing: "linear"
  });

  document.querySelector("a-scene").appendChild(house);
  document.getElementById("clear-button").style.display = "none";
}
