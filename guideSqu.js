let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let drawing = false;
let visualAidSphere = null;
let squareCompleted = false;

// Square vertices in 2D local space
const A = new THREE.Vector2(-0.75, 0.75);
const B = new THREE.Vector2(0.75, 0.75);
const C = new THREE.Vector2(0.75, 2.25);
const D = new THREE.Vector2(-0.75, 2.25);

// Divide Square edges AB and CD into segments
const segmentsPerEdge = 20;
const AB_segments = [];
const BC_segments = [];
const CD_segments = [];
const DA_segments = [];

for (let i = 0; i < segmentsPerEdge; i++) {
  const t = i / (segmentsPerEdge - 1);
  AB_segments.push(new THREE.Vector2().lerpVectors(A, B, t));
  BC_segments.push(new THREE.Vector2().lerpVectors(B, C, t));
  CD_segments.push(new THREE.Vector2().lerpVectors(C, D, t));
  DA_segments.push(new THREE.Vector2().lerpVectors(D, A, t));
}

const coverage = {
  AB: new Array(segmentsPerEdge).fill(false),
  BC: new Array(segmentsPerEdge).fill(false),
  CD: new Array(segmentsPerEdge).fill(false),
  DA: new Array(segmentsPerEdge).fill(false),
};


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

function markCoverage(p) {

  // Only mark coverage on CD and DA edges
  [CD_segments, DA_segments].forEach((segArr, idx) => {
    const edgeName = ["CD", "DA"][idx];
    segArr.forEach((segPt, i) => {
      if (!coverage[edgeName][i] && p.distanceTo(segPt) < 0.12) {
        coverage[edgeName][i] = true;
      }
    });
  });
}

// HOW MANY PERCENT BEFORE SUCCESS
function isEdgeCovered(edgeArray) {
  const count = edgeArray.filter(v => v).length;
  return count / segmentsPerEdge >= 0.6;
}

function closestPointOnLineSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const ap = p.clone().sub(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
  return a.clone().add(ab.multiplyScalar(t));
}

function getClosestPointOnEdges(p) {
  const edges = [
    { name: "CD", a: C, b: D },
    { name: "DA", a: D, b: A }
  ];

  let minDist = Infinity;
  let closestPoint = null;
  let closestEdgeName = null;

  for (const edge of edges) {
    const pt = closestPointOnLineSegment(p, edge.a, edge.b);
    const dist = p.distanceTo(pt);
    if (dist < minDist) {
      minDist = dist;
      closestPoint = pt;
      closestEdgeName = edge.name;
    }
  }

  return { closestPoint, minDist, closestEdgeName };
}



function drawEdgeSphere({ x, y }) {
  const fixedZ = -4;
  const sphere = document.createElement("a-sphere");
  if (squareCompleted) return; // Don't allow drawing anymore

  sphere.setAttribute("position", `${x} ${y + 0.5} ${fixedZ}`);
  sphere.setAttribute("color", "SpringGreen");
  sphere.setAttribute("radius", "0.1");
  sphere.classList.add("spawned-sphere");
  document.querySelector("a-scene").appendChild(sphere);
  locationText.innerHTML = `🎨 Snapped Drawing`;
  markCoverage(new THREE.Vector2(x, y));

  if ( isEdgeCovered(coverage.CD) && isEdgeCovered(coverage.DA)) 
  {
    showSuccessSquare();
  }
}

function deleteAllSpheres() {
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  coverage.AB.fill(false);
  coverage.BC.fill(false);
  coverage.CD.fill(false);
  coverage.DA.fill(false);
  locationText.innerHTML = `✅ All Drawings Cleared`;
  setTimeout(() => {
    locationText.innerHTML = "";
  }, 1000);
}

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

