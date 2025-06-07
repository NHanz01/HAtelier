// guideTree.js

// --- State Variables ---
let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let visualAidSphere = null;
let treeCompleted = false;
let drawing = false;


const locationText = document.getElementById("locationText");

// --- Tree Shape Definitions ---
const treeVertices = [
  // Canopy
  new THREE.Vector2(0, 2.5),        // 0
  new THREE.Vector2(-0.5, 2),       // 1
  new THREE.Vector2(0.5, 2),        // 2
  new THREE.Vector2(-0.3, 1.5),     // 3
  new THREE.Vector2(0.3, 1.5),      // 4

  // Trunk rectangle corners (from guide lines logic)
  new THREE.Vector2(-0.25, 1.0),    // 5: top-left
  new THREE.Vector2(0.25, 1.0),     // 6: top-right
  new THREE.Vector2(0.25, 0.5),     // 7: bottom-right
  new THREE.Vector2(-0.25, 0.5),    // 8: bottom-left
];

const canopyIndices = [0, 1, 3, 4, 2]; // canopy arc shape
const branchIndices = [
  5, 6,  // top edge
  6, 7,  // right edge
  7, 8,  // bottom edge
  8, 5,  // left edge
];

const canopyCoverage = new Array(canopyIndices.length).fill(false);
const trunkCoverage = new Array(branchIndices.length).fill(false);

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

function isNearEdge(pos, indices) {
  for (let i = 0; i < indices.length - 1; i++) {
    if (isPointNearLineSegment(pos, treeVertices[indices[i]], treeVertices[indices[i + 1]])) {
      return true;
    }
  }
  return false;
}

function isNearCanopyEdge(pos) {
  return isNearEdge(pos, [...canopyIndices, canopyIndices[0]]);
}

function isNearBranchEdge(pos) {
  return isNearEdge(pos, branchIndices);
}

function markNearbyEdgesCovered(pos) {
  [...canopyIndices, canopyIndices[0]].forEach((_, i, arr) => {
    if (i === arr.length - 1) return;
    if (isPointNearLineSegment(pos, treeVertices[arr[i]], treeVertices[arr[i + 1]])) {
      canopyCoverage[i] = true;
    }
  });

  for (let i = 0; i < branchIndices.length - 1; i++) {
    if (isPointNearLineSegment(pos, treeVertices[branchIndices[i]], treeVertices[branchIndices[i + 1]])) {
      trunkCoverage[i] = true;
    }
  }
}

function isPointNearLineSegment(p, a, b, threshold = 0.15) {
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const abLengthSq = ab.x * ab.x + ab.y * ab.y;

  if (abLengthSq === 0) return false; // a and b are the same point

  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / abLengthSq));
  const closestPoint = {
    x: a.x + ab.x * t,
    y: a.y + ab.y * t,
  };

  const dx = p.x - closestPoint.x;
  const dy = p.y - closestPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance < threshold;
}

// CHECK COMPLETION SUCCESS
function isTreeCovered() {
  const canopyFilled = canopyCoverage.filter(Boolean).length / canopyCoverage.length;
  const trunkFilled = trunkCoverage.filter(Boolean).length / trunkCoverage.length;

  return canopyFilled >= 0.5 && trunkFilled >= 0.35;
}


