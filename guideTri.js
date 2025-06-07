// guideTri.js
let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let drawing = false;
let visualAidSphere = null;
let triangleCompleted = false;

// Triangle vertices in 2D local space for calculations
const A = new THREE.Vector2(0, 0);
const B = new THREE.Vector2(2, 0);
const C = new THREE.Vector2(1, 2);

// Divide triangle sides BC and CA into segments
const segmentsPerEdge = 20;
const BC_segments = [];
const CA_segments = [];

for (let i = 0; i < segmentsPerEdge; i++) {
  const t = i / (segmentsPerEdge - 1);
  BC_segments.push(new THREE.Vector2().lerpVectors(B, C, t));
  CA_segments.push(new THREE.Vector2().lerpVectors(C, A, t));
}
const coverage = {
  BC: new Array(segmentsPerEdge).fill(false),
  CA: new Array(segmentsPerEdge).fill(false)
};

// Setup AR.js location-based
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

// Degrees to radians helper
function degreesToRadians(deg) {
  return deg * (Math.PI / 180);
}

// Move GPS coordinate forward (not used now, kept if needed later)
function moveForward(lat, lon, distance, heading) {
  const R = 6371000;
  const δ = distance / R;
  const θ = degreesToRadians(heading);
  const φ1 = degreesToRadians(lat);
  const λ1 = degreesToRadians(lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { latitude: φ2 * (180 / Math.PI), longitude: λ2 * (180 / Math.PI) };
}

function markCoverage(p) {
  // Check BC
  BC_segments.forEach((segPt, i) => {
    if (!coverage.BC[i] && p.distanceTo(segPt) < 0.12) coverage.BC[i] = true;
  });
  // Check CA
  CA_segments.forEach((segPt, i) => {
    if (!coverage.CA[i] && p.distanceTo(segPt) < 0.12) coverage.CA[i] = true;
  });
}

// HOW MANY PERCENT BEFORE SUCCESS
function isEdgeCovered(edgeArray) {
  const count = edgeArray.filter(v => v).length;
  return count / segmentsPerEdge >= 0.7;
}


// Helper: closest point on a line segment
function closestPointOnLineSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const ap = p.clone().sub(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
  return a.clone().add(ab.multiplyScalar(t));
}

// Get closest point on any triangle edge from point p
function getClosestPointOnEdges(p) {
  const points = [
    closestPointOnLineSegment(p, A, B),
    closestPointOnLineSegment(p, B, C),
    closestPointOnLineSegment(p, C, A),
  ];

  let minDist = Infinity;
  let closestPoint = null;
  for (const pt of points) {
    const dist = p.distanceTo(pt);
    if (dist < minDist) {
      minDist = dist;
      closestPoint = pt;
    }
  }
  return { closestPoint, minDist };
}

// Draw a sphere snapped exactly to triangle edges (same logic as visual aid)
function drawEdgeSphere({ x, y }) {
  
  if (triangleCompleted) return; // Don't allow drawing anymore
  const fixedZ = -4;
  const sphere = document.createElement("a-sphere");
  sphere.setAttribute("position", `${x} ${y + 0.5} ${fixedZ}`);
  sphere.setAttribute("color", "cyan");
  sphere.setAttribute("radius", "0.1");
  sphere.classList.add("spawned-sphere");
  document.querySelector("a-scene").appendChild(sphere);
  locationText.innerHTML = `🎨 Snapped Drawing`;

  // Mark coverage of BC and CA
  markCoverage(new THREE.Vector2(x, y));

  // Check for triangle completion!
  if (isEdgeCovered(coverage.BC) && isEdgeCovered(coverage.CA)) {
    showSuccessTriangle();
  }
}

// Delete all drawn spheres
function deleteAllSpheres() {
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  locationText.innerHTML = `✅ All All Drawings Cleared`;
  setTimeout(() => {
    locationText.innerHTML = "";
  }, 1000);
}

// Gesture detection helpers
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

function isIndexFinger(landmarks) {
  return isFingerExtended(landmarks[8], landmarks[6]) && [12, 16, 20].every(i => !isFingerExtended(landmarks[i], landmarks[i - 2]));
}

// Main setup after DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  const videoElement = document.getElementById("input_video");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const statusText = document.getElementById("statusText");

  const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  
  // Create and add the triangle to the scene
  const triangle = document.createElement("a-triangle");
  triangle.setAttribute("color", "yellow");
  triangle.setAttribute("opacity", "0.5");
  triangle.setAttribute("transparent", "true");
  triangle.setAttribute("vertex-a", "0 0 0");
  triangle.setAttribute("vertex-b", "2 0 0");
  triangle.setAttribute("vertex-c", "1 2 0");
  triangle.setAttribute("position", "0 0.5 -4");
  triangle.setAttribute("rotation", "0 0 0");
  triangle.setAttribute("id", "drawing-triangle");
  document.querySelector("a-scene").appendChild(triangle);

  
  // Add a visual aid line slightly above edge AB
  const baseLine = document.createElement("a-cylinder");
  baseLine.setAttribute("position", "1 0.55 -3.8"); // Middle point of A-B edge, slightly raised on Y
  baseLine.setAttribute("radius", "0.09");       // Thickness of the line
  baseLine.setAttribute("height", "2");          // Length of the base edge
  baseLine.setAttribute("color", "cyan");
  baseLine.setAttribute("rotation", "0 0 90");   // Rotate to lie flat along X axis
  baseLine.setAttribute("id", "cylinder");
  document.querySelector("a-scene").appendChild(baseLine);


  const triangleLabel = document.createElement("a-text");
  triangleLabel.setAttribute("value", "Try completing this triangle!");
  triangleLabel.setAttribute("align", "center");
  triangleLabel.setAttribute("color", "cyan");
  triangleLabel.setAttribute("width", "5.5");
  triangleLabel.setAttribute("position", "1 -0.2 -4"); // Centered under triangle
  triangleLabel.setAttribute("rotation", "0 0 0");
  triangleLabel.setAttribute("id", "label-triangle");
  document.querySelector("a-scene").appendChild(triangleLabel);
  
  // Called on each MediaPipe frame
  function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks?.length) {
      const landmarks = results.multiHandLandmarks[0];
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: "#BDF2FB", lineWidth: 5 });
      drawLandmarks(canvasCtx, landmarks, { color: "#007FFF", lineWidth: 2 });
      
      // Map fingertip normalized coords to triangle local 2D space (0 to 2)
      const fingerX = landmarks[8].x * 2;
      const fingerY = (1 - landmarks[8].y) * 2;
      const fingertip2D = new THREE.Vector2(fingerX, fingerY);
      const fixedZ = -4;

      const triangleEntity = document.getElementById("drawing-triangle");

      // Get closest edge point and distance
      const { closestPoint, minDist } = getClosestPointOnEdges(fingertip2D);

      // Update triangle color based on proximity to edges
      if (minDist < 0.2) {
        triangleEntity.setAttribute("color", "green");
        locationText.innerHTML = "💚 Triangle touched!";
      } else {
        triangleEntity.setAttribute("color", "yellow");
        locationText.innerHTML = "";
      }

      // Setup visual aid sphere if not created
      if (!visualAidSphere) {
        visualAidSphere = document.createElement("a-sphere");
        visualAidSphere.setAttribute("id", "visual-aid");
        visualAidSphere.setAttribute("radius", "0.05");
        visualAidSphere.setAttribute("opacity", "0.5");
        visualAidSphere.setAttribute("transparent", "true");
        document.querySelector("a-scene").appendChild(visualAidSphere);
      }

      // Position and color the visual aid sphere
      if (minDist < 0.2) {
        visualAidSphere.setAttribute("position", `${closestPoint.x} ${closestPoint.y + 0.5} ${fixedZ}`);
        visualAidSphere.setAttribute("color", "cyan");
        visualAidSphere.setAttribute("visible", "true");
      } else {
        visualAidSphere.setAttribute("position", `${fingerX} ${fingerY} ${fixedZ}`);
        visualAidSphere.setAttribute("color", "red");
        visualAidSphere.setAttribute("visible", "true");
      }

      // Drawing logic with peace sign gesture
      if (isPeaceSign(landmarks)) {
        statusText.textContent = "Gesture: Peace Sign ✌️";
        drawing = true;
        document.getElementById("menu").style.display = "none";

        if (minDist < 0.2) {
          // Draw sphere exactly at snapped edge point (same as visual aid)
          drawEdgeSphere({ x: closestPoint.x, y: closestPoint.y });
          locationText.innerHTML = `🎨 Drawing on edge!`;
        } else {
          locationText.innerHTML = `👉 Move finger closer to triangle edges to draw`;
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
        } else if (isIndexFinger(landmarks)) {
          statusText.textContent = "Gesture: Selecting Menu ☝️";
        } else {
          statusText.textContent = "Gesture: None";
        }
      }

    } else {
      // No hands detected: hide visual aid & reset states
      statusText.textContent = "Gesture: None";
      if (visualAidSphere) visualAidSphere.setAttribute("visible", "false");
      if (drawing) drawing = false;
      locationText.innerHTML = "";
    }

    canvasCtx.restore();

    // Dispatch event with latest hand results if needed elsewhere
    const event = new CustomEvent("handsResults", { detail: results });
    window.dispatchEvent(event);
  }

  // Setup camera for MediaPipe Hands
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


