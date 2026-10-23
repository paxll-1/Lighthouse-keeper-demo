// Session presentation only. App owns modes, focus, input, camera and all progress.
// Bind the static IDs or delegate [data-coast-action][data-coast-point] in app.
(function(G){
  "use strict";
  var zoomFormat=new Intl.NumberFormat("ru",{maximumFractionDigits:1});
  var ids=Object.freeze({bag:"bag",bagPanel:"bag-panel",bagClose:"bag-close",bagStatus:"bag-status",lantern:"gear-lantern",binoculars:"gear-binoculars",bagCargo:"bag-cargo",bagPlaces:"bag-places",toolPanel:"tool-panel",toolClose:"tool-close",toolTitle:"tool-title",toolStatus:"tool-status",zoom:"binocular-zoom",minus:"binocular-minus",plus:"binocular-plus",previous:"coast-previous",next:"coast-next",point:"coast-point",points:"binocular-points"});
  function $(id){return document.getElementById(id);}
  function text(node,value){value=String(value==null?"":value);if(node.textContent===value)return false;node.textContent=value;return true;}
  function attr(node,key,value){value=String(value);if(node.getAttribute(key)!==value)node.setAttribute(key,value);}
  function hidden(node,value){if(node.hidden===value)return false;node.hidden=value;return true;}
  function cargoLabel(cargo){
    if(typeof cargo==="string")return cargo;
    if(!cargo||!cargo.amount)return "Руки свободны";
    var kind=cargo.kind||cargo.type,amount=Number(cargo.amount);
    if(kind==="logs")return "В руках: "+amount+" бревно";
    if(kind==="boards")return "В руках: "+amount+(amount===1?" доска":" доски");
    return "Груз остаётся в руках";
  }
  function pointToken(id){return Array.from(id).map(function(c){return c.codePointAt(0).toString(16);}).join("-");}
  function choices(node,points,action){
    var fragment=document.createDocumentFragment();
    points.forEach(function(point){
      var button=document.createElement("button");button.type="button";button.className="coast-choice";
      button.id=(action==="walk"?"bag-place-":"binocular-point-")+pointToken(point.id);
      button.dataset.coastAction=action;button.dataset.coastPoint=point.id;
      var label=document.createElement("span");label.textContent=action==="walk"?"Пройти к месту «"+point.name+"»":"Посмотреть: "+point.name;button.append(label);
      if(action==="walk"&&point.detail){var detail=document.createElement("small");detail.textContent=point.detail;button.append(detail);}
      if(action==="look")button.setAttribute("aria-pressed","false");
      fragment.append(button);
    });
    node.replaceChildren(fragment);
  }
  function Gear(view){this.view=view;this.pointsKey=null;this.bagWasOpen=false;}
  Gear.ids=ids;
  Gear.prototype.render=function(data){
    data=data||{};var view=this.view,changed=false,bagOpen=!!data.bagOpen;
    var mode=data.mode==="lantern"||data.mode==="binoculars"?data.mode:"none";
    var points=(Array.isArray(data.points)?data.points:[]).filter(function(p){return p&&p.id!=null;}).slice(0,3).map(function(p){return {id:String(p.id),name:String(p.name||p.label||"Берег"),detail:String(p.detail||"")};});
    var pointId=data.point&&typeof data.point==="object"?String(data.point.id):data.point==null?"":String(data.point);
    var point=points.find(function(p){return p.id===pointId;})||null;
    var panel=bagOpen?"bag":mode;
    if(panel!=="none")view.panel(true,panel);
    else if(["bag","lantern","binoculars"].indexOf(view.root.dataset.panel)>=0)view.panel(false);
    attr(view.root,"data-gear",mode);attr($("tool-panel"),"data-mode",mode);
    attr($("bag"),"aria-expanded",bagOpen);attr($("bag"),"aria-pressed",bagOpen||mode!=="none");
    attr($("bag"),"aria-label",bagOpen?"Закрыть сумку смотрителя":"Сумка смотрителя");
    attr($("bag"),"title",(bagOpen?"Закрыть сумку":"Сумка смотрителя")+(view.keyboard()?" (B)":""));
    changed=text($("bag-status"),data.status||"Инструменты для спокойного осмотра. Груз остаётся с тобой.")||changed;
    if(bagOpen&&!this.bagWasOpen)$("bag-scroll").scrollTop=0;
    this.bagWasOpen=bagOpen;
    changed=text($("bag-cargo"),cargoLabel(data.cargo))||changed;
    var pointsKey=JSON.stringify(points);
    if(this.pointsKey!==pointsKey){choices($("bag-places"),points,"walk");choices($("binocular-points"),points,"look");this.pointsKey=pointsKey;changed=true;}
    changed=hidden($("bag-coast"),!points.length)||changed;
    changed=hidden($("binocular-coast"),!points.length)||changed;
    var title=mode==="lantern"?"Фонарь":"Бинокль";
    var status=data.status||(mode==="lantern"?"Мягкий свет у пояса.":point?point.name:"Спокойный взгляд с места.");
    changed=text($("tool-title"),title)||changed;changed=text($("tool-status"),status)||changed;
    changed=text($("tool-close-label"),mode==="lantern"?"Убрать":"Выйти")||changed;
    attr($("tool-close"),"aria-label",mode==="lantern"?"Убрать фонарь":"Выйти из бинокля");
    attr($("tool-close"),"title",(mode==="lantern"?"Убрать фонарь":"Выйти из бинокля")+(view.keyboard()?" (Esc)":""));
    changed=hidden($("tool-scroll"),mode!=="binoculars")||changed;
    var min=Number.isFinite(data.minZoom)?data.minZoom:1,max=Number.isFinite(data.maxZoom)?Math.max(min,data.maxZoom):4;
    var zoom=Number.isFinite(data.zoom)?data.zoom:min;
    text($("binocular-zoom"),zoomFormat.format(zoom)+"×");
    attr($("binocular-minus"),"aria-disabled",zoom<=min+.001);attr($("binocular-plus"),"aria-disabled",zoom>=max-.001);
    attr($("coast-previous"),"aria-disabled",points.length<2);attr($("coast-next"),"aria-disabled",points.length<2);
    changed=text($("coast-point"),point?point.name:"Выбери место")||changed;
    $("binocular-points").querySelectorAll("[data-coast-point]").forEach(function(button){var selected=button.dataset.coastPoint===pointId;attr(button,"aria-pressed",selected);attr(button,"data-state",selected?"selected":"normal");});
    if(changed)view.invalidate();
  };
  G.CloseGear=Gear;
})(globalThis);
