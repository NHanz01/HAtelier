// main.js
let initialLatitude = null;
let initialLongitude = null;
let currentHeading = 0;
let drawing = false;
let localDrawnSpheres = [];
let visualAidSphere = null;

let currentSphereRadius = 0.1;
const sphereColors = ["Red", "Orange", "Gold", "SpringGreen", "Cyan", "RoyalBlue", "Orchid", "Hotpink", "WhiteSmoke", "Black"];
let currentColorIndex = 0;
let currentSphereColor = sphereColors[currentColorIndex];
const menu = document.querySelector(".navbar"); // or the correct selector for your nav bar
const colorButton = document.querySelector(".color-button");

const buttons = document.querySelectorAll(".navbar button");
let lastHoverTime = 0;
const HOVER_COOLDOWN_MS = 1000; // 1 second cooldown

// SETUP AR.JS LOCATION BASED
// Get user's current GPS location and update UI on success or failure
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


// Listen for device orientation events to update current heading (compass direction)
window.addEventListener("deviceorientationabsolute", (evt) => {
  if (evt.absolute && evt.alpha !== null) currentHeading = 360 - evt.alpha;
});
window.addEventListener("deviceorientation", (evt) => {
  if (!evt.absolute && evt.alpha !== null) currentHeading = 360 - evt.alpha;
});

// Convert degrees to radians helper function
function degreesToRadians(deg) {
  return deg * (Math.PI / 180);
}

// Calculate new GPS coordinate by moving a distance in meters forward from lat/lon with given heading
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


function updateColorButton() {
  colorButton.style.backgroundColor = currentSphereColor;
  colorButton.textContent = ""; // Remove any text
}

// Call this once at the start to set initial color
updateColorButton();

// Update inside color-cycle action case:
buttons.forEach((btn) => {
  btn.classList.remove("hovered");
});

// DRAW A-SPHERE IN A-FRAME SCENE BASED ON NORMALIZED HAND LANDMARK POSITION
function drawLocalSphereFromLandmark(landmark) {
  const scene = document.querySelector("a-scene");

  const x = (landmark.x - 0.1) * 3;
  let zRaw = (0.5 - landmark.y) * -15;
  let z = Math.max(-5, Math.min(zRaw, 5));
  const y = landmark.z * -2.5;

  const sphere = document.createElement("a-sphere");
  sphere.setAttribute("position", `${x} ${y} ${z}`);
  sphere.setAttribute("color", currentSphereColor);
  sphere.setAttribute("radius", currentSphereRadius.toString());
  sphere.classList.add("local-sphere");

  scene.appendChild(sphere);
  localDrawnSpheres.push(sphere);
  locationText.innerHTML = `🎨 Drawing <br>Size: ${currentSphereRadius.toFixed(2)} <br>Color: ${currentSphereColor}`;
}


// DELETE ALL SPHERES
function deleteAllSpheres() {
  document.querySelectorAll(".spawned-sphere, .local-sphere").forEach(s => s.remove());
  localDrawnSpheres = [];
  locationText.innerHTML = `✅ All Drawings Cleared`;
  setTimeout(() => {
  locationText.innerHTML = "";}, 1000);
}


// UNDO SPHERES
function undoLastSphere() {
  if (localDrawnSpheres.length > 0) {
    const lastSphere = localDrawnSpheres.pop();
    lastSphere.remove();
    locationText.innerHTML = `Undo: Last Drawing Undo`;
    setTimeout(() => {
      locationText.innerHTML = "";
    }, 1500);
  } else {
    locationText.innerHTML = `No Drawings To Undo`;
    setTimeout(() => {
      locationText.innerHTML = "";
    }, 1500);
  }
}

// GESTURE DETECTION
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

