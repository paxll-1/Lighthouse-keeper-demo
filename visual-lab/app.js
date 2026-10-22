import {createScene,cameraFor} from './scene.js';
import {createBackend} from './backends.js';

const BUILD='visual-lab-2026-10-22-r2';
const $=id=>document.getElementById(id),scene=createScene();
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const cameraLimits={zoomMin:.7,zoomMax:2.2,orbitMin:-.85,orbitMax:.85,minEyeY:3.6};
const viewLabels={overview:'Общий вид',lighthouse:'Маяк крупно',shore:'Берег крупно'};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const state={backend:'three',style:'art',motion:!reduce.matches,route:false,dpr:Math.min(devicePixelRatio||1,1.5),view:'overview',zoom:1,orbit:0,time:0,freeze:null};
state.dpr=state.dpr>=1.5?1.5:1;
let renderer=null,canvas=null,lastRender=0,lastTick=performance.now(),switching=false,noticeTimer=null,measurement=null,latestMs=0,frames=0;
let camera=null,width=innerWidth,height=innerHeight,renderError=null;
const frameTimes=[];
function notice(message,permanent=false){$('notice').textContent=message;$('notice').hidden=!message;clearTimeout(noticeTimer);if(message&&!permanent)noticeTimer=setTimeout(()=>{$('notice').hidden=true;},6500);}
function syncUI(){for(const k of ['backend','style','dpr'])$(k).value=String(state[k]);for(const k of ['motion','route'])$(k).checked=state[k];for(const name of Object.keys(viewLabels))$('view-'+name).setAttribute('aria-pressed',String(state.view===name));$('zoom-in').disabled=state.zoom>=cameraLimits.zoomMax-.0001;$('zoom-out').disabled=state.zoom<=cameraLimits.zoomMin+.0001;$('stage').dataset.view=state.view;}
function resize(){width=$('surface').clientWidth;height=$('surface').clientHeight;renderer?.resize(width,height,state.dpr);}
function inspectionCamera(time){
  const route=state.route?(Math.sin(time*.18)*.5+.5):0,aspect=width/height;
  const base=cameraFor(aspect,route,state.orbit),d=base.eye.map((v,i)=>v-base.target[i]);
  const yaw=Math.atan2(d[0],d[2]),portrait=clamp((1.18-aspect)/.7,0,1);
  let target=base.target.slice(),radius=Math.hypot(...d),elevation=Math.atan2(d[1],Math.hypot(d[0],d[2]));
  if(state.view==='lighthouse'){target=[-1.64,6.4,-.7];radius=14.2+portrait*1.8;elevation=.16;}
  else if(state.view==='shore'){target=[.25,1.15,3.25];radius=11+portrait*3;elevation=.34;}
  else if(aspect>1.4)target[1]-=.6; // Keep the cape above the landscape toolbar.
  radius/=state.zoom;
  const eye=[target[0]+Math.sin(yaw)*radius*Math.cos(elevation),Math.max(cameraLimits.minEyeY,target[1]+Math.sin(elevation)*radius),target[2]+Math.cos(yaw)*radius*Math.cos(elevation)];
  return {...base,eye,target};
}
function stopCameraRoute(){state.route=false;state.freeze=null;}
function setView(view){if(!Object.hasOwn(viewLabels,view))throw Error('Unknown camera view');clearGesture();state.view=view;state.zoom=1;state.orbit=0;stopCameraRoute();syncUI();draw(state.time);}
function setZoom(zoom){if(!Number.isFinite(zoom))throw Error('Invalid camera zoom');state.zoom=clamp(zoom,cameraLimits.zoomMin,cameraLimits.zoomMax);stopCameraRoute();syncUI();}
async function setBackend(kind){
  if(switching)throw Error('Renderer switch already pending');switching=true;
  const old=renderer,oldCanvas=canvas,candidate=document.createElement('canvas');candidate.setAttribute('aria-label','Этюд маяка: берег, море и смотритель');
  let next;
  try{next=await createBackend(kind,candidate,scene);next.resize(width,height,state.dpr);renderer=next;canvas=candidate;state.backend=kind;$('surface').replaceChildren(canvas);old?.dispose();syncUI();draw(state.time);return snapshot();}
  catch(e){next?.dispose();candidate.remove();renderer=old;canvas=oldCanvas;syncUI();throw e;}
  finally{switching=false;}
}
function draw(time){
  if(!renderer||document.hidden)return;
  camera=inspectionCamera(time);
  const t=performance.now();renderer.render({camera,aspect:width/height,time,style:state.style,motion:state.motion});latestMs=performance.now()-t;frames++;
  const finish=performance.now();frameTimes.push(finish);while(frameTimes.length&&frameTimes[0]<finish-1000)frameTimes.shift();
  if(measurement){const now=performance.now(),elapsed=now-measurement.start;
    if(elapsed>=measurement.warmupMs){measurement.renderDurationMs.push(latestMs);if(measurement.previous!==null)measurement.renderedFrameIntervalMs.push(now-measurement.previous);measurement.previous=now;}
  }
}
function tick(now){
  const dt=Math.min((now-lastTick)/1000,.1);lastTick=now;
  if(measurement)state.time=(now-measurement.start)/1000;
  else if(state.freeze===null&&!document.hidden)state.time+=dt;
  if(renderer&&!switching&&!document.hidden&&(measurement||now-lastRender>=32)){
    try{draw(state.freeze??state.time);lastRender=now;renderError=null;}catch(e){renderError=String(e);notice('Сцена не смогла отрисовать кадр. Выбери другой рендер.',true);}
  }
  if($('diagnostics').checked&&frames%10===0)$('stats').textContent=`${BUILD}\n${renderer?.label||'Загрузка'} · ${width}×${height} · DPR ${state.dpr}\n${renderer?.stats().triangles??0} треуг. · ${renderer?.stats().drawCalls??0} draw calls\n${frameTimes.length} рендеров/с · CPU submit ${latestMs.toFixed(2)} мс\nОбычный предел 30 кадров/с; это локальное измерение.`;
  requestAnimationFrame(tick);
}
// Content fingerprint independent of engine; both backends receive this exact scene object.
function hashScene(){let h=2166136261;for(const mesh of scene.meshes){for(const a of [mesh.positions,mesh.normals,mesh.colors,mesh.artColors]){const bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(const b of bytes){h^=b;h=Math.imul(h,16777619);}}}return (h>>>0).toString(16).padStart(8,'0');}
const geometryFingerprint=hashScene();
function snapshot(){return {build:BUILD,...state,camera,cameraLimits:{...cameraLimits},geometryFingerprint,meshCount:scene.meshes.length,sceneTriangles:scene.meshes.reduce((n,m)=>n+m.positions.length/9,0),viewport:{width,height,dpr:state.dpr,bufferWidth:canvas?.width,bufferHeight:canvas?.height},stats:renderer?.stats()??null,rendererLabel:renderer?.label,renderError,storage:'not-used',fullScreen:!!document.fullscreenElement};}
const percentile=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.floor((s.length-1)*q))]:null;};
function statsOf(a){return {count:a.length,p50:percentile(a,.5),p95:percentile(a,.95)};}
async function benchmark({durationMs=1500,warmupMs=500}={}){
  if(measurement)throw Error('Measurement already active');
  state.freeze=null;state.time=0;lastTick=performance.now();
  measurement={start:performance.now(),warmupMs,renderDurationMs:[],renderedFrameIntervalMs:[],previous:null};
  await new Promise(resolve=>setTimeout(resolve,warmupMs+durationMs));
  const m=measurement;measurement=null;
  return {...snapshot(),warmupMs,durationMs,renderDurationMs:m.renderDurationMs,renderedFrameIntervalMs:m.renderedFrameIntervalMs,mainThreadRenderMs:statsOf(m.renderDurationMs),frameIntervalMs:statsOf(m.renderedFrameIntervalMs),gpuTimer:false,heap:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null};
}
window.VisualLab={snapshot,setBackend,setView,setZoom,setStyle(v){if(!['art','baseline'].includes(v))throw Error('Invalid style');state.style=v;syncUI();draw(state.time);},setMotion(v){state.motion=!!v;syncUI();},setRoute(v){state.route=!!v;state.freeze=null;syncUI();},setDpr(v){if(![1,1.5,2].includes(+v))throw Error('Invalid DPR');state.dpr=+v;syncUI();resize();},capture(time=0){state.freeze=time;state.time=time;draw(time);return snapshot();},benchmark};
$('backend').addEventListener('change',async e=>{try{await setBackend(e.target.value);notice('');}catch(error){notice(`Этот режим недоступен: ${error.message}. Текущий рендер сохранён.`,true);}});
$('style').addEventListener('change',e=>window.VisualLab.setStyle(e.target.value));
$('motion').addEventListener('change',e=>window.VisualLab.setMotion(e.target.checked));
$('route').addEventListener('change',e=>window.VisualLab.setRoute(e.target.checked));
$('dpr').addEventListener('change',e=>window.VisualLab.setDpr(+e.target.value));
$('diagnostics').addEventListener('change',e=>{$('stats').hidden=!e.target.checked;});
$('compare').addEventListener('click',()=>{const open=$('comparison').hidden;$('comparison').hidden=!open;$('compare').setAttribute('aria-expanded',String(open));});
for(const view of Object.keys(viewLabels))$('view-'+view).addEventListener('click',()=>setView(view));
$('zoom-in').addEventListener('click',()=>{clearGesture();setZoom(state.zoom*1.22);});
$('zoom-out').addEventListener('click',()=>{clearGesture();setZoom(state.zoom/1.22);});
$('reset').addEventListener('click',()=>{setView('overview');notice('Камера сброшена: общий вид');});
$('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage').requestFullscreen)await $('stage').requestFullscreen();else notice('Полный экран недоступен в этом браузере. Сцена уже занимает всё доступное окно.',true);}
  catch{notice('Браузер не разрешил полный экран. Сцена занимает всё доступное окно.',true);}
});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Выйти из полного экрана':'Развернуть сцену');resize();});
const pointers=new Map();let gesture=null;
function rebaseGesture(){const points=[...pointers.values()];gesture=points.length>=2?{kind:'pinch',distance:Math.max(1,Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)),zoom:state.zoom}:points.length?{kind:'orbit',x:points[0].x,orbit:state.orbit}:null;}
$('surface').addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;if(e.cancelable)e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stopCameraRoute();$('surface').setPointerCapture(e.pointerId);rebaseGesture();},{passive:false});
$('surface').addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;if(e.cancelable)e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const points=[...pointers.values()];if(gesture?.kind==='pinch'&&points.length>=2){const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),requested=gesture.zoom*distance/gesture.distance;setZoom(requested);if(state.zoom!==requested)rebaseGesture();}else if(gesture?.kind==='orbit'&&points.length===1){state.orbit=clamp(gesture.orbit+(points[0].x-gesture.x)*.0045,cameraLimits.orbitMin,cameraLimits.orbitMax);stopCameraRoute();syncUI();}},{passive:false});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('surface').addEventListener(event,e=>{if(pointers.delete(e.pointerId))rebaseGesture();});
$('surface').addEventListener('wheel',e=>{e.preventDefault();clearGesture();setZoom(state.zoom*Math.exp(-clamp(e.deltaY,-100,100)*.002));},{passive:false});
function clearGesture(){pointers.clear();gesture=null;}
addEventListener('blur',clearGesture);
reduce.addEventListener('change',e=>{if(e.matches){state.motion=false;state.route=false;syncUI();}});
addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{lastTick=performance.now();if(document.hidden)clearGesture();});
scene.background&&($('stage').style.background=`linear-gradient(rgb(${scene.background.top.map(v=>Math.round(v*255)).join(',')}),rgb(${scene.background.bottom.map(v=>Math.round(v*255)).join(',')}))`);
syncUI();resize();requestAnimationFrame(tick);
try{await setBackend('three');window.VisualLab.ready=true;}
catch(error){try{await setBackend('native');notice(`Three.js недоступен (${error.message}). Показан исправленный текущий рендер.`,true);window.VisualLab.ready=true;}
catch{try{await setBackend('canvas');notice('WebGL недоступен. Показан упрощённый Canvas без GPU; это отдельный запасной режим.',true);window.VisualLab.ready=true;}catch(e){notice(`Сцена недоступна: ${e.message}`,true);window.VisualLab.error=String(e);}}}
