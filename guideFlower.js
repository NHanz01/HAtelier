let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let drawing = false;
let visualAidSphere = null;
let flowerCompleted = false;

// Flower center and petals configuration
const center = new THREE.Vector2(0, 2);
const petalRadius = 0.6;
const petalCount = 5;
const petalAngleStep = (2 * Math.PI) / petalCount;

// Generate petal centers in 2D space
const petalCenters = [];
for (let i = 0; i < petalCount; i++) {
  const angle = i * petalAngleStep - Math.PI / 2; // start from top (adjust as needed)
  const x = center.x + petalRadius * Math.cos(angle);
  const y = center.y + petalRadius * Math.sin(angle);
  petalCenters.push(new THREE.Vector2(x, y));
}

// Generate checkpoints around each petal
const checkpointsPerPetal = 6;
const checkpointRadius = 0.3;
const checkpointTolerance = 0.06;
const checkpoints = [];

for (let i = 0; i < petalCount; i++) {
  const petalCheckpoints = [];
  const center = petalCenters[i];
  const baseAngle = i * petalAngleStep - Math.PI / 2;

  for (let j = 0; j < checkpointsPerPetal; j++) {
    const angle = baseAngle + (j / checkpointsPerPetal) * 2 * Math.PI;
    const x = center.x + checkpointRadius * Math.cos(angle);
    const y = center.y + checkpointRadius * Math.sin(angle);
    petalCheckpoints.push({ pos: new THREE.Vector2(x, y), hit: false });
  }
  checkpoints.push(petalCheckpoints);
}

function isNearTorusRing(finger, petalCenter, petalRadius = 0.3, tubeRadius = 0.05) {
  const dx = finger.x - petalCenter.x;
  const dy = finger.y - petalCenter.y;
  const dz = finger.z + 4.6; // Assuming torus Z is fixed at -4.6

  const distXY = Math.sqrt(dx * dx + dy * dy);
  const ringDist = Math.abs(distXY - petalRadius); // distance from finger to torus ring

  return ringDist < tubeRadius * 1.5 && Math.abs(dz) < tubeRadius * 1.5;
}

// Track which petals have been drawn on
const coverage = new Array(petalCount).fill(false);

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

function tryHitCheckpoint(fingerPos) {
  for (let i = 0; i < checkpoints.length; i++) {
    for (let j = 0; j < checkpoints[i].length; j++) {
      const cp = checkpoints[i][j];
      if (!cp.hit && fingerPos.distanceTo(cp.pos) <= checkpointTolerance) {
        cp.hit = true;
        return i; // return petal index instead of true
      }
    }
  }
  return -1; // no checkpoint hit
}

// CHECK SUCCESS COMPLETION OF THE DRAWING
function isFlowerCompleted() {
  const total = checkpoints.length * checkpointsPerPetal;
  let hitCount = 0;
  for (const petal of checkpoints) {
    for (const cp of petal) {
      if (cp.hit) hitCount++;
    }
  }
  return hitCount / total >= 0.8;
}


function drawPetalSphere(pos) {
  if (flowerCompleted) return;

  const z = -4;

  // Check if the finger is close to any torus ring (freeform drawing allowed!)
  let nearAnyPetal = false;
  for (let center of petalCenters) {
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const torusRadius = 0.3;
    const tubeThickness = 0.05;

    // Allow drawing if finger is within the torus ring band
    if (Math.abs(dist - torusRadius) < tubeThickness * 2.2) {
      nearAnyPetal = true;
      break;
    }
  }

  if (!nearAnyPetal) {
    locationText.innerHTML = `❌ Not on petals`;
    return;
  }

  // Always allow drawing when near the ring (no longer tied to checkpoint!)
  const sphere = document.createElement("a-sphere");
  sphere.setAttribute("position", `${pos.x} ${pos.y} ${z}`);
  sphere.setAttribute("color", "Orchid");
  sphere.setAttribute("radius", "0.09");
  sphere.classList.add("spawned-sphere");
  document.querySelector("a-scene").appendChild(sphere);

  locationText.innerHTML = `🎨 Drawing on flower petals`;

  // Check checkpoint hits quietly in the background
  tryHitCheckpoint(pos);

  // Check if 80% checkpoint coverage is reached
  if (isFlowerCompleted()) showSuccessFlower();
}