// MEDIAPIPE SETUP
window.addEventListener('DOMContentLoaded', () => {

  const videoElement = document.getElementById("input_video");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const statusText = document.getElementById("statusText");

  const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });

  // Called every time MediaPipe processes a new video frame;
  // draws the hand landmarks and connections on the canvas,
  // detects hand gestures, and triggers drawing or other actions accordingly.
  function onResults(results) {
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  

      if (results.multiHandLandmarks?.length) {
        const landmarks = results.multiHandLandmarks[0];
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: "#BDF2FB", lineWidth: 5 });
        drawLandmarks(canvasCtx, landmarks, { color: "#007FFF", lineWidth: 2 });
        
        // Call the check inside here
        checkMenuHover(landmarks);
        
        // Calculate position from index finger (landmark 8)
        const x = (landmarks[8].x - 0.1) * 3;
        let zRaw = (0.5 - landmarks[8].y) * -15;
        let z = Math.max(-5, Math.min(zRaw, 5));
        const y = landmarks[8].z * -2.5;

        // VISUAL AID
        if (!visualAidSphere) {
          visualAidSphere = document.createElement("a-sphere");
          visualAidSphere.setAttribute("id", "visual-aid");
          visualAidSphere.setAttribute("radius", "0.05");
          visualAidSphere.setAttribute("color", "#007FFF");
          visualAidSphere.setAttribute("opacity", "0.5");
          visualAidSphere.setAttribute("transparent", "true");

          document.querySelector("a-scene").appendChild(visualAidSphere);
        }
        
        visualAidSphere.setAttribute("visible", "true");
        // Always update position
        visualAidSphere.setAttribute("position", `${x} ${y} ${z}`);


        if (isPeaceSign(landmarks)) {
          statusText.textContent = "Gesture: Peace Sign ✌️";
          menu.style.display = "none"; 
          drawing = true;
          drawLocalSphereFromLandmark(landmarks[8]);
        } else {
          if (drawing) {
            drawing = false;
            locationText.innerHTML = `Drawing Stopped`;
          }

          if (isOpenPalm(landmarks)) {
            statusText.textContent = "Gesture: Menu Opened 🖐️";
            menu.style.display = "flex"; 
          } else if (isClosedPalm(landmarks)) {
            statusText.textContent = "Gesture: Menu Closed ✊";
            menu.style.display = "none"; 
          } else if (isIndexFinger(landmarks)) {
            statusText.textContent = "Gesture: Selecting Menu ☝️";
          } else {
            statusText.textContent = "Gesture: None";
          }
        }
      } else {
        statusText.textContent = "Gesture: None";
        if (visualAidSphere) {
          visualAidSphere.setAttribute("visible", "false");
        }
        if (drawing) {
          drawing = false;
        }
      }

      canvasCtx.restore();

      const event = new CustomEvent('handsResults', { detail: results });
      window.dispatchEvent(event);
    }


    // Setup camera and start streaming video for MediaPipe processing
    const camera = new Camera(videoElement, {
      onFrame: async () => await hands.send({ image: videoElement }),
      width: 1280,
      height: 720,
      facingMode: { ideal: "environment" },
    });
    camera.start();

    // Adjust canvas size once video metadata is loaded
    videoElement.addEventListener("loadedmetadata", () => {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
    });

    // Register onResults callback for MediaPipe hands results
    hands.onResults(onResults);
});

function checkMenuHover(landmarks) {
  if (!landmarks) return;

  const now = Date.now();
  if (now - lastHoverTime < HOVER_COOLDOWN_MS) return; // prevent spamming

  const fingerX = landmarks[8].x; // normalized 0-1 left to right
  const fingerY = landmarks[8].y; // normalized 0-1 top to bottom

  buttons.forEach((btn) => btn.classList.remove("hovered")); // reset highlights

  buttons.forEach((btn) => {
    const rect = btn.getBoundingClientRect();

    // normalize rect coords 0-1
    const left = rect.left / window.innerWidth;
    const right = rect.right / window.innerWidth;
    const top = rect.top / window.innerHeight;
    const bottom = rect.bottom / window.innerHeight;

    if (fingerX > left && fingerX < right && fingerY > top && fingerY < bottom) {
      btn.classList.add("hovered");

      // Trigger action on hover, with cooldown
      lastHoverTime = now;
      switch (btn.dataset.action) {
          
        case "home":
          const confirmLeave = confirm("Back To Main Menu?");
          if (confirmLeave) {
            window.location.href = "./";
          }
          break;
          
        case "undo":
          undoLastSphere();
          break;
          
        case "size-increase":
          currentSphereRadius = Math.min(currentSphereRadius + 0.05, 0.3);
          locationText.innerHTML = `Size Increased to ${currentSphereRadius.toFixed(2)}`;
          break;
        case "size-decrease":
          currentSphereRadius = Math.max(currentSphereRadius - 0.05, 0.05);
          locationText.innerHTML = `Size Decreased to ${currentSphereRadius.toFixed(2)}`;
          break;
        case "color-cycle":
          currentColorIndex = (currentColorIndex + 1) % sphereColors.length;
          currentSphereColor = sphereColors[currentColorIndex];
          locationText.innerHTML = `Color Changed to ${currentSphereColor}`;
          updateColorButton();
          break;

        case "clearAll":
          const confirmClear = confirm("Clear All Drawings?");
          if (confirmClear) {
          deleteAllSpheres();
          }
          break;
      }
    }
  });
}


buttons.forEach((btn) => {
  btn.addEventListener("click", () => {
    switch (btn.dataset.action) {
        
      case "home":
        const confirmLeave = confirm("Back To Main Menu?");
        if (confirmLeave) {
          window.location.href = "./";
        }
        break;
        
      case "undo":
        undoLastSphere();
        break;
        
      case "size-increase":
        currentSphereRadius = Math.min(currentSphereRadius + 0.05, 0.3);
        locationText.innerHTML = `Size Increased to ${currentSphereRadius.toFixed(2)}`;
        break;

      case "size-decrease":
        currentSphereRadius = Math.max(currentSphereRadius - 0.05, 0.05);
        locationText.innerHTML = `Size Decreased to ${currentSphereRadius.toFixed(2)}`;
        break;

      case "color-cycle":
        currentColorIndex = (currentColorIndex + 1) % sphereColors.length;
        currentSphereColor = sphereColors[currentColorIndex];
        locationText.innerHTML = `Color Changed to ${currentSphereColor}`;
        updateColorButton();
        break;

      case "clearAll":
        const confirmClear = confirm("Clear All Drawings?");
        if (confirmClear) {
          deleteAllSpheres();
        }
        break;

    }
  });
});
