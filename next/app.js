(function(){
  "use strict";
  var uiModes=new CloseUIModes({onChange:modeChanged,onPending:modePending}),U=CloseUI,view=new CloseInterface(uiModes),M=CloseModel,C=M.config,$=function(id){return document.getElementById(id);},canvas=$("world"),P=new CloseRenderer(canvas);
  // Assets are validated before any save reader/writer starts. The renderer
  // owns native meshes/mixers; the game remains sole owner of progress and dt.
  P.installAuthoredAssets(ThreeIslandPreview.authoredAssets);
  delete ThreeIslandPreview.authoredAssets;
  var state=M.create(),job=null,hover=null,selectedTag=null,pointer={x:0,y:0},last=performance.now(),clock=0,walkPhase=0,stepSound=0,workSound=-1;
  var camera={x:C.start.x,y:.8,z:C.start.z,distance:C.camera.distance,yaw:C.camera.yaw,pitch:C.camera.pitch},distance=C.camera.distance,yaw=C.camera.yaw,pitch=C.camera.pitch,overview=false;
  var keys=new Set(),touches=new Map(),gesture=null,pinch=null,night=0,toastTimer,saveTimer=0;
  var revision=0,hasInitial=false,writer=Date.now().toString(36)+"-"+Math.random().toString(36).slice(2),KEY="lighthouse.close-work.storage.v1",LEGACY_KEY="lighthouse.close-work.v1",SLOT="closeIslandStorage",saveGood=true;
  var audio=null,master=null,ambient=null,windFilter=null,muted=false,lastSaved=0,audioAttempted=false,audioContexts=0,audioTick=-1,ambientGains=null,ambientLevels={wind:0,leaves:0,surf:0};
  var sitting=false,sitBlend=0,visited=new Set(),placeTimer=0,saveBlocked=false,saveMemoryOnly=false,shedOpen=false,shedRevealAt=0,panelNotice=null;
  var gearUI=new CloseGear(view),coast=CloseCoast.create(),kit={bagOpen:false,mode:"none",zoom:1,point:CloseCoast.points[0].id,note:""},savedNormal=null,bagCamera=null,gallerySession=null,optics={eye:null,yaw:0,pitch:.1,zoom:1};
  var benchProbe=new CloseBenchProbe(view),benchEnabled=new URLSearchParams(location.search).get("workbench")!=="classic",benchState={reason:"",reasonUntil:0,result:"",resultUntil:0,selectedAt:-Infinity,confirmedAt:-Infinity,confirmPoint:null,focused:false},benchHit=null,benchPointer=null,benchPointerClickUntil=0;
  var worldActionUI=new CloseActionUI(view),ACTION_RADIUS=4.75,actionCache=null,actionFeedback=null,actionSnapshot={candidate:null,phase:"idle",radius:ACTION_RADIUS},lastActionTap=null;
  view.root.dataset.actionsWorld="active";
  var hostEnvelope=Object.assign({},globalThis.openai&&globalThis.openai.widgetState||{});
  var motionPreference=matchMedia("(prefers-reduced-motion: reduce)"),reducedMotion=motionPreference.matches,manualCamera=false,resultView=null,contextKey="",lastFrame=0,bottomHeight=110,coarsePointer=matchMedia("(pointer:coarse)").matches,fullscreenPending=false;
  var PRESENTATION_KEY="lighthouse.presentation.v1",motionOverride=null,quality="standard",inspectionLighting="auto",islandTime=0,wind={x:.86,z:.5,strength:.25},perfStart=performance.now(),perfFrames=0,perfTotal=0,perf={fps:null,renderMs:null,sampleMs:0,frames:0},cpuSamples=[],intervalSamples=[],sampleCursor=0;
  try{var prefs=JSON.parse(localStorage.getItem(PRESENTATION_KEY)||"null");if(prefs&&typeof prefs==="object"){if(typeof prefs.reducedMotion==="boolean")motionOverride=prefs.reducedMotion;if(prefs.quality==="lighter")quality="lighter";if(prefs.inspectionLighting==="day"||prefs.inspectionLighting==="night")inspectionLighting=prefs.inspectionLighting;}}catch(e){}
  function inspectionView(){return inspectionLighting==="auto"?(state.lit?"night":"day"):inspectionLighting;}
  function updateInspectionControl(){var button=$("lighting-view"),dark=inspectionView()==="night";if(!button)return;button.textContent="Осмотр: "+(dark?"ночь":"день");button.setAttribute("aria-pressed",String(dark));button.dataset.view=dark?"night":"day";button.setAttribute("aria-label","Осмотр: "+(dark?"ночь":"день")+". Включить "+(dark?"дневной":"ночной")+" вид без изменения прогресса");}
  function applyPresentation(){updateInspectionControl();reducedMotion=motionOverride===null?motionPreference.matches:motionOverride;P.quality=quality;view.root.dataset.reducedMotion=String(reducedMotion);$("motion").setAttribute("aria-pressed",String(reducedMotion));$("motion").textContent="Меньше движения: "+(reducedMotion?"вкл.":"выкл.");$("quality").setAttribute("data-quality",quality);$("quality").setAttribute("aria-pressed",String(quality==="lighter"));$("quality").textContent="Качество: "+(quality==="lighter"?"легче":"стандарт");}
  function persistPresentation(){try{localStorage.setItem(PRESENTATION_KEY,JSON.stringify({reducedMotion:motionOverride,quality:quality,inspectionLighting:inspectionLighting}));}catch(e){}}
  motionPreference.addEventListener("change",function(){applyPresentation();});applyPresentation();
  function notify(text){if(shedOpen&&!$("shed-panel").hidden){if(!job)panelNotice={text:text,at:clock};updateShedPanel();}else view.notify(text,"result");}
  function clearNotice(){actionFeedback=null;view.clearNotice();panelNotice=null;if(benchState){benchState.reason="";benchState.reasonUntil=0;benchState.result="";benchState.resultUntil=0;}}
  function widget(){return globalThis.openai&&typeof globalThis.openai.setWidgetState==="function";}
  function saveError(){saveGood=false;view.saveError("Не удалось записать прогресс. Не перезагружай и не закрывай страницу: последние изменения могут потеряться.");}
  function saveOK(){saveGood=true;view.saveOK(widget()?"Прогресс сохранён в этом просмотрщике":"Прогресс сохранён в этом браузере",!!job||shedOpen);}
  function saveMemoryWarning(){saveGood=false;view.saveError("Сохранение недоступно. Не перезагружай и не закрывай страницу: изменения останутся только до её закрытия.");}
  function persist(){
    if(saveBlocked)return;
    revision++;hasInitial=true;state.sync={revision:revision,writer:writer};var rev=revision;
    if(saveMemoryOnly){saveMemoryWarning();lastSaved=clock;return;}
    try{
      if(widget()){var envelope=Object.assign({},hostEnvelope);envelope[SLOT]=JSON.parse(JSON.stringify(state));hostEnvelope=envelope;var pending=globalThis.openai.setWidgetState(envelope);if(pending&&typeof pending.then==="function")pending.then(function(){if(rev===revision)saveOK();},function(){if(rev===revision)saveError();});else saveOK();}
      else {localStorage.setItem(KEY,JSON.stringify(state));saveOK();}
    }catch(e){saveError();}
    lastSaved=clock;
  }
  function unreadableSave(){saveBlocked=true;saveGood=false;view.saveError("Не удалось прочитать сохранение. Оно не изменено. Начать заново можно в меню — это заменит прежний прогресс.");}
  try{
    var stored=null,present=false,imported=false;
    if(widget()){
      present=Object.prototype.hasOwnProperty.call(hostEnvelope,SLOT);
      stored=present?hostEnvelope[SLOT]:hostEnvelope.closeIsland;
      imported=!present&&stored!=null;present=present||imported;
    }else {
      var raw=null;
      try{raw=localStorage.getItem(KEY);if(raw===null){raw=localStorage.getItem(LEGACY_KEY);imported=raw!==null;}}catch(e){if(e&&e.name==="SecurityError"){saveMemoryOnly=true;saveMemoryWarning();}else throw e;}
      if(!saveMemoryOnly&&raw!==null){stored=JSON.parse(raw);present=true;if(imported&&stored===null)present=false;}
    }
    var restored=present?M.restore(stored):null;
    if(restored){state=restored;revision=state.sync?state.sync.revision:0;hasInitial=true;camera.x=state.avatar.x;camera.z=state.avatar.z;if(imported)persist();}
    else if(present)unreadableSave();
  }catch(e){unreadableSave();}
  function audioVisibility(){
    if(!audio||!master)return;master.gain.cancelScheduledValues(audio.currentTime);master.gain.value=muted||document.hidden?0:.16;
    if(document.hidden){if(audio.state==='running')audio.suspend().catch(function(){});}
    else if(audio.state==='suspended')audio.resume().catch(function(){});
  }
  function unlock(){
    if(muted||document.hidden)return;
    try{if(!audio&&!audioAttempted){audioAttempted=true;var AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return;audio=new AC();audioContexts++;master=audio.createGain();master.gain.value=.16;master.connect(audio.destination);
      var length=audio.sampleRate*4,buffer=audio.createBuffer(1,length,audio.sampleRate),v=buffer.getChannelData(0),brown=0;
      for(var i=0;i<length;i++){var white=Math.random()*2-1;brown=(brown+white*.05)/1.05;v[i]=white*.45+brown*.55;}
      var noise=audio.createBufferSource();noise.buffer=buffer;noise.loop=true;ambientGains={};
      [['wind','lowpass',420],['leaves','bandpass',1900],['surf','lowpass',1000]].forEach(function(spec){var filter=audio.createBiquadFilter(),gain=audio.createGain();filter.type=spec[1];filter.frequency.value=spec[2];filter.Q.value=.65;gain.gain.value=0;noise.connect(filter);filter.connect(gain);gain.connect(master);ambientGains[spec[0]]=gain;if(spec[0]==='wind')windFilter=filter;});
      ambient=noise;noise.start();audioTick=-1;
    }audioVisibility();}catch(e){if(audio)audio.close().catch(function(){});audio=null;master=null;}
  }
  function placeAudio(){
    if(!audio||!ambientGains||audio.state!=="running"||clock-audioTick<.12)return;audioTick=clock;
    var a=state.avatar,shore=Math.max(0,Math.min(1,(a.z-2.5)/4.5)),grove=0;
    state.trees.forEach(function(t){if(!t.felled)grove=Math.max(grove,Math.max(0,1-Math.hypot(a.x-t.x,a.z-t.z)/5));});
    var pulse=.5+.5*Math.sin(islandTime*.75),gust=wind.strength;
    ambientLevels={wind:.06+gust*.065,leaves:grove*(.018+gust*.05),surf:(.018+shore*.115)*(.5+pulse*.5)};
    Object.keys(ambientLevels).forEach(function(key){ambientGains[key].gain.setTargetAtTime(ambientLevels[key],audio.currentTime,.35);});windFilter.frequency.setTargetAtTime(340+gust*260,audio.currentTime,.4);
  }
  function sound(kind){
    if(muted||document.hidden||!audio||!master||audio.state!=="running")return;
    try{var o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime,f={step:110,chop:150,saw:230,repair:360,collect:260,done:600,light:430}[kind]||200;
      if(kind==="step"&&state.avatar.z>8.7&&Math.abs(state.avatar.x-5)<1.2)f=75;
      o.type=kind==="saw"?"sawtooth":"triangle";o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(35,f*.45),t+.12);
      g.gain.setValueAtTime(kind==="step"?.06:.15,t);g.gain.exponentialRampToValueAtTime(.001,t+.16);o.connect(g);g.connect(master);o.onended=function(){o.disconnect();g.disconnect();};o.start(t);o.stop(t+.18);
    }catch(e){}
  }
  function treeById(id){return state.trees.find(function(t){return t.id===id;});}
  function actionForTag(tag){
    if(!tag)return null;
    if(tag.indexOf("tree:")===0)return "chop:"+tag.slice(5);
    if(tag.indexOf("logs:")===0)return "collect:"+tag.slice(5);
    if(tag.indexOf("drift:")===0||tag.indexOf("shed:")===0)return tag;
    if(tag==="gallery")return state.galleryRepaired?"gallery-view":"gallery-repair";
    return {workshop:"saw",bench:"saw",step:"repair",lighthouse:"light",stairs:"stairs",seat:"rest"}[tag]||null;
  }
  function shedTag(tag){return !!tag&&tag.indexOf("shed:")===0;}
  function navAction(tag){
    var id=actionForTag(tag),a=M.info(state,id),description=U.action(state,id);
    if(a&&description)a=Object.assign({},a,description);
    if(a&&shedTag(tag)){var open=U.action(state,"shed:logs");a=Object.assign({},a,open,{id:id,type:"shed",reason:"",available:true,done:false,progress:0});}
    if(a&&a.progress>0)a.label="Продолжить: "+a.label;
    return a;
  }
  function materialText(n,kind,accusative){return U.material(n,kind,accusative);}
  function cargoText(){return U.cargo(state);}
  function nearShed(){return Object.keys(C.shed.zones).some(function(k){var q=C.shed.zones[k];return Math.hypot(state.avatar.x-q.x,state.avatar.z-q.z)<=C.interactionReach&&M.clear(state,state.avatar,q);});}
  function clearUIInput(){keys.clear();touches.clear();gesture=null;pinch=null;hover=null;}
  function modePending(){if(!view)return;clearUIInput();view.syncMode();view.invalidate();}
  function modeChanged(next,previous,meta){
    if(!view||!kit)return;
    clearUIInput();
    if(next.mode==="walk"&&gallerySession)finishGallery();
    if(previous.mode==="binoculars"&&next.mode!=="binoculars"){if(!gallerySession)restoreNormal(savedNormal);savedNormal=null;kit.mode="none";P.observation=null;}
    if(previous.mode==="bag"&&next.mode!=="bag"){if(next.mode!=="binoculars"&&!gallerySession)restoreNormal(bagCamera);bagCamera=null;}
    kit.bagOpen=next.mode==="bag";shedOpen=next.mode==="shed";
    if(job&&(next.mode!=="walk"||previous.mode==="shed"))pause(true);
    if(previous.mode==="shed"&&next.mode!=="shed")panelNotice=null;
    [["help-dialog","help"],["restart-dialog","confirm"]].forEach(function(pair){var d=$(pair[0]);if(next.mode===pair[1]){if(!d.open)d.showModal();}else if(d.open)d.close();});
    view.syncMode();renderGear();view.invalidate();
    var focus=next.mode==="bag"?"bag-close":next.mode==="menu"?"menu-close":next.mode==="help"?"help-close":next.mode==="confirm"?"restart-cancel":next.mode==="shed"?(next.detail?"shed-details-back":"shed-close"):next.mode==="binoculars"?(next.detail?"binocular-places-back":"world"):next.mode==="gallery"?"gallery-binoculars":"world";
    if(meta&&meta.reason==="detail"&&next.mode==="bag")focus="bag-places-back";
    if($(focus))$(focus).focus({preventScroll:true});
    if(next.mode==="help"&&previous.mode!=="help"){$("help-dialog").scrollTop=0;$("help-dialog").querySelector(".dialog-content").scrollTop=0;}
  }
  function openShed(){
    if(saveBlocked||job||!nearShed()||uiModes.snapshot().pending)return;
    closeTools(false,true);uiModes.open("shed");shedRevealAt=0;clearUIInput();refresh();updateShedPanel();
    var first=["shed-store","shed-take-boards","shed-take-logs","shed-close"].find(function(id){return $(id).getClientRects().length&&$(id).getAttribute("aria-disabled")!=="true";});if(first)$(first).focus({preventScroll:true});
  }
  function coastPoint(id){return CloseCoast.points.find(function(p){return p.id===(id||kit.point);})||CloseCoast.points[0];}
  function captureNormal(){return {camera:Object.assign({},camera),targetDistance:distance,targetYaw:yaw,targetPitch:pitch,overview:overview,manual:manualCamera};}
  function restoreNormal(saved){if(!saved)return;Object.assign(camera,saved.camera);distance=saved.targetDistance;yaw=saved.targetYaw;pitch=saved.targetPitch;overview=saved.overview;manualCamera=saved.manual;$("overview").setAttribute("aria-pressed",String(overview));}
  function renderGear(){gearUI.render({bagOpen:kit.bagOpen,mode:kit.mode,zoom:optics.zoom,minZoom:1,maxZoom:7,point:coastPoint(),cargo:cargoText(),points:CloseCoast.points,status:kit.note,gallery:!!gallerySession});}
  function closeTools(focus,keepUI){
    var wasOpen=kit.bagOpen||kit.mode!=="none";
    if(!gallerySession){if(kit.mode==="binoculars")restoreNormal(savedNormal);else if(kit.bagOpen)restoreNormal(bagCamera);}
    kit.mode="none";kit.note="";savedNormal=null;bagCamera=null;P.observation=null;P.lantern=null;clearUIInput();
    if(!keepUI&&(uiModes.is("bag")||uiModes.is("binoculars")))uiModes.back("tool-close");
    kit.bagOpen=uiModes.is("bag");renderGear();view.invalidate();
    if(wasOpen&&focus!==false)canvas.focus({preventScroll:true});
  }
  function finishGallery(){
    if(!gallerySession)return;var normal=gallerySession.normal;gallerySession=null;restoreNormal(normal);savedNormal=null;bagCamera=null;P.observation=null;kit.mode="none";clearUIInput();
  }
  function enterGallery(){
    var a=M.info(state,"gallery-view");if(saveBlocked||job||!a||!a.available||Math.hypot(state.avatar.x-a.x,state.avatar.z-a.z)>C.interactionReach||!M.clear(state,state.avatar,a)){notify(a&&a.reason||"Подойди к основанию маяка.");return;}
    closeTools(false,true);pause(true);clearNotice();clearUIInput();resultView=null;
    var eye=C.gallery.eye,look=C.gallery.look;
    gallerySession={normal:captureNormal(),eye:eye.slice(),yaw:Math.atan2(eye[0]-look.x,eye[2]-look.z),pitch:Math.max(-.15,Math.min(.55,Math.atan2(eye[1]-look.y,Math.hypot(look.x-eye[0],look.z-eye[2]))))};
    uiModes.open("gallery");renderGear();view.invalidate();
  }
  function galleryCamera(){var safe=view.layout();P.observation={eye:gallerySession.eye,yaw:gallerySession.yaw,pitch:gallerySession.pitch,zoom:1,centerX:safe.centerX,centerY:safe.centerY};}
  function openBag(){
    if(uiModes.snapshot().pending)return;
    unlock();if(uiModes.is("bag")){uiModes.back("bag-toggle");return;}
    var wasWorking=!!job,normal=savedNormal||bagCamera||captureNormal();closeTools(false,true);bagCamera=normal;pause(true);clearUIInput();
    kit.note=wasWorking?"Работа приостановлена.":"Выбери инструмент или место для прогулки.";uiModes.open("bag");renderGear();refresh();
  }
  function aimPoint(id){
    var point=coastPoint(id);kit.point=point.id;var eye=optics.eye;
    if(eye){optics.yaw=Math.atan2(eye[0]-point.look.x,eye[2]-point.look.z);optics.pitch=Math.max(-.15,Math.min(.55,Math.atan2(eye[1]-point.look.y,Math.hypot(point.look.x-eye[0],point.look.z-eye[2]))));}
    renderGear();
  }
  function useTool(mode){
    if((mode!=="lantern"&&mode!=="binoculars")||uiModes.snapshot().pending)return;
    if(mode==="lantern"&&gallerySession){uiModes.reset("gallery-lantern");kit.mode="lantern";kit.note="";renderGear();view.invalidate();notify("Фонарь включён у основания маяка.");canvas.focus({preventScroll:true});return;}
    var normal=bagCamera||savedNormal||captureNormal();closeTools(false,true);restoreNormal(normal);pause(true);clearUIInput();resultView=null;kit.mode=mode;kit.note="";
    if(mode==="binoculars"){savedNormal=gallerySession?null:normal;var a=actorPosition();optics.eye=gallerySession?gallerySession.eye.slice():[a.x,M.height(a.x,a.z)+1.65,a.z];optics.zoom=kit.zoom;if(gallerySession){optics.yaw=gallerySession.yaw;optics.pitch=gallerySession.pitch;}uiModes.open("binoculars");if(!gallerySession)aimPoint(kit.point);}
    else uiModes.reset("lantern-equip");
    renderGear();view.invalidate();canvas.focus({preventScroll:true});
  }
  function changeZoom(delta){if(kit.mode!=="binoculars")return;kit.zoom=Math.max(1,Math.min(7,kit.zoom+delta));renderGear();}
  function shiftPoint(delta){var i=CloseCoast.points.findIndex(function(p){return p.id===kit.point;});aimPoint(CloseCoast.points[(i+delta+CloseCoast.points.length)%CloseCoast.points.length].id);}
  function walkCoast(id){var point=coastPoint(id);if(saveBlocked){notify("Сохранение не прочитано. Оно не изменено.");return;}kit.point=point.id;closeTools(false);selectedTag=null;walk(point.stand,null);notify(point.name+". Здесь можно достать бинокль из сумки.");}
  function observationCamera(){var safe=view.layout();P.observation={eye:optics.eye,yaw:optics.yaw,pitch:optics.pitch,zoom:optics.zoom,centerX:safe.centerX,centerY:safe.centerY};}
  function nearBench(){var a=M.info(state,"saw");return Math.hypot(state.avatar.x-a.x,state.avatar.z-a.z)<=C.interactionReach&&M.clear(state,state.avatar,a);}
  function benchPermitted(){return !saveBlocked&&!kit.bagOpen&&kit.mode!=="binoculars"&&!shedOpen&&uiModes.is("walk")&&!uiModes.snapshot().pending&&$("menu").hidden&&!document.querySelector("dialog[open]")&&!(job&&job.id&&job.id!=="saw");}
  function selectBench(e){if(!benchEnabled||!benchPermitted()||job&&job.id==="saw")return;
    // The broad object zone must not steal another visible world target.
    if(e&&e.detail>0){var point=local(e),tag=e.worldTag||P.pick(point.x,point.y);if(tag&&tag!=="bench"&&actionForTag(tag)){benchState.focused=false;canvas.focus({preventScroll:true});approach(tag);return;}}
    benchState.reason="";benchState.result="";benchState.focused=false;approach("bench");benchState.selectedAt=clock;renderBench(contextAction());}
  function confirmBench(e){
    if(!benchEnabled||!benchPermitted()||job&&job.id==="saw")return;
    selectedTag="bench";var d=U.action(state,"saw");
    if(!d.available){benchState.reason=d.reason;benchState.reasonUntil=clock+4;renderBench(contextAction());return;}
    benchState.reason="";benchState.result="";benchState.confirmedAt=performance.now();benchState.confirmPoint=e&&e.detail>0?{x:e.clientX,y:e.clientY}:null;interact("bench");renderBench(contextAction());
  }
  function dismissBench(){if(selectedTag==="bench"&&job)pause(true);if(selectedTag==="bench")selectedTag=null;benchState.focused=false;benchState.reason="";benchState.result="";benchState.selectedAt=-Infinity;renderBench(contextAction());canvas.focus({preventScroll:true});}
  function benchRect(){
    if(!benchEnabled||!benchPermitted()||Math.hypot(state.avatar.x-C.bench.x,state.avatar.z-C.bench.z)>9)return null;
    var visible=false;[[-.65,.99],[0,1.04],[.65,1.04]].forEach(function(v){var a=P.project([C.bench.x+v[0],v[1],C.bench.z]);if(a&&a.x>0&&a.y>0&&a.x<canvas.clientWidth&&a.y<canvas.clientHeight&&P.pick(a.x,a.y)==="bench")visible=true;});
    if(!visible)return null;
    var pts=[];[-1.47,1.47].forEach(function(x){[.3,1.65].forEach(function(y){[-.56,.56].forEach(function(z){var p=P.project([C.bench.x+x,y,C.bench.z+z]);if(p)pts.push(p);});});});if(!pts.length)return null;
    var xs=pts.map(function(p){return p.x;}),ys=pts.map(function(p){return p.y;}),left=Math.min.apply(null,xs),right=Math.max.apply(null,xs),top=Math.min.apply(null,ys),bottom=Math.max.apply(null,ys),w=Math.max(72,Math.min(200,right-left)),h=Math.max(64,Math.min(128,bottom-top));
    return {left:(left+right-w)/2,top:(top+bottom-h)/2,width:w,height:h};
  }
  function renderBench(nearby){
    var busy=!!job&&job.id==="saw",working=busy&&job.working,selected=selectedTag==="bench",near=nearBench(),permitted=benchPermitted(),result=benchState.result&&clock<benchState.resultUntil&&near?benchState.result:false;
    benchHit=benchRect();var own=permitted&&((nearby&&nearby.tag==="bench")||selected&&(near||job&&job.path.length)||benchState.focused&&benchHit||busy||result),description=U.action(state,"saw"),point=P.project([C.bench.x,1.22,C.bench.z]);
    benchProbe.render({enabled:benchEnabled,eligible:permitted,ownsContext:!!own,near:near,selected:selected&&!!own,focused:benchState.focused&&!!benchHit,working:working,busy:busy,travelling:busy&&!working,done:result,progress:working?job.elapsed/job.action.seconds:0,description:description,hitRect:benchHit,commandPoint:point,sceneRect:view.layout(),cargo:cargoText(),reason:clock<benchState.reasonUntil?benchState.reason:""});
    if(benchEnabled&&own)$("act").hidden=true;
  }
  function nextMaterialHint(){return U.guidance(state,{sitting:sitting}).title;}
  function pause(silent){
    actionCache=null;
    if(job){if(job.working)state.progress[job.id]=Math.min(.999999,job.elapsed/job.action.seconds);job=null;persist();}
  }
  function walk(to,intent,arrivalTag,plannedPath){
    if(saveBlocked)return;if(gallerySession)uiModes.reset("gallery-travel");if(kit.bagOpen||kit.mode==="binoculars"||intent)closeTools(false);sitting=false;resultView=null;if(uiModes.is("shed")&&!(intent&&["store","take","upgrade"].indexOf(intent.type)>=0))uiModes.reset("walk");shedOpen=uiModes.is("shed");
    var path=plannedPath!==undefined?plannedPath:Math.hypot(state.avatar.x-to.x,state.avatar.z-to.z)<.001?[]:M.path(state,state.avatar,to);if(!path){pause(true);refresh();notify("Здесь не пройти. Выбери тропинку рядом.");return;}
    clearNotice();pause(true);job={id:intent?intent.id:null,action:intent,path:path.map(function(p){return {x:p.x,z:p.z};}),working:false,elapsed:0,arrivalTag:arrivalTag||null};overview=false;$("overview").setAttribute("aria-pressed","false");
    persist();refresh();
    var end=path[path.length-1];if(end&&Math.hypot(end.x-to.x,end.z-to.z)>.15)notify("Подойду к доступному месту рядом.");
  }
  function approach(tag){
    if(saveBlocked)return;
    if(tag==="workshop")tag="bench";
    if(tag==="lighthouse"&&state.lit)tag="gallery";
    var id=actionForTag(tag),a=navAction(tag);if(!a)return;
    selectedTag=tag;if(benchEnabled&&tag==="bench"){benchState.selectedAt=clock;benchState.reason="";benchState.result="";}
    if(job&&job.id===id&&job.working){pause(true);refresh();return;}
    walk({x:a.x,z:a.z},null,tag==="seat"?"seat":null);
  }
  function setResting(value){
    sitting=value;keys.clear();if(sitting){yaw=2.05;pitch=.38;distance=11;overview=false;$("overview").setAttribute("aria-pressed","false");}
  }
  function interact(tag){
    unlock();if(saveBlocked)return;closeTools(false);if(shedTag(tag)){openShed();return;}var id=actionForTag(tag),a=id?M.info(state,id):null;if(!a)return;
    if(job&&job.id===id&&job.working){pause(false);refresh();return;}
    if(!a.available){if(benchEnabled&&tag==="bench"){benchState.reason=U.action(state,id).reason;benchState.reasonUntil=clock+4;renderBench(contextAction());}else notify(U.action(state,id).reason);return;}
    if(a.type==="view"){enterGallery();return;}
    if(a.type==="rest"){clearNotice();pause(true);setResting(!sitting);refresh();return;}
    walk({x:a.x,z:a.z},a);
  }
  function refresh(){
    var caps=M.capacity(state);$("logs").textContent=state.logs+" из "+caps.logs;$("boards").textContent=state.boards+" из "+caps.boards;$("carry").textContent=cargoText();$("objective").classList.toggle("done",state.repaired);
    $("goal-title").textContent=state.lit?"Маяк светит":state.repaired?"Ступень готова":"Починить ступень";
    $("goal-next").hidden=true;
    $("day").textContent=state.lit?"Вечерний огонь":state.daylight>.6?"Тёплый вечер":state.daylight>.32?"День у моря":"Утро у моря";
  }
  function update(dt){
    P.updateAuthored(dt);
    clock+=dt;night+=( (state.lit?1:0)-night)*Math.min(1,dt*.8);
    if(!reducedMotion)islandTime+=dt;
    var pulse=.5-.5*Math.cos(islandTime*.48);wind.strength=.25+.55*pulse*pulse*pulse+.08*Math.sin(islandTime*1.3);placeAudio();
    sitBlend+=((sitting?1:0)-sitBlend)*Math.min(1,dt*7);
    CloseCoast.update(coast,dt,{avatar:state.avatar,reducedMotion:reducedMotion,quality:quality,time:clock});
    if(kit.mode==="binoculars"){
      var zoomStep=1-Math.exp(-dt*12);optics.zoom+=(kit.zoom-optics.zoom)*zoomStep;if(Math.abs(kit.zoom-optics.zoom)<.0005)optics.zoom=kit.zoom;renderGear();
      var fineAim=1/Math.max(1,optics.zoom);
      optics.yaw+=((keys.has("ArrowLeft")||keys.has("KeyA")?1:0)-(keys.has("ArrowRight")||keys.has("KeyD")?1:0))*dt*.55*fineAim;
      optics.pitch=Math.max(-.15,Math.min(.55,optics.pitch+((keys.has("ArrowDown")||keys.has("KeyS")?1:0)-(keys.has("ArrowUp")||keys.has("KeyW")?1:0))*dt*.35*fineAim));
      observationCamera();P.camera(camera,camera.distance,camera.yaw,camera.pitch);return false;
    }
    if(gallerySession){keys.clear();galleryCamera();P.camera(camera,camera.distance,camera.yaw,camera.pitch);return false;}
    P.observation=null;
    if(uiModes.blocksWorld())keys.clear();
    var kx=(keys.has("ArrowRight")||keys.has("KeyD")?1:0)-(keys.has("ArrowLeft")||keys.has("KeyA")?1:0),kz=(keys.has("ArrowDown")||keys.has("KeyS")?1:0)-(keys.has("ArrowUp")||keys.has("KeyW")?1:0),moving=false;
    function moveTo(x,z){
      var travelled=Math.hypot(x-state.avatar.x,z-state.avatar.z);
      if(travelled>0){state.avatar.heading=Math.atan2(x-state.avatar.x,z-state.avatar.z);state.avatar.x=x;state.avatar.z=z;state.daylight=Math.min(.81,state.daylight+travelled*C.daylightPerMeter);walkPhase+=travelled*4;moving=true;}
    }
    if(kx||kz){
      if(saveBlocked||uiModes.blocksWorld()){keys.clear();return false;}sitting=false;resultView=null;selectedTag=null;benchState.reason="";benchState.result="";
      if(job)pause(true);
      var length=Math.hypot(kx,kz),dx=(Math.cos(yaw)*kx+Math.sin(yaw)*kz)/length*C.walkSpeed*dt,dz=(-Math.sin(yaw)*kx+Math.cos(yaw)*kz)/length*C.walkSpeed*dt;
      var x=state.avatar.x,z=state.avatar.z;
      if(M.walkable(state,x+dx,z))x+=dx;if(M.walkable(state,x,z+dz))z+=dz;moveTo(x,z);
      if(clock-lastSaved>1)persist();
    }else if(job){
      if(job.path.length){
        var next=job.path[0],dx=next.x-state.avatar.x,dz=next.z-state.avatar.z,d=Math.hypot(dx,dz),step=Math.min(d,C.walkSpeed*dt);
        if(d<.001)job.path.shift();else {var dest={x:state.avatar.x+dx/d*step,z:state.avatar.z+dz/d*step};if(M.clear(state,state.avatar,dest)){moveTo(dest.x,dest.z);if(step>=d-.001)job.path.shift();}else {var end=job.path[job.path.length-1],reroute=M.path(state,state.avatar,end);if(reroute)job.path=reroute;else {var blockedTag=job.intentTag;pause(true);if(blockedTag)actionMessage("Здесь не пройти. Выбери место рядом.",blockedTag);else notify("Здесь не пройти. Выбери место рядом.");}}}
      }else if(!job.action){var arrivedAt=job.arrivalTag,arrival=job.intentTag&&navAction(job.intentTag),intentTag=job.intentTag;job=null;
        if(arrival&&(Math.hypot(state.avatar.x-arrival.x,state.avatar.z-arrival.z)>C.interactionReach+.000001||!M.clear(state,state.avatar,arrival)||arrival.done||!arrival.available)){actionMessage(arrival.reason||"Здесь не удалось подойти к месту действия.",intentTag);}
        else if(arrivedAt==="seat")setResting(true);else if(arrivedAt&&shedTag(arrivedAt))openShed();else if(arrivedAt==="gallery")enterGallery();persist();refresh();}
      else {
        if(!job.working){
          var current=M.info(state,job.id);if(!current||current.done||!current.available){var rejectedTag=job.intentTag||selectedTag;pause(true);actionMessage(current?U.action(state,current.id).reason:"Дело уже закончено.",rejectedTag);return;}
          if(Math.hypot(state.avatar.x-current.x,state.avatar.z-current.z)>C.interactionReach+.000001||!M.clear(state,state.avatar,current)){var rejectedTag=job.intentTag||selectedTag;pause(true);actionMessage("Не удалось подойти к месту работы. Выбери цель снова.",rejectedTag);return;}
          job.action=current;job.elapsed=(state.progress[job.id]||0)*current.seconds;job.working=true;workSound=-1;
          state.avatar.heading=Math.atan2(current.faceX-state.avatar.x,current.faceZ-state.avatar.z);
        }
        job.elapsed+=dt;var cycle=Math.floor(job.elapsed*1.5);
        if(cycle!==workSound){workSound=cycle;sound(job.action.type);}
        state.progress[job.id]=Math.min(.999999,job.elapsed/job.action.seconds);
        if(clock-lastSaved>1)persist();
        if(job.elapsed>=job.action.seconds){
          var id=job.id,type=job.action.type,finishedTag=job.intentTag||selectedTag,result=M.finish(state,id);job=null;hover=null;actionCache=null;
          if(result.ok){state=result.state;if(type==="store"||type==="take"||type==="upgrade")shedRevealAt=clock+1.2;resultView={id:id,type:type,x:state.avatar.x,z:state.avatar.z,at:clock,amount:result.amount};sound("done");persist();refresh();if(!shedOpen)actionMessage(resultMessage(id,type,result.amount),finishedTag,"result");if(benchEnabled&&type==="saw"){benchState.result="Получено "+U.material(state.carry.amount,"boards")+". Они в руках.";benchState.resultUntil=clock+4;benchState.reason="";}else if(shedOpen&&!(type==="store"||type==="take"||type==="upgrade"))notify(resultMessage(id,type,result.amount));}else {persist();if(finishedTag&&!shedOpen)actionMessage(result.reason,finishedTag);else notify(result.reason);}
        }
      }
    }
    if(moving&&clock-stepSound>.33){stepSound=clock;sound("step");}
    if(moving)refresh();
    var a=actorPosition(),target=overview?{x:0,y:0,z:1}:{x:a.x,y:M.height(a.x,a.z)+.85,z:a.z};
    // Keep orientation stable: only framing, distance and pitch respond to work.
    var framed=job&&job.working?job.action:resultView&&clock-resultView.at<3?M.info(state,resultView.id):null;
    var autoDistance=distance,autoPitch=pitch;
    if(!overview){
      if(framed){target.x+=(framed.faceX-a.x)*.28;target.z+=(framed.faceZ-a.z)*.28;target.y=framed.type==="light"?1.8:1.05;
        if(!manualCamera){autoDistance=framed.type==="light"?Math.max(distance,15):Math.max(C.camera.min,distance*.84);autoPitch=Math.max(pitch,.61);}}
      else if(moving){target.x+=Math.sin(a.heading)*.65;target.z+=Math.cos(a.heading)*.65;}
      if(!manualCamera&&canvas.clientHeight<500)autoDistance*=.9;
    }
    // Reframe into the actual free scene rectangle, preserving the user's yaw,
    // pitch and zoom. This changes presentation only, never world coordinates.
    var safe=view.layout(),w=canvas.clientWidth,h=canvas.clientHeight;
    var framingScale=h/(2*Math.tan(w<h*.82?.58:.48)),framingDistance=overview?Math.max(36,h/w*35):autoDistance;
    var centerY=h*(w<h*.82?.53:h<500?.48:.52);
    var rightShift=(w*.5-safe.centerX)*framingDistance/framingScale,upShift=(safe.centerY-centerY)*framingDistance/framingScale;
    target.x+=Math.cos(yaw)*rightShift-Math.sin(yaw)*Math.sin(autoPitch)*upShift;
    target.y+=Math.cos(autoPitch)*upShift;
    target.z-=Math.sin(yaw)*rightShift+Math.cos(yaw)*Math.sin(autoPitch)*upShift;
    var ease=reducedMotion?1:1-Math.exp(-dt*4.5);
    camera.x+=(target.x-camera.x)*ease;camera.y+=(target.y-camera.y)*ease;camera.z+=(target.z-camera.z)*ease;
    var mapDistance=Math.max(36,canvas.clientHeight/canvas.clientWidth*35);
    camera.distance+=((overview?mapDistance:autoDistance)-camera.distance)*ease;camera.yaw+=(yaw-camera.yaw)*ease;camera.pitch+=((overview?.88:autoPitch)-camera.pitch)*ease;
    P.camera(camera,camera.distance,camera.yaw,camera.pitch);
    var name=areaName();if(name&&!visited.has(name)){visited.add(name);$("place").textContent=name;$("place").classList.add("visible");clearTimeout(placeTimer);placeTimer=setTimeout(function(){$("place").classList.remove("visible");},3200);}
    return moving;
  }
  function resultMessage(id,type,amount){return U.result(state,id,type,amount);}
  function actorPosition(){return {x:state.avatar.x+(C.seat.x-state.avatar.x)*sitBlend,z:state.avatar.z+(C.seat.z-state.avatar.z)*sitBlend,heading:sitBlend>.1?C.seat.heading:state.avatar.heading};}
  function areaName(){var x=state.avatar.x,z=state.avatar.z;if(x>17)return "Крабовая бухта";if(x>14.5&&z<3.2)return "Каменный проход";if(Math.hypot(x-5,z-9.6)<2)return "Старый причал";if(Math.hypot(x+12,z+4.6)<2.4)return "Видовая площадка";if(z>5.8&&x>1)return "Каменистый берег";if(x<-7.5&&z>-2)return "Тихая роща";return null;}
  function keeper(moving){
    var a=actorPosition(),w=job&&job.working?job:null,t=w?w.action.type:null;
    var carrying=state.carry.amount>0&&(!w||t==="store"||t==="take"),clip="Idle",phase;
    if(sitBlend>.5)clip="Sit";
    else if(w){
      clip=t==="chop"?"Chop":t==="saw"?"Saw":t==="repair"||t==="upgrade"?"Repair":t==="collect"||t==="take"||t==="store"?"Collect":"Idle";
      // Existing game elapsed is authoritative; animation cannot grant resources.
      phase=clip==="Collect"?Math.min(1,w.elapsed/w.action.seconds):(w.elapsed*1.5)%1;
    }else if(moving){clip=carrying?"CarryWalk":"Walk";phase=(walkPhase/(Math.PI*2))%1;}
    else if(carrying)clip="CarryIdle";
    P.shadow(a.x,a.z,.36,.28,M.height(a.x,a.z)+.012);
    P.drawAuthored("keeper","keeper",{position:[a.x,M.height(a.x,a.z),a.z],heading:a.heading,clip:clip,phase:phase,
      speed:reducedMotion&&clip==="Idle"?0:1,props:{cargo:carrying?{kind:state.carry.kind,amount:state.carry.amount}:null,
      tool:t==="chop"?"axe":t==="saw"?"saw":t==="repair"||t==="upgrade"?"hammer":null,lantern:kit.mode==="lantern"}});
  }
  function targetPoint(tag){
    if(!tag)return null;
    if(tag.indexOf("tree:")===0){var t=treeById(tag.slice(5));return t?[t.x,1.1,t.z]:null;}
    if(tag.indexOf("logs:")===0){var t=treeById(tag.slice(5));return t?[t.x+.6,.4,t.z+.3]:null;}
    if(tag.indexOf("drift:")===0){var d=state.shore.find(function(v){return v.id===tag.slice(6);});return d?[d.x,M.height(d.x,d.z)+.3,d.z]:null;}
    if(shedTag(tag)){var zone=C.shed.zones[tag.slice(5)];return zone?[5.4,tag==="shed:upgrade"?1.7:.9,tag==="shed:upgrade"?-3.08:zone.z]:null;}
    if(tag==="stairs")return [C.stairs.x,M.height(C.stairs.x,C.stairs.z)+.3,C.stairs.z];
    if(tag==="seat")return [C.seat.x,.8,C.seat.z];
    if(tag==="gallery")return [C.lighthouse.x,5.45,C.lighthouse.z+1.5];
    return {workshop:[3.8,1.2,-4.3],bench:[3.8,1.2,-1.6],step:[-5,.35,-1.05],lighthouse:[10,1.2,-5.98]}[tag]||null;
  }
  function render(moving){
    // Inspection is presentation-only. Game/beacon/audio night remains unchanged.
    var displayNight=inspectionLighting==="day"?0:inspectionLighting==="night"?1:night;
    var displayDaylight=inspectionLighting==="day"?.32:inspectionLighting==="night"?.81:state.daylight;
    P.begin(displayNight,displayDaylight,islandTime);
    var work={id:job&&job.working?job.id:null,type:job&&job.working?job.action.type:null,amount:job&&job.working?job.action.amount:0,progress:job&&job.working?Math.min(1,job.elapsed/job.action.seconds):0,cycle:job&&job.working?job.elapsed*1.5:0};
    var env={time:islandTime,wind:wind,night:night,work:work,reducedMotion:reducedMotion,hovered:hover,selected:job?job.id:null,coast:coast};CloseWorld.draw(P,state,env);CloseScene.draw(P,state,env);
    var actor=actorPosition();if(kit.mode!=="binoculars"&&!gallerySession)keeper(moving);
    P.keeperFocus=kit.mode==="binoculars"||gallerySession?null:[actor.x,M.height(actor.x,actor.z)+1.1,actor.z];
    P.lantern=kit.mode==="lantern"?{position:[actor.x,M.height(actor.x,actor.z)+.9,actor.z],strength:.7}:null;P.flush(hover);
    if(resultView&&clock-resultView.at<1.2){var age=(clock-resultView.at)/1.2;P.ring(resultView.x,resultView.z,"#f4df9be0",reducedMotion?.5:.35+age*.8,M.height(resultView.x,resultView.z)+.045);}
    if(job&&job.working&&!reducedMotion&&(job.action.type==="saw"||job.action.type==="repair")){
      var q=(job.elapsed*1.5)%1;for(var chip=0;chip<3;chip++)P.spark([job.action.faceX+(chip-1)*q*.4,M.height(job.action.faceX,job.action.faceZ)+.5+Math.sin(q*Math.PI)*.35,job.action.faceZ+q*.4],.025,"#f2d4a0");
    }
    if(job&&job.path.length){var dest=job.path[job.path.length-1];P.ring(dest.x,dest.z,"#f5df9b9e",.33,M.height(dest.x,dest.z)+.045);}
    if(night*displayNight>.05)P.beam([10,5.65,-7],[24+Math.sin(islandTime*.14)*10,3,-19],night*displayNight);
    var nearby=contextAction();
    if(!job&&actionFeedback&&clock<actionFeedback.until&&actionFeedback.kind==="reason"){nearby={tag:actionFeedback.tag,action:Object.assign({},actionFeedback.action,{available:false,reason:actionFeedback.text})};}
    var safe=view.layout(),active=!!(job&&job.intentTag),phase=active?(job.working?"working":"travelling"):"idle";
    updateContext(nearby);updateShedPanel();renderGear();benchProbe.render({enabled:false,eligible:false});
    var anchor=nearby&&(targetPoint(nearby.tag)||actionFeedback&&actionFeedback.worldPoint),screen=anchor&&P.project(anchor),head=P.project([actor.x,M.height(actor.x,actor.z)+1.9,actor.z]),feet=P.project([actor.x,M.height(actor.x,actor.z),actor.z]);
    if(screen&&head&&feet){screen.avoid=[{left:head.x-22,top:head.y-8,right:head.x+22,bottom:feet.y+8}];}
    var feedback=actionFeedback&&clock<actionFeedback.until&&nearby&&(actionFeedback.kind==="result"||actionFeedback.tag===nearby.tag)?actionFeedback:null;
    var eligible=!!nearby&&!!screen&&uiModes.is("walk")&&!uiModes.snapshot().pending&&!saveBlocked;
    var rendered=worldActionUI.render({visible:eligible,tag:nearby&&nearby.tag,action:nearby&&nearby.action,point:screen,safeRect:safe,phase:phase,progress:active&&job.working?Math.min(1,job.elapsed/job.action.seconds):0,keyboard:view.keyboard(),reason:feedback&&feedback.kind==="reason"?feedback.text:"",result:feedback&&feedback.kind==="result"?feedback.text:"",selected:!!nearby&&nearby.tag===selectedTag});
    actionSnapshot={candidate:nearby?{tag:nearby.tag,id:nearby.action.id,type:nearby.action.type,available:nearby.action.available,reason:nearby.action.reason||""}:null,intent:active?{tag:job.intentTag,id:job.id||actionForTag(job.intentTag)}:null,phase:phase,radius:ACTION_RADIUS,reach:C.interactionReach,ownsContext:!!(rendered&&rendered.ownsContext)};
    canvas.style.cursor=gesture&&gesture.moved?"grabbing":hover&&actionForTag(hover)?"pointer":"grab";
    P.end();
  }
  function frame(now){requestAnimationFrame(frame);if(document.hidden){last=now;return;}if(coarsePointer&&now-lastFrame<30)return;if(lastFrame>0)intervalSamples[sampleCursor]=now-lastFrame;lastFrame=now;var dt=Math.max(0,Math.min(.05,(now-last)/1000));last=now;var start=performance.now(),moving=update(dt);render(moving);var cost=performance.now()-start;cpuSamples[sampleCursor]=cost;sampleCursor=(sampleCursor+1)%120;perfFrames++;perfTotal+=cost;
    if(now-perfStart>=1000){perf={fps:perfFrames*1000/(now-perfStart),renderMs:perfTotal/perfFrames,sampleMs:now-perfStart,frames:perfFrames};perfStart=now;perfFrames=0;perfTotal=0;if(!$("performance-panel").hidden)$("performance-panel").textContent=Math.round(perf.fps)+" FPS · Кадр "+perf.renderMs.toFixed(1)+" мс\n"+(quality==="lighter"?"Легче":"Стандарт")+" · DPR "+P.pixelRatio+"\nТолько это устройство; не замер GPU";}
  }
  function resetPerformance(){perfStart=performance.now();perfFrames=0;perfTotal=0;cpuSamples=[];intervalSamples=[];sampleCursor=0;lastFrame=0;perf={fps:null,renderMs:null,sampleMs:0,frames:0};}
  function percentile(samples,q){if(!samples.length)return null;var sorted=samples.slice().sort(function(a,b){return a-b;});return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))];}
  function resize(){P.resize(canvas.clientWidth,canvas.clientHeight);}
  new ResizeObserver(resize).observe(canvas);
  new ResizeObserver(function(entries){bottomHeight=entries[0].contentRect.height;$('game').style.setProperty('--status-height',bottomHeight+'px');}).observe($('bottom-ui'));
  if(globalThis.visualViewport)visualViewport.addEventListener('resize',resize);
  function local(e){var r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function closeMenu(){if(uiModes.is("menu"))uiModes.back("menu-close");view.syncMode();view.invalidate();}
  function cameraGesture(){overview=false;$("overview").setAttribute("aria-pressed","false");}
  function rotate(dx,dy){if(kit.mode==="binoculars"){var fineAim=1/Math.max(1,optics.zoom);optics.yaw-=dx*.0035*fineAim;optics.pitch=Math.max(-.15,Math.min(.55,optics.pitch+dy*.003*fineAim));return;}manualCamera=true;cameraGesture();yaw-=dx*.006;pitch=Math.max(C.camera.pitchMin,Math.min(C.camera.pitchMax,pitch+dy*.004));}
  canvas.addEventListener("pointerdown",function(e){if(lastActionTap&&performance.now()-lastActionTap.at<350&&Math.hypot(e.clientX-lastActionTap.x,e.clientY-lastActionTap.y)<56){e.preventDefault();return;}if(uiModes.is("gallery")){e.preventDefault();canvas.focus({preventScroll:true});return;}if(uiModes.blocksWorld()||uiModes.recentlyClosed()){e.preventDefault();if(uiModes.blocksWorld()&&!uiModes.snapshot().pending)uiModes.back("outside");return;}if(benchEnabled&&job&&job.id==="saw"&&benchState.confirmPoint&&performance.now()-benchState.confirmedAt<350&&Math.hypot(e.clientX-benchState.confirmPoint.x,e.clientY-benchState.confirmPoint.y)<56){e.preventDefault();return;}unlock();closeMenu();if(kit.bagOpen)closeTools(false);canvas.focus({preventScroll:true});var p=local(e);touches.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);gesture={id:e.pointerId,start:p,last:p,moved:e.button===2||e.button===1};
    if(touches.size>=2){gesture.moved=true;if(touches.size===2){var arr=Array.from(touches.values());pinch={length:Math.hypot(arr[0].x-arr[1].x,arr[0].y-arr[1].y),distance:kit.mode==="binoculars"?kit.zoom:overview?camera.distance:distance,last:{x:(arr[0].x+arr[1].x)/2,y:(arr[0].y+arr[1].y)/2}};}else pinch=null;}
  });
  canvas.addEventListener("pointermove",function(e){if(uiModes.blocksWorld())return;var p=local(e);pointer=p;
    if(touches.has(e.pointerId)){touches.set(e.pointerId,p);if(touches.size===2&&pinch){var v=Array.from(touches.values()),n=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y),centre={x:(v[0].x+v[1].x)/2,y:(v[0].y+v[1].y)/2};if(kit.mode==="binoculars"){kit.zoom=Math.max(1,Math.min(7,pinch.distance*n/Math.max(10,pinch.length)));renderGear();}else distance=Math.max(C.camera.min,Math.min(C.camera.max,pinch.distance*pinch.length/Math.max(10,n)));rotate(centre.x-pinch.last.x,centre.y-pinch.last.y);pinch.last=centre;if(gesture)gesture.moved=true;}
      else if(gesture&&e.pointerId===gesture.id){var dx=p.x-gesture.last.x,dy=p.y-gesture.last.y;if(Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>8)gesture.moved=true;if(gesture.moved)rotate(dx,dy);gesture.last=p;}
    }else hover=P.pick(p.x,p.y);
  });
  canvas.addEventListener("pointerup",function(e){var p=local(e),tap=gesture&&gesture.id===e.pointerId&&!gesture.moved&&!pinch;touches.delete(e.pointerId);if(touches.size<2)pinch=null;
    if(tap&&!uiModes.blocksWorld()&&!uiModes.recentlyClosed()&&kit.mode!=="binoculars"){var tag=P.pick(p.x,p.y);if(tag&&tag!=="ground")approach(tag);else {var g=P.ground(p.x,p.y,M.height);if(g){selectedTag=null;walk(g,null);}}}
    if(!touches.size)gesture=null;
  });
  canvas.addEventListener("pointercancel",function(e){touches.delete(e.pointerId);gesture=null;pinch=null;});
  canvas.addEventListener("pointerleave",function(){if(!gesture)hover=null;});
  canvas.addEventListener("contextmenu",function(e){e.preventDefault();});
  canvas.addEventListener("wheel",function(e){e.preventDefault();if(uiModes.blocksWorld()||uiModes.recentlyClosed())return;var d=e.deltaY*(e.deltaMode===1?16:1);if(kit.mode==="binoculars"){kit.zoom=Math.max(1,Math.min(7,kit.zoom*Math.exp(-d*.0018)));renderGear();return;}if(overview)distance=Math.min(C.camera.max,camera.distance);manualCamera=true;cameraGesture();distance=Math.max(C.camera.min,Math.min(C.camera.max,distance*Math.exp(d*.0018)));if(e.deltaX)yaw-=e.deltaX*.003;},{passive:false});
  function toggleOverview(){if(gallerySession)uiModes.reset("gallery-overview");closeTools(false);overview=!overview;$("overview").setAttribute("aria-pressed",String(overview));}
  function actionMessage(message,tag,kind){actionFeedback={text:message,tag:tag,kind:kind||"reason",until:clock+4.2,action:navAction(tag)||{id:actionForTag(tag)||"unavailable",type:"collect",label:"Действие недоступно",available:false},worldPoint:targetPoint(tag)||[state.avatar.x,M.height(state.avatar.x,state.avatar.z)+1.5,state.avatar.z]};view.clearNotice();}
  function actionRoute(a){return Math.hypot(state.avatar.x-a.x,state.avatar.z-a.z)<.001?[]:M.path(state,state.avatar,a);}
  function actionVisible(a){var p=P.project([a.faceX,M.height(a.faceX,a.faceZ)+1.5,a.faceZ]);return p&&p.x>-36&&p.x<canvas.clientWidth+36&&p.y>0&&p.y<canvas.clientHeight;}
  function contextAction(force){
    if(!uiModes.is("walk")||uiModes.snapshot().pending||uiModes.recentlyClosed()||kit.bagOpen||kit.mode==="binoculars"||keys.size||shedOpen||!$("menu").hidden||document.querySelector("dialog[open]"))return null;
    if(sitting)return {tag:"seat",action:{id:"rest",x:C.seat.x,z:C.seat.z,type:"stand",available:true,label:"Встать со скамьи",object:"Отдых у моря",resultPreview:"Можно продолжить прогулку.",progress:0}};
    if(job&&job.intentTag){var running=navAction(job.intentTag);if(running)running.label=running.label.replace(/^Продолжить: /,"");return running?{tag:job.intentTag,action:running}:null;}
    var cacheKey=selectedTag+"|"+revision+"|"+Math.round(state.avatar.x*4)+"|"+Math.round(state.avatar.z*4);
    if(!force&&actionCache&&actionCache.key===cacheKey&&clock<actionCache.until)return actionCache.value;
    var found=CloseActionIntent.select({avatar:state.avatar,tags:allTags().filter(function(t){return t!=="workshop";}),selectedTag:selectedTag,describe:navAction,pathTo:actionRoute,clear:function(a,b){return M.clear(state,a,b);},reach:C.interactionReach,radius:ACTION_RADIUS,project:actionVisible});
    actionCache={key:cacheKey,until:clock+.18,value:found};return found;
  }
  function requestWorldAction(tag){
    if(saveBlocked||!uiModes.is("walk")||uiModes.snapshot().pending||uiModes.recentlyClosed()||kit.mode==="binoculars"||gallerySession)return;
    if(sitting&&tag==="seat"){setResting(false);refresh();return;}
    var a=navAction(tag);if(!a){actionMessage("Это дело уже завершено. Выбери следующее действие.",tag);return;}
    if(Math.hypot(state.avatar.x-a.x,state.avatar.z-a.z)>ACTION_RADIUS+.01){actionMessage("Подойди ближе к месту работы.",tag);return;}
    if(job&&job.arrivalTag===tag)return;
    var plan=CloseActionIntent.plan({tag:tag,activeJob:job,describe:navAction,pathTo:actionRoute,avatar:state.avatar,clear:function(a,b){return M.clear(state,a,b);},reach:C.interactionReach});
    if(plan.status==="duplicate")return;
    selectedTag=tag;actionCache=null;
    if(plan.status!=="ready"){actionMessage(plan.reason,tag);return;}
    unlock();clearNotice();
    var alreadyNear=Math.hypot(state.avatar.x-plan.action.x,state.avatar.z-plan.action.z)<=C.interactionReach&&M.clear(state,state.avatar,plan.action);
    if(plan.action.type==="rest"){if(alreadyNear){if(job)pause(true);setResting(true);refresh();return;}walk(plan.action,null,"seat",plan.path);if(job)job.intentTag=tag;return;}
    if(plan.action.type==="view"||plan.action.type==="shed"){if(alreadyNear){if(job)pause(true);if(plan.action.type==="view")enterGallery();else openShed();return;}walk(plan.action,null,tag,plan.path);if(job)job.intentTag=tag;return;}
    // The explicit icon is the confirmation. An ordinary object tap still only
    // approaches; shed upgrades remain explicit panel commands as before.
    walk(plan.action,plan.action,null,plan.path);if(job)job.intentTag=tag;
    if(tag==="bench"){benchState.reason="";benchState.result="";}
  }
  function updateContext(nearby){
    // World commands own their compact glyph/feedback; no duplicate white card.
    view.context({visible:false,title:"",detail:"",action:null,tag:null,job:!!job,working:!!(job&&job.working)});
    var main=nearby&&nearby.tag,alternate=!state.lit&&!job&&uiModes.is("walk")&&["lighthouse","gallery"].indexOf(main)>=0;
    $("gallery-select").hidden=!alternate;$("gallery-select").dataset.icon=main==="gallery"?"light":"gallery";
    $("gallery-select").setAttribute("aria-label",main==="gallery"?"Выбрать огонь маяка":"Выбрать смотровую галерею маяка");
    $("gallery-select").title=$("gallery-select").getAttribute("aria-label");
  }
  function shedCommand(id){
    if(saveBlocked||job||!shedOpen||$("shed-panel").hidden||!nearShed())return;
    var a=id?M.info(state,id):null;if(!a||!a.available){notify(U.action(state,id||"store:logs").reason);return;}
    selectedTag=id==="shed:upgrade"?id:"shed:"+id.split(":")[1];keys.clear();unlock();walk(a,a);shedOpen=uiModes.is("shed");
  }
  function updateShedPanel(){
    if(!uiModes.is("shed")){shedOpen=false;view.panel(false);return;}
    if(saveBlocked||!job&&!nearShed()){uiModes.reset("shed-unavailable");view.panel(false);return;}
    shedOpen=true;view.panel(true,"shed");
    var caps=M.capacity(state),store=state.carry.kind?"store:"+state.carry.kind:null,busy=!!job,partial=state.carry.kind==="boards"&&state.carry.amount<C.carryLimit.boards;
    $("shed-panel").dataset.carry=partial?"partial":state.carry.amount?"loaded":"empty";
    $("shed-logs").textContent=state.logs+" из "+caps.logs;$("shed-boards").textContent=state.boards+" из "+caps.boards;$("shed-carry").textContent=cargoText();
    var preferred=store?"shed-store":U.action(state,"take:boards").available?"shed-take-boards":"shed-take-logs";
    [["shed-store",store],["shed-take-logs","take:logs"],["shed-take-boards","take:boards"],["shed-upgrade","shed:upgrade"]].forEach(function(pair){
      var button=$(pair[0]),description=pair[1]?U.action(state,pair[1]):null,reason=$(pair[0]+"-reason");
      view.command(button,description,{label:$(pair[0]+"-label"),reason:reason,busy:busy,active:!!job&&job.id===pair[1],describedBy:pair[0]==="shed-upgrade"?"shed-upgrade-cost shed-upgrade-capacity shed-upgrade-reason"+(busy?" shed-feedback":""):null,emptyLabel:"Сложить материалы",emptyReason:U.action(state,"store:logs").reason});
      reason.hidden=pair[0]!=="shed-upgrade"||uiModes.snapshot().detail!=="shed-details"||!reason.textContent;
      button.classList.toggle("primary",!busy&&!!description&&description.available&&(pair[0]===preferred||pair[0]==="shed-upgrade"));
      button.setAttribute("data-action-id",pair[1]||"");
      if(busy&&job.id===pair[1])button.dataset.state="busy";
    });
    $("shed-take-logs").hidden=partial;
    var upgrade=U.action(state,"shed:upgrade");$("shed-upgrade-cost").hidden=upgrade.done;$("shed-upgrade-cost").textContent=upgrade.cost;$("shed-upgrade-capacity").textContent=upgrade.done?"Вместимость: брёвна "+caps.logs+", доски "+caps.boards:upgrade.capacityPreview;
    var feedback=$("shed-feedback"),result=resultView&&clock-resultView.at<4&&["store","take","upgrade"].indexOf(resultView.type)>=0,notice=panelNotice&&clock-panelNotice.at<6,wasBusy=$("shed-panel").dataset.state==="busy";
    feedback.hidden=!busy&&!result&&!notice;$("shed-panel").dataset.state=busy?"busy":result?"result":"normal";
    if(busy)view.feedback(feedback,(job.working?"Работа: ":"Подходим: ")+U.action(state,job.id).label,"busy");
    else if(notice)view.feedback(feedback,panelNotice.text,"disabled");
    else if(result){var message=resultView.type==="upgrade"?U.result(state,resultView.id,resultView.type,resultView.amount):(resultView.type==="store"?"Сложено: ":"Взято: ")+U.material(resultView.amount,String(resultView.id).split(":")[1])+".";view.feedback(feedback,message,"result");}
    $("shed-pause").hidden=!(job&&job.working);$("shed-pause").textContent="Пауза";$("shed-pause").setAttribute("aria-label","Приостановить работу");
    if(busy&&!wasBusy||!busy&&wasBusy){$("shed-scroll").scrollTop=0;if(view.keyboard())$((job&&job.working)?"shed-pause":"shed-close").focus({preventScroll:true});}
  }
  function closeShed(){pause(true);panelNotice=null;uiModes.reset("shed-close");view.syncMode();canvas.focus({preventScroll:true});}
  $("shed-close").addEventListener("click",closeShed);
  ["shed-store","shed-take-logs","shed-take-boards","shed-upgrade"].forEach(function(id){$(id).addEventListener("click",function(){if(job){notify("Идёт действие. Можно дождаться результата или приостановить работу.");return;}shedCommand(this.getAttribute("data-action-id"));});});
  function pauseFromUI(){var working=job&&job.working;pause(false);keys.clear();refresh();if(working){if(shedOpen)notify("Работа приостановлена. Выбери ту же команду, чтобы продолжить.");else actionMessage("Работа приостановлена. Нажми значок, чтобы продолжить.",selectedTag);}}
  $("pause-work").addEventListener("click",pauseFromUI);$("shed-pause").addEventListener("click",pauseFromUI);
  $("context-command").addEventListener("click",function(){if(this.hidden)return;nearest();if(!shedOpen)canvas.focus({preventScroll:true});});
  function nearest(){
    if(job&&job.working){pauseFromUI();return;}
    var shown=!$("act").hidden&&$("act").getAttribute("data-action");if(shown){requestWorldAction(shown);return;}var nearby=contextAction(true);if(nearby)requestWorldAction(nearby.tag);
  }
  $("act").addEventListener("click",function(e){e.stopPropagation();if(this.hidden)return;var id=this.getAttribute("data-action-id");if(e.detail>0){if(lastActionTap&&performance.now()-lastActionTap.at<350&&Math.hypot(e.clientX-lastActionTap.x,e.clientY-lastActionTap.y)<56&&lastActionTap.id!==id)return;lastActionTap={at:performance.now(),x:e.clientX,y:e.clientY,id:id};}requestWorldAction(this.getAttribute("data-action"));});
  $("action-pause").addEventListener("click",function(e){e.stopPropagation();pauseFromUI();canvas.focus({preventScroll:true});});
  document.addEventListener("keydown",function(e){
    if(document.querySelector("dialog[open]"))return;
    if(e.code==="Escape"&&!uiModes.is("walk")){e.preventDefault();if(!e.repeat)uiModes.back("escape");return;}
    if(e.code==="KeyB"&&!e.repeat){e.preventDefault();openBag();return;}
    if(uiModes.is("gallery")&&e.code==="KeyE"){e.preventDefault();if(!e.repeat)useTool("binoculars");return;}
    if(uiModes.blocksWorld()){if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyW","KeyA","KeyS","KeyD","KeyE","KeyM","KeyF"].indexOf(e.code)>=0)e.preventDefault();return;}
    if(kit.mode==="binoculars"){
      if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyW","KeyA","KeyS","KeyD"].indexOf(e.code)>=0){e.preventDefault();if(!e.repeat||keys.has(e.code))keys.add(e.code);return;}
      if(e.code==="Home"){e.preventDefault();changeZoom(1-kit.zoom);return;}if(e.code==="End"){e.preventDefault();changeZoom(7-kit.zoom);return;}
      if(e.code==="Equal"||e.code==="NumpadAdd"){e.preventDefault();changeZoom(.5);}else if(e.code==="Minus"||e.code==="NumpadSubtract"){e.preventDefault();changeZoom(-.5);}return;
    }
    if(kit.mode==="lantern"&&e.code==="Escape"){closeTools();e.preventDefault();return;}
    if(e.target.closest&&e.target.closest("button")&&e.code!=="Escape"&&!(e.code==="KeyE"&&e.target.closest("#act")))return;
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyW","KeyA","KeyS","KeyD"].indexOf(e.code)>=0){e.preventDefault();if(!e.repeat||keys.has(e.code)){keys.add(e.code);unlock();}}
    if(e.code==="KeyE"&&!e.repeat)nearest();if(e.code==="KeyM"&&!e.repeat)toggleOverview();if(e.code==="KeyF"&&!e.repeat)resetCamera();if(e.code==="Escape"){pause(false);sitting=false;if(benchEnabled&&selectedTag==="bench")dismissBench();refresh();}
  });
  document.addEventListener("keyup",function(e){if(keys.delete(e.code)&&keys.size===0&&kit.mode!=="binoculars"){persist();refresh();}});
  globalThis.addEventListener("blur",function(){keys.clear();});
  function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement;}
  function fullscreenSync(){var active=!!fullscreenElement(),button=$("fullscreen");button.setAttribute("aria-pressed",String(active));button.setAttribute("aria-label",active?"Выйти из полного экрана":"На весь экран");button.title=active?"Выйти из полного экрана":"На весь экран";$("fullscreen-path").setAttribute("d",active?"M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3":"M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5");resize();}
  function fullscreenFallback(text){view.fullscreen(text+" Игра занимает доступный экран; панели браузера могут остаться.");fullscreenSync();}
  $("fullscreen").addEventListener("click",async function(){
    if(fullscreenPending)return;fullscreenPending=true;
    var button=this,root=document.documentElement,active=!!fullscreenElement(),request=root.requestFullscreen||root.webkitRequestFullscreen,exit=document.exitFullscreen||document.webkitExitFullscreen;
    closeMenu();button.setAttribute("aria-busy","true");
    try{
      if(active){if(!exit)throw new Error("exit unavailable");await exit.call(document);}
      else if(!request||document.fullscreenEnabled===false||document.webkitFullscreenEnabled===false){fullscreenFallback("Браузер или просмотрщик не разрешает полный экран.");return;}
      else {view.fullscreen("Открываю полный экран…");await request.call(root);}
      fullscreenSync();
    }catch(e){if(!active&&fullscreenElement())fullscreenChanged();else fullscreenFallback(active?"Не удалось выйти из полного экрана. Используй системную кнопку выхода.":"Полный экран не включился. Можно открыть ссылку в отдельной вкладке.");}
    finally{fullscreenPending=false;button.removeAttribute("aria-busy");}
  });
  function fullscreenChanged(){fullscreenSync();view.fullscreen(fullscreenElement()?"Полный экран. Выход — та же кнопка или Escape.":"Полный экран закрыт. Игра занимает доступную область.");}
  document.addEventListener("fullscreenchange",fullscreenChanged);document.addEventListener("webkitfullscreenchange",fullscreenChanged);
  document.addEventListener("fullscreenerror",function(){if(fullscreenElement())fullscreenChanged();else fullscreenFallback("Браузер отклонил полный экран.");});fullscreenSync();
  $("overview").addEventListener("click",function(){toggleOverview();closeMenu();canvas.focus({preventScroll:true});});
  function resetCamera(){if(gallerySession)uiModes.reset("gallery-reset-camera");closeTools(false);manualCamera=false;resultView=null;cameraGesture();yaw=C.camera.yaw;pitch=C.camera.pitch;distance=C.camera.distance;}
  $("focus").addEventListener("click",function(){resetCamera();closeMenu();canvas.focus({preventScroll:true});});
  function toggleMenu(){updateInspectionControl();if(uiModes.snapshot().pending)return;if(uiModes.is("menu")){uiModes.back("menu-toggle");return;}closeTools(false,true);pause(true);clearUIInput();uiModes.open("menu");view.invalidate();}
  // Some touch/fullscreen paths deliver pointerup without the compatibility
  // click. Activate a short in-bounds touch once; keep native keyboard/mouse.
  var menuTouch=null,menuTouchClickUntil=0,menuTouchClickPoint=null;
  // Opening the landscape menu moves its close button under the same finger.
  // Consume that compatibility click even when its target has changed. A fresh
  // pointerdown starts a new intentional gesture and remains immediately usable.
  document.addEventListener("pointerdown",function(){menuTouchClickUntil=0;},{capture:true,passive:true});
  document.addEventListener("click",function(e){if(e.detail>0&&menuTouchClickPoint&&performance.now()<menuTouchClickUntil&&Math.hypot(e.clientX-menuTouchClickPoint.x,e.clientY-menuTouchClickPoint.y)<12){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
  $("more").addEventListener("pointerdown",function(e){
    if(e.pointerType!=="touch"){menuTouch=null;menuTouchClickUntil=0;return;}
    menuTouch=e.isPrimary?{id:e.pointerId,x:e.clientX,y:e.clientY,moved:false}:null;
  });
  $("more").addEventListener("pointermove",function(e){if(menuTouch&&menuTouch.id===e.pointerId&&Math.hypot(e.clientX-menuTouch.x,e.clientY-menuTouch.y)>8)menuTouch.moved=true;});
  $("more").addEventListener("pointercancel",function(){menuTouch=null;});
  $("more").addEventListener("pointerup",function(e){
    var tap=menuTouch;menuTouch=null;if(!tap||tap.id!==e.pointerId||tap.moved)return;
    var box=this.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)return;
    menuTouchClickPoint={x:e.clientX,y:e.clientY};menuTouchClickUntil=performance.now()+750;e.preventDefault();view.root.dataset.input="touch";view.invalidate();toggleMenu();
  });
  $("more").addEventListener("click",function(e){if(e&&e.detail>0&&performance.now()<menuTouchClickUntil)return;toggleMenu();});
  $("sound").addEventListener("click",function(){muted=!muted;this.setAttribute("aria-pressed",String(muted));this.setAttribute("aria-label",muted?"Включить звук":"Выключить звук");this.textContent=muted?"Звук выкл.":"Звук вкл.";if(!muted)unlock();else audioVisibility();});
  $("motion").addEventListener("click",function(){motionOverride=!reducedMotion;applyPresentation();persistPresentation();});
  $("quality").addEventListener("click",function(){quality=quality==="standard"?"lighter":"standard";applyPresentation();resize();persistPresentation();resetPerformance();});
  $("lighting-view").addEventListener("click",function(){inspectionLighting=inspectionView()==="night"?"day":"night";updateInspectionControl();persistPresentation();view.invalidate();});
  $("performance-toggle").addEventListener("click",function(){var show=$("performance-panel").hidden;$("performance-panel").hidden=!show;this.setAttribute("aria-pressed",String(show));this.textContent=show?"Скрыть плавность":"Показать плавность";if(show)$("performance-panel").textContent="Измеряю FPS и время кадра…";});
  $("help").addEventListener("click",function(){uiModes.open("help",{returnTo:"menu"});});
  $("help-close").addEventListener("click",function(){uiModes.back("help-close");});
  $("restart").addEventListener("click",function(){uiModes.open("confirm",{returnTo:"menu"});});
  $("restart-cancel").addEventListener("click",function(){uiModes.back("restart-cancel");});
  ["help-dialog","restart-dialog"].forEach(function(id){$(id).addEventListener("cancel",function(e){e.preventDefault();uiModes.back("dialog-cancel");});});
  $("menu-close").addEventListener("click",function(){uiModes.back("menu-close");});
  [["shed-details-toggle","shed-details"],["binocular-places-toggle","places"],["bag-places-toggle","bag-places"]].forEach(function(pair){$(pair[0]).addEventListener("click",function(){if(uiModes.snapshot().detail===pair[1])uiModes.back("detail-toggle");else uiModes.openDetail(pair[1]);});});
  ["shed-details-back","binocular-places-back","bag-places-back"].forEach(function(id){$(id).addEventListener("click",function(){uiModes.back("detail-back");});});
  $("restart-confirm").addEventListener("click",function(){finishGallery();saveBlocked=false;state=M.create();shedOpen=false;job=null;hover=null;selectedTag=null;sitting=false;sitBlend=0;visited.clear();camera.x=state.avatar.x;camera.z=state.avatar.z;resetCamera();persist();refresh();uiModes.reset("restart-confirm");});
  globalThis.addEventListener("openai:set_globals",function(e){
    var incoming=e.detail&&e.detail.globals&&e.detail.globals.widgetState;if(!incoming||typeof incoming!=="object")return;
    hostEnvelope=Object.assign({},hostEnvelope,incoming);
    var present=Object.prototype.hasOwnProperty.call(incoming,SLOT),imported=!present&&!hasInitial&&!saveBlocked&&incoming.closeIsland!=null;
    if(!present&&!imported)return;var s=M.restore(present?incoming[SLOT]:incoming.closeIsland);if(!s){unreadableSave();pause(true);return;}
    var a=s.sync||{revision:0,writer:""},b=state.sync||{revision:revision,writer:""};
    if(a.revision<revision||(hasInitial&&a.revision===revision&&a.writer<=b.writer))return;
    closeTools(false);uiModes.reset("host-state");job=null;selectedTag=null;hover=null;shedOpen=false;sitting=false;sitBlend=0;keys.clear();closeMenu();document.querySelectorAll("dialog[open]").forEach(function(d){d.close();});state=s;revision=a.revision;hasInitial=true;saveBlocked=false;if(widget())saveMemoryOnly=false;if(imported)persist();refresh();
  });
  document.addEventListener("visibilitychange",function(){if(document.hidden&&hasInitial)persist();audioVisibility();last=performance.now();resetPerformance();});
  $("bench-select").addEventListener("pointerdown",function(e){
    if(!e.isPrimary||e.button!==0)return;
    var point=local(e);benchPointer={id:e.pointerId,x:e.clientX,y:e.clientY,tag:P.pick(point.x,point.y),moved:false};benchPointerClickUntil=0;
    // Prevent focus from inserting a prompt between down/up and retargeting
    // the compatibility click to its common ancestor instead of this button.
    e.preventDefault();this.setPointerCapture(e.pointerId);
  });
  $("bench-select").addEventListener("pointermove",function(e){if(benchPointer&&benchPointer.id===e.pointerId&&Math.hypot(e.clientX-benchPointer.x,e.clientY-benchPointer.y)>8)benchPointer.moved=true;});
  $("bench-select").addEventListener("pointercancel",function(){benchPointer=null;benchPointerClickUntil=performance.now()+750;});
  $("bench-select").addEventListener("pointerup",function(e){
    var tap=benchPointer;benchPointer=null;if(!tap||tap.id!==e.pointerId)return;
    benchPointerClickUntil=performance.now()+750;e.preventDefault();
    var box=this.getBoundingClientRect();if(tap.moved||e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)return;
    view.root.dataset.input=e.pointerType==="touch"||e.pointerType==="pen"?"touch":"mouse";view.invalidate();
    selectBench({detail:1,clientX:e.clientX,clientY:e.clientY,worldTag:tap.tag});
  });
  $("bench-select").addEventListener("click",function(e){if(e.detail>0&&performance.now()<benchPointerClickUntil)return;selectBench(e);});$("bench-confirm").addEventListener("click",confirmBench);$("bench-pause").addEventListener("click",function(e){if(e.detail>0&&(e.detail>1||performance.now()-benchState.confirmedAt<350))return;pauseFromUI();renderBench(contextAction());});$("bench-dismiss").addEventListener("click",dismissBench);
  $("bench-select").addEventListener("focus",function(){benchState.focused=true;renderBench(contextAction());});$("bench-select").addEventListener("blur",function(){benchState.focused=false;});
  $("gallery-select").addEventListener("click",function(){if(this.hidden||job||!uiModes.is("walk"))return;var main=actionSnapshot.candidate&&actionSnapshot.candidate.tag||selectedTag;approach(main==="gallery"?"lighthouse":"gallery");canvas.focus({preventScroll:true});});
  $("gallery-exit").addEventListener("click",function(){if(!uiModes.is("gallery")||uiModes.recentlyClosed())return;uiModes.back("gallery-exit");});
  $("gallery-binoculars").addEventListener("click",function(){if(uiModes.is("gallery"))useTool("binoculars");});
  $("bag").addEventListener("click",openBag);$("bag-close").addEventListener("click",function(){closeTools();});
  $("gear-lantern").addEventListener("click",function(){unlock();useTool("lantern");});$("gear-binoculars").addEventListener("click",function(){useTool("binoculars");});
  $("tool-close").addEventListener("click",function(){closeTools();});$("binocular-minus").addEventListener("click",function(){changeZoom(-.5);});$("binocular-plus").addEventListener("click",function(){changeZoom(.5);});
  $("coast-previous").addEventListener("click",function(){shiftPoint(-1);});$("coast-next").addEventListener("click",function(){shiftPoint(1);});
  ["bag-places","binocular-points"].forEach(function(id){$(id).addEventListener("click",function(e){var b=e.target.closest("button[data-coast-point]");if(!b||!this.contains(b))return;if(b.dataset.coastAction==="walk")walkCoast(b.dataset.coastPoint);else if(kit.mode==="binoculars")aimPoint(b.dataset.coastPoint);});});
  globalThis.CloseDemo={
    uiMode:function(){return uiModes.snapshot();},
    renderer:function(){return P.diagnostics();},
    gear:function(){return JSON.parse(JSON.stringify({bagOpen:kit.bagOpen,mode:kit.mode,zoom:optics.zoom,zoomTarget:kit.zoom,point:kit.point,observation:kit.mode==="binoculars"?optics:null,savedNormal:savedNormal}));},
    coast:function(){return CloseCoast.snapshot(coast);},
    gallery:function(){return {active:!!gallerySession,repaired:!!state.galleryRepaired,session:gallerySession?JSON.parse(JSON.stringify(gallerySession)):null};},
    bench:function(){return {enabled:benchEnabled,variant:benchEnabled?"world":"classic",selected:selectedTag==="bench",near:nearBench(),busy:!!job&&job.id==="saw",working:!!job&&job.id==="saw"&&job.working,reason:clock<benchState.reasonUntil?benchState.reason:"",result:clock<benchState.resultUntil?benchState.result:"",hitRect:benchHit?Object.assign({},benchHit):null};},
    performance:function(){var stats=P.stats||{};return {renderer:P.mode,quality:quality,fps:perf.fps,renderMs:perf.renderMs,renderP50Ms:percentile(cpuSamples,.5),renderP95Ms:percentile(cpuSamples,.95),intervalP50Ms:percentile(intervalSamples,.5),intervalP95Ms:percentile(intervalSamples,.95),sampleMs:perf.sampleMs,frames:perf.frames,dpr:P.pixelRatio,width:canvas.clientWidth,height:canvas.clientHeight,faces:stats.faces===undefined?null:stats.faces,generatedFaces:stats.generatedFaces===undefined?null:stats.generatedFaces,triangles:stats.triangles===undefined?null:stats.triangles,drawCalls:stats.drawCalls===undefined?null:stats.drawCalls};},
    environment:function(){return {lighting:{preference:inspectionLighting,view:inspectionView(),displayNight:P.night,displayDaylight:P.daylight,gameNight:night,beaconLit:state.lit},time:islandTime,wind:{x:wind.x,z:wind.z,strength:wind.strength},seaPhase:(islandTime*.12)%1,reducedMotion:reducedMotion,motionPreference:motionOverride===null?"system":"user",audio:{initialized:!!audio,state:audio?audio.state:"uninitialized",muted:muted,wind:ambientLevels.wind,leaves:ambientLevels.leaves,surf:ambientLevels.surf,contextsCreated:audioContexts}};},
    getState:function(){return JSON.parse(JSON.stringify(state));},
    actions:function(){return JSON.parse(JSON.stringify(actionSnapshot));},
    getJob:function(){return job?{id:job.id,working:job.working,remainingPath:job.path.length,arrivalTag:job.arrivalTag||null,progress:job.working?job.elapsed/job.action.seconds:0}:null;},
    project:function(p){return P.project(p);},
    isResting:function(){return sitting;},
    targetPoints:function(){var out={};allTags().forEach(function(tag){out[tag]=P.project(targetPoint(tag));});return out;},
    interface:function(){return {input:view.root.dataset.input,panel:view.root.dataset.panel,scene:view.layout(),saveError:!!view.errorKey,saveErrorRead:view.errorRead};},
    camera:function(){var p=actorPosition(),h=M.height(p.x,p.z),a=P.project([p.x,h,p.z]),b=P.project([p.x,h+1.8,p.z]);return {distance:camera.distance,yaw:camera.yaw,pitch:camera.pitch,targetDistance:distance,targetYaw:yaw,targetPitch:pitch,overview:overview,manual:manualCamera,framing:job&&job.working?"work":resultView&&clock-resultView.at<3?"result":job&&job.path.length?"walk":"idle",keeperPixels:a&&b?Math.abs(a.y-b.y):0,renderer:P.mode,faces:P.stats?P.stats.faces:0};}
  };
  function allTags(){return state.trees.map(function(t){return (t.felled?"logs:":"tree:")+t.id;}).concat(state.shore.filter(function(d){return !d.collected;}).map(function(d){return "drift:"+d.id;}),["bench","workshop","step","stairs","seat","lighthouse","gallery","shed:logs","shed:boards","shed:upgrade"]);}
  resize();P.camera(camera,camera.distance,camera.yaw,C.camera.pitch);refresh();requestAnimationFrame(frame);
})();