// --- Visual Helpers ---
function createTreeGuideLines(scene) {
  const z = -4;
  const canopyPositions = [
    { x: 0, y: 2.5 }, { x: -0.5, y: 2 }, { x: 0.5, y: 2 },
    { x: -0.3, y: 1.5 }, { x: 0.3, y: 1.5 },
  ];

  canopyPositions.forEach(pos => {
    const torus = document.createElement("a-torus");
    torus.setAttribute("radius", 0.3);
    torus.setAttribute("radius-tubular", 0.03);
    torus.setAttribute("rotation", "0 0 0");
    torus.setAttribute("color", "springGreen");
    torus.setAttribute("opacity", "0.5");
    torus.setAttribute("position", `${pos.x} ${pos.y} ${z}`);
    torus.classList.add("guide-canopy");
    scene.appendChild(torus);
  });

  const branchWidth = 0.3, branchHeight = 0.5, branchBaseY = 0.5;

  const addCyl = (x, y, rot = "0 0 0") => {
    const cyl = document.createElement("a-cylinder");
    cyl.setAttribute("position", `${x} ${y} ${z}`);
    cyl.setAttribute("height", branchHeight / 3);
    cyl.setAttribute("radius", 0.05);
    cyl.setAttribute("color", "saddleBrown");
    cyl.setAttribute("opacity", "0.5");
    cyl.setAttribute("rotation", rot);
    cyl.classList.add("guide-branch");
    scene.appendChild(cyl);
  };

  [ -0.25, 0.25 ].forEach(x =>
    Array.from({ length: 4 }).forEach((_, i) =>
      addCyl(x, branchBaseY + i * (branchHeight / 3))
    )
  );

  for (let i = 0; i < 5; i++) {
    const x = -branchWidth / 2 + i * branchWidth / 4;
    addCyl(x, branchBaseY, "0 0 90");
    addCyl(x, branchBaseY + branchHeight, "0 0 90");
  }
}

function drawTreeSphere(pos) {
  if (treeCompleted) return;

  const isNearCanopy = isNearCanopyEdge(pos);
  const isNearBranch = isNearBranchEdge(pos);
  if (!isNearCanopy && !isNearBranch) return;

  const sphere = document.createElement("a-sphere");
  sphere.setAttribute("position", `${pos.x} ${pos.y} -3.9`);
  sphere.setAttribute("color", isNearCanopy ? "springGreen" : "saddleBrown");
  sphere.setAttribute("radius", "0.08");
  sphere.classList.add("spawned-sphere");
  document.querySelector("a-scene").appendChild(sphere);

  locationText.innerHTML = "🌲 Drawing tree...";
  markNearbyEdgesCovered(pos);

  if (isTreeCovered()) showSuccessTree();
} 

function deleteAllSpheres() {
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  canopyCoverage.fill(false);
  trunkCoverage.fill(false);
  treeCompleted = false;
  locationText.innerHTML = "✅ Drawings cleared";
  setTimeout(() => locationText.innerHTML = "", 1000);
}

