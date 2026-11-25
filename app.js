
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const photoInput = $("#photoInput");
const photo = $("#userPhoto");
const canvas = $("#glassesCanvas");
const ctx = canvas.getContext("2d");
const empty = $("#emptyPreview");
const controls = $("#previewControls");
const statusText = $("#cameraStatus");
const cameraButton = $("#cameraButton");
const video = $("#cameraVideo");

let currentFrame = "classic";
let photoUrl = null;
let cameraStream = null;
let cameraFacingMode = "user";

let faceLandmarker = null;
let faceDetectionFrame = null;
let lastFaceLandmarks = null;
let lastDetectionTime = 0;
let faceModuleLoading = null;

let smoothedFaceLandmarks = null;

function smoothFaceLandmarks(newLandmarks, factor = 0.35) {
  if (!smoothedFaceLandmarks) {
    smoothedFaceLandmarks = newLandmarks.map(p => ({...p}));
    return smoothedFaceLandmarks;
  }

  smoothedFaceLandmarks = newLandmarks.map((p, i) => ({
    x: smoothedFaceLandmarks[i].x +
       (p.x - smoothedFaceLandmarks[i].x) * factor,
    y: smoothedFaceLandmarks[i].y +
       (p.y - smoothedFaceLandmarks[i].y) * factor,
    z: smoothedFaceLandmarks[i].z +
       (p.z - smoothedFaceLandmarks[i].z) * factor
  }));

  return smoothedFaceLandmarks;
}

// Images réelles des quatre montures
const frameImages = {
  classic: "assets/01_monture_classique_rectangulaire.png",
  round: "assets/02_monture_ronde_doree.png",
  bold: "assets/03_monture_epaisse_noire.png",
  minimal: "assets/04_monture_fine_minimaliste.png"
};
const loadedFrames = {};
const frameBounds = {};

Object.entries(frameImages).forEach(([name, src]) => {
  const img = new Image();
  img.onload = () => {
    loadedFrames[name] = img;
    // Recadre automatiquement les marges transparentes du PNG.
    const temp = document.createElement("canvas");
    temp.width = img.naturalWidth;
    temp.height = img.naturalHeight;
    const tempCtx = temp.getContext("2d", {willReadFrequently: true});
    tempCtx.drawImage(img, 0, 0);
    const pixels = tempCtx.getImageData(0, 0, temp.width, temp.height).data;
    let minX = temp.width, minY = temp.height, maxX = -1, maxY = -1;
    for (let y = 0; y < temp.height; y++) {
      for (let x = 0; x < temp.width; x++) {
        if (pixels[(y * temp.width + x) * 4 + 3] > 12) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    frameBounds[name] = maxX >= minX && maxY >= minY
      ? {x:minX, y:minY, width:maxX-minX+1, height:maxY-minY+1}
      : {x:0, y:0, width:img.naturalWidth, height:img.naturalHeight};
    if (cameraStream || !photo.hidden) drawPreview();
  };
  img.onerror = () => console.error("Monture impossible à charger :", src);
  img.src = src;
});

// Bouton pour changer de caméra
const cameraSwitchButton = document.createElement("button");
cameraSwitchButton.type = "button";
cameraSwitchButton.setAttribute("aria-label", "Changer de caméra");
cameraSwitchButton.title = "Changer de caméra";
cameraSwitchButton.innerHTML = `
  <svg viewBox="0 0 24 24" width="25" height="25"
    fill="none" stroke="#111111" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 3l4 4-4 4"/>
    <path d="M20 7H9a5 5 0 0 0-5 5"/>
    <path d="M8 21l-4-4 4-4"/>
    <path d="M4 17h11a5 5 0 0 0 5-5"/>
  </svg>
`;

cameraSwitchButton.hidden = true;
cameraSwitchButton.style.cssText = `
  position:absolute;
  right:8px;
  bottom:8px;
  z-index:20;
  width:40px;
  height:40px;
  padding:7px;
  display:none;
  align-items:center;
  justify-content:center;
  border:none;
  border-radius:50%;
  background:transparent;
  color:#111;
  cursor:pointer;
  touch-action:manipulation;
  filter:drop-shadow(0 1px 2px rgba(255,255,255,.85));
`;

function showToast(message) {
  const t = $("#toast");
  if (!t) return;

  t.textContent = message;
  t.classList.add("show");
  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(
    () => t.classList.remove("show"), 2600
  );
}

// ========================================
// DÉTECTION DU VISAGE AVEC MEDIAPIPE
// ========================================

async function getFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  if (faceModuleLoading) return faceModuleLoading;

  faceModuleLoading = (async () => {
    const vision = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
    );

    const {FilesetResolver, FaceLandmarker} = vision;

    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(
      fileset,
      {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "CPU"
        },
        runningMode: "IMAGE",
        numFaces: 1
      }
    );

    return faceLandmarker;
  })();

  try {
    return await faceModuleLoading;
  } catch (error) {
    faceModuleLoading = null;
    throw error;
  }
}

