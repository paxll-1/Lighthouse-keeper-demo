(function(G){
  "use strict";
  var EPS=.000001;
  var unavailableReason="Действие сейчас недоступно.",finishedReason="Дело уже закончено.",pathReason="Здесь не пройти. Выбери тропинку рядом.";
  function point(p){return !!p&&Number.isFinite(p.x)&&Number.isFinite(p.z);}
  function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
  function bounded(n){return Number.isFinite(n)&&n>=0;}
  function descriptor(a){return !!a&&typeof a.id==="string"&&!!a.id&&point(a);}

  // pathTo is the caller's model path adapter. A model path may stop at a
  // nearby free cell, so its existence alone does not prove interaction reach.
  // Empty paths mean the avatar is already at the endpoint. Nothing is consumed.
  function route(o,a){
    if(!point(o.avatar)||!bounded(o.reach))return null;
    var path=o.pathTo(a);
    if(!Array.isArray(path)||!path.every(point))return null;
    var end=path.length?path[path.length-1]:o.avatar;
    if(distance(end,a)>o.reach+EPS||!o.clear(end,a))return null;
    return path;
  }
  function order(a,b){
    if(a.selected!==b.selected)return a.selected?-1:1;
    if(a.distance!==b.distance)return a.distance-b.distance;
    return a.tag<b.tag?-1:a.tag>b.tag?1:a.action.id<b.action.id?-1:a.action.id>b.action.id?1:0;
  }

  // Unavailable but unfinished actions remain candidates: the UI can show the
  // model's reason, including full hands, without making a command executable.
  // radius is a caller-owned UI distance; reach remains the model's distance.
  function select(o){
    if(!point(o.avatar)||!bounded(o.radius)||!bounded(o.reach))return null;
    var candidates=[];
    o.tags.forEach(function(tag){
      var a=o.describe(tag);
      if(!descriptor(a)||a.done)return;
      var d=distance(o.avatar,a);
      if(d>o.radius||o.project&&!o.project(a))return;
      candidates.push({tag:tag,action:a,distance:d,selected:tag===o.selectedTag});
    });
    candidates.sort(order);
    for(var i=0;i<candidates.length;i++){
      var candidate=candidates[i],path=route(o,candidate.action);
      if(path)return {tag:candidate.tag,action:candidate.action,path:path};
    }
    return null;
  }

  // Always describe again on explicit activation; a marker is only a snapshot.
  // The app owns replacing its single job, arrival revalidation and completion.
  // duplicate/unavailable carry no path and never change an existing job.
  function plan(o){
    var a=o.describe(o.tag),result={status:"unavailable",tag:o.tag,action:a||null,path:null,reason:""};
    if(descriptor(a)&&o.activeJob&&o.activeJob.id===a.id){result.status="duplicate";return result;}
    if(!descriptor(a)||a.done||!a.available){result.reason=a&&a.reason||(a&&a.done?finishedReason:unavailableReason);return result;}
    var path=route(o,a);
    if(!path){result.reason=pathReason;return result;}
    result.status="ready";result.path=path;return result;
  }
  G.CloseActionIntent={select:select,plan:plan};
})(globalThis);