window.addEventListener('DOMContentLoaded', () => {
  const videoElement = document.getElementById("input_video");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const statusText = document.getElementById("statusText");

  const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });

  const scene = document.querySelector("a-scene");
  createTreeGuideLines(scene);

  const label = document.createElement("a-text");
  label.setAttribute("value", "Try To Draw The Tree!");
  label.setAttribute("align", "center");
  label.setAttribute("color", "SpringGreen");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 0 -4");
  label.setAttribute("id", "label-tree");
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
      const fingerY = (0.5 - landmarks[8].y) * 1.5 + 1;
      const fingerPos = new THREE.Vector2(fingerX, fingerY);
      const fixedZ = -4;

      // Show visual aid sphere following fingertip
      if (!visualAidSphere) {
        visualAidSphere = document.createElement("a-sphere");
        visualAidSphere.setAttribute("id", "visual-aid");
        visualAidSphere.setAttribute("radius", "0.1");
        visualAidSphere.setAttribute("opacity", "0.7");
        visualAidSphere.setAttribute("transparent", "true");
        document.querySelector("a-scene").appendChild(visualAidSphere);
      }

      visualAidSphere.setAttribute("position", `${fingerX} ${fingerY} ${fixedZ}`);

      // Check proximity to tree
      const isNear = isNearCanopyEdge(fingerPos) || isNearBranchEdge(fingerPos);

      visualAidSphere.setAttribute("color", isNear ? "springGreen" : "red");
      visualAidSphere.setAttribute("visible", "true");

      if (isPeaceSign(landmarks)) {
        statusText.textContent = "Gesture: Peace Sign ✌️";
        document.getElementById("menu").style.display = "none";
        if (treeCompleted) return;
        drawing = true;
        if (isNear ) {
          drawTreeSphere(fingerPos);
        } else {
          locationText.innerHTML = `👉 Move finger closer to tree`;
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

// Home button
document.getElementById("home-button").addEventListener("click", () => {
  if(confirm("Back To Main Menu?")) {
    window.location.href = "./index.html";
  }
});

// Clear button
document.getElementById("clear-button").addEventListener("click", () => {
  if(confirm("Clear Drawings?")) {
    deleteAllSpheres();
  }
});

function showSuccessTree() {
  treeCompleted = true;

  // Remove drawn spheres and hide guides
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  document.querySelectorAll(".guide-line").forEach(l => l.setAttribute("visible", "false"));
  document.querySelectorAll(".guide-canopy, .guide-branch").forEach(el => el.setAttribute("visible", "false"));

  const label = document.getElementById("label-tree");
  if (label) label.setAttribute("value", "Brilliant! Tree Drawn! \nOpen Menu To Go Back To Homepage!");

  const scene = document.querySelector("a-scene");

  // Create final tree container
  const tree = document.createElement("a-entity");
  tree.setAttribute("position", "0 1.5 -4");
  tree.setAttribute("id", "final-tree");

  const canopyPositions = [
    { x: 0, y: 1.5 }, { x: -0.7, y: 1 }, { x: 0.7, y: 1 },
    { x: -0.4, y: 0.3 }, { x: 0.4, y: 0.3 },
  ];

  canopyPositions.forEach(pos => {
    const torus = document.createElement("a-torus");
    torus.setAttribute("radius", 0.3);
    torus.setAttribute("radius-tubular", 0.05);
    torus.setAttribute("rotation", "0 0 0");
    torus.setAttribute("color", "springGreen");
    torus.setAttribute("position", `${pos.x} ${pos.y} 0`);
    tree.appendChild(torus);
  });

  // Add branches (vertical and horizontal cylinders)
  const branchWidth = 0.6;
  const branchHeight = 0.9;
  const branchBaseY = -1;

  // Vertical edges
  for (let i = 0; i < 4; i++) {
    const leftCyl = document.createElement("a-cylinder");
    leftCyl.setAttribute("position", `${-branchWidth / 2} ${branchBaseY + (i * branchHeight / 3)} 0`);
    leftCyl.setAttribute("height", branchHeight / 3);
    leftCyl.setAttribute("radius", 0.05);
    leftCyl.setAttribute("color", "saddleBrown");
    tree.appendChild(leftCyl);

    const rightCyl = document.createElement("a-cylinder");
    rightCyl.setAttribute("position", `${branchWidth / 2} ${branchBaseY + (i * branchHeight / 3)} 0`);
    rightCyl.setAttribute("height", branchHeight / 3);
    rightCyl.setAttribute("radius", 0.05);
    rightCyl.setAttribute("color", "saddleBrown");
    tree.appendChild(rightCyl);
  }

  // Horizontal edges
  for (let i = 0; i < 5; i++) {
    const xPos = -branchWidth / 2 + (i * branchWidth / 4);
    
    const bottomCyl = document.createElement("a-cylinder");
    bottomCyl.setAttribute("position", `${xPos} ${branchBaseY} 0`);
    bottomCyl.setAttribute("height", branchWidth / 4);
    bottomCyl.setAttribute("radius", 0.05);
    bottomCyl.setAttribute("color", "saddleBrown");
    bottomCyl.setAttribute("rotation", "0 0 90");
    tree.appendChild(bottomCyl);

    const topCyl = document.createElement("a-cylinder");
    topCyl.setAttribute("position", `${xPos} ${branchBaseY + branchHeight} 0`);
    topCyl.setAttribute("height", branchWidth / 4);
    topCyl.setAttribute("radius", 0.05);
    topCyl.setAttribute("color", "saddleBrown");
    topCyl.setAttribute("rotation", "0 0 90");
    tree.appendChild(topCyl);
  }

  // Add rotation and float animations
  tree.setAttribute('animation', 'property: rotation; to: 0 360 0; loop: true; dur: 4000; easing: linear;');
  tree.setAttribute('animation__float', 'property: position; dir: alternate; dur: 2000; loop: true; to: 0 1.7 -4; easing: easeInOutSine;');

  scene.appendChild(tree);

  // Hide clear button
  document.getElementById("clear-button").style.display = "none";
}