async function detectFaceInPhoto() {
  if (photo.hidden || !photo.naturalWidth) return;

  lastFaceLandmarks = null;
  smoothedFaceLandmarks = null;

  statusText.textContent = "Analyse du visage en cours...";

  try {
    const detector = await getFaceLandmarker();
    await detector.setOptions({runningMode: "IMAGE"});

    const result = detector.detect(photo);

    if (result.faceLandmarks && result.faceLandmarks.length > 0) {
      lastFaceLandmarks = result.faceLandmarks[0];

      statusText.textContent =
        "Visage détecté ! Les lunettes sont positionnées sur votre visage.";

      drawPreview();
    } else {
      lastFaceLandmarks = null;
      drawPreview();

      statusText.textContent =
        "Aucun visage détecté. Essayez une photo de face.";
    }
  } catch (error) {
    console.error("Erreur de détection du visage :", error);

    statusText.textContent =
      "Détection indisponible. Vérifiez votre connexion internet.";
  }
}

async function startFaceDetection() {
  if (faceDetectionFrame) {
    cancelAnimationFrame(faceDetectionFrame);
    faceDetectionFrame = null;
  }

  lastFaceLandmarks = null;
  smoothedFaceLandmarks = null;
  lastDetectionTime = 0;

  try {
    const detector = await getFaceLandmarker();

    if (!cameraStream || video.paused) return;

    await detector.setOptions({runningMode: "VIDEO"});

    function detectLoop() {
      if (!cameraStream || video.paused || video.readyState < 2) {
        faceDetectionFrame = requestAnimationFrame(detectLoop);
        return;
      }

      const now = performance.now();

      if (now - lastDetectionTime >= 150) {
        lastDetectionTime = now;

        try {
          const result = detector.detectForVideo(video, now);

          if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            lastFaceLandmarks = smoothFaceLandmarks(
              result.faceLandmarks[0],
              0.16
            );

            statusText.textContent =
              "Visage détecté ! Bougez doucement la tête pour essayer.";
          } else {
            lastFaceLandmarks = null;
            smoothedFaceLandmarks = null;

            statusText.textContent =
              "Placez votre visage devant la caméra.";
          }

          drawPreview();
        } catch (error) {
          console.error("Erreur détection vidéo :", error);
        }
      }

      faceDetectionFrame = requestAnimationFrame(detectLoop);
    }

    detectLoop();
  } catch (error) {
    console.error("Impossible de démarrer la détection :", error);

    statusText.textContent =
      "Détection indisponible. Vérifiez votre connexion.";
  }
}

function stopFaceDetection() {
  if (faceDetectionFrame) {
    cancelAnimationFrame(faceDetectionFrame);
    faceDetectionFrame = null;
  }

  lastFaceLandmarks = null;
  smoothedFaceLandmarks = null;
}

// ========================================
// AFFICHAGE ET POSITIONNEMENT DES LUNETTES
// ========================================

function selectFrame(name) {
  if (!frameImages[name]) return;

  currentFrame = name;

  $$(".frame-option").forEach(b =>
    b.classList.toggle("selected", b.dataset.frame === name)
  );

  if (cameraStream || !photo.hidden) drawPreview();
}

