let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let drawing = false;
let visualAidSphere = null;
let fishCompleted = false;
let guideFishEntities = [];

const locationText = document.getElementById("locationText");

// FISH 
const fishParts = [
  { type: 'torus', position: { x: 0, y: 2 }, radius: 0.6, tubular: 0.05, scale: "1.5 1 1" }, // body
  { type: 'cylinder', position: { x: 1, y: 2.1 }, height: 1, radius: 0.1, rotation: "0 0 -45" },  // tail fin 1 (upper right)
  { type: 'cylinder', position: { x: 1, y: 1.9 }, height: 1, radius: 0.1, rotation: "0 0 45" },   // tail fin 2 (lower right)
  { type: 'cylinder', position: { x: 1.6, y: 2.2 }, height: 0.8, radius: 0.1, rotation: "0 0 -120" }, // tail fin 3 (top far right)
  { type: 'cylinder', position: { x: 1.6, y: 1.8 }, height: 0.8, radius: 0.1, rotation: "0 0 120" },  // tail fin 4 (bottom far right)
];

const fishCheckpoints = [
  new THREE.Vector2(0, 2.7),      // body 1
  new THREE.Vector2(-0.8, 2.2),   // body 2
  new THREE.Vector2(1, 2.2),      // body 3
  new THREE.Vector2(0, 1.4),      // body 4
  new THREE.Vector2(1.5, 2.5),   // tail 1
  new THREE.Vector2(1.5, 1.6),   // tail 2
];

let checkpointHits = new Array(fishCheckpoints.length).fill(false);

// DRAW THE FISH GUIDE ON THE SCENE
fishParts.forEach(part => {
  let entity;
  if (part.type === 'torus') {
    entity = document.createElement("a-torus");
    entity.setAttribute("radius", part.radius);
    entity.setAttribute("radius-tubular", part.tubular);
    entity.setAttribute("scale", part.scale);
  } else if (part.type === 'cylinder') {
    entity = document.createElement("a-cylinder");
    entity.setAttribute("radius", part.radius);
    entity.setAttribute("height", part.height);
    entity.setAttribute("rotation", part.rotation);
  }
  entity.setAttribute("position", `${part.position.x} ${part.position.y} -4`);
  entity.setAttribute("color", "royalBlue");
  entity.setAttribute("opacity", "0.3");
  entity.setAttribute("transparent", "true");
  document.querySelector("a-scene").appendChild(entity);

  // Store for later removal
  guideFishEntities.push(entity);
});

// CHECK CHECKPOINTS
function checkFishCheckpoint(pos) {
  for (let i = 0; i < fishCheckpoints.length; i++) {
    const checkpoint = fishCheckpoints[i];
    if (!checkpointHits[i] && pos.distanceTo(checkpoint) <= 0.2) {
      checkpointHits[i] = true;
      return true;
    }
  }
  return false;
}