window.addEventListener('DOMContentLoaded', () => {
  const videoElement = document.getElementById("input_video");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const statusText = document.getElementById("statusText");

  const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });

  const rect = document.createElement("a-plane");
  rect.setAttribute("position", "0 2 -4.1");
  rect.setAttribute("width", "1.5");
  rect.setAttribute("height", "1.5");
  rect.setAttribute("color", "yellow");
  rect.setAttribute("opacity", "0.5");
  rect.setAttribute("transparent", "true");
  rect.setAttribute("id", "drawing-square");
  document.querySelector("a-scene").appendChild(rect);

  const baseLine = document.createElement("a-cylinder");
  baseLine.setAttribute("position", "0.7 2 -3.8");
  baseLine.setAttribute("radius", "0.09");
  baseLine.setAttribute("height", "1.5");
  baseLine.setAttribute("color", "SpringGreen");
  baseLine.setAttribute("rotation", "0 90 0");
  baseLine.setAttribute("id", "cylinder");
  document.querySelector("a-scene").appendChild(baseLine);
  
  const baseLine2 = document.createElement("a-cylinder");
  baseLine2.setAttribute("position", "0.05 1.3 -3.8");
  baseLine2.setAttribute("radius", "0.09");
  baseLine2.setAttribute("height", "1.5");
  baseLine2.setAttribute("color", "SpringGreen");
  baseLine2.setAttribute("rotation", "0 0 90");
  baseLine2.setAttribute("id", "cylinder2");
  document.querySelector("a-scene").appendChild(baseLine2);


  const label = document.createElement("a-text");
  label.setAttribute("value", "Try completing this square!");
  label.setAttribute("align", "center");
  label.setAttribute("color", "SpringGreen");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 1 -4");
  label.setAttribute("id", "label-square");
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
      const fingertip2D = new THREE.Vector2(fingerX, fingerY);
      const fixedZ = -4;

      const squareEntity = document.getElementById("drawing-square");

      const { closestPoint, minDist } = getClosestPointOnEdges(fingertip2D);

      if (minDist < 0.2) {
        squareEntity.setAttribute("color", "green");
        locationText.innerHTML = "💚 Square edge touched!";
      } else {
        squareEntity.setAttribute("color", "yellow");
        locationText.innerHTML = "";
      }

      if (!visualAidSphere) {
        visualAidSphere = document.createElement("a-sphere");
        visualAidSphere.setAttribute("id", "visual-aid");
        visualAidSphere.setAttribute("radius", "0.05");
        visualAidSphere.setAttribute("opacity", "0.5");
        visualAidSphere.setAttribute("transparent", "true");
        document.querySelector("a-scene").appendChild(visualAidSphere);
      }

      if (minDist < 0.2) {
        visualAidSphere.setAttribute("position", `${closestPoint.x} ${closestPoint.y + 0.5} ${fixedZ}`);
        visualAidSphere.setAttribute("color", "SpringGreen");
        visualAidSphere.setAttribute("visible", "true");
      } else {
        visualAidSphere.setAttribute("position", `${fingerX} ${fingerY} ${fixedZ}`);
        visualAidSphere.setAttribute("color", "red");
        visualAidSphere.setAttribute("visible", "true");
      }

      if (isPeaceSign(landmarks)) {
        statusText.textContent = "Gesture: Peace Sign ✌️";
        drawing = true;
        document.getElementById("menu").style.display = "none";
        if (minDist < 0.2) {
          drawEdgeSphere({ x: closestPoint.x, y: closestPoint.y });
          
        } else {
          locationText.innerHTML = `👉 Move finger closer to square edge to draw`;
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
      statusText.textContent = "Gesture: None";
      if (visualAidSphere) visualAidSphere.setAttribute("visible", "false");
      if (drawing) drawing = false;
      locationText.innerHTML = "";
    }

    canvasCtx.restore();
    const event = new CustomEvent("handsResults", { detail: results });
    window.dispatchEvent(event);
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


function showSuccessSquare() {
  squareCompleted = true;

  // Remove all spawned spheres
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());

  // Hide drawing square and cylinders
  const rect = document.getElementById("drawing-square");
  if (rect) rect.setAttribute("visible", "false");

  const baseCylinder = document.getElementById("cylinder");
  if (baseCylinder) baseCylinder.setAttribute("visible", "false");

  const baseCylinder2 = document.getElementById("cylinder2");
  if (baseCylinder2) baseCylinder2.setAttribute("visible", "false");

  // Update success label
  const label = document.getElementById("label-square");
  if (label) label.setAttribute("value", "Brilliant! Square Drawn! \nOpen Menu To Go Back To Homepage!");

  // Define square vertices in Vector3 (z = -4 for placement in scene)
  const A = new THREE.Vector3(-0.75, 1.5, -4);
  const B = new THREE.Vector3(0.75, 1.5, -4);
  const C = new THREE.Vector3(0.75, 3, -4);
  const D = new THREE.Vector3(-0.75, 3, -4);

  // Compute centroid for centering the rotating group
  const centroid = new THREE.Vector3(
    (A.x + B.x + C.x + D.x) / 4,
    (A.y + B.y + C.y + D.y) / 4,
    (A.z + B.z + C.z + D.z) / 4
  );

  // Create rotating group
  const scene = document.querySelector("a-scene");
  let successGroup = document.getElementById("success-square-group");
  if (successGroup) successGroup.remove(); // Remove old group if exists

  successGroup = document.createElement("a-entity");
  successGroup.setAttribute("id", "success-square-group");
  successGroup.setAttribute("position", `${centroid.x} ${centroid.y} ${centroid.z}`);
  scene.appendChild(successGroup);

  // Utility: Create edge cylinders between vertices
  function createEdgeCylinder(id, start, end) {
    const s = new THREE.Vector3().subVectors(start, centroid);
    const e = new THREE.Vector3().subVectors(end, centroid);

    const cyl = document.createElement("a-cylinder");
    cyl.setAttribute("id", id);
    cyl.setAttribute("radius", 0.1);
    cyl.setAttribute("color", "SpringGreen");

    const length = s.distanceTo(e);
    cyl.setAttribute("height", length);

    const midpoint = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
    cyl.setAttribute("position", `${midpoint.x} ${midpoint.y} ${midpoint.z}`);

    const direction = new THREE.Vector3().subVectors(e, s).normalize();
    const axis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, direction);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
    cyl.setAttribute("rotation", `${THREE.MathUtils.radToDeg(euler.x)} ${THREE.MathUtils.radToDeg(euler.y)} ${THREE.MathUtils.radToDeg(euler.z)}`);

    successGroup.appendChild(cyl);
  }

  // Utility: Create vertex spheres
  function createVertexSphere(id, position) {
    const pos = new THREE.Vector3().subVectors(position, centroid);
    const sphere = document.createElement("a-sphere");
    sphere.setAttribute("id", id);
    sphere.setAttribute("radius", 0.1);
    sphere.setAttribute("color", "SpringGreen");
    sphere.setAttribute("position", `${pos.x} ${pos.y} ${pos.z}`);
    successGroup.appendChild(sphere);
  }

  // Add edges
  createEdgeCylinder("edge-AB", A, B);
  createEdgeCylinder("edge-BC", B, C);
  createEdgeCylinder("edge-CD", C, D);
  createEdgeCylinder("edge-DA", D, A);

  // Add corners
  createVertexSphere("vertex-A", A);
  createVertexSphere("vertex-B", B);
  createVertexSphere("vertex-C", C);
  createVertexSphere("vertex-D", D);

  // Animate the square's rotation
  let angle = 0;
  function rotateSquare() {
    if (!squareCompleted) return; // stop rotating if reset
    angle += 15;
    successGroup.setAttribute("rotation", `0 ${angle} 0`);
    requestAnimationFrame(rotateSquare);
  }
  rotateSquare();
  
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