function deleteAllSpheres() {
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  for (let i = 0; i < checkpoints.length; i++) {
    for (let j = 0; j < checkpoints[i].length; j++) {
      checkpoints[i][j].hit = false;
    }
  }
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

  // Draw flower petals as yellow torus rings
  for(let i = 0; i < petalCount; i++) {
    const angleDeg = i * (360 / petalCount) - 90;
    const petal = document.createElement("a-torus");
    petal.setAttribute("position", `${petalCenters[i].x} ${petalCenters[i].y} -4.6`);
    petal.setAttribute("radius", "0.3");
    petal.setAttribute("radius-tubular", "0.05");
    petal.setAttribute("color", "yellow");
    petal.setAttribute("opacity", "0.3");
    petal.setAttribute("rotation", `0 0 ${angleDeg}`);
    petal.setAttribute("id", `petal-${i}`);
    document.querySelector("a-scene").appendChild(petal);
  }

  const label = document.createElement("a-text");
  label.setAttribute("value", "Try To Draw The Flower!");
  label.setAttribute("align", "center");
  label.setAttribute("color", "Orchid");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 0 -4.5");
  label.setAttribute("id", "label-flower");
  document.querySelector("a-scene").appendChild(label);

  // Add center sphere
  const centerSphere = document.createElement("a-sphere");
  centerSphere.setAttribute("radius", "0.3");
  centerSphere.setAttribute("color", "gold");
  centerSphere.setAttribute("position", "0 2 -4.5");
  document.querySelector("a-scene").appendChild(centerSphere);
  
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

      // Check proximity to petals
      let nearPetal = false;
      for (let center of petalCenters) {
        if (fingerPos.distanceTo(center) >= 0.3 - 0.07 && fingerPos.distanceTo(center) <= 0.3 + 0.07) {
          nearPetal = true;
          break;
        }
      }

      // Change color based on hit detection
      visualAidSphere.setAttribute("color", nearPetal ? "orchid" : "red");
      visualAidSphere.setAttribute("visible", "true");


      if (isPeaceSign(landmarks)) {
        statusText.textContent = "Gesture: Peace Sign ✌️";
        document.getElementById("menu").style.display = "none";
        if (flowerCompleted) return;
        drawing = true;
        if (nearPetal) {
          drawPetalSphere(fingerPos); 
        } else {
          locationText.innerHTML = `👉 Move finger closer to petals`;
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

function showSuccessFlower() {
  flowerCompleted = true;

  // Remove all spawned spheres
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());

  // Hide flower petals
  for(let i = 0; i < petalCount; i++) {
    const petal = document.getElementById(`petal-${i}`);
    if(petal) petal.setAttribute("visible", "false");
  }

  // Update label
  const label = document.getElementById("label-flower");
  if (label) label.setAttribute("value", "Beautiful! Flower Drawn! \nOpen Menu To Go Back To Homepage!");

  // Create flower spin animation using torus petals
  const spinEntity = document.createElement("a-entity");
  spinEntity.setAttribute("position", "0 2 -4");

  // Add petals
  for(let i = 0; i < petalCount; i++) {
    const angleDeg = i * (360 / petalCount) - 90;
    const petal = document.createElement("a-torus");
    petal.setAttribute("radius", "0.3");
    petal.setAttribute("radius-tubular", "0.05");
    petal.setAttribute("color", "orchid");
    petal.setAttribute("rotation", `0 0 ${angleDeg}`);
    petal.setAttribute("position", `${petalCenters[i].x} ${petalCenters[i].y - 2} 0`); 
    // We subtract 2 on y because spinEntity already positioned at y=2
    spinEntity.appendChild(petal);
  }

  // Add center sphere
  const centerSphere = document.createElement("a-sphere");
  centerSphere.setAttribute("radius", "0.3");
  centerSphere.setAttribute("color", "gold");
  centerSphere.setAttribute("position", "0 0 0");
  spinEntity.appendChild(centerSphere);

  // Animate rotation
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