// CHECK SUCCESS COMPLETION OF THE DRAWING
function isFishCovered() {
  return checkpointHits.filter(Boolean).length >= 4;
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

function closestPointOnSegment(A, B, P) {
  const AB = B.clone().sub(A);
  const AP = P.clone().sub(A);
  const t = Math.max(0, Math.min(1, AP.dot(AB) / AB.lengthSq()));
  return A.clone().add(AB.multiplyScalar(t));
}


// Check if finger is close to a fish center within threshold
function findClosestFishPartIndex(pos) {
  for (let i = 0; i < fishParts.length; i++) {
    const part = fishParts[i];
    const center = new THREE.Vector2(part.position.x, part.position.y);

    if (part.type === 'torus') {
      const rOuter = part.radius;
      const rInner = rOuter - part.tubular * 2; // inner radius from tubular

      const dist = pos.distanceTo(center);
      if (dist >= rInner && dist <= rOuter + 0.05) {
        return i;
      }
    }

    if (part.type === 'cylinder') {
      const height = part.height;
      const half = height / 2;
      const angleDeg = parseFloat(part.rotation.split(" ")[2]);
      const angleRad = angleDeg * (Math.PI / 180);

      const dx = Math.cos(angleRad) * half;
      const dy = Math.sin(angleRad) * half;

      const start = new THREE.Vector2(center.x - dx, center.y - dy);
      const end = new THREE.Vector2(center.x + dx, center.y + dy);

      const closest = closestPointOnSegment(start, end, pos);
      const distToSegment = pos.distanceTo(closest);

      if (distToSegment <= 0.15) {
        return i;
      }
    }
  }
  return -1;
}

// Draw a red sphere on center
function drawFishSegment(pos) {
  if (fishCompleted) return;

  const z = -3.8;

  const sphere = document.createElement("a-sphere");
  sphere.setAttribute("position", `${pos.x} ${pos.y} ${z}`);
  sphere.setAttribute("color", "RoyalBlue");
  sphere.setAttribute("radius", "0.1");
  sphere.classList.add("spawned-sphere");
  document.querySelector("a-scene").appendChild(sphere);

  locationText.innerHTML = `🎨 Drawing on fish parts`;

  const index = findClosestFishPartIndex(pos);

  if (checkFishCheckpoint(pos)) {
  locationText.innerHTML = `✅ Fish part hit!`;
  }
  
  if (isFishCovered()) showSuccessFish();
}


function deleteAllSpheres() {
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  locationText.innerHTML = `✅ All Drawings Cleared`;
  checkpointHits.fill(false);
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
  label.setAttribute("value", "Try To Draw The Fish!");
  label.setAttribute("align", "center");
  label.setAttribute("color", "RoyalBlue");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 0 -4.5");
  label.setAttribute("id", "label-fish");
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
      const fixedZ = -3.9;

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

      // Check proximity to Fish
      const closeIndex = findClosestFishPartIndex(fingerPos);
      const near = closeIndex !== -1;

      // Change color based on hit detection
      visualAidSphere.setAttribute("color", near ? "royalBlue" : "red");
      visualAidSphere.setAttribute("visible", "true");


      if (isPeaceSign(landmarks)) {
        statusText.textContent = "Gesture: Peace Sign ✌️";
        document.getElementById("menu").style.display = "none";
        if (fishCompleted) return;
        drawing = true;
        if (near) {
          drawFishSegment(fingerPos); 
        } else {
          locationText.innerHTML = `👉 Move finger closer to fish`;
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

function showSuccessFish() {
  fishCompleted = true;
  
  // Hide guide fish parts
  guideFishEntities.forEach(e => e.setAttribute("visible", "false"));

  // Update label
  const label = document.getElementById("label-fish");
  if (label) label.setAttribute("value", "Nice! Fish Drawn! \nOpen Menu To Go Back To Homepage!");

  // Remove all spawned spheres
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());

  const spinEntity = document.createElement("a-entity");
  spinEntity.setAttribute("position", "0 2 -4");

  // Fish body (oval torus)
  const body = document.createElement("a-torus");
  body.setAttribute("radius", "0.6");
  body.setAttribute("radius-tubular", "0.05");
  body.setAttribute("color", "royalBlue");
  body.setAttribute("scale", "1.5 1 1"); // make it oval
  body.setAttribute("position", "0.2 0 0");
  spinEntity.appendChild(body);

  // Tail: diamond shape using 4 angled cylinders
  const tail1 = document.createElement("a-cylinder");
  tail1.setAttribute("radius", "0.1");
  tail1.setAttribute("height", "1");
  tail1.setAttribute("color", "royalBlue");
  tail1.setAttribute("rotation", "0 0 45");
  tail1.setAttribute("position", "-1 0.1 0");
  spinEntity.appendChild(tail1);

  const tail2 = document.createElement("a-cylinder");
  tail2.setAttribute("radius", "0.1");
  tail2.setAttribute("height", "1");
  tail2.setAttribute("color", "royalBlue");
  tail2.setAttribute("rotation", "0 0 -45");
  tail2.setAttribute("position", "-1 -0.1 0");
  spinEntity.appendChild(tail2);

  const tail3 = document.createElement("a-cylinder");
  tail3.setAttribute("radius", "0.1"); // CORRECTED from tail2
  tail3.setAttribute("height", "0.8");
  tail3.setAttribute("color", "royalBlue");
  tail3.setAttribute("rotation", "0 0 120");
  tail3.setAttribute("position", "-1.6 0.2 0");
  spinEntity.appendChild(tail3);

  const tail4 = document.createElement("a-cylinder");
  tail4.setAttribute("radius", "0.1"); // CORRECTED from tail2
  tail4.setAttribute("height", "0.8");
  tail4.setAttribute("color", "royalBlue");
  tail4.setAttribute("rotation", "0 0 -120");
  tail4.setAttribute("position", "-1.6 -0.2 0");
  spinEntity.appendChild(tail4);

  spinEntity.setAttribute('animation', {
    property: 'rotation',
    to: '0 360 0',
    loop: true,
    dur: 3000,
    easing: 'linear'
  });

  document.querySelector("a-scene").appendChild(spinEntity);

  document.getElementById("clear-button").style.display = "none";
}

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
