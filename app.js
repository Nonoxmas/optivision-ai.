
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

const cameraButtonLabel = "◎ Utiliser ma caméra";

const frameStyles = {
  classic: {w:.22,h:.115,r:13,line:7,color:"#263d37"},
  round: {w:.205,h:.205,r:50,line:7,color:"#263d37"},
  bold: {w:.225,h:.13,r:8,line:12,color:"#263d37"},
  minimal: {w:.22,h:.12,r:12,line:2,color:"#6d7d73"}
};

function showToast(message){
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

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

function stopCamera(){
  if(cameraStream){
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  if(video){
    video.pause();
    video.srcObject = null;
    video.hidden = true;
    video.style.display = "none";
  }

  if(cameraButton){
    cameraButton.textContent = cameraButtonLabel;
  }
}

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

/* NOUVEAU FONCTIONNEMENT DE LA CAMÉRA */

cameraButton.addEventListener("click", async () => {

  // Si la caméra est déjà ouverte, le clic prend la photo.
  if(cameraStream){

    if(!video.videoWidth){
      showToast("Patientez un instant, la caméra se prépare.");
      return;
    }

    const snap = document.createElement("canvas");
    snap.width = video.videoWidth;
    snap.height = video.videoHeight;

    const snapCtx = snap.getContext("2d");

    // Image miroir pour correspondre à l'aperçu.
    snapCtx.translate(snap.width,0);
    snapCtx.scale(-1,1);
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

  // Premier clic : ouverture de la caméra.
  if(!navigator.mediaDevices?.getUserMedia){
    showToast("Caméra indisponible. Importez une photo à la place.");
    return;
  }

  cameraButton.disabled = true;

  try{
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:"user"
      },
      audio:false
    });

    const area = $("#previewArea");

    // Place la vidéo dans la zone d'aperçu.
    area.appendChild(video);

    if(getComputedStyle(area).position === "static"){
      area.style.position = "relative";
    }

    video.srcObject = cameraStream;
    video.hidden = false;
    video.style.display = "block";
    video.style.position = "absolute";
    video.style.inset = "0";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    video.style.transform = "scaleX(-1)";
    video.style.zIndex = "5";
    video.style.background = "#101816";

    await video.play();

    // On masque les autres éléments pendant l'aperçu.
    photo.hidden = true;
    canvas.hidden = true;
    empty.hidden = true;
    controls.hidden = true;

    statusText.textContent =
      "Caméra active · Ajustez votre visage puis prenez la photo.";

    cameraButton.textContent = "◎ Prendre la photo";

    showToast("Caméra activée. Positionnez votre visage.");

  }catch(err){
    stopCamera();
    showToast("Autorisez l'accès à la caméra ou importez une photo.");
  }finally{
    cameraButton.disabled = false;
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
