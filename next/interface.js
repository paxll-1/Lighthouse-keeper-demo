// Presentation only: five shared UI roles. No game state, save writes or loop.
(function(G){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  function text(node,value){if(node&&node.textContent!==String(value||""))node.textContent=value||"";}
  function state(node,value){if(node&&node.dataset.state!==value)node.dataset.state=value;}
  function Interface(){
    var self=this;this.root=$("game");this.dirty=true;this.rect=null;this.noticeTimer=null;this.fullscreenTimer=null;this.errorKey="";this.errorRead=false;this.lastSaveNotice=-Infinity;this.noticeKind="";
    this.root.dataset.input=matchMedia("(pointer:coarse)").matches?"touch":"keyboard";
    document.addEventListener("pointerdown",function(e){self.root.dataset.input=e.pointerType==="touch"||e.pointerType==="pen"?"touch":"mouse";self.invalidate();},{capture:true,passive:true});
    document.addEventListener("keydown",function(e){if(!e.metaKey&&!e.ctrlKey&&!e.altKey){self.root.dataset.input="keyboard";self.invalidate();}},{capture:true});
    var observer=new ResizeObserver(function(){self.invalidate();});
    [this.root,document.querySelector('.hud'),$("context"),$("shed-panel"),$("menu"),$("save")].forEach(function(n){if(n)observer.observe(n);});
    if(G.visualViewport)visualViewport.addEventListener("resize",function(){self.invalidate();});
    $("save").hidden=true;$("save-dismiss").addEventListener("click",function(){self.errorRead=true;$("save").hidden=true;self.invalidate();$("world").focus({preventScroll:true});});
  }
  Interface.prototype.invalidate=function(){this.dirty=true;};
  Interface.prototype.keyboard=function(){return this.root.dataset.input==="keyboard";};
  Interface.prototype.feedback=function(node,message,mode){text(node,message);state(node,mode||"result");};
  Interface.prototype.command=function(button,description,options){
    options=options||{};var disabled=!!options.busy||!description||!description.available;
    var label=description?description.label:options.emptyLabel||"Сложить материалы";
    text(options.label||button,label);button.setAttribute("aria-disabled",String(disabled));
    button.setAttribute("aria-busy",String(!!options.busy&&!!options.active));state(button,options.busy&&options.active?"busy":disabled?"disabled":"normal");
    var reason=description?description.reason:options.emptyReason||"В руках ничего нет. Принеси бревно или доски.";
    text(options.reason,reason||(!options.busy&&description&&description.type!=="upgrade"?description.detail:"")||"");
    if(options.reason)button.setAttribute("aria-describedby",options.describedBy||options.reason.id+(options.busy?" shed-feedback":""));
    button.title=reason||description&&description.resultPreview||label;
    return {label:label,reason:reason,disabled:disabled};
  };
  Interface.prototype.context=function(data){
    var box=$("context"),button=$("context-command");state(box,data.mode||"normal");
    text($("context-title"),data.title);text($("context-detail"),data.detail);
    button.hidden=!data.action;button.dataset.action=data.tag||"";
    if(data.action)this.command(button,data.action);
    $("pause-work").hidden=!data.job; text($("pause-work"),data.working?"Приостановить работу":"Остановиться");
    $("context-key").hidden=!data.action;
  };
  Interface.prototype.panel=function(show){
    if($("shed-panel").hidden===show){$("shed-panel").hidden=!show;this.invalidate();}
    var value=show?"shed":"";if(this.root.dataset.panel!==value){this.root.dataset.panel=value;this.invalidate();}
    if(show){$("act").hidden=true;$("context-command").hidden=true;}
  };
  Interface.prototype.notify=function(message,kind,milliseconds){
    if(kind==="save"&&($("toast").classList.contains("visible")||$("fullscreen-status").textContent))return;
    clearTimeout(this.fullscreenTimer);text($("fullscreen-status"),"");
    clearTimeout(this.noticeTimer);text($("toast"),message);this.noticeKind=kind||"result";state($("toast"),this.noticeKind);$("toast").classList.add("visible");
    this.invalidate();
    var self=this;this.noticeTimer=setTimeout(function(){self.clearNotice();},milliseconds||4200);
  };
  Interface.prototype.clearNotice=function(){clearTimeout(this.noticeTimer);$("toast").classList.remove("visible");text($("toast"),"");this.noticeKind="";};
  Interface.prototype.saveError=function(message){
    if(this.errorKey!==message){this.errorKey=message;this.errorRead=false;}
    text($("save-message"),message);state($("save"),"error");$("save").classList.add("error");$("save").setAttribute("role","alert");$("save").hidden=this.errorRead;this.invalidate();
  };
  Interface.prototype.saveOK=function(origin,quiet){
    var recovered=!!this.errorKey;this.errorKey="";this.errorRead=false;$("save").hidden=true;$("save").classList.remove("error");this.invalidate();
    var now=performance.now();if(!quiet&&(recovered||now-this.lastSaveNotice>30000)){this.notify(origin,"save",2100);this.lastSaveNotice=now;}
  };
  Interface.prototype.fullscreen=function(message){
    this.clearNotice();
    clearTimeout(this.fullscreenTimer);text($("fullscreen-status"),message);state($("fullscreen-status"),"result");
    this.fullscreenTimer=setTimeout(function(){text($("fullscreen-status"),"");},4800);this.invalidate();
  };
  Interface.prototype.layout=function(){
    if(!this.dirty&&this.rect)return this.rect;this.dirty=false;
    var canvas=$("world"),w=canvas.clientWidth,h=canvas.clientHeight,left=12,right=w-12,top=12,bottom=h-12;
    function bounds(node){if(!node||node.hidden||!node.getClientRects().length)return null;var cs=getComputedStyle(node);return cs.display==="none"?null:node.getBoundingClientRect();}
    var hud=bounds(document.querySelector('.hud')),controls=bounds(document.querySelector('.controls'));
    top=Math.max(top,hud?hud.bottom+12:0,controls?controls.bottom+10:0);
    var panel=bounds($("shed-panel"))||bounds($("context")),menu=bounds($("menu")),error=bounds($("save"));
    if(menu&&w<=h)top=Math.max(top,menu.bottom+12);
    [panel,w>h?menu:null].forEach(function(b){if(!b)return;if(w>h&&b.left>w*.42)right=Math.min(right,b.left-12);else if(b.top>h*.28)bottom=Math.min(bottom,b.top-12);else if(b.right<w*.58)left=Math.max(left,b.right+12);});
    if(error&&error.top>h*.3)bottom=Math.min(bottom,error.top-10);
    // Even a short viewport keeps a real, bounded scene area. Panels scroll.
    if(right-left<100)right=Math.min(w-12,left+100);
    if(bottom-top<100)top=Math.max(12,bottom-100);
    this.rect={left:left,right:right,top:top,bottom:bottom,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
    [$("toast"),$("fullscreen-status")].forEach(function(n){
      if(!n.textContent)return;n.style.left=(left+6)+"px";n.style.right="auto";n.style.width=Math.max(100,Math.min(368,right-left-12))+"px";n.style.bottom="auto";
      var nh=n.getBoundingClientRect().height;n.style.top=Math.max(12,Math.min(h-nh-12,top+8))+"px";
    });
    return this.rect;
  };
  G.CloseInterface=Interface;
})(globalThis);
