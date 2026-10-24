// Presentation only: app owns intent, input, feedback lifetimes and work.
// point is the projected object position, in canvas CSS pixels. Its optional
// avoid array contains canvas-space rectangles (for example the keeper).
(function(G){
  "use strict";
  var ids=Object.freeze({button:"act",path:"action-path",pause:"action-pause",note:"action-note",copy:"action-note-copy",key:"action-key",progress:"action-progress",status:"action-progress-status",alternate:"gallery-select",alternatePath:"gallery-select-path"});
  var icons=Object.freeze({
    chop:"M5 21 14.2 5.8M10.5 4.5 13 1.8l2.5 1.6c.5 2.1 2.7 2.8 6.3 3l-2.6 6.6c-1.1-2.7-3.3-4.5-7.1-5.5ZM4.1 20.4l1.8 1.2",
    collect:"M8 13V7a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6c0 4-2 6-6 6h-2c-2 0-3-1-4-3l-4-5a1.5 1.5 0 0 1 2-2l3 2",
    saw:"m2 16 12-12 8 3-2 5-4-1-2 3-2-1-2 3-2-1-2 3-4-2ZM16 7l3 1-1 2-3-1Z",
    repair:"m4 22 10-12M10 5l5-3 7 6-3 3-3-2-4 5-4-4 4-4Z",
    light:"M13 2c1 6 6 7 6 12a7 7 0 0 1-14 0c0-3 2-5 4-7 0 4 1 4 2 4 2-2 2-5 2-9Z",
    rest:"M5 4v9h14V8M5 13v8M19 13v8M5 9h10v4",
    stand:"M12 20V4m-6 6 6-6 6 6M5 21h14",
    shed:"M3 10 12 3l9 7M5 9v12h14V9M8 15h8M8 18h8",
    view:"M7 19V8h10v11M5 8h14M8 8V4h8v4M4 14h16M4 14v4h16v-4M8 14v4m4-4v4m4-4v4M5 21h14",
    store:"M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5",
    take:"M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5",
    upgrade:"m3 10 9-7 9 7M5 9v12h14V9M12 18v-7m-3 3 3-3 3 3"
  });
  var workingLabels={chop:"Рубка дерева",collect:"Поднимаем материал",saw:"Распил бревна",repair:"Ремонт",light:"Зажигаем маяк"};
  var labels={chop:"Рубить",collect:"Поднять",saw:"Распилить",repair:"Починить",light:"Зажечь",rest:"Отдохнуть",stand:"Встать",shed:"Открыть навес",view:"Галерея",store:"Сложить",take:"Взять",upgrade:"Расширить"};
  function $(id){return document.getElementById(id);}
  function attr(node,key,value){value=String(value);if(node.getAttribute(key)!==value)node.setAttribute(key,value);}
  function text(node,value){value=String(value||"");if(node.textContent!==value)node.textContent=value;}
  function hide(node,value){if(node.hidden!==value)node.hidden=value;}
  function style(node,key,value){if(node.style[key]!==value)node.style[key]=value;}
  function finite(value,fallback){return Number.isFinite(value)?value:fallback;}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function pixels(value){return Math.round(value*10)/10+"px";}
  function rect(value){
    if(!value)return null;
    var left=finite(value.left,value.x),top=finite(value.top,value.y),right=finite(value.right,left+value.width),bottom=finite(value.bottom,top+value.height);
    return [left,top,right,bottom].every(Number.isFinite)&&right>left&&bottom>top?{left:left,top:top,right:right,bottom:bottom}:null;
  }
  function overlap(a,b,padding){return Math.max(0,Math.min(a.right,b.right+padding)-Math.max(a.left,b.left-padding))*Math.max(0,Math.min(a.bottom,b.bottom+padding)-Math.max(a.top,b.top-padding));}
  function at(left,top,width,height){return {left:left,top:top,right:left+width,bottom:top+height};}
  function place(candidates,width,height,safe,obstacles){
    var best=null,score=Infinity;
    candidates.forEach(function(p,index){
      var x=clamp(p.x,safe.left,safe.right-width),y=clamp(p.y,safe.top,safe.bottom-height),box=at(x,y,width,height);
      var cost=index*12+Math.hypot(x-p.x,y-p.y);
      obstacles.forEach(function(o){cost+=overlap(box,o,5)*20;});
      if(cost<score){score=cost;best=box;}
    });
    return best;
  }
  function visibleRect(node,origin){
    if(!node||node.hidden||!node.getClientRects().length)return null;
    var r=node.getBoundingClientRect();return rect({left:r.left-origin.left,top:r.top-origin.top,width:r.width,height:r.height});
  }
  function ActionUI(view){this.view=view;this.noteKey="";this.noteSize=null;}
  ActionUI.ids=ids;ActionUI.icons=icons;
  ActionUI.prototype.render=function(data){
    data=data||{};
    var view=this.view,button=$(ids.button),pause=$(ids.pause),note=$(ids.note),alternate=$(ids.alternate),a=data.action||{},phase=["idle","travelling","working","result"].indexOf(data.phase)>=0?data.phase:"idle";
    var owns=!!data.visible&&!!data.action&&!!data.tag;
    if(!owns){
      if(button.dataset.actionUi==="true"){
        hide(button,true);attr(button,"data-action-ui","false");attr(button,"aria-describedby","context-detail");attr(button,"aria-busy",false);button.tabIndex=0;
        style(alternate,"left","");style(alternate,"top","");
      }
      hide(pause,true);hide(note,true);hide($(ids.status),true);
      return {ownsContext:false,visible:false};
    }
    var canvas=$("world"),origin=canvas.getBoundingClientRect(),q=data.safeRect||view.layout(),inset=visibleRect($("action-safe-bounds"),origin);
    var safe={left:Math.max(finite(q.left,12),inset?inset.left:0),top:Math.max(finite(q.top,12),inset?inset.top:0),right:Math.min(finite(q.right,canvas.clientWidth-12),inset?inset.right:canvas.clientWidth),bottom:Math.min(finite(q.bottom,canvas.clientHeight-12),inset?inset.bottom:canvas.clientHeight)};
    var p=data.point,visible=!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&safe.right-safe.left>=56&&safe.bottom-safe.top>=56;
    var working=phase==="working",busy=working||phase==="travelling",disabled=phase==="idle"&&a.available===false;
    var keyboard=typeof data.keyboard==="boolean"?data.keyboard:view.keyboard(),focused=document.activeElement===button,pauseFocus=document.activeElement===pause,alternateFocus=document.activeElement===alternate;
    var label=String(a.label||labels[a.type]||"Начать дело"),reason=String(data.reason||(!data.result&&focused&&disabled?a.reason||"":""));
    var noteText=reason||String(data.result||phase==="result"?data.result||"Готово":phase==="travelling"?"Подходим":working?(workingLabels[a.type]||label):focused?label:a.shortLabel||labels[a.type]||label);
    if(alternateFocus&&!busy&&phase==="idle"){noteText=alternate.getAttribute("aria-label")||"Выбрать галерею";reason="";}
    if(pauseFocus&&working)noteText="Пауза сохранит сделанную часть.";
    var noteMode=reason?"reason":data.result?"result":phase==="result"?"result":busy?"busy":"label",key=keyboard&&phase==="idle"&&!alternateFocus;
    attr(button,"data-action-ui","true");attr(button,"data-action",data.tag);attr(button,"data-action-id",a.id||"");attr(button,"data-phase",phase);attr(button,"data-state",disabled?"disabled":busy?"busy":phase==="result"?"result":"normal");attr(button,"data-selected",!!data.selected);
    attr(button,"aria-disabled",disabled||busy||phase==="result");attr(button,"aria-busy",busy);attr(button,"aria-describedby","action-note"+(working?" action-progress-status":""));
    attr(button,"aria-label",(phase==="travelling"?"Подходим: ":working?"Идёт работа: ":phase==="result"?"Готово: ":"")+label+(disabled&&a.reason?". "+a.reason:""));
    attr(button,"title",(reason||label)+(key?" (E)":""));button.tabIndex=busy||phase==="result"?-1:0;
    attr($(ids.path),"d",icons[a.type]||icons.collect);
    attr(pause,"data-action",data.tag);attr(pause,"data-action-id",a.id||"");attr(pause,"aria-label","Приостановить работу: "+label);attr(pause,"title","Приостановить работу"+(keyboard?" (Esc)":""));
    attr($(ids.alternatePath),"d",alternate.dataset.icon==="light"?icons.light:icons.view);
    var percent=Math.round(clamp(finite(data.progress,0),0,1)*100);
    style($(ids.progress),"strokeDasharray",percent+" 100");attr($(ids.status),"aria-label",label);attr($(ids.status),"aria-valuenow",percent);attr($(ids.status),"aria-valuetext",percent+"%");
    text($(ids.copy),noteText);attr(note,"data-note",noteMode);hide($(ids.key),!key);
    hide(button,!visible);hide(pause,!visible||!working);hide(note,!visible||!noteText);hide($(ids.status),!visible||!working);
    if(!visible){hide(alternate,true);return {ownsContext:true,visible:false};}
    // Read obstacles before changing positions. The app supplies the keeper's
    // projected bounds; fixed controls and transient notices are accounted here.
    var obstacles=(Array.isArray(p.avoid)?p.avoid:[]).map(rect).filter(Boolean);
    [view.root.querySelector(".controls"),$("save"),$("toast").classList.contains("visible")?$("toast"):null,$("fullscreen-status").textContent?$("fullscreen-status"):null,view.root.querySelector('#tool-panel[data-mode="lantern"] .tool-heading')].forEach(function(node){var r=visibleRect(node,origin);if(r)obstacles.push(r);});
    obstacles.push(at(p.x-12,p.y-10,24,20));
    var extra=working||!alternate.hidden,width=extra?118:56;
    // If a very narrow safe rectangle cannot hold both touch targets, stack
    // the secondary control. No target is reduced below 56 CSS pixels.
    var stacked=width>safe.right-safe.left;if(stacked)width=56;
    var height=stacked&&extra?118:56;
    if(height>safe.bottom-safe.top){hide(button,true);hide(pause,true);hide(alternate,true);hide(note,true);hide($(ids.status),true);return {ownsContext:true,visible:false};}
    var anchor=place([{x:p.x-28,y:p.y-height-18},{x:p.x+22,y:p.y-height-8},{x:p.x-width-22,y:p.y-height-8},{x:p.x+22,y:p.y-28},{x:p.x-width-22,y:p.y-28},{x:p.x-28,y:p.y+20}],width,height,safe,obstacles);
    style(button,"left",pixels(anchor.left+28));style(button,"top",pixels(anchor.top+28));
    var secondary=working?pause:alternate;
    if(extra){style(secondary,"left",pixels(anchor.left+(stacked?28:90)));style(secondary,"top",pixels(anchor.top+(stacked?90:28)));}
    var maxWidth=Math.min(240,safe.right-safe.left),maxHeight=Math.min(152,safe.bottom-safe.top-62);
    style(note,"maxWidth",pixels(maxWidth));style(note,"maxHeight",pixels(Math.max(32,maxHeight)));
    var measureKey=[noteText,key,noteMode,maxWidth,maxHeight].join("|");
    if(this.noteKey!==measureKey){var measured=note.getBoundingClientRect();this.noteSize={width:Math.min(maxWidth,measured.width),height:Math.min(Math.max(32,maxHeight),measured.height)};this.noteKey=measureKey;}
    var size=this.noteSize,notesAvoid=obstacles.concat([anchor]);
    var noteBox=place([{x:anchor.left+width/2-size.width/2,y:anchor.top-size.height-5},{x:anchor.right+6,y:anchor.top+(height-size.height)/2},{x:anchor.left-size.width-6,y:anchor.top+(height-size.height)/2},{x:anchor.left+width/2-size.width/2,y:anchor.bottom+5}],size.width,size.height,safe,notesAvoid);
    style(note,"left",pixels(noteBox.left));style(note,"top",pixels(noteBox.top));
    return {ownsContext:true,visible:true};
  };
  G.CloseActionUI=ActionUI;
})(globalThis);
