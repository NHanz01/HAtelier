let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let drawing = false;
let visualAidSphere = null;
let sunCompleted = false;

// Sun center and rays configuration
const center = new THREE.Vector2(0, 1.5);
const rayCount = 7;
const rayAngleStep = (2 * Math.PI) / rayCount;
const spread = 0.4;         // Reduced spread to make triangles less wide
const baseRadius = 0.4;     // Increase base radius to space out triangles more
const rayLength = 1.2;      // Increase ray length to make triangles taller

// Compute the vertices of each triangle ray in 2D space
const rayTriangles = [];
for (let i = 0; i < rayCount; i++) {
  const angle = i * rayAngleStep - Math.PI / 2; // start pointing up
  
  const baseLeft = new THREE.Vector2(
    center.x + baseRadius * Math.cos(angle + spread),
    center.y + baseRadius * Math.sin(angle + spread)
  );
  const baseRight = new THREE.Vector2(
    center.x + baseRadius * Math.cos(angle - spread),
    center.y + baseRadius * Math.sin(angle - spread)
  );

  // Tip vertex (unchanged)
  const tip = new THREE.Vector2(
    center.x + rayLength * Math.cos(angle),
    center.y + rayLength * Math.sin(angle)
  );
  rayTriangles.push([baseLeft, tip, baseRight]);
}

// Number of sample checkpoints per edge
const samplesPerEdge = 5;

// Build a flat list of checkpoints
const checkpoints = [];

rayTriangles.forEach(tri => {
  const [A, B, C] = tri;
  // function to sample n points between two vertices (excluding endpoints)
  function sampleEdge(p1, p2) {
    const pts = [];
    for (let i = 1; i <= samplesPerEdge; i++) {
      const t = i / (samplesPerEdge + 1);
      pts.push(new THREE.Vector2(
        THREE.MathUtils.lerp(p1.x, p2.x, t),
        THREE.MathUtils.lerp(p1.y, p2.y, t)
      ));
    }
    return pts;
  }
  checkpoints.push(...sampleEdge(A, B), ...sampleEdge(B, C), ...sampleEdge(C, A));
});

// Track hits for each checkpoint
const hitCheckpoints = new Array(checkpoints.length).fill(false);

// Geolocation
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

// New helper: distance from point p to segment ab
function distancePointToSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const ap = p.clone().sub(a);
  const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
  const closest = a.clone().add(ab.multiplyScalar(t));
  return p.distanceTo(closest);
}

// threshold for “hitting” a checkpoint
const checkpointThreshold = 0.05;

function findClosestCheckpointIndex(p) {
  for (let i = 0; i < checkpoints.length; i++) {
    if (p.distanceTo(checkpoints[i]) <= checkpointThreshold) {
      return i;
    }
  }
  return -1;
}

function markCheckpoint(index) {
  if (index >= 0 && !hitCheckpoints[index]) {
    hitCheckpoints[index] = true;
  }
}

// PERCENTAGE SUCCESS 
function isSunCompleted() {
  const hitCount = hitCheckpoints.filter(v => v).length;
  const ratio = hitCount / hitCheckpoints.length;
  return ratio >= 0.5;
}


// Draw small sphere on the triangle tip to show drawing
function drawRaySphere(pos) {
  if (sunCompleted) return;
  const z = -4;
  const sphere = document.createElement("a-sphere");
  sphere.setAttribute("position", `${pos.x} ${pos.y} ${z}`);
  sphere.setAttribute("color", "Orange");
  sphere.setAttribute("radius", "0.09");
  sphere.classList.add("spawned-sphere");
  document.querySelector("a-scene").appendChild(sphere);
  locationText.innerHTML = `🎨 Drawing sun rays`;

  const cpIndex = findClosestCheckpointIndex(pos);
  markCheckpoint(cpIndex);

  if (isSunCompleted()) {
    showSuccessSun();
  }
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

  // Draw sun rays as orange triangles in 3D
  for (let i = 0; i < rayCount; i++) {
    const tri = rayTriangles[i];

    const triangle = document.createElement("a-entity");

    triangle.setAttribute("geometry", {
      primitive: "triangle",
      vertexA: `${tri[0].x} ${tri[0].y} -4.5`,
      vertexB: `${tri[1].x} ${tri[1].y} -4.5`,
      vertexC: `${tri[2].x} ${tri[2].y} -4.5`
    });

    triangle.setAttribute("material", {
      color: "orange",
      opacity: 0.4,
      transparent: true,
      side: "double"
    });

    triangle.setAttribute("id", `ray-${i}`);
    document.querySelector("a-scene").appendChild(triangle);
  }

  const label = document.createElement("a-text");
  label.setAttribute("value", "Try To Draw The Sun Rays!");
  label.setAttribute("align", "center");
  label.setAttribute("color", "Orange");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 0 -4.5");
  label.setAttribute("id", "label-sun");
  document.querySelector("a-scene").appendChild(label);

  // Add center sphere (gold)
  const centerSphere = document.createElement("a-sphere");
  centerSphere.setAttribute("radius", "0.3");
  centerSphere.setAttribute("color", "gold");
  centerSphere.setAttribute("position", "0 1.5 -4");
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
      const fingerY = (0.5 - landmarks[8].y) * 1.5 + 1.5;
      const fingerPos = new THREE.Vector2(fingerX, fingerY);
      const fixedZ = -4;

      const closestCheckpoint = findClosestCheckpointIndex(fingerPos);

      if (!visualAidSphere) {
        visualAidSphere = document.createElement("a-sphere");
        visualAidSphere.setAttribute("radius", "0.07");
        visualAidSphere.setAttribute("opacity", "0.5");
        document.querySelector("a-scene").appendChild(visualAidSphere);
      }

      // Change color based on proximity to ray edges
      if (closestCheckpoint !== -1) {
        visualAidSphere.setAttribute("color", "orange");
      } else {
        visualAidSphere.setAttribute("color", "red");
      }

      visualAidSphere.setAttribute("position", `${fingerPos.x} ${fingerPos.y} ${fixedZ}`);
      visualAidSphere.setAttribute("visible", "true");


      if (isPeaceSign(landmarks) && !sunCompleted) {
        drawing = true;
        document.getElementById("menu").style.display = "none";
        if (closestCheckpoint !== -1) {
           markCheckpoint(closestCheckpoint);
           drawRaySphere(fingerPos);
          statusText.textContent = "Drawing Sun Rays!";
        } else {
          statusText.textContent = "Move Finger Near Sun Rays!";
        }
      } else {
        drawing = false;
        
          if (isOpenPalm(landmarks)) {
            statusText.textContent = "Gesture: Menu Opened 🖐️";
            document.getElementById("menu").style.display = "block";
          } else if (isClosedPalm(landmarks)) {
            statusText.textContent = "Gesture: Menu Closed ✊";
            document.getElementById("menu").style.display = "none";
          } else {
            statusText.textContent = "Gesture: None";
            visualAidSphere.setAttribute("visible", "false");
            locationText.innerHTML = "";
            }
        }
    }
    
  }

  const camera = new Camera(videoElement, {
    onFrame: async () => await hands.send({ image: videoElement }),
    width: 1280,
    height: 720,
    facingMode: { ideal: "environment" },
  });
  

  videoElement.addEventListener("loadedmetadata", () => {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
  });    
  
  camera.start();
  hands.onResults(onResults);
  canvasCtx.restore();

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

