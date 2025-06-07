function setupMenu() {
  const mainMenu = document.getElementById("main-menu");
  const levelMenu = document.getElementById("level-menu");
  const easyMenu = document.getElementById("easy-menu");
  const mediumMenu = document.getElementById("medium-menu");
  const hardMenu = document.getElementById("hard-menu");

  const overlay = document.getElementById("overlay");
  const titleContainer = document.getElementById("title-container");
  const backBtn = document.getElementById("back-btn");
  const subtitleContainer = document.getElementById("subtitle-container");

  // Reset UI to initial state
  function resetUI() {
    mainMenu.style.display = "flex";
    levelMenu.style.display = "none";
    easyMenu.style.display = "none";
    mediumMenu.style.display = "none";
    hardMenu.style.display = "none";

    titleContainer.style.display = "flex";
    backBtn.style.display = "none";
  }

  // Show shapes for selected level
  function showShapeMenu(level) {
    
    if (level === "easy") {
      easyMenu.style.display = "flex";
      mediumMenu.style.display = "none";
      hardMenu.style.display = "none";
    } else if (level === "medium") {
      mediumMenu.style.display = "flex";
      easyMenu.style.display = "none";
      hardMenu.style.display = "none";
    } else if (level === "hard") {
      hardMenu.style.display = "flex";
      easyMenu.style.display = "none";
      mediumMenu.style.display = "none";
    }

    subtitleContainer.style.display = "flex";
    titleContainer.style.display = "none";
    backBtn.style.display = "block";
  }

  // Action handler
  function handleAction(btn) {
    if (btn.dataset.action === "free") {
      window.location.href = "./freeDraw.html";
    } else if (btn.dataset.action === "tutorial") {
      mainMenu.style.display = "none";
      levelMenu.style.display = "flex";
      titleContainer.style.display = "none";
      backBtn.style.display = "block";
    } else if (btn.dataset.level) {
      levelMenu.style.display = "none";
      showShapeMenu(btn.dataset.level);
    } else if (btn.dataset.link) {
      window.location.href = btn.dataset.link;
    } else if (btn.id === "back-btn") {
      resetUI();
    }
  }

  // Hover gesture handler with debounce
  function handleHover(btn, callback) {
    if (!btn.classList.contains("hovered")) {
      btn.classList.add("hovered", "pressed");

      setTimeout(() => {
        callback();
        btn.classList.remove("pressed");
      }, 300);

      setTimeout(() => btn.classList.remove("hovered"), 1000);
    }
  }

  function getAllInteractiveButtons() {
    return [
      ...document.querySelectorAll(".menu-btn"),
      ...document.querySelectorAll(".level-btn"),
      ...document.querySelectorAll(".shape-btn"),
      backBtn,
    ];
  }

  getAllInteractiveButtons().forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.add("pressed");

      // Delay the action so animation plays
      setTimeout(() => {
        btn.classList.remove("pressed");
        handleAction(btn);
      }, 300);
    });
  });

  // MediaPipe + Gesture Hover Integration (unchanged)
  const videoElement = document.createElement("video");
  videoElement.style.display = "none";
  document.body.appendChild(videoElement);

  const canvasElement = document.createElement("canvas");
  canvasElement.id = "output_canvas";
  canvasElement.style.position = "absolute";
  canvasElement.style.top = "0";
  canvasElement.style.left = "0";
  canvasElement.style.zIndex = "2";
  canvasElement.style.pointerEvents = "none";
  document.body.appendChild(canvasElement);

  const canvasCtx = canvasElement.getContext("2d");

  function resizeCanvas() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  const hands = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
  });

  hands.onResults(results => {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#BDF2FB', lineWidth: 5 });
        drawLandmarks(canvasCtx, landmarks, { color: '#007FFF', lineWidth: 2 });

        const indexTip = landmarks[8];
        const x = indexTip.x * window.innerWidth;
        const y = indexTip.y * window.innerHeight;

        getAllInteractiveButtons().forEach(btn => {
          const rect = btn.getBoundingClientRect();
          if (x > rect.left && x < rect.right && y > rect.top && y < rect.bottom) {
            handleHover(btn, () => handleAction(btn));
          }
        });
      }
    }
    canvasCtx.restore();
  });

  const camera = new Camera(videoElement, {
    onFrame: async () => await hands.send({ image: videoElement }),
    width: 1280,
    height: 720,
    facingMode: { ideal: "environment" },
  });
  camera.start();
}

window.addEventListener("DOMContentLoaded", setupMenu);
