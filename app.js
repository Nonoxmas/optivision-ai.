
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

// Détection du visage
let faceLandmarker = null;
let faceDetectionFrame = null;
let lastFaceLandmarks = null;
let lastDetectionTime = 0;
let faceModuleLoading = null;

const frameStyles = {
  classic: {w:.22,h:.115,r:13,line:7,color:"#263d37"},
  round: {w:.205,h:.205,r:50,line:7,color:"#263d37"},
  bold: {w:.225,h:.13,r:8,line:12,color:"#263d37"},
  minimal: {w:.22,h:.12,r:12,line:2,color:"#6d7d73"}
};

// Bouton discret de changement de caméra
const cameraSwitchButton = document.createElement("button");
cameraSwitchButton.type = "button";
cameraSwitchButton.setAttribute("aria-label", "Changer de caméra");
cameraSwitchButton.title = "Changer de caméra";
cameraSwitchButton.innerHTML = `
  <svg viewBox="0 0 24 24" width="25" height="25"
    fill="none" stroke="#111111" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">
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
  outline:none;
  border-radius:50%;
  background:transparent;
  color:#111;
  cursor:pointer;
  touch-action:manipulation;
  filter:drop-shadow(0 1px 2px rgba(255,255,255,.85));
`;

function showToast(message){
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

// ========================================
// DÉTECTION DU VISAGE AVEC MEDIAPIPE
// ========================================

async function getFaceLandmarker(){

  if(faceLandmarker) return faceLandmarker;

  if(faceModuleLoading) return faceModuleLoading;

  faceModuleLoading = (async () => {

    const vision = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
    );

    const { FilesetResolver, FaceLandmarker } = vision;

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

  try{
    return await faceModuleLoading;
  }catch(error){
    faceModuleLoading = null;
    throw error;
  }
}

// Détecter un visage sur une photo importée
async function detectFaceInPhoto(){

  if(photo.hidden || !photo.naturalWidth) return;

  lastFaceLandmarks = null;

  statusText.textContent = "Analyse du visage en cours...";

  try{

    const detector = await getFaceLandmarker();

    await detector.setOptions({
      runningMode: "IMAGE"
    });

    const result = detector.detect(photo);

    if(result.faceLandmarks && result.faceLandmarks.length > 0){

      lastFaceLandmarks = result.faceLandmarks[0];

      statusText.textContent =
        "Visage détecté ! Préparation de l'essayage.";

    }else{

      statusText.textContent =
        "Aucun visage détecté. Essayez une photo de face.";

    }

  }catch(error){

    console.error("Erreur de détection du visage :", error);

    statusText.textContent =
      "Détection indisponible. Vérifiez votre connexion internet.";

  }
}

// Détecter le visage en direct avec la caméra
async function startFaceDetection(){

  if(faceDetectionFrame){
    cancelAnimationFrame(faceDetectionFrame);
    faceDetectionFrame = null;
  }

  lastFaceLandmarks = null;
  lastDetectionTime = 0;

  try{

    const detector = await getFaceLandmarker();

    if(!cameraStream || video.paused) return;

    await detector.setOptions({
      runningMode: "VIDEO"
    });

    function detectLoop(){

      if(!cameraStream || video.paused || video.readyState < 2){
        faceDetectionFrame = requestAnimationFrame(detectLoop);
        return;
      }

      const now = performance.now();

      // Limiter la détection pour préserver les performances du téléphone
      if(now - lastDetectionTime >= 150){

        lastDetectionTime = now;

        try{

          const result = detector.detectForVideo(video, now);

          if(result.faceLandmarks && result.faceLandmarks.length > 0){

            lastFaceLandmarks = result.faceLandmarks[0];

            statusText.textContent =
              "Visage détecté ! Gardez cette position.";

          }else{

            lastFaceLandmarks = null;

            statusText.textContent =
              "Placez votre visage devant la caméra.";

          }

        }catch(error){

          console.error("Erreur pendant la détection vidéo :", error);

        }
      }

      faceDetectionFrame = requestAnimationFrame(detectLoop);
    }

    detectLoop();

  }catch(error){

    console.error("Impossible de démarrer la détection :", error);

    statusText.textContent =
      "Détection indisponible. Vérifiez votre connexion.";

  }
}

// Arrêter la détection en cours
function stopFaceDetection(){

  if(faceDetectionFrame){
    cancelAnimationFrame(faceDetectionFrame);
    faceDetectionFrame = null;
  }

  lastFaceLandmarks = null;
}

// ========================================
// FIN DE LA DÉTECTION DU VISAGE
// ========================================

function selectFrame(name){
  currentFrame = name;
  $$(".frame-option").forEach(b =>
    b.classList.toggle("selected", b.dataset.frame === name)
  );
  if(!photo.hidden) drawPreview();
}

function roundedRect(c,x,y,w,h,r){
  c.beginPath();
  c.roundRect(x,y,w,h,r);
  c.stroke();
}

function drawPreview(){

  if(photo.hidden || !photo.naturalWidth) return;

  const area = $("#previewArea");
  const rect = area.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";

  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,rect.width,rect.height);

  const scale = Math.min(
    rect.width / photo.naturalWidth,
    rect.height / photo.naturalHeight
  );

  const w = photo.naturalWidth * scale;
  const h = photo.naturalHeight * scale;
  const x = (rect.width - w) / 2;
  const y = (rect.height - h) / 2;

  const s = frameStyles[currentFrame];
  const cx = x + w / 2;
  const cy = y + h * .39;
  const lensW = w * s.w;
  const lensH = h * s.h;
  const bridge = w * .035;

  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.line;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(20,35,30,.18)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;

  roundedRect(ctx,cx-lensW-bridge/2,cy-lensH/2,lensW,lensH,s.r);
  roundedRect(ctx,cx+bridge/2,cy-lensH/2,lensW,lensH,s.r);

  ctx.beginPath();
  ctx.moveTo(cx-lensW-bridge/2,cy);
  ctx.lineTo(cx+bridge/2+lensW,cy);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx-lensW*2-bridge/2,cy-2);
  ctx.lineTo(cx-w*.035,cy-h*.008);
  ctx.moveTo(cx+lensW*2+bridge/2,cy-2);
  ctx.lineTo(cx+w*.035,cy-h*.008);
  ctx.stroke();

  ctx.restore();
}