function drawPreview() {
  const live = !!cameraStream;
  const sourceWidth = live ? video.videoWidth : photo.naturalWidth;
  const sourceHeight = live ? video.videoHeight : photo.naturalHeight;
  if ((!live && photo.hidden) || !sourceWidth || !sourceHeight) return;

  const area = $("#previewArea");
  const rect = area.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (live && cameraFacingMode === "user") {
    ctx.translate(rect.width, 0);
    ctx.scale(-1, 1);
  }

  const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight);
  const w = sourceWidth * scale;
  const h = sourceHeight * scale;
  const x = (rect.width - w) / 2;
  const y = (rect.height - h) / 2;
  const img = loadedFrames[currentFrame];
  const bounds = frameBounds[currentFrame];
  if (!img || !bounds) return;

  const drawFrame = (centerX, centerY, frameWidth, angle = 0) => {
    // On utilise la partie centrale du PNG pour isoler la face avant.
    // Les branches latérales ne doivent pas traverser les yeux.
    const frontX = bounds.x + bounds.width * 0.18;
    const frontWidth = bounds.width * 0.64;
    const frameHeight = frameWidth * bounds.height / frontWidth;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.drawImage(img, frontX, bounds.y, frontWidth, bounds.height,
      -frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight);
    ctx.restore();
  };

  if (lastFaceLandmarks && lastFaceLandmarks.length > 263) {
    const point = index => ({
      x: x + lastFaceLandmarks[index].x * w,
      y: y + lastFaceLandmarks[index].y * h
    });
    const average = (a, b) => ({x:(a.x+b.x)/2, y:(a.y+b.y)/2});
    const eyeA = average(point(33), point(133));
    const eyeB = average(point(362), point(263));
    const leftEye = eyeA.x < eyeB.x ? eyeA : eyeB;
    const rightEye = eyeA.x < eyeB.x ? eyeB : eyeA;
    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;
    const eyeDistance = Math.hypot(dx, dy);
    if (eyeDistance > 8) {
      drawFrame((leftEye.x+rightEye.x)/2,
        (leftEye.y+rightEye.y)/2 + eyeDistance*0.035,
        eyeDistance*2.05, Math.atan2(dy,dx));
      return;
    }
  }

  if (live) return;
  // Position de secours sur une photo si la détection du visage échoue.
  drawFrame(x+w/2, y+h*0.39, w*0.48, 0);
}

function stopCameraStream() {
  stopFaceDetection();

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  if (video) {
    video.pause();
    video.srcObject = null;
  }
}

function stopCamera() {
  stopCameraStream();

  cameraFacingMode = "user";

  video.hidden = true;
  video.style.display = "none";

  cameraButton.textContent = "◎ Utiliser ma caméra";

  if (photo.hidden) canvas.hidden = true;

  cameraSwitchButton.hidden = true;
  cameraSwitchButton.style.display = "none";
}

async function openCamera(facingMode) {
  const area = $("#previewArea");

  if (getComputedStyle(area).position === "static") {
    area.style.position = "relative";
  }

  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {facingMode: {ideal: facingMode}},
    audio: false
  });

  video.srcObject = cameraStream;
  video.hidden = false;
  video.style.display = "block";
  video.style.position = "absolute";
  video.style.inset = "0";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "contain";
  video.style.transform =
    facingMode === "user" ? "scaleX(-1)" : "none";
  video.style.zIndex = "5";
  video.style.background = "#101816";

  area.appendChild(video);

  await video.play();

  canvas.hidden = false;
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.zIndex = "6";
  canvas.style.pointerEvents = "none";

  area.appendChild(canvas);
  area.appendChild(cameraSwitchButton);

  cameraFacingMode = facingMode;

  startFaceDetection();
}

// ========================================
// IMPORTATION D'UNE PHOTO
// ========================================

function loadPhoto(file) {
  if (!file || !file.type.startsWith("image/")) return;

  stopCamera();

  if (photoUrl) URL.revokeObjectURL(photoUrl);

  photoUrl = URL.createObjectURL(file);

  photo.onload = () => {
    photo.hidden = false;
    empty.hidden = true;
    controls.hidden = false;
    canvas.hidden = false;

    statusText.textContent = "Photo prête · " + file.name;

    drawPreview();
    detectFaceInPhoto();
  };

  photo.onerror = () => {
    statusText.textContent = "Impossible de lire cette photo.";
    showToast("Cette image ne peut pas être ouverte.");
  };

  photo.src = photoUrl;
}

photoInput.addEventListener("change", e => {
  loadPhoto(e.target.files[0]);
});

// Sélection des montures
$$(".frame-option").forEach(b =>
  b.addEventListener("click", () => selectFrame(b.dataset.frame))
);

