const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const photoInput = $("#photoInput"), photo = $("#userPhoto"), canvas = $("#glassesCanvas");
const ctx = canvas.getContext("2d");
const empty = $("#emptyPreview"), controls = $("#previewControls"), statusText = $("#cameraStatus");
let currentFrame = "classic", photoUrl = null, cameraStream = null;

const frameStyles = {
  classic: {w:.22,h:.115,r:13,line:7,color:"#263d37"},
  round: {w:.205,h:.205,r:50,line:7,color:"#263d37"},
  bold: {w:.225,h:.13,r:8,line:12,color:"#263d37"},
  minimal: {w:.22,h:.12,r:12,line:2,color:"#6d7d73"}
};

function showToast(message){
  const t=$("#toast"); t.textContent=message; t.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove("show"),2600);
}
function selectFrame(name){
  currentFrame=name;
  $$(".frame-option").forEach(b=>b.classList.toggle("selected",b.dataset.frame===name));
  if(!photo.hidden) drawPreview();
}
function roundedRect(c,x,y,w,h,r){
  c.beginPath(); c.roundRect(x,y,w,h,r); c.stroke();
}
function drawPreview(){
  if(photo.hidden || !photo.naturalWidth) return;
  const area=$("#previewArea");
  const rect=area.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(rect.width*dpr); canvas.height=Math.round(rect.height*dpr);
  canvas.style.width=rect.width+"px"; canvas.style.height=rect.height+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,rect.width,rect.height);
  const scale=Math.min(rect.width/photo.naturalWidth,rect.height/photo.naturalHeight);
  const w=photo.naturalWidth*scale,h=photo.naturalHeight*scale;
  const x=(rect.width-w)/2,y=(rect.height-h)/2;
  const s=frameStyles[currentFrame];
  // Prototype placement: centered in the upper-middle of the portrait.
  const cx=x+w/2, cy=y+h*.39, lensW=w*s.w, lensH=h*s.h, bridge=w*.035;
  ctx.save(); ctx.strokeStyle=s.color; ctx.lineWidth=s.line; ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.shadowColor="rgba(20,35,30,.18)";ctx.shadowBlur=3;ctx.shadowOffsetY=1;
  roundedRect(ctx,cx-lensW-bridge/2,cy-lensH/2,lensW,lensH,s.r);
  roundedRect(ctx,cx+bridge/2,cy-lensH/2,lensW,lensH,s.r);
  ctx.beginPath();ctx.moveTo(cx-lensW-bridge/2,cy);ctx.lineTo(cx+bridge/2+lensW,cy);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx-lensW*2-bridge/2,cy-2);ctx.lineTo(cx-w*.035,cy-h*.008);ctx.moveTo(cx+lensW*2+bridge/2,cy-2);ctx.lineTo(cx+w*.035,cy-h*.008);ctx.stroke();
  ctx.restore();
}
function loadPhoto(file){
  if(!file || !file.type.startsWith("image/")) return;
  if(photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl=URL.createObjectURL(file);
  photo.onload=()=>{photo.hidden=false;empty.hidden=true;controls.hidden=false;canvas.hidden=false;statusText.textContent="Photo prête · "+file.name;drawPreview();};
  photo.src=photoUrl;
  stopCamera();
}
photoInput.addEventListener("change",e=>loadPhoto(e.target.files[0]));
$$(".frame-option").forEach(b=>b.addEventListener("click",()=>selectFrame(b.dataset.frame)));
$$(".try-product").forEach(b=>b.addEventListener("click",()=>{selectFrame(b.dataset.select);$("#essayage").scrollIntoView({behavior:"smooth"});showToast("Monture sélectionnée. Ajoutez une photo pour l'essayer.");}));
$("#resetPhoto").addEventListener("click",()=>{photo.hidden=true;canvas.hidden=true;controls.hidden=true;empty.hidden=false;photoInput.value="";statusText.textContent="Aucune photo sélectionnée";if(photoUrl){URL.revokeObjectURL(photoUrl);photoUrl=null;}});
$("#downloadLook").addEventListener("click",()=>{
  if(photo.hidden)return;
  const out=document.createElement("canvas");out.width=photo.naturalWidth;out.height=photo.naturalHeight;
  const c=out.getContext("2d");c.drawImage(photo,0,0);
  const area=$("#previewArea").getBoundingClientRect(), scale=Math.min(area.width/photo.naturalWidth,area.height/photo.naturalHeight);
  const offsetX=(area.width-photo.naturalWidth*scale)/2,offsetY=(area.height-photo.naturalHeight*scale)/2;
  c.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,out.width,out.height);
  const a=document.createElement("a");a.download="optivision-ai-essayage.png";a.href=out.toDataURL("image/png");a.click();
});
async function stopCamera(){if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}$("#cameraVideo").hidden=true;}
$("#cameraButton").addEventListener("click",async()=>{
  if(!navigator.mediaDevices?.getUserMedia){showToast("Caméra indisponible. Importez une photo à la place.");return;}
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
    const video=$("#cameraVideo");video.srcObject=cameraStream;await video.play();
    const snap=document.createElement("canvas");snap.width=video.videoWidth;snap.height=video.videoHeight;
    snap.getContext("2d").translate(snap.width,0);snap.getContext("2d").scale(-1,1);snap.getContext("2d").drawImage(video,0,0);
    snap.toBlob(blob=>loadPhoto(new File([blob],"photo-camera.png",{type:"image/png"})),"image/png");
    showToast("Photo capturée. Vous pouvez changer de monture.");
  }catch(err){showToast("Autorisez l'accès à la caméra ou importez une photo.");}
});
window.addEventListener("resize",()=>{if(!photo.hidden)drawPreview();});
$("#menuToggle").addEventListener("click",()=>{const nav=$(".desktop-nav");const open=nav.style.display==="flex";nav.style.cssText=open?"":"display:flex;position:absolute;top:68px;left:0;right:0;background:white;padding:22px;flex-direction:column;gap:18px;box-shadow:0 10px 20px #102b2a12";});
if("serviceWorker" in navigator && location.protocol.startsWith("http")) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