// Arrêter uniquement le flux vidéo
function stopCameraStream(){

  stopFaceDetection();

  if(cameraStream){
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  if(video){
    video.pause();
    video.srcObject = null;
  }
}

// Fermer complètement la caméra
function stopCamera(){

  stopCameraStream();

  cameraFacingMode = "user";

  video.hidden = true;
  video.style.display = "none";

  cameraButton.textContent = "◎ Utiliser ma caméra";

  cameraSwitchButton.hidden = true;
  cameraSwitchButton.style.display = "none";
}

// Ouvrir la caméra choisie
async function openCamera(facingMode){

  const area = $("#previewArea");

  if(getComputedStyle(area).position === "static"){
    area.style.position = "relative";
  }

  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: {ideal: facingMode}
    },
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
  video.style.transform = facingMode === "user" ? "scaleX(-1)" : "none";
  video.style.zIndex = "5";
  video.style.background = "#101816";

  area.appendChild(video);

  await video.play();

  area.appendChild(cameraSwitchButton);

  cameraFacingMode = facingMode;

  // Lancer la reconnaissance du visage
  startFaceDetection();
}

// Charger une photo
function loadPhoto(file){

  if(!file || !file.type.startsWith("image/")) return;

  stopCamera();

  if(photoUrl) URL.revokeObjectURL(photoUrl);

  photoUrl = URL.createObjectURL(file);

  photo.onload = () => {

    photo.hidden = false;
    empty.hidden = true;
    controls.hidden = false;
    canvas.hidden = false;

    statusText.textContent = "Photo prête · " + file.name;

    drawPreview();

    // Analyser automatiquement le visage
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

$$(".frame-option").forEach(b =>
  b.addEventListener("click", () => selectFrame(b.dataset.frame))
);

$$(".try-product").forEach(b =>
  b.addEventListener("click", () => {

    selectFrame(b.dataset.select);

    $("#essayage").scrollIntoView({behavior:"smooth"});

    showToast("Monture sélectionnée. Ajoutez une photo pour l'essayer.");

  })
);

$("#resetPhoto").addEventListener("click", () => {

  stopCamera();

  photo.hidden = true;
  canvas.hidden = true;
  controls.hidden = true;
  empty.hidden = false;

  photoInput.value = "";

  statusText.textContent = "Aucune photo sélectionnée";

  if(photoUrl){
    URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }

});

$("#downloadLook").addEventListener("click", () => {

  if(photo.hidden) return;

  const out = document.createElement("canvas");

  out.width = photo.naturalWidth;
  out.height = photo.naturalHeight;

  const c = out.getContext("2d");

  c.drawImage(photo,0,0);

  c.drawImage(
    canvas,
    0,0,canvas.width,canvas.height,
    0,0,out.width,out.height
  );

  const a = document.createElement("a");

  a.download = "optivision-ai-essayage.png";
  a.href = out.toDataURL("image/png");

  a.click();

});

// Premier clic : ouvrir la caméra avant
cameraButton.addEventListener("click", async () => {

  if(cameraStream){

    // Deuxième clic : prendre la photo
    if(!video.videoWidth){
      showToast("Patientez un instant, la caméra se prépare.");
      return;
    }

    const snap = document.createElement("canvas");

    snap.width = video.videoWidth;
    snap.height = video.videoHeight;

    const snapCtx = snap.getContext("2d");

    if(cameraFacingMode === "user"){
      snapCtx.translate(snap.width,0);
      snapCtx.scale(-1,1);
    }

    snapCtx.drawImage(video,0,0);

    snap.toBlob(blob => {

      if(!blob){
        showToast("Impossible de prendre la photo. Réessayez.");
        return;
      }

      const file = new File(
        [blob],
        "photo-camera.png",
        {type:"image/png"}
      );

      loadPhoto(file);

      showToast("Photo prise ! Vous pouvez essayer les montures.");

    },"image/png");

    return;
  }

  if(!navigator.mediaDevices?.getUserMedia){
    showToast("Caméra indisponible. Importez une photo à la place.");
    return;
  }

  cameraButton.disabled = true;

  try{

    await openCamera("user");

    photo.hidden = true;
    canvas.hidden = true;
    empty.hidden = true;
    controls.hidden = true;

    statusText.textContent =
      "Caméra avant active · Placez votre visage devant la caméra.";

    cameraButton.textContent = "◎ Prendre la photo";

    cameraSwitchButton.hidden = false;
    cameraSwitchButton.style.display = "flex";

    $("#previewArea").appendChild(cameraSwitchButton);

    showToast("Caméra avant activée. La détection du visage démarre.");

  }catch(err){

    console.error("Erreur caméra :", err);

    stopCamera();

    showToast("Autorisez l'accès à la caméra ou importez une photo.");

  }finally{

    cameraButton.disabled = false;

  }

});

// Passer de la caméra avant à la caméra arrière
cameraSwitchButton.addEventListener("click", async () => {

  if(!cameraStream) return;

  const previousMode = cameraFacingMode;

  const nextMode =
    previousMode === "user" ? "environment" : "user";

  cameraSwitchButton.disabled = true;

  try{

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

  }catch(err){

    console.error("Erreur changement caméra :", err);

    stopCameraStream();

    try{

      await openCamera(previousMode);

      cameraSwitchButton.hidden = false;
      cameraSwitchButton.style.display = "flex";

      showToast("Ancienne caméra réactivée.");

    }catch(recoveryError){

      stopCamera();

      showToast("Impossible d'accéder à la caméra. Réessayez.");

    }

  }finally{

    cameraSwitchButton.disabled = false;

  }

});

window.addEventListener("resize", () => {

  if(!photo.hidden) drawPreview();

});

$("#menuToggle").addEventListener("click", () => {

  const nav = $(".desktop-nav");

  const open = nav.style.display === "flex";

  nav.style.cssText = open
    ? ""
    : "display:flex;position:absolute;top:68px;left:0;right:0;background:white;padding:22px;flex-direction:column;gap:18px;box-shadow:0 10px 20px #102b2a12";

});

if("serviceWorker" in navigator && location.protocol.startsWith("http")){

  window.addEventListener("load", () => {

    navigator.serviceWorker.register("./sw.js").catch(() => {});

  });

}
