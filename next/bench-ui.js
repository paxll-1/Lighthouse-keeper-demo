// One-workbench presentation experiment. App owns selection, work, feedback
// lifetimes, input, progress, camera and saves. No listeners or independent loop.
(function(G){
  "use strict";
  var ids=Object.freeze({root:"bench-ui",select:"bench-select",prompt:"bench-prompt",confirm:"bench-confirm",dismiss:"bench-dismiss",notes:"bench-notes",instruction:"bench-instruction",reason:"bench-reason",pause:"bench-pause",workStatus:"bench-work-status",result:"bench-result"});
  function $(id){return document.getElementById(id);}
  function text(node,value){value=String(value==null?"":value);if(node.textContent===value)return false;node.textContent=value;return true;}
  function attr(node,key,value){value=String(value);if(node.getAttribute(key)!==value)node.setAttribute(key,value);}
  function hide(node,value){if(node.hidden===value)return false;node.hidden=value;return true;}
  function style(node,key,value){if(node.style[key]!==value)node.style[key]=value;}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function finite(n,fallback){return Number.isFinite(n)?n:fallback;}
  function pixels(n){return (Math.round(n*10)/10)+"px";}
  function area(view,provided){
    var canvas=$("world"),width=canvas.clientWidth,height=canvas.clientHeight,q=provided||view.layout();
    var left=clamp(finite(q.left,12),0,Math.max(0,width-44)),top=clamp(finite(q.top,12),0,Math.max(0,height-44));
    var right=clamp(finite(q.right,left+finite(q.width,width-24)),left+44,width),bottom=clamp(finite(q.bottom,top+finite(q.height,height-24)),top+44,height);
    return {left:left,top:top,right:right,bottom:bottom,width:right-left,height:bottom-top};
  }
  function hitBox(rect,safe){
    if(!rect)return null;
    var left=finite(rect.left,rect.x),top=finite(rect.top,rect.y),width=finite(rect.width,finite(rect.right,0)-left),height=finite(rect.height,finite(rect.bottom,0)-top);
    if(!Number.isFinite(left)||!Number.isFinite(top)||width<=0||height<=0||left+width<=safe.left||top+height<=safe.top||left>=safe.right||top>=safe.bottom)return null;
    width=Math.min(safe.width,Math.max(44,width));height=Math.min(safe.height,Math.max(44,height));
    return {left:clamp(left,safe.left,safe.right-width),top:clamp(top,safe.top,safe.bottom-height),width:width,height:height};
  }
  function place(node,point,safe,size){
    var x=finite(point&&point.x,(safe.left+safe.right)/2),y=finite(point&&point.y,(safe.top+safe.bottom)/2);
    var left=clamp(x-size.width/2,safe.left,safe.right-size.width);
    var top=y-size.height-14;if(top<safe.top)top=y+14;
    top=clamp(top,safe.top,safe.bottom-size.height);
    style(node,"left",pixels(left));style(node,"top",pixels(top));
  }
  function Probe(view){this.view=view;this.measureKey="";this.promptSize=null;this.resultSize=null;}
  Probe.ids=ids;
  Probe.prototype.render=function(data){
    data=data||{};var view=this.view,permitted=!!data.enabled&&!!data.eligible;
    var focused=!!data.focused||document.activeElement===$("bench-select"),chosen=!!data.selected||focused;
    var busy=!!data.busy||!!data.working||!!data.travelling,working=!!data.working,done=!!data.done;
    var owns=permitted&&(typeof data.ownsContext==="boolean"?data.ownsContext:!!data.near||chosen||busy||done);
    var old=view.root.dataset.benchWorld||"";attr(view.root,"data-bench-world",owns?"active":"");
    if(old!==(owns?"active":""))view.invalidate();
    var visible=permitted&&(chosen||busy||done||!!data.hitRect);hide($("bench-ui"),!visible);
    attr($("bench-ui"),"data-state",busy?(working?"working":"travelling"):done?"result":chosen?"selected":"idle");
    var confirm=permitted&&chosen&&!busy&&!done,pause=permitted&&busy,result=permitted&&done;
    hide($("bench-prompt"),!confirm&&!pause);hide($("bench-confirm"),!confirm);hide($("bench-dismiss"),!confirm);hide($("bench-instruction"),!confirm);hide($("bench-pause"),!pause);hide($("bench-result"),!result);
    var description=data.description||{},reason=confirm?String(data.reason||""):"";
    text($("bench-reason"),reason);hide($("bench-reason"),!reason);
    attr($("bench-confirm"),"aria-disabled",!description.available);
    attr($("bench-confirm"),"aria-describedby","bench-instruction"+(reason?" bench-reason":""));
    text($("bench-confirm"),data.near?"Распилить · 2 доски":"Подойти и распилить");
    attr($("bench-confirm"),"aria-label",(data.near?description.label||"Распилить бревно":"Подойти к верстаку и распилить бревно")+". "+(description.resultPreview||"Две доски останутся в руках."));
    attr($("bench-select"),"aria-pressed",chosen);attr($("bench-select"),"aria-expanded",confirm);
    if(confirm)attr($("bench-select"),"aria-describedby","bench-instruction");else if($("bench-select").hasAttribute("aria-describedby"))$("bench-select").removeAttribute("aria-describedby");
    text($("bench-pause"),working?"Пауза":"Остановиться");
    attr($("bench-pause"),"aria-label",working?"Приостановить распил":"Остановиться по пути к верстаку");
    attr($("bench-pause"),"title",(working?"Приостановить распил":"Остановиться")+(view.keyboard()?" (Esc)":""));
    text($("bench-work-status"),working?"Идёт распил. Сделанная часть сохранится при паузе.":"Смотритель идёт к верстаку. Можно остановиться.");
    var resultText=typeof data.done==="string"?data.done:done?"Распил завершён."+(data.cargo?" "+data.cargo+".":""):"";
    text($("bench-result"),resultText);
    if(!visible){hide($("bench-select"),true);return {ownsContext:owns,selectVisible:false,confirmVisible:false,pauseVisible:false,resultVisible:false};}
    var safe=area(view,data.sceneRect),rect=permitted&&!busy&&!done?hitBox(data.hitRect,safe):null;
    hide($("bench-select"),!rect);
    if(rect){style($("bench-select"),"left",pixels(rect.left));style($("bench-select"),"top",pixels(rect.top));style($("bench-select"),"width",pixels(rect.width));style($("bench-select"),"height",pixels(rect.height));}
    var maxWidth=pixels(Math.min(284,safe.width)),maxHeight=pixels(safe.height);style($("bench-prompt"),"maxWidth",maxWidth);style($("bench-prompt"),"maxHeight",maxHeight);style($("bench-result"),"maxWidth",maxWidth);
    var measureKey=[confirm,pause,result,working,data.near,reason,resultText,maxWidth,maxHeight].join("|");
    if(this.measureKey!==measureKey){this.promptSize=null;this.resultSize=null;this.measureKey=measureKey;}
    if(confirm||pause){if(!this.promptSize){var p=$("bench-prompt").getBoundingClientRect();this.promptSize={width:Math.min(safe.width,p.width),height:Math.min(safe.height,p.height)};}place($("bench-prompt"),data.commandPoint,safe,this.promptSize);}
    if(result){if(!this.resultSize){var r=$("bench-result").getBoundingClientRect();this.resultSize={width:Math.min(safe.width,r.width),height:Math.min(safe.height,r.height)};}place($("bench-result"),data.commandPoint,safe,this.resultSize);}
    return {ownsContext:owns,selectVisible:!!rect,confirmVisible:confirm,pauseVisible:pause,resultVisible:result};
  };
  G.CloseBenchProbe=Probe;
})(globalThis);
