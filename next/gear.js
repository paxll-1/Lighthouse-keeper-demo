// Session presentation only. The controller owns modes and app binds actions.
(function(G){
  "use strict";
  var zoomFormat=new Intl.NumberFormat("ru",{maximumFractionDigits:1});
  var ids=Object.freeze({bag:"bag",bagPanel:"bag-panel",bagClose:"bag-close",bagStatus:"bag-status",lantern:"gear-lantern",binoculars:"gear-binoculars",bagCargo:"bag-cargo",bagPlaces:"bag-places",bagPlacesToggle:"bag-places-toggle",bagPlacesBack:"bag-places-back",toolPanel:"tool-panel",toolClose:"tool-close",toolTitle:"tool-title",toolStatus:"tool-status",zoom:"binocular-zoom",minus:"binocular-minus",plus:"binocular-plus",previous:"coast-previous",next:"coast-next",point:"coast-point",points:"binocular-points",placesToggle:"binocular-places-toggle",placesBack:"binocular-places-back"});
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
      var label=document.createElement("span");label.textContent=action==="walk"?"Пройти: "+point.name:point.name;button.append(label);
      if(action==="walk"&&point.detail){var detail=document.createElement("small");detail.textContent=point.detail;button.append(detail);}
      if(action==="look")button.setAttribute("aria-pressed","false");fragment.append(button);
    });
    node.replaceChildren(fragment);
  }
  function Gear(view){this.view=view;this.pointsKey=null;this.bagWasOpen=false;this.detail=null;}
  Gear.ids=ids;
  Gear.prototype.render=function(data){
    data=data||{};var view=this.view,changed=false;
    var mode=data.mode==="lantern"||data.mode==="binoculars"?data.mode:"none";
    // Equipment never navigates: panel() reads the controller when supplied.
    attr(view.root,"data-gear",mode);attr($("tool-panel"),"data-mode",mode);
    var intended=data.bagOpen?"bag":mode;view.panel(intended!=="none",intended);
    var snapshot=view.snapshot?view.snapshot():{mode:data.bagOpen?"bag":mode==="binoculars"?"binoculars":"walk",detail:null};
    var bagOpen=snapshot.mode==="bag",bagPlaces=bagOpen&&snapshot.detail==="bag-places";
    var points=(Array.isArray(data.points)?data.points:[]).filter(function(p){return p&&p.id!=null;}).slice(0,12).map(function(p){return {id:String(p.id),name:String(p.name||p.label||"Берег"),detail:String(p.detail||"")};});
    var pointId=data.point&&typeof data.point==="object"?String(data.point.id):data.point==null?"":String(data.point);
    attr($("bag"),"aria-expanded",bagOpen);attr($("bag"),"aria-pressed",bagOpen||mode!=="none");
    attr($("bag"),"aria-label",bagOpen?"Закрыть сумку смотрителя":"Сумка смотрителя");
    attr($("bag"),"title",(bagOpen?"Закрыть сумку":"Сумка смотрителя")+(view.keyboard()?" (B)":""));
    changed=text($("bag-title"),bagPlaces?"Прогулка":"Сумка")||changed;
    changed=text($("bag-status"),data.status||"")||changed;changed=hidden($("bag-status"),!data.status)||changed;
    if(bagOpen&&(!this.bagWasOpen||snapshot.detail!==this.detail))$("bag-scroll").scrollTop=0;
    this.bagWasOpen=bagOpen;this.detail=snapshot.detail;
    changed=text($("bag-cargo"),cargoLabel(data.cargo))||changed;
    var pointsKey=JSON.stringify(points);
    if(this.pointsKey!==pointsKey){choices($("bag-places"),points,"walk");choices($("binocular-points"),points,"look");this.pointsKey=pointsKey;changed=true;}
    changed=hidden($("bag-places-toggle"),!points.length)||changed;
    changed=hidden($("bag-main"),bagPlaces)||changed;changed=hidden($("bag-coast"),!bagPlaces)||changed;changed=hidden($("bag-places-back"),!bagPlaces)||changed;
    attr($("bag-places-toggle"),"aria-expanded",bagPlaces);
    changed=text($("tool-title"),mode==="lantern"?"Фонарь":"Бинокль")||changed;
    // The view can turn freely, so a selected destination is not a gaze label.
    changed=text($("tool-status"),"")||changed;changed=hidden($("tool-status"),true)||changed;
    changed=text($("tool-close-label"),mode==="lantern"?"Убрать фонарь":"Выйти")||changed;
    attr($("tool-close"),"aria-label",mode==="lantern"?"Убрать фонарь":"Выйти из бинокля");
    attr($("tool-close"),"title",(mode==="lantern"?"Убрать фонарь":"Выйти из бинокля")+(view.keyboard()?" (Esc)":""));
    attr($("tool-panel"),"aria-describedby",mode==="binoculars"?"binocular-instructions":"");
    changed=hidden($("tool-scroll"),mode!=="binoculars")||changed;
    // Walk destinations belong in the bag. Keep the old nodes for app bindings,
    // but never open a list or navigation panel over the optical view.
    changed=hidden($("binocular-coast"),true)||changed;
    changed=hidden($("binocular-places-toggle"),true)||changed;
    attr($("binocular-places-toggle"),"aria-expanded",false);
    var min=Number.isFinite(data.minZoom)?data.minZoom:1,max=Number.isFinite(data.maxZoom)?Math.max(min,data.maxZoom):7;
    var zoom=Math.max(min,Math.min(max,Number.isFinite(data.zoom)?data.zoom:min));
    text($("binocular-zoom"),zoomFormat.format(zoom)+"×");
    attr($("binocular-minus"),"aria-disabled",zoom<=min+.001);attr($("binocular-plus"),"aria-disabled",zoom>=max-.001);
    attr($("binocular-minus"),"title","Уменьшить приближение"+(view.keyboard()?" (−)":""));
    attr($("binocular-plus"),"title","Увеличить приближение"+(view.keyboard()?" (+)":""));
    attr($("coast-previous"),"aria-disabled",points.length<2);attr($("coast-next"),"aria-disabled",points.length<2);
    changed=text($("coast-point"),mode==="binoculars"?"Бинокль":"")||changed;
    $("binocular-points").querySelectorAll("[data-coast-point]").forEach(function(button){var selected=button.dataset.coastPoint===pointId;attr(button,"aria-pressed",selected);attr(button,"data-state",selected?"selected":"normal");});
    if(changed)view.invalidate();
  };
  G.CloseGear=Gear;
})(globalThis);
