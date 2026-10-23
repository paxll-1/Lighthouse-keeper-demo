(function(){
  "use strict";
  var U=CloseUI,view=new CloseInterface(),M=CloseModel,C=M.config,$=function(id){return document.getElementById(id);},canvas=$("world"),P=new CloseRenderer(canvas);
  var state=M.create(),job=null,hover=null,selectedTag=null,pointer={x:0,y:0},last=performance.now(),clock=0,walkPhase=0,stepSound=0,workSound=-1;
  var camera={x:C.start.x,y:.8,z:C.start.z,distance:C.camera.distance,yaw:C.camera.yaw,pitch:C.camera.pitch},distance=C.camera.distance,yaw=C.camera.yaw,pitch=C.camera.pitch,overview=false;
  var keys=new Set(),touches=new Map(),gesture=null,pinch=null,night=0,toastTimer,saveTimer=0;
  var revision=0,hasInitial=false,writer=Date.now().toString(36)+"-"+Math.random().toString(36).slice(2),KEY="lighthouse.close-work.storage.v1",LEGACY_KEY="lighthouse.close-work.v1",SLOT="closeIslandStorage",saveGood=true;
  var audio=null,master=null,ambient=null,windFilter=null,muted=false,lastSaved=0,audioAttempted=false,audioContexts=0,audioTick=-1,ambientGains=null,ambientLevels={wind:0,leaves:0,surf:0};
  var sitting=false,sitBlend=0,visited=new Set(),placeTimer=0,saveBlocked=false,saveMemoryOnly=false,shedOpen=false,shedRevealAt=0,panelNotice=null;
  var hostEnvelope=Object.assign({},globalThis.openai&&globalThis.openai.widgetState||{});
  var motionPreference=matchMedia("(prefers-reduced-motion: reduce)"),reducedMotion=motionPreference.matches,manualCamera=false,resultView=null,contextKey="",lastFrame=0,bottomHeight=110,coarsePointer=matchMedia("(pointer:coarse)").matches,fullscreenPending=false;
  var PRESENTATION_KEY="lighthouse.presentation.v1",motionOverride=null,quality="standard",islandTime=0,wind={x:.86,z:.5,strength:.25},perfStart=performance.now(),perfFrames=0,perfTotal=0,perf={fps:null,renderMs:null,sampleMs:0,frames:0},cpuSamples=[],intervalSamples=[],sampleCursor=0;
  try{var prefs=JSON.parse(localStorage.getItem(PRESENTATION_KEY)||"null");if(prefs&&typeof prefs==="object"){if(typeof prefs.reducedMotion==="boolean")motionOverride=prefs.reducedMotion;if(prefs.quality==="lighter")quality="lighter";}}catch(e){}
  function applyPresentation(){reducedMotion=motionOverride===null?motionPreference.matches:motionOverride;P.quality=quality;view.root.dataset.reducedMotion=String(reducedMotion);$("motion").setAttribute("aria-pressed",String(reducedMotion));$("motion").textContent="Меньше движения: "+(reducedMotion?"вкл.":"выкл.");$("quality").setAttribute("data-quality",quality);$("quality").setAttribute("aria-pressed",String(quality==="lighter"));$("quality").textContent="Качество: "+(quality==="lighter"?"легче":"стандарт");}
  function persistPresentation(){try{localStorage.setItem(PRESENTATION_KEY,JSON.stringify({reducedMotion:motionOverride,quality:quality}));}catch(e){}}
  motionPreference.addEventListener("change",function(){applyPresentation();});applyPresentation();
  function notify(text){if(shedOpen&&!$("shed-panel").hidden){if(!job)panelNotice={text:text,at:clock};updateShedPanel();}else view.notify(text,"result");}
  function clearNotice(){view.clearNotice();panelNotice=null;}
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
    return {bench:"saw",step:"repair",lighthouse:"light",stairs:"stairs",seat:"rest"}[tag]||null;
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
  function openShed(){if(saveBlocked||job||!nearShed())return;shedOpen=true;shedRevealAt=0;keys.clear();refresh();updateShedPanel();var first=["shed-store","shed-take-logs","shed-take-boards","shed-upgrade","shed-close"].find(function(id){return $(id).getAttribute("aria-disabled")!=="true";});$(first).focus({preventScroll:true});}
  function nextMaterialHint(){return U.guidance(state,{sitting:sitting}).title;}
  function pause(silent){
    if(job){if(job.working)state.progress[job.id]=Math.min(.999999,job.elapsed/job.action.seconds);job=null;persist();}
  }
  function walk(to,intent){
    if(saveBlocked)return;sitting=false;resultView=null;shedOpen=false;
    var path=Math.hypot(state.avatar.x-to.x,state.avatar.z-to.z)<.001?[]:M.path(state,state.avatar,to);if(!path){notify("Здесь не пройти. Выбери тропинку рядом.");return;}
    clearNotice();pause(true);job={id:intent?intent.id:null,action:intent,path:path,working:false,elapsed:0};overview=false;$("overview").setAttribute("aria-pressed","false");
    persist();refresh();
  }
  function approach(tag){
    if(saveBlocked)return;
    var id=actionForTag(tag),a=navAction(tag);if(!a)return;
    selectedTag=tag;
    if(job&&job.id===id&&job.working){pause(true);refresh();return;}
    walk({x:a.x,z:a.z},null);
  }
  function interact(tag){
    unlock();if(saveBlocked)return;if(shedTag(tag)){openShed();return;}var id=actionForTag(tag),a=id?M.info(state,id):null;if(!a)return;
    if(job&&job.id===id&&job.working){pause(false);refresh();return;}
    if(!a.available){notify(U.action(state,id).reason);return;}
    if(a.type==="rest"){clearNotice();pause(true);sitting=!sitting;keys.clear();if(sitting){yaw=2.05;pitch=.38;distance=11;overview=false;$("overview").setAttribute("aria-pressed","false");}refresh();return;}
    walk({x:a.x,z:a.z},a);
  }
  function refresh(){
    var caps=M.capacity(state);$("logs").textContent=state.logs+" из "+caps.logs;$("boards").textContent=state.boards+" из "+caps.boards;$("carry").textContent=cargoText();$("objective").classList.toggle("done",state.repaired);
    $("goal-title").textContent=state.lit?"Маяк светит":state.repaired?"Ступень готова":"Починить ступень";
    $("goal-next").hidden=true;
    $("day").textContent=state.lit?"Вечерний огонь":state.daylight>.6?"Тёплый вечер":state.daylight>.32?"День у моря":"Утро у моря";
  }
  function update(dt){
    clock+=dt;night+=( (state.lit?1:0)-night)*Math.min(1,dt*.8);
    if(!reducedMotion)islandTime+=dt;
    var pulse=.5-.5*Math.cos(islandTime*.48);wind.strength=.25+.55*pulse*pulse*pulse+.08*Math.sin(islandTime*1.3);placeAudio();
    sitBlend+=((sitting?1:0)-sitBlend)*Math.min(1,dt*7);
    var kx=(keys.has("ArrowRight")||keys.has("KeyD")?1:0)-(keys.has("ArrowLeft")||keys.has("KeyA")?1:0),kz=(keys.has("ArrowDown")||keys.has("KeyS")?1:0)-(keys.has("ArrowUp")||keys.has("KeyW")?1:0),moving=false;
    function moveTo(x,z){
      var travelled=Math.hypot(x-state.avatar.x,z-state.avatar.z);
      if(travelled>0){state.avatar.heading=Math.atan2(x-state.avatar.x,z-state.avatar.z);state.avatar.x=x;state.avatar.z=z;state.daylight=Math.min(.81,state.daylight+travelled*C.daylightPerMeter);walkPhase+=travelled*4;moving=true;}
    }
    if(kx||kz){
      if(saveBlocked){keys.clear();return false;}sitting=false;resultView=null;
      if(job)pause(true);
      var length=Math.hypot(kx,kz),dx=(Math.cos(yaw)*kx+Math.sin(yaw)*kz)/length*C.walkSpeed*dt,dz=(-Math.sin(yaw)*kx+Math.cos(yaw)*kz)/length*C.walkSpeed*dt;
      var x=state.avatar.x,z=state.avatar.z;
      if(M.walkable(state,x+dx,z))x+=dx;if(M.walkable(state,x,z+dz))z+=dz;moveTo(x,z);
      if(clock-lastSaved>1)persist();
    }else if(job){
      if(job.path.length){
        var next=job.path[0],dx=next.x-state.avatar.x,dz=next.z-state.avatar.z,d=Math.hypot(dx,dz),step=Math.min(d,C.walkSpeed*dt);
        if(d<.001)job.path.shift();else {var dest={x:state.avatar.x+dx/d*step,z:state.avatar.z+dz/d*step};if(M.clear(state,state.avatar,dest)){moveTo(dest.x,dest.z);if(step>=d-.001)job.path.shift();}else {var end=job.path[job.path.length-1],reroute=M.path(state,state.avatar,end);if(reroute)job.path=reroute;else {pause(true);notify("Здесь не пройти. Выбери место рядом.");}}}
      }else if(!job.action){job=null;persist();}
      else {
        if(!job.working){
          var current=M.info(state,job.id);if(!current||!current.available){notify(current?current.reason:"Дело уже закончено.");job=null;return;}
          job.action=current;job.elapsed=(state.progress[job.id]||0)*current.seconds;job.working=true;workSound=-1;
          state.avatar.heading=Math.atan2(current.faceX-state.avatar.x,current.faceZ-state.avatar.z);
        }
        job.elapsed+=dt;var cycle=Math.floor(job.elapsed*1.5);
        if(cycle!==workSound){workSound=cycle;sound(job.action.type);}
        state.progress[job.id]=Math.min(.999999,job.elapsed/job.action.seconds);
        if(clock-lastSaved>1)persist();
        if(job.elapsed>=job.action.seconds){
          var id=job.id,type=job.action.type,result=M.finish(state,id);job=null;hover=null;
          if(result.ok){state=result.state;if(type==="store"||type==="take"||type==="upgrade")shedRevealAt=clock+1.2;resultView={id:id,type:type,x:state.avatar.x,z:state.avatar.z,at:clock,amount:result.amount};sound("done");persist();refresh();if(!(shedOpen&&(type==="store"||type==="take"||type==="upgrade")))notify(resultMessage(id,type,result.amount));}else {persist();notify(result.reason);}
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
  function areaName(){var x=state.avatar.x,z=state.avatar.z;if(Math.hypot(x-5,z-9.6)<2)return "Старый причал";if(Math.hypot(x+12,z+4.6)<2.4)return "Видовая площадка";if(z>5.8&&x>1)return "Каменистый берег";if(x<-7.5&&z>-2)return "Тихая роща";return null;}
  function keeper(moving){
    var a=actorPosition(),w=job&&job.working?job:null,t=w?w.action.type:null,cycle=w?w.elapsed*1.5:0,swing=Math.sin(cycle*Math.PI*2)*(reducedMotion?.25:1),stride=moving?Math.sin(walkPhase)*(reducedMotion?.2:.5):0,seated=sitBlend>.5,carry=state.carry.amount>0&&(!w||t==="store"||t==="take"),handover=t==="store"?Math.max(0,(w.elapsed/w.action.seconds-.35)/.65):0;
    P.shadow(a.x,a.z,.44,.34,M.height(a.x,a.z)+.012);
    P.tag("keeper",function(){P.group({x:a.x,y:M.height(a.x,a.z)+(moving?Math.abs(Math.sin(walkPhase))*.035:(reducedMotion?0:Math.sin(clock*1.7)*.004)),z:a.z,ry:a.heading},function(){
      if(seated){[-.17,.17].forEach(function(x){P.cylinder(x,.49,.18,.105,.11,.43,"#435657",8);P.box(x,.25,.4,.18,.4,.2,"#435657");P.blob(x,.07,.5,.14,.105,.24,"#304744");});}
      else [-1,1].forEach(function(side){
        var angle=stride*side;
        P.group({x:side*.17,y:.72,z:0,rx:angle},function(){
          P.cylinder(0,-.15,0,.105,.1,.34,"#485b5a",8);
          P.group({y:-.32,rx:moving?Math.max(0,-angle)*.65:0},function(){P.cylinder(0,-.13,0,.1,.09,.28,"#3d5352",8);P.box(0,-.285,.075,.22,.13,.32,"#2e4542");P.blob(0,-.265,.17,.127,.09,.16,"#334c47");});
        });
      });
      var lifting=t==="saw"&&w.elapsed/w.action.seconds>.86,hammer=t==="repair"||t==="upgrade";
      P.group({y:seated?.62:.83,rx:t==="collect"||t==="take"||lifting?.46:t==="store"?.28*handover:hammer?.22:0},function(){
        P.cylinder(0,.25,0,.3,.405,.78,"#c49643",12);
        P.cylinder(0,-.127,0,.405,.414,.035,"#a47d3b",12);
        P.poly([[-.12,-.1,-.38],[0,.63,-.26],[.13,-.1,-.38]],"#d4aa55");
        P.poly([[-.03,-.1,.402],[-.02,.55,.28],[.022,.55,.28],[.03,-.1,.402]],"#9e7738");
        P.box(0,.08,.36,.53,.035,.045,"#9b783b");
        for(var button=0;button<3;button++)P.blob(.04,.18+button*.15,.344-button*.022,.024,.024,.017,"#e8c78a");
        P.box(-.23,.1,.3,.14,.12,.035,"#b58d42");P.box(.23,.1,.3,.14,.12,.035,"#d1a551");
        P.cylinder(0,.65,0,.19,.2,.13,"#3d6761",10);
        P.blob(0,.88,-.015,.28,.315,.27,"#d4ac59");
        P.blob(0,.87,.23,.17,.175,.055,"#3d5149");
        P.poly([[-.24,.88,.2],[-.18,1.04,.22],[0,1.16,.19],[.18,1.04,.22],[.24,.88,.2],[.17,1.005,.255],[0,1.085,.255],[-.17,1.005,.255]],"#e5c781");
        function arm(side,angle){P.group({x:side*.34,y:.53,z:.02,rx:angle,rz:side*.035},function(){
          P.blob(0,-.03,0,.13,.17,.14,"#c69a4c");
          P.cylinder(0,-.22,0,.104,.087,.37,side===1?"#b98d40":"#d1a34e",8);
          P.cylinder(0,-.405,0,.09,.09,.055,"#e3bf73",8);P.blob(0,-.49,.025,.084,.1,.09,"#8d7e59");
          if(t==="chop"&&side===1){P.cylinder(0,-.76,0,.035,.04,.7,"#927247",7);P.box(.08,-1.03,.025,.31,.17,.13,"#758d89");P.poly([[.2,-1.14,.1],[.2,-.94,.1],[.29,-.94,.02],[.3,-1.11,.02]],"#c4d5c6");}
          if(hammer&&side===1){P.cylinder(0,-.65,.02,.034,.04,.37,"#9f7d47",7);P.box(0,-.84,.02,.28,.12,.13,"#8b9d91");}
        });}
        var armAngle=carry?-1.25+handover*.65:moving?-stride*.64:t==="chop"?-.65-swing*.85:t==="saw"?(lifting?-1.1:-1.88+swing*.12):hammer?-.8-swing*.5:t==="collect"||t==="take"?-1.25:-.1;
        arm(1,armAngle);arm(-1,carry?-1.25+handover*.65:t==="saw"?-1.15:t==="collect"||t==="take"?-1.2:moving?stride*.64:-.12);
      });
      if(carry&&state.carry.kind==="logs")P.group({x:0,y:(seated?.78:1.09)-handover*.32,z:.45+handover*.28,rz:Math.PI/2},function(){P.cylinder(0,0,0,.13,.14,1.15,"#926c46",9);P.cylinder(0,.58,0,.115,.115,.013,"#e6c78d",9);});
      else if(carry&&state.carry.kind==="boards"){for(var plank=0;plank<state.carry.amount;plank++)P.box(0,(seated?.75:.96)+plank*.14-handover*.32,.46+handover*.28,1.08,.12,.27,plank?"#c6a36b":"#d3ad73");}
    });});
  }
  function targetPoint(tag){
    if(!tag)return null;
    if(tag.indexOf("tree:")===0){var t=treeById(tag.slice(5));return t?[t.x,1.1,t.z]:null;}
    if(tag.indexOf("logs:")===0){var t=treeById(tag.slice(5));return t?[t.x+.6,.4,t.z+.3]:null;}
    if(tag.indexOf("drift:")===0){var d=state.shore.find(function(v){return v.id===tag.slice(6);});return d?[d.x,M.height(d.x,d.z)+.3,d.z]:null;}
    if(shedTag(tag)){var zone=C.shed.zones[tag.slice(5)];return zone?[5.4,tag==="shed:upgrade"?1.7:.9,tag==="shed:upgrade"?-3.08:zone.z]:null;}
    if(tag==="stairs")return [C.stairs.x,M.height(C.stairs.x,C.stairs.z)+.3,C.stairs.z];
    if(tag==="seat")return [C.seat.x,.8,C.seat.z];
    return {bench:[3.8,1.2,-1.6],step:[-5,.35,-1.05],lighthouse:[10,1.2,-5.98]}[tag]||null;
  }
  function render(moving){
    P.begin(night,state.daylight,islandTime);
    var work={id:job&&job.working?job.id:null,type:job&&job.working?job.action.type:null,amount:job&&job.working?job.action.amount:0,progress:job&&job.working?Math.min(1,job.elapsed/job.action.seconds):0,cycle:job&&job.working?job.elapsed*1.5:0};
    var env={time:islandTime,wind:wind,night:night,work:work,reducedMotion:reducedMotion,hovered:hover,selected:job?job.id:null};CloseWorld.draw(P,state,env);CloseScene.draw(P,state,env);
    var actor=actorPosition();keeper(moving);P.keeperFocus=[actor.x,M.height(actor.x,actor.z)+1.1,actor.z];P.flush(hover);
    if(resultView&&clock-resultView.at<1.2){var age=(clock-resultView.at)/1.2;P.ring(resultView.x,resultView.z,"#f4df9be0",reducedMotion?.5:.35+age*.8,M.height(resultView.x,resultView.z)+.045);}
    if(job&&job.working&&!reducedMotion&&(job.action.type==="saw"||job.action.type==="repair")){
      var q=(job.elapsed*1.5)%1;for(var chip=0;chip<3;chip++)P.spark([job.action.faceX+(chip-1)*q*.4,M.height(job.action.faceX,job.action.faceZ)+.5+Math.sin(q*Math.PI)*.35,job.action.faceZ+q*.4],.025,"#f2d4a0");
    }
    if(job&&job.path.length){var dest=job.path[job.path.length-1];P.ring(dest.x,dest.z,"#f5df9b9e",.33,M.height(dest.x,dest.z)+.045);}
    if(night>.05)P.beam([10,5.65,-7],[24+Math.sin(islandTime*.14)*10,3,-19],night);
    var nearby=contextAction(),screen=nearby?P.project(targetPoint(nearby.tag)):null,button=$("act"),safe=view.layout();
    button.hidden=!screen;
    if(nearby&&screen){
      var bx=Math.max(safe.left+24,Math.min(safe.right-24,screen.x)),by=Math.max(safe.top+24,Math.min(safe.bottom-24,screen.y-26));
      var head=P.project([actor.x,M.height(actor.x,actor.z)+1.9,actor.z]),feet=P.project([actor.x,M.height(actor.x,actor.z),actor.z]);
      if(head&&feet){var half=Math.max(14,Math.abs(feet.y-head.y)*.23);
        if(bx+24>head.x-half&&bx-24<head.x+half&&by+24>head.y-6&&by-24<feet.y+4){var side=head.x+half+30;bx=side<=canvas.clientWidth-28?side:Math.max(28,head.x-half-30);}}
      button.style.left=bx+"px";button.style.top=by+"px";
      button.setAttribute("data-action",nearby.tag);button.setAttribute("aria-label",nearby.action.label+(nearby.action.available?"":". "+nearby.action.reason));button.setAttribute("title",(nearby.action.available?nearby.action.label:nearby.action.reason)+(view.keyboard()?" (E)":""));button.setAttribute("aria-disabled",String(!nearby.action.available));button.dataset.state=nearby.action.available?"normal":"disabled";
      $("action-path").setAttribute("d",actionIcons[nearby.action.type]);
    }else button.setAttribute("data-action","");
    var p=P.project([state.avatar.x,M.height(state.avatar.x,state.avatar.z)+2.03,state.avatar.z]);$("working").hidden=!job||!job.working||!p;
    if(job&&job.working&&p){$("working").style.left=Math.max(safe.left+43,Math.min(safe.right-43,p.x))+"px";$("working").style.top=Math.max(safe.top+8,Math.min(safe.bottom-8,p.y-14))+"px";$("working").setAttribute("aria-label",U.action(state,job.id).label);$("working").setAttribute("aria-valuenow",String(Math.round(work.progress*100)));$("work-progress").style.width=Math.min(100,work.progress*100)+"%";}
    updateContext(nearby);updateShedPanel();
    canvas.style.cursor=gesture&&gesture.moved?"grabbing":hover&&actionForTag(hover)?"pointer":"grab";
    P.end();
  }
  function frame(now){requestAnimationFrame(frame);if(document.hidden){last=now;return;}if(coarsePointer&&now-lastFrame<30)return;if(lastFrame>0)intervalSamples[sampleCursor]=now-lastFrame;lastFrame=now;var dt=Math.min(.05,(now-last)/1000);last=now;var start=performance.now(),moving=update(dt);render(moving);var cost=performance.now()-start;cpuSamples[sampleCursor]=cost;sampleCursor=(sampleCursor+1)%120;perfFrames++;perfTotal+=cost;
    if(now-perfStart>=1000){perf={fps:perfFrames*1000/(now-perfStart),renderMs:perfTotal/perfFrames,sampleMs:now-perfStart,frames:perfFrames};perfStart=now;perfFrames=0;perfTotal=0;if(!$("performance-panel").hidden)$("performance-panel").textContent=Math.round(perf.fps)+" FPS · Кадр "+perf.renderMs.toFixed(1)+" мс\n"+(quality==="lighter"?"Легче":"Стандарт")+" · DPR "+P.pixelRatio+"\nТолько это устройство; не замер GPU";}
  }
  function resetPerformance(){perfStart=performance.now();perfFrames=0;perfTotal=0;cpuSamples=[];intervalSamples=[];sampleCursor=0;lastFrame=0;perf={fps:null,renderMs:null,sampleMs:0,frames:0};}
  function percentile(samples,q){if(!samples.length)return null;var sorted=samples.slice().sort(function(a,b){return a-b;});return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))];}
  function resize(){P.resize(canvas.clientWidth,canvas.clientHeight);}
  new ResizeObserver(resize).observe(canvas);
  new ResizeObserver(function(entries){bottomHeight=entries[0].contentRect.height;$('game').style.setProperty('--status-height',bottomHeight+'px');}).observe($('bottom-ui'));
  if(globalThis.visualViewport)visualViewport.addEventListener('resize',resize);
  function local(e){var r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function closeMenu(){$("menu").hidden=true;$("more").setAttribute("aria-expanded","false");view.root.dataset.menu="";view.invalidate();}
  function cameraGesture(){overview=false;$("overview").setAttribute("aria-pressed","false");}
  function rotate(dx,dy){manualCamera=true;cameraGesture();yaw-=dx*.006;pitch=Math.max(C.camera.pitchMin,Math.min(C.camera.pitchMax,pitch+dy*.004));}
  canvas.addEventListener("pointerdown",function(e){unlock();closeMenu();canvas.focus({preventScroll:true});var p=local(e);touches.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);gesture={id:e.pointerId,start:p,last:p,moved:e.button===2||e.button===1};
    if(touches.size>=2){gesture.moved=true;if(touches.size===2){var arr=Array.from(touches.values());pinch={length:Math.hypot(arr[0].x-arr[1].x,arr[0].y-arr[1].y),distance:overview?camera.distance:distance,last:{x:(arr[0].x+arr[1].x)/2,y:(arr[0].y+arr[1].y)/2}};}else pinch=null;}
  });
  canvas.addEventListener("pointermove",function(e){var p=local(e);pointer=p;
    if(touches.has(e.pointerId)){touches.set(e.pointerId,p);if(touches.size===2&&pinch){var v=Array.from(touches.values()),n=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y),centre={x:(v[0].x+v[1].x)/2,y:(v[0].y+v[1].y)/2};distance=Math.max(C.camera.min,Math.min(C.camera.max,pinch.distance*pinch.length/Math.max(10,n)));rotate(centre.x-pinch.last.x,centre.y-pinch.last.y);pinch.last=centre;if(gesture)gesture.moved=true;}
      else if(gesture&&e.pointerId===gesture.id){var dx=p.x-gesture.last.x,dy=p.y-gesture.last.y;if(Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>8)gesture.moved=true;if(gesture.moved)rotate(dx,dy);gesture.last=p;}
    }else hover=P.pick(p.x,p.y);
  });
  canvas.addEventListener("pointerup",function(e){var p=local(e),tap=gesture&&gesture.id===e.pointerId&&!gesture.moved&&!pinch;touches.delete(e.pointerId);if(touches.size<2)pinch=null;
    if(tap){var tag=P.pick(p.x,p.y);if(tag&&tag!=="ground")approach(tag);else {var g=P.ground(p.x,p.y,M.height);if(g){selectedTag=null;walk(g,null);}}}
    if(!touches.size)gesture=null;
  });
  canvas.addEventListener("pointercancel",function(e){touches.delete(e.pointerId);gesture=null;pinch=null;});
  canvas.addEventListener("pointerleave",function(){if(!gesture)hover=null;});
  canvas.addEventListener("contextmenu",function(e){e.preventDefault();});
  canvas.addEventListener("wheel",function(e){e.preventDefault();var d=e.deltaY*(e.deltaMode===1?16:1);if(overview)distance=Math.min(C.camera.max,camera.distance);manualCamera=true;cameraGesture();distance=Math.max(C.camera.min,Math.min(C.camera.max,distance*Math.exp(d*.0018)));if(e.deltaX)yaw-=e.deltaX*.003;},{passive:false});
  function toggleOverview(){overview=!overview;$("overview").setAttribute("aria-pressed",String(overview));}
  var actionIcons={
    chop:"M5 22 16 4M11 8l4-6 7 4-4 7-7-5Z",
    collect:"M8 13V7a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6c0 4-2 6-6 6h-2c-2 0-3-1-4-3l-4-5a1.5 1.5 0 0 1 2-2l3 2",
    saw:"m2 16 12-12 8 3-2 5-4-1-2 3-2-1-2 3-2-1-2 3-4-2ZM16 7l3 1-1 2-3-1Z",
    repair:"m4 22 10-12M10 5l5-3 7 6-3 3-3-2-4 5-4-4 4-4Z",
    light:"M13 2c1 6 6 7 6 12a7 7 0 0 1-14 0c0-3 2-5 4-7 0 4 1 4 2 4 2-2 2-5 2-9Z",
    rest:"M5 4v9h14V8M5 13v8M19 13v8M5 9h10v4",
    stand:"M12 20V4m-6 6 6-6 6 6M5 21h14",
    shed:"M3 10 12 3l9 7M5 9v12h14V9M8 15h8M8 18h8"
  };
  function contextAction(){
    if(job||keys.size||shedOpen&&nearShed()||!$("menu").hidden||document.querySelector("dialog[open]"))return null;
    if(sitting)return {tag:"seat",action:{type:"stand",available:true,label:"Встать со скамьи",object:"Отдых у моря",resultPreview:"Можно продолжить прогулку. День во время отдыха не проходит.",progress:0}};
    var tags=allTags(),best=null,dist=C.interactionReach;
    tags.forEach(function(tag){var a=navAction(tag);if(!a||a.done)return;var d=Math.hypot(state.avatar.x-a.x,state.avatar.z-a.z);if(d<=C.interactionReach&&M.clear(state,state.avatar,a)&&(!best||tag===selectedTag||(best.tag!==selectedTag&&d<dist))){best={tag:tag,action:a};dist=d;}});
    return best;
  }
  function updateContext(nearby){
    var title,detail,action=null,tag=null,mode="normal";
    if(saveBlocked){title="Игра приостановлена";detail="Сохранение не изменено. Для нового начала открой меню.";mode="disabled";}
    else if(job&&job.working){var work=U.action(state,job.id);title=work.object;detail=work.label+". "+(work.resultPreview||"Сделанная часть сохранится при паузе.");mode="busy";}
    else if(job){title="Смотритель идёт";detail=selectedTag?"У предмета он остановится. Затем выбери действие.":"Можно выбрать другое место и изменить путь.";mode="busy";}
    else if(nearby){action=nearby.action;tag=nearby.tag;title=action.object||"Рядом со смотрителем";detail=action.available?action.resultPreview||action.detail:action.reason;mode=action.available?"normal":"disabled";}
    else {var guidance=U.guidance(state,{sitting:sitting});title=guidance.title;detail=guidance.detail;}
    view.context({title:title,detail:detail,action:action,tag:tag,mode:mode,job:!!job,working:!!(job&&job.working)});
  }
  function shedCommand(id){
    if(saveBlocked||job||!shedOpen||$("shed-panel").hidden||!nearShed())return;
    var a=id?M.info(state,id):null;if(!a||!a.available){notify(U.action(state,id||"store:logs").reason);return;}
    selectedTag=id==="shed:upgrade"?id:"shed:"+id.split(":")[1];keys.clear();unlock();walk(a,a);shedOpen=true;
  }
  function updateShedPanel(){
    if(!job&&!nearShed())shedOpen=false;
    var show=shedOpen&&!saveBlocked&&nearShed()&&$("menu").hidden&&!document.querySelector("dialog[open]");view.panel(show);if(!show)return;
    var caps=M.capacity(state),store=state.carry.kind?"store:"+state.carry.kind:null,busy=!!job;
    $("shed-logs").textContent=state.logs+" из "+caps.logs;$("shed-boards").textContent=state.boards+" из "+caps.boards;$("shed-carry").textContent=cargoText();
    [["shed-store",store],["shed-take-logs","take:logs"],["shed-take-boards","take:boards"],["shed-upgrade","shed:upgrade"]].forEach(function(pair){
      var button=$(pair[0]),description=pair[1]?U.action(state,pair[1]):null;
      view.command(button,description,{label:$(pair[0]+"-label"),reason:$(pair[0]+"-reason"),busy:busy,active:!!job&&job.id===pair[1],describedBy:pair[0]==="shed-upgrade"?"shed-upgrade-cost shed-upgrade-capacity shed-upgrade-reason"+(busy?" shed-feedback":""):null,emptyLabel:"Сложить материалы",emptyReason:U.action(state,"store:logs").reason});
      button.setAttribute("data-action-id",pair[1]||"");
      if(busy&&job.id===pair[1])button.dataset.state="busy";
    });
    var upgrade=U.action(state,"shed:upgrade");$("shed-upgrade-cost").hidden=upgrade.done;$("shed-upgrade-cost").textContent=upgrade.cost;$("shed-upgrade-capacity").textContent=upgrade.done?"Вместимость: брёвна "+caps.logs+", доски "+caps.boards:upgrade.capacityPreview;
    var feedback=$("shed-feedback"),result=resultView&&clock-resultView.at<6&&["store","take","upgrade"].indexOf(resultView.type)>=0,notice=panelNotice&&clock-panelNotice.at<6,wasBusy=$("shed-panel").dataset.state==="busy";
    feedback.hidden=!busy&&!result&&!notice;$("shed-panel").dataset.state=busy?"busy":result?"result":"normal";
    if(busy)view.feedback(feedback,(job.working?"Идёт работа: ":"Подходим к отсеку: ")+U.action(state,job.id).label+". Сделанная часть сохраняется при паузе.","busy");
    else if(notice)view.feedback(feedback,panelNotice.text,"disabled");
    else if(result)view.feedback(feedback,U.result(state,resultView.id,resultView.type,resultView.amount),"result");
    $("shed-pause").hidden=!busy;$("shed-pause").textContent=job&&job.working?"Пауза":"Стоп";$("shed-pause").setAttribute("aria-label",job&&job.working?"Приостановить работу":"Остановиться");
    if(busy&&!wasBusy||!busy&&wasBusy){$("shed-scroll").scrollTop=0;if(view.keyboard())$(busy?"shed-pause":"shed-close").focus({preventScroll:true});}
  }
  function closeShed(){shedOpen=false;panelNotice=null;view.panel(false);canvas.focus({preventScroll:true});}
  $("shed-close").addEventListener("click",closeShed);
  ["shed-store","shed-take-logs","shed-take-boards","shed-upgrade"].forEach(function(id){$(id).addEventListener("click",function(){if(job){notify("Идёт действие. Можно дождаться результата или приостановить работу.");return;}shedCommand(this.getAttribute("data-action-id"));});});
  function pauseFromUI(){var working=job&&job.working;pause(false);keys.clear();refresh();if(working)notify("Работа приостановлена. Выбери ту же команду, чтобы продолжить.");}
  $("pause-work").addEventListener("click",pauseFromUI);$("shed-pause").addEventListener("click",pauseFromUI);
  $("context-command").addEventListener("click",function(){if(this.hidden)return;nearest();if(!shedOpen)canvas.focus({preventScroll:true});});
  function nearest(){
    if(job&&job.working){pause(true);refresh();return;}
    var nearby=contextAction();if(nearby)interact(nearby.tag);
  }
  $("act").addEventListener("click",function(){if(this.hidden)return;var nearby=contextAction();if(nearby&&nearby.tag===this.getAttribute("data-action")){interact(nearby.tag);if(!shedTag(nearby.tag))canvas.focus({preventScroll:true});}});
  document.addEventListener("keydown",function(e){
    if(document.querySelector("dialog[open]"))return;
    if(!$("menu").hidden){if(e.code==="Escape"){closeMenu();$("more").focus({preventScroll:true});}return;}
    if(shedOpen&&e.code==="Escape"){pause(false);closeShed();refresh();return;}
    if(shedOpen&&e.code==="KeyE")return;
    if(e.target.closest&&e.target.closest("button")&&e.code!=="Escape")return;
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyW","KeyA","KeyS","KeyD"].indexOf(e.code)>=0){e.preventDefault();keys.add(e.code);unlock();}
    if(e.code==="KeyE"&&!e.repeat)nearest();if(e.code==="KeyM"&&!e.repeat)toggleOverview();if(e.code==="KeyF"&&!e.repeat)resetCamera();if(e.code==="Escape"){pause(false);sitting=false;shedOpen=false;refresh();}
  });
  document.addEventListener("keyup",function(e){if(keys.delete(e.code)&&keys.size===0){persist();refresh();}});
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
  function resetCamera(){manualCamera=false;resultView=null;cameraGesture();yaw=C.camera.yaw;pitch=C.camera.pitch;distance=C.camera.distance;}
  $("focus").addEventListener("click",function(){resetCamera();closeMenu();canvas.focus({preventScroll:true});});
  function toggleMenu(){var visible=$("menu").hidden;$("menu").hidden=!visible;$("more").setAttribute("aria-expanded",String(visible));view.root.dataset.menu=visible?"open":"";if(visible){pause(true);keys.clear();$("sound").focus({preventScroll:true});}view.invalidate();}
  // Some touch/fullscreen paths deliver pointerup without the compatibility
  // click. Activate a short in-bounds touch once; keep native keyboard/mouse.
  var menuTouch=null,menuTouchClickUntil=0;
  $("more").addEventListener("pointerdown",function(e){
    if(e.pointerType!=="touch"){menuTouch=null;menuTouchClickUntil=0;return;}
    menuTouch=e.isPrimary?{id:e.pointerId,x:e.clientX,y:e.clientY,moved:false}:null;
  });
  $("more").addEventListener("pointermove",function(e){if(menuTouch&&menuTouch.id===e.pointerId&&Math.hypot(e.clientX-menuTouch.x,e.clientY-menuTouch.y)>8)menuTouch.moved=true;});
  $("more").addEventListener("pointercancel",function(){menuTouch=null;});
  $("more").addEventListener("pointerup",function(e){
    var tap=menuTouch;menuTouch=null;if(!tap||tap.id!==e.pointerId||tap.moved)return;
    var box=this.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)return;
    menuTouchClickUntil=performance.now()+750;e.preventDefault();toggleMenu();
  });
  $("more").addEventListener("click",function(e){if(e&&e.detail>0&&performance.now()<menuTouchClickUntil)return;toggleMenu();});
  $("sound").addEventListener("click",function(){muted=!muted;this.setAttribute("aria-pressed",String(muted));this.setAttribute("aria-label",muted?"Включить звук":"Выключить звук");this.textContent=muted?"Звук выкл.":"Звук вкл.";if(!muted)unlock();else audioVisibility();});
  $("motion").addEventListener("click",function(){motionOverride=!reducedMotion;applyPresentation();persistPresentation();});
  $("quality").addEventListener("click",function(){quality=quality==="standard"?"lighter":"standard";applyPresentation();resize();persistPresentation();resetPerformance();});
  $("performance-toggle").addEventListener("click",function(){var show=$("performance-panel").hidden;$("performance-panel").hidden=!show;this.setAttribute("aria-pressed",String(show));this.textContent=show?"Скрыть плавность":"Показать плавность";if(show)$("performance-panel").textContent="Измеряю FPS и время кадра…";});
  $("help").addEventListener("click",function(){closeMenu();pause(true);keys.clear();$("help-dialog").showModal();});
  $("help-close").addEventListener("click",function(){$("help-dialog").close();canvas.focus();});
  $("restart").addEventListener("click",function(){closeMenu();pause(true);keys.clear();$("restart-dialog").showModal();});
  $("restart-cancel").addEventListener("click",function(){$("restart-dialog").close();});
  $("restart-confirm").addEventListener("click",function(){saveBlocked=false;state=M.create();shedOpen=false;job=null;hover=null;selectedTag=null;sitting=false;sitBlend=0;visited.clear();camera.x=state.avatar.x;camera.z=state.avatar.z;resetCamera();persist();refresh();$("restart-dialog").close();});
  globalThis.addEventListener("openai:set_globals",function(e){
    var incoming=e.detail&&e.detail.globals&&e.detail.globals.widgetState;if(!incoming||typeof incoming!=="object")return;
    hostEnvelope=Object.assign({},hostEnvelope,incoming);
    var present=Object.prototype.hasOwnProperty.call(incoming,SLOT),imported=!present&&!hasInitial&&!saveBlocked&&incoming.closeIsland!=null;
    if(!present&&!imported)return;var s=M.restore(present?incoming[SLOT]:incoming.closeIsland);if(!s){unreadableSave();pause(true);return;}
    var a=s.sync||{revision:0,writer:""},b=state.sync||{revision:revision,writer:""};
    if(a.revision<revision||(hasInitial&&a.revision===revision&&a.writer<=b.writer))return;
    job=null;selectedTag=null;hover=null;shedOpen=false;sitting=false;sitBlend=0;keys.clear();closeMenu();document.querySelectorAll("dialog[open]").forEach(function(d){d.close();});state=s;revision=a.revision;hasInitial=true;saveBlocked=false;if(widget())saveMemoryOnly=false;if(imported)persist();refresh();
  });
  document.addEventListener("visibilitychange",function(){if(document.hidden&&hasInitial)persist();audioVisibility();last=performance.now();resetPerformance();});
  globalThis.CloseDemo={
    renderer:function(){return P.diagnostics();},
    performance:function(){var stats=P.stats||{};return {renderer:P.mode,quality:quality,fps:perf.fps,renderMs:perf.renderMs,renderP50Ms:percentile(cpuSamples,.5),renderP95Ms:percentile(cpuSamples,.95),intervalP50Ms:percentile(intervalSamples,.5),intervalP95Ms:percentile(intervalSamples,.95),sampleMs:perf.sampleMs,frames:perf.frames,dpr:P.pixelRatio,width:canvas.clientWidth,height:canvas.clientHeight,faces:stats.faces===undefined?null:stats.faces,generatedFaces:stats.generatedFaces===undefined?null:stats.generatedFaces,triangles:stats.triangles===undefined?null:stats.triangles,drawCalls:stats.drawCalls===undefined?null:stats.drawCalls};},
    environment:function(){return {time:islandTime,wind:{x:wind.x,z:wind.z,strength:wind.strength},seaPhase:(islandTime*.12)%1,reducedMotion:reducedMotion,motionPreference:motionOverride===null?"system":"user",audio:{initialized:!!audio,state:audio?audio.state:"uninitialized",muted:muted,wind:ambientLevels.wind,leaves:ambientLevels.leaves,surf:ambientLevels.surf,contextsCreated:audioContexts}};},
    getState:function(){return JSON.parse(JSON.stringify(state));},
    getJob:function(){return job?{id:job.id,working:job.working,remainingPath:job.path.length,progress:job.working?job.elapsed/job.action.seconds:0}:null;},
    project:function(p){return P.project(p);},
    isResting:function(){return sitting;},
    targetPoints:function(){var out={};allTags().forEach(function(tag){out[tag]=P.project(targetPoint(tag));});return out;},
    interface:function(){return {input:view.root.dataset.input,panel:view.root.dataset.panel,scene:view.layout(),saveError:!!view.errorKey,saveErrorRead:view.errorRead};},
    camera:function(){var p=actorPosition(),h=M.height(p.x,p.z),a=P.project([p.x,h,p.z]),b=P.project([p.x,h+1.8,p.z]);return {distance:camera.distance,yaw:camera.yaw,pitch:camera.pitch,targetDistance:distance,targetYaw:yaw,targetPitch:pitch,overview:overview,manual:manualCamera,framing:job&&job.working?"work":resultView&&clock-resultView.at<3?"result":job&&job.path.length?"walk":"idle",keeperPixels:a&&b?Math.abs(a.y-b.y):0,renderer:P.mode,faces:P.stats?P.stats.faces:0};}
  };
  function allTags(){return state.trees.map(function(t){return (t.felled?"logs:":"tree:")+t.id;}).concat(state.shore.filter(function(d){return !d.collected;}).map(function(d){return "drift:"+d.id;}),["bench","step","stairs","seat","lighthouse","shed:logs","shed:boards","shed:upgrade"]);}
  resize();P.camera(camera,camera.distance,camera.yaw,C.camera.pitch);refresh();requestAnimationFrame(frame);
})();
