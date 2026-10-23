// Presentation only. The mode controller owns navigation; app owns game state.
(function(G){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var modesList=["walk","shed","bag","binoculars","menu","help","confirm"];
  function text(node,value){value=String(value||"");if(!node||node.textContent===value)return false;node.textContent=value;return true;}
  function state(node,value){if(!node||node.dataset.state===value)return false;node.dataset.state=value;return true;}
  function attribute(node,name,value){value=String(value);if(node&&node.getAttribute(name)!==value)node.setAttribute(name,value);}
  function Interface(modes){
    var self=this;this.root=$("game");this.modes=modes||null;this.fallback={mode:"walk",detail:null,pending:null};this.contextWanted=false;this.contextKey=null;this.dirty=true;this.rect=null;this.noticeTimer=null;this.fullscreenTimer=null;this.errorKey="";this.errorRead=false;this.lastSaveNotice=-Infinity;this.noticeKind="";
    this.root.dataset.input=matchMedia("(pointer:coarse)").matches?"touch":"keyboard";
    var pendingPointerInput=null;
    function input(value){if(self.root.dataset.input!==value){self.root.dataset.input=value;self.invalidate();}}
    document.addEventListener("pointerdown",function(e){
      pendingPointerInput=e.pointerType==="touch"||e.pointerType==="pen"?"touch":"mouse";
      // Do not reflow an anchored control between pointerdown and click.
      // The click target is fixed before its capture phase; world gestures can
      // update immediately because they do not depend on a UI button position.
      if(!e.target.closest||!e.target.closest("button,a,summary,input,select,textarea"))input(pendingPointerInput);
    },{capture:true,passive:true});
    document.addEventListener("click",function(e){if(e.detail>0&&pendingPointerInput)input(pendingPointerInput);pendingPointerInput=null;},{capture:true});
    document.addEventListener("pointercancel",function(){pendingPointerInput=null;},{capture:true,passive:true});
    document.addEventListener("keydown",function(e){if(!e.metaKey&&!e.ctrlKey&&!e.altKey){pendingPointerInput=null;input("keyboard");}},{capture:true});
    var observer=new ResizeObserver(function(){self.invalidate();});
    [this.root,$("context"),$("shed-panel"),$("bag-panel"),$("tool-panel"),$("binocular-coast"),$("menu"),$("save")].forEach(function(n){if(n)observer.observe(n);});
    if(G.visualViewport)visualViewport.addEventListener("resize",function(){self.invalidate();});
    $("save").hidden=true;$("save-dismiss").addEventListener("click",function(){self.errorRead=true;$("save").hidden=true;self.invalidate();$("world").focus({preventScroll:true});});
    this.syncMode();
  }
  Interface.prototype.invalidate=function(){this.dirty=true;};
  Interface.prototype.keyboard=function(){return this.root.dataset.input==="keyboard";};
  Interface.prototype.snapshot=function(){
    var s=this.modes&&typeof this.modes.snapshot==="function"?this.modes.snapshot():this.fallback;
    s=s||{};return {mode:modesList.indexOf(s.mode)>=0?s.mode:"walk",detail:s.detail||null,pending:s.pending||null};
  };
  Interface.prototype.mode=function(){return this.snapshot().mode;};
  Interface.prototype.syncMode=function(){
    var s=this.snapshot(),mode=s.mode,detail=s.detail,self=this;
    function show(id,value){var n=$(id);if(n&&n.hidden===!!value){n.hidden=!value;self.invalidate();}}
    function data(name,value){if(self.root.dataset[name]!==value){self.root.dataset[name]=value;self.invalidate();}}
    data("uiMode",mode);data("uiDetail",detail||"none");data("uiPending",String(!!s.pending));
    data("menu",mode==="menu"?"open":"closed");
    var lantern=mode==="walk"&&this.root.dataset.gear==="lantern";
    data("panel",mode==="shed"||mode==="bag"||mode==="binoculars"?mode:lantern?"lantern":"none");
    show("shed-panel",mode==="shed");show("bag-panel",mode==="bag");show("menu",mode==="menu");show("tool-panel",mode==="binoculars"||lantern);
    show("context",mode==="walk"&&this.contextWanted);
    show("shed-main",detail!=="shed-details");show("shed-details",mode==="shed"&&detail==="shed-details");show("shed-details-back",mode==="shed"&&detail==="shed-details");show("shed-details-toggle",mode==="shed"&&detail!=="shed-details");
    attribute($("shed-details-toggle"),"aria-expanded",mode==="shed"&&detail==="shed-details");
    show("bag-main",detail!=="bag-places");show("bag-coast",mode==="bag"&&detail==="bag-places");show("bag-places-back",mode==="bag"&&detail==="bag-places");
    attribute($("bag-places-toggle"),"aria-expanded",mode==="bag"&&detail==="bag-places");
    show("binocular-coast",mode==="binoculars"&&detail==="places");
    attribute($("binocular-places-toggle"),"aria-expanded",mode==="binoculars"&&detail==="places");
    attribute($("more"),"aria-expanded",mode==="menu");
    attribute($("bag"),"aria-expanded",mode==="bag");
    if(mode!=="walk"&&!$("act").hidden)$("act").hidden=true;
    return s;
  };
  Interface.prototype.feedback=function(node,message,mode){var changed=text(node,message);changed=state(node,mode||"result")||changed;if(changed)this.invalidate();};
  Interface.prototype.command=function(button,description,options){
    options=options||{};var disabled=!!options.busy||!description||!description.available;
    var label=description?description.label:options.emptyLabel||"Сложить материалы";
    text(options.label||button,label);attribute(button,"aria-disabled",disabled);
    attribute(button,"aria-busy",!!options.busy&&!!options.active);state(button,options.busy&&options.active?"busy":disabled?"disabled":"normal");
    var reason=description?description.reason:options.emptyReason||"В руках ничего нет. Принеси бревно или доски.";
    text(options.reason,reason||(!options.busy&&description&&description.type!=="upgrade"?description.detail:"")||"");
    // Regular shed actions explain an unavailable attempt through shed-feedback.
    // Their descriptions remain available to assistive technology by ID.
    if(options.reason){
      if(button.closest("#shed-main"))options.reason.hidden=true;
      attribute(button,"aria-describedby",options.describedBy||options.reason.id+(options.busy?" shed-feedback":""));
    }
    var title=reason||description&&description.resultPreview||label;if(button.title!==title)button.title=title;
    return {label:label,reason:reason,disabled:disabled};
  };
  Interface.prototype.context=function(data){
    data=data||{};var a=data.action,key=JSON.stringify([data.visible,data.mode,data.title,data.detail,data.tag,!!data.job,!!data.working,a&&a.label,a&&a.available,a&&a.reason,a&&a.resultPreview]);
    if(this.contextKey===key){this.syncMode();return;}this.contextKey=key;
    var box=$("context"),button=$("context-command");this.contextWanted=data.visible===true;state(box,data.mode||"normal");
    text($("context-title"),data.title);text($("context-detail"),data.detail);
    button.hidden=!data.action;button.dataset.action=data.tag||"";
    if(data.action)this.command(button,data.action);
    $("pause-work").hidden=!data.working;text($("pause-work"),"Приостановить работу");
    $("context-key").hidden=!data.action;this.syncMode();this.invalidate();
  };
  Interface.prototype.panel=function(show,kind){
    if(!this.modes){
      kind=kind||"shed";
      if(kind==="lantern")this.root.dataset.gear=show?"lantern":"none";
      this.fallback={mode:show&&kind!=="lantern"&&modesList.indexOf(kind)>=0?kind:"walk",detail:null,pending:null};
    }
    return this.syncMode();
  };
  Interface.prototype.notify=function(message,kind,milliseconds){
    if(kind==="save"&&($("toast").classList.contains("visible")||$("fullscreen-status").textContent))return;
    clearTimeout(this.fullscreenTimer);text($("fullscreen-status"),"");
    clearTimeout(this.noticeTimer);text($("toast"),message);this.noticeKind=kind||"result";state($("toast"),this.noticeKind);$("toast").classList.add("visible");this.invalidate();
    var self=this;this.noticeTimer=setTimeout(function(){self.clearNotice();},milliseconds||4200);
  };
  Interface.prototype.clearNotice=function(){clearTimeout(this.noticeTimer);$("toast").classList.remove("visible");text($("toast"),"");this.noticeKind="";this.invalidate();};
  Interface.prototype.saveError=function(message){
    if(this.errorKey!==message){this.errorKey=message;this.errorRead=false;}
    text($("save-message"),message);state($("save"),"error");$("save").classList.add("error");$("save").setAttribute("role","alert");$("save").hidden=this.errorRead;this.invalidate();
  };
  Interface.prototype.saveOK=function(origin,quiet){
    var recovered=!!this.errorKey;this.errorKey="";this.errorRead=false;$("save").hidden=true;$("save").classList.remove("error");this.invalidate();
    var now=performance.now();if(!quiet&&(recovered||now-this.lastSaveNotice>30000)){this.notify(origin,"save",2100);this.lastSaveNotice=now;}
  };
  Interface.prototype.fullscreen=function(message){
    this.clearNotice();clearTimeout(this.fullscreenTimer);text($("fullscreen-status"),message);state($("fullscreen-status"),"result");
    var self=this;this.fullscreenTimer=setTimeout(function(){text($("fullscreen-status"),"");self.invalidate();},4800);this.invalidate();
  };
  Interface.prototype.layout=function(){
    var snapshot=this.syncMode();if(!this.dirty&&this.rect)return this.rect;this.dirty=false;
    var canvas=$("world"),w=canvas.clientWidth,h=canvas.clientHeight,left=12,right=w-12,top=12,bottom=h-12;
    function bounds(node){if(!node||node.hidden||!node.getClientRects().length)return null;var cs=getComputedStyle(node);return cs.display==="none"?null:node.getBoundingClientRect();}
    var mode=snapshot.mode,panel=mode==="shed"?bounds($("shed-panel")):mode==="bag"?bounds($("bag-panel")):mode==="menu"?bounds($("menu")):mode==="walk"?bounds($("context")):snapshot.detail==="places"?bounds($("binocular-coast")):null;
    if(panel){if(w>h&&panel.left>w*.4)right=Math.min(right,panel.left-12);else if(panel.top>h*.15)bottom=Math.min(bottom,panel.top-12);}
    var error=bounds($("save"));
    if(error){if(error.top<h*.3)top=Math.max(top,error.bottom+10);else bottom=Math.min(bottom,error.top-10);}
    if(right-left<100)right=Math.min(w-12,left+100);
    if(bottom-top<100)top=Math.max(12,bottom-100);
    this.rect={left:left,right:right,top:top,bottom:bottom,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
    var noticeTop=top+8,controls=bounds(this.root.querySelector(".controls")),optical=mode==="binoculars"?bounds(this.root.querySelector(".tool-heading")):null;
    if(controls)noticeTop=Math.max(noticeTop,controls.bottom+8);
    if(optical)noticeTop=Math.max(noticeTop,optical.bottom+8);
    [$("toast"),$("fullscreen-status")].forEach(function(n){
      if(!n.textContent)return;n.style.left=(left+6)+"px";n.style.right="auto";n.style.width=Math.max(100,Math.min(368,right-left-12))+"px";n.style.bottom="auto";
      var nh=n.getBoundingClientRect().height;n.style.top=Math.max(12,Math.min(h-nh-12,noticeTop))+"px";
    });
    return this.rect;
  };
  G.CloseInterface=Interface;
})(globalThis);