function showSuccessSun() {
  if (sunCompleted) return;
  sunCompleted = true;

  // Remove drawn spheres and hide original rays & center
  document.querySelectorAll(".spawned-sphere").forEach(s => s.remove());
  for (let i = 0; i < rayCount; i++) {
    const ray = document.getElementById(`ray-${i}`);
    if (ray) ray.setAttribute("visible", "false");
  }
  const origCenter = document.querySelector("a-sphere[color='gold']");
  if (origCenter) origCenter.setAttribute("visible", "false");

  // Update the on-screen label
  const label = document.getElementById("label-sun");
  if (label) {
    label.setAttribute("value", "Amazing! Sun Completed!\nOpen Menu to Go Back!");
    label.setAttribute("position", "0 -0.5 -4.5");
  }

  // Create a parent entity at the exact sun center
  const spinEntity = document.createElement("a-entity");
  spinEntity.setAttribute("position", `${center.x} ${center.y} -4`);

  // Parameters for ray spacing
  const gapDistance = 0.2;  // how far to push each ray outward for spacing

  // For each original ray, add a cone that points outward with gaps
  for (let i = 0; i < rayCount; i++) {
    const tri = rayTriangles[i];
    // centroid of this triangle
    const midX = (tri[0].x + tri[1].x + tri[2].x) / 3;
    const midY = (tri[0].y + tri[1].y + tri[2].y) / 3;

    // direction from sun center to centroid
    const dir = new THREE.Vector3(
      midX - center.x,
      midY - center.y,
      0
    ).normalize();

    // compute rotation from +Y to dir
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir
    );
    const euler = new THREE.Euler().setFromQuaternion(quat, "XYZ");
    const rx = THREE.MathUtils.radToDeg(euler.x);
    const ry = THREE.MathUtils.radToDeg(euler.y);
    const rz = THREE.MathUtils.radToDeg(euler.z);

    // position relative to spinEntity, with added gap along dir
    const posX = (midX - center.x) + dir.x * gapDistance;
    const posY = (midY - center.y) + dir.y * gapDistance;
    const posZ = dir.z * gapDistance; // zero unless you want 3D offset

    const cone = document.createElement("a-cone");
    cone.setAttribute("height", "0.8");
    cone.setAttribute("radius-bottom", "0.2");
    cone.setAttribute("radius-top", "0.01");
    cone.setAttribute("position", `${posX} ${posY} ${posZ}`);
    cone.setAttribute("rotation", `${rx} ${ry} ${rz}`);
    cone.setAttribute("color", "orange");
    spinEntity.appendChild(cone);
  }

  // Add the spinning sun core at (0,0,0) inside spinEntity
  const centerSphere = document.createElement("a-sphere");
  centerSphere.setAttribute("radius", "0.3");
  centerSphere.setAttribute("color", "gold");
  centerSphere.setAttribute("position", "0 0 0");
  spinEntity.appendChild(centerSphere);

  // Animate rotation around Y
  spinEntity.setAttribute("animation", {
    property: "rotation",
    to: "0 360 0",
    loop: true,
    dur: 4000,
    easing: "linear"
  });

  // Append to scene and hide clear button
  document.querySelector("a-scene").appendChild(spinEntity);
  const clearBtn = document.getElementById("clear-button");
  if (clearBtn) clearBtn.style.display = "none";
}