$$(".try-product").forEach(b =>
  b.addEventListener("click", () => {
    selectFrame(b.dataset.select);

    $("#essayage").scrollIntoView({behavior: "smooth"});

    showToast("Monture sélectionnée. Ajoutez une photo pour l'essayer.");
  })
);

// Réinitialiser la photo
$("#resetPhoto").addEventListener("click", () => {
  stopCamera();

  photo.hidden = true;
  canvas.hidden = true;
  controls.hidden = true;
  empty.hidden = false;

  photoInput.value = "";

  statusText.textContent = "Aucune photo sélectionnée";

  if (photoUrl) {
    URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }
});

// Télécharger le résultat
$("#downloadLook").addEventListener("click", () => {
  if (photo.hidden) return;

  const out = document.createElement("canvas");

  out.width = photo.naturalWidth;
  out.height = photo.naturalHeight;

  const c = out.getContext("2d");
  c.drawImage(photo, 0, 0);

  c.drawImage(
    canvas,
    0, 0, canvas.width, canvas.height,
    0, 0, out.width, out.height
  );

  const a = document.createElement("a");

  a.download = "optivision-ai-essayage.png";
  a.href = out.toDataURL("image/png");

  a.click();
});

// ========================================
// BOUTON DE LA CAMÉRA
// ========================================

cameraButton.addEventListener("click", async () => {
  if (cameraStream) {
    if (!video.videoWidth) {
      showToast("Patientez un instant, la caméra se prépare.");
      return;
    }

    const snap = document.createElement("canvas");

    snap.width = video.videoWidth;
    snap.height = video.videoHeight;

    const snapCtx = snap.getContext("2d");

    if (cameraFacingMode === "user") {
      snapCtx.translate(snap.width, 0);
      snapCtx.scale(-1, 1);
    }

    snapCtx.drawImage(video, 0, 0);

    snap.toBlob(blob => {
      if (!blob) {
        showToast("Impossible de prendre la photo. Réessayez.");
        return;
      }

      const file = new File(
        [blob],
        "photo-camera.png",
        {type: "image/png"}
      );

      loadPhoto(file);

      showToast("Photo prise ! Vous pouvez essayer les montures.");
    }, "image/png");

    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Caméra indisponible. Importez une photo à la place.");
    return;
  }

  cameraButton.disabled = true;

  try {
    await openCamera("user");

    photo.hidden = true;
    canvas.hidden = false;
    empty.hidden = true;
    controls.hidden = true;

    statusText.textContent =
      "Caméra avant active · Placez votre visage devant la caméra.";

    cameraButton.textContent = "◎ Prendre la photo";

    cameraSwitchButton.hidden = false;
    cameraSwitchButton.style.display = "flex";

    $("#previewArea").appendChild(cameraSwitchButton);

    showToast("Caméra avant activée. La détection du visage démarre.");
  } catch (err) {
    console.error("Erreur caméra :", err);

    stopCamera();

    showToast("Autorisez l'accès à la caméra ou importez une photo.");
  } finally {
    cameraButton.disabled = false;
  }
});

// Changer de caméra
cameraSwitchButton.addEventListener("click", async () => {
  if (!cameraStream) return;

  const previousMode = cameraFacingMode;
  const nextMode =
    previousMode === "user" ? "environment" : "user";

  cameraSwitchButton.disabled = true;

  try {
    stopCameraStream();

    await openCamera(nextMode);

    cameraSwitchButton.hidden = false;
    cameraSwitchButton.style.display = "flex";

    statusText.textContent =
      nextMode === "user"
        ? "Caméra avant active · Placez votre visage devant la caméra."
        : "Caméra arrière active · Placez votre visage devant la caméra.";

    showToast(
      nextMode === "user"
        ? "Caméra avant activée."
        : "Caméra arrière activée."
    );
  } catch (error) {
    console.error("Erreur lors du changement de caméra :", error);

    showToast("Impossible de changer de caméra. Réessayez.");

    stopCamera();
  } finally {
    cameraSwitchButton.disabled = false;
  }
});

// Menu mobile
const menuToggle = $("#menuToggle");

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    document.body.classList.toggle("menu-open");
  });
}

// Enregistrement du service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .catch(error => {
        console.error("Service worker indisponible :", error);
      });
  });
}