function showSuccessTriangle() {
  
  triangleCompleted = true;
  // Hide existing drawing spheres
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());

  // Hide original triangle and base cylinder
  const triangle = document.getElementById("drawing-triangle");
  if (triangle) triangle.setAttribute("visible", "false");

  const baseCylinder = document.getElementById("cylinder");
  if (baseCylinder) baseCylinder.setAttribute("visible", "false");

  // Update label text
  const label = document.getElementById("label-triangle");
  if (label) label.setAttribute("value", "Great Work! Triangle Drawn! \nOpen Menu To Go Back To Homepage!");

  // Remove existing success group if any
  const scene = document.querySelector("a-scene");
  let successGroup = document.getElementById("success-triangle-group");
  if (successGroup) {
    successGroup.parentNode.removeChild(successGroup);
  }

  // Triangle vertices
  const A3 = new THREE.Vector3(0, 0, 0);
  const B3 = new THREE.Vector3(2, 0, 0);
  const C3 = new THREE.Vector3(1, 2, 0);

  // Calculate centroid of the triangle
  const centroid = new THREE.Vector3(
    (A3.x + B3.x + C3.x) / 3,
    (A3.y + B3.y + C3.y) / 3,
    (A3.z + B3.z + C3.z) / 3
  );

  // Create successGroup and position it at the centroid's world position
  successGroup = document.createElement("a-entity");
  successGroup.setAttribute("id", "success-triangle-group");

  successGroup.setAttribute("position", `${centroid.x} ${centroid.y + 0.5} -4`);
  scene.appendChild(successGroup);

  // Helper to create cylinders between points relative to centroid (for centering rotation)
  function createEdgeCylinder(id, start, end) {
    const s = new THREE.Vector3().subVectors(start, centroid);
    const e = new THREE.Vector3().subVectors(end, centroid);

    const cyl = document.createElement("a-cylinder");
    cyl.setAttribute("id", id);

    const edgeRadius = 0.1;
    const color = "cyan";

    cyl.setAttribute("radius", edgeRadius);

    const length = s.distanceTo(e);
    cyl.setAttribute("height", length);
    cyl.setAttribute("color", color);

    const midpoint = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
    cyl.setAttribute("position", `${midpoint.x} ${midpoint.y} ${midpoint.z}`);

    const direction = new THREE.Vector3().subVectors(e, s).normalize();
    const axis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, direction);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');

    cyl.setAttribute("rotation", `${THREE.MathUtils.radToDeg(euler.x)} ${THREE.MathUtils.radToDeg(euler.y)} ${THREE.MathUtils.radToDeg(euler.z)}`);

    successGroup.appendChild(cyl);
    return cyl;
  }

  // Helper to create spheres at vertices (rounded corners)
  function createVertexSphere(id, position) {
    const pos = new THREE.Vector3().subVectors(position, centroid);
    const sphere = document.createElement("a-sphere");
    sphere.setAttribute("id", id);
    sphere.setAttribute("radius", 0.10);
    sphere.setAttribute("color", "cyan");
    sphere.setAttribute("position", `${pos.x} ${pos.y} ${pos.z}`);
    successGroup.appendChild(sphere);
  }

  // Create edges
  createEdgeCylinder("success-edge-AB", A3, B3);
  createEdgeCylinder("success-edge-BC", B3, C3);
  createEdgeCylinder("success-edge-CA", C3, A3);

  // Create spheres at vertices
  createVertexSphere("vertex-A", A3);
  createVertexSphere("vertex-B", B3);
  createVertexSphere("vertex-C", C3);

  // Animate rotation
  let angle = 0;
  function rotate() {
    angle += 10; 
    successGroup.setAttribute("rotation", `0 ${angle} 0`);
    requestAnimationFrame(rotate);
  }
  rotate();

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


