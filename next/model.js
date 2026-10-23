(function(G){
  "use strict";
  var C=G.CloseConfig,clone=function(x){return JSON.parse(JSON.stringify(x));};
  // A defensive format bound, not storage capacity or a conservation rule.
  // Legacy saves could independently contain the maximum stock, stats and all sources.
  var MAX_COUNTER=1000000;
  function emptyCarry(){return {kind:null,amount:0};}
  function cargo(s){return s.carry||emptyCarry();}
  function held(s,kind){var c=cargo(s);return c.kind===kind?c.amount:0;}
  function capacity(s){return C.shed.capacity[s.shedLevel||0];}
  function create(){return {version:C.version,avatar:clone(C.start),logs:0,boards:0,carry:emptyCarry(),shedLevel:0,repaired:false,lit:false,stairs:false,galleryRepaired:false,daylight:.12,trees:C.trees.map(function(t){return Object.assign({},t,{felled:false,collected:false});}),shore:C.shore.map(function(t){return Object.assign({},t,{collected:false});}),progress:{},stats:{chopped:0,sawn:0,collected:0}};}
  function tree(s,id){return s.trees.find(function(t){return t&&t.id===id;});}
  function info(s,id){
    var a={id:id,type:"",x:0,z:0,faceX:0,faceZ:0,label:"",reason:"",seconds:0,done:false,amount:0};
    var parts=String(id).split(":"),t=tree(s,parts[1]),c=cargo(s),kind=parts[1];
    if(parts[0]==="chop"&&t){a.type="chop";a.x=t.x;a.z=t.z+1.15;a.faceX=t.x;a.faceZ=t.z;a.label="Срубить дерево";a.done=t.felled;if(t.felled)a.reason="Дерево уже срублено";}
    else if(parts[0]==="collect"&&t){a.type="collect";a.x=t.x+.75;a.z=t.z+.85;a.faceX=t.x+.65;a.faceZ=t.z;a.label="Поднять древесину";a.done=t.collected;if(!t.felled||t.collected)a.reason="Здесь нет древесины";else if(c.amount)a.reason="Руки заняты. Отнеси груз к навесу или используй его.";}
    else if(parts[0]==="drift"){var d=(s.shore||[]).find(function(v){return v.id===parts[1];});if(!d)return null;a.type="collect";a.x=d.x;a.z=d.z+.7;a.faceX=d.x;a.faceZ=d.z;a.label="Поднять плавник";a.done=d.collected;if(d.collected)a.reason="Плавник уже подобран";else if(c.amount)a.reason="Руки заняты. Плавник останется здесь.";}
    else if(id==="saw"){a.type="saw";a.x=C.bench.x+.75;a.z=C.bench.z+1.25;a.faceX=C.bench.x+.75;a.faceZ=C.bench.z;a.label="Распилить принесённое бревно";if(held(s,"logs")<1)a.reason=s.logs>0?"Возьми бревно из навеса и принеси к верстаку.":"Принеси бревно: из рощи или с берега.";}
    else if(id==="repair"){a.type="repair";a.x=C.step.x;a.z=C.step.z+1.15;a.faceX=C.step.x;a.faceZ=C.step.z;a.label="Починить ступень у дома";a.done=s.repaired;if(s.repaired)a.reason="Ступень починена";else if(held(s,"boards")<C.repairBoards)a.reason="Принеси "+C.repairBoards+" доски в руках: с верстака или из навеса.";}
    else if(id==="stairs"){a.type="repair";a.x=C.stairs.x;a.z=C.stairs.z-1.05;a.faceX=C.stairs.x;a.faceZ=C.stairs.z;a.label="Восстановить спуск";a.done=!!s.stairs;if(s.stairs)a.reason="Спуск восстановлен";else if(held(s,"boards")<C.stairsBoards)a.reason="Принеси "+C.stairsBoards+" доски в руках: с верстака или из навеса.";}
    else if(id==="gallery-repair"||id==="gallery-view"){
      a.x=C.gallery.approach.x;a.z=C.gallery.approach.z;a.faceX=C.lighthouse.x;a.faceZ=C.lighthouse.z;
      if(id==="gallery-repair"){
        a.type="repair";a.label="Восстановить галерею";a.done=s.galleryRepaired===true;
        if(a.done)a.reason="Галерея восстановлена";
        else if(held(s,"boards")<C.gallery.repairBoards)a.reason="Принеси "+C.gallery.repairBoards+" доски в руках: с верстака или из навеса.";
      }else {a.type="view";a.label="Подняться на галерею";if(s.galleryRepaired!==true)a.reason="Сначала восстанови галерею: настил и перила.";}
    }
    else if((parts[0]==="store"||parts[0]==="take"||parts[0]==="shed")&&(kind==="logs"||kind==="boards"||id==="shed:upgrade")){
      if(kind==="upgrade"&&parts[0]!=="shed")return null;
      var zone=C.shed.zones[kind];a.x=zone.x;a.z=zone.z;a.faceX=5.4;a.faceZ=kind==="upgrade"?-3.08:zone.z;a.type=parts[0]==="shed"?(kind==="upgrade"?"upgrade":"shed"):parts[0];
      if(a.type==="shed")a.label="Открыть навес: брёвна и доски";
      else if(a.type==="upgrade"){a.label="Улучшить навес";a.done=s.shedLevel===C.shed.capacity.length-1;if(a.done)a.reason="Навес уже расширен";else if(s.boards<C.shed.upgradeBoards)a.reason="Сложи в навес "+C.shed.upgradeBoards+" доски для улучшения.";}
      else if(a.type==="store"){
        a.label=kind==="logs"?"Сложить бревно":"Сложить доски";a.amount=Math.min(held(s,kind),Math.max(0,capacity(s)[kind]-s[kind]));
        if(!held(s,kind))a.reason=c.amount?"Это отсек другого материала. Выбери отсек груза в руках.":"В руках ничего нет. Принеси древесину или доски.";
        else if(!a.amount)a.reason=(kind==="logs"?"Брёвна: ":"Доски: ")+s[kind]+"/"+capacity(s)[kind]+". Отсек полон; груз останется в руках.";
      }else {
        a.label=kind==="logs"?"Взять бревно":"Взять доски";a.amount=Math.min(s[kind],C.carryLimit[kind]-held(s,kind));
        if(c.amount&&c.kind!==kind)a.reason="Руки заняты другим материалом. Сначала сложи или используй груз.";
        else if(held(s,kind)>=C.carryLimit[kind])a.reason="В руках уже полный груз.";
        else if(s[kind]<1)a.reason=kind==="logs"?"В навесе нет брёвен.":"В навесе нет досок.";
      }
    }
    else if(id==="rest"){a.type="rest";a.x=C.seat.x-1;a.z=C.seat.z;a.faceX=a.x-1;a.faceZ=a.z;a.label="Присесть у моря";}
    else if(id==="light"){a.type="light";a.x=C.lighthouse.x;a.z=C.lighthouse.z+1.7;a.faceX=C.lighthouse.x;a.faceZ=C.lighthouse.z;a.label=s.lit?"Огонь уже горит":"Зажечь вечерний огонь";a.done=s.lit;if(!s.repaired)a.reason="Сначала почини ступень у дома";else if(s.lit)a.reason="Маяк светит";}
    else return null;
    a.seconds=a.type==="rest"||a.type==="shed"||a.type==="view"?0:id==="gallery-repair"?C.gallery.repairSeconds:id==="stairs"?C.workSeconds.stairs:C.workSeconds[a.type];a.progress=s.progress[id]||0;a.available=!a.reason;return a;
  }
  function finish(s,id){
    if(!s||s.version!==C.version||!valid(s))return {ok:false,state:s,reason:"Состояние не прочитано. Материалы не изменены."};
    var a=info(s,id);if(!a||!a.available||a.type==="rest"||a.type==="shed"||a.type==="view")return {ok:false,state:s,reason:a?a.reason:"Неизвестное дело."};
    var n=clone(s),t=tree(n,String(id).split(":")[1]),kind=String(id).split(":")[1];
    if(a.type==="chop"){t.felled=true;n.stats.chopped++;}
    if(a.type==="collect"){if(t)t.collected=true;else n.shore.find(function(v){return v.id===kind;}).collected=true;n.carry={kind:"logs",amount:C.logsPerTree};n.stats.collected++;}
    if(a.type==="saw"){n.carry={kind:"boards",amount:C.boardsPerLog};n.stats.sawn++;}
    if(id==="repair"){n.carry.amount-=C.repairBoards;n.repaired=true;}
    if(id==="stairs"){n.carry.amount-=C.stairsBoards;n.stairs=true;}
    if(id==="gallery-repair"){n.carry.amount-=C.gallery.repairBoards;n.galleryRepaired=true;}
    if(a.type==="store"){n[kind]+=a.amount;n.carry.amount-=a.amount;}
    if(a.type==="take"){n[kind]-=a.amount;n.carry={kind:kind,amount:held(s,kind)+a.amount};}
    if(a.type==="upgrade"){n.boards-=C.shed.upgradeBoards;n.shedLevel++;}
    if(a.type==="light")n.lit=true;
    if(!n.carry.amount)n.carry=emptyCarry();
    delete n.progress[id];
    if(a.type!=="store"&&a.type!=="take"){n.daylight=Math.min(.82,n.daylight+C.daylightPerWork);if(n.repaired)n.daylight=Math.max(.64,n.daylight);}
    if(!valid(n))return {ok:false,state:s,reason:"Значение за пределами сохранения. Материалы не изменены."};
    return {ok:true,state:n,amount:a.amount};
  }
  function count(n){return Number.isSafeInteger(n)&&n>=0&&n<=MAX_COUNTER;}
  function validate(s){
    if(!s||[1,2,C.version].indexOf(s.version)<0)return false;
    var legacy=s.version<3,v1=s.version===1,bases=v1?C.trees.slice(0,3):C.trees,total=v1?3:C.trees.length+C.shore.length;
    if(!s.avatar||!Number.isFinite(s.avatar.x)||!Number.isFinite(s.avatar.z)||!Number.isFinite(s.avatar.heading)||s.avatar.x< -18||s.avatar.x>(legacy?18:C.terrain.coastExtension.saveXMax)||Math.abs(s.avatar.z)>14)return false;
    // Preserve the old independent limits and accepted shapes before migration.
    if(legacy?(!Number.isInteger(s.logs)||s.logs<0||s.logs>total||!Number.isInteger(s.boards)||s.boards<0||s.boards>total*C.boardsPerLog):(!count(s.logs)||!count(s.boards)))return false;
    if(typeof s.repaired!=="boolean"||typeof s.lit!=="boolean"||!Number.isFinite(s.daylight)||s.daylight<0||s.daylight>1)return false;
    if(Object.prototype.hasOwnProperty.call(s,"galleryRepaired")&&typeof s.galleryRepaired!=="boolean")return false;
    if(!legacy&&(!s.carry||typeof s.carry!=="object"||Array.isArray(s.carry)||!Number.isInteger(s.shedLevel)||s.shedLevel<0||s.shedLevel>=C.shed.capacity.length||!Number.isSafeInteger(s.carry.amount)||s.carry.amount<0||(s.carry.amount===0?s.carry.kind!==null:((s.carry.kind!=="logs"&&s.carry.kind!=="boards")||s.carry.amount>C.carryLimit[s.carry.kind]))))return false;
    if(!Array.isArray(s.trees)||s.trees.length!==bases.length)return false;
    if(!bases.every(function(base){var t=s.trees.find(function(v){return v&&v.id===base.id;});return t&&t.x===base.x&&t.z===base.z&&typeof t.felled==="boolean"&&typeof t.collected==="boolean"&&(!t.collected||t.felled);}))return false;
    if(!v1&&(typeof s.stairs!=="boolean"||!Array.isArray(s.shore)||s.shore.length!==C.shore.length||!C.shore.every(function(b){var d=s.shore.find(function(v){return v&&v.id===b.id;});return d&&d.x===b.x&&d.z===b.z&&typeof d.collected==="boolean";})))return false;
    if(!s.progress||typeof s.progress!=="object"||Array.isArray(s.progress))return false;
    if(!Object.keys(s.progress).every(function(k){var a=info(s,k);return a&&a.type!=="rest"&&a.type!=="shed"&&a.type!=="view"&&(!legacy||["store","take","upgrade"].indexOf(a.type)<0)&&(!v1||k!=="stairs")&&Number.isFinite(s.progress[k])&&s.progress[k]>=0&&s.progress[k]<1;}))return false;
    if(!s.stats||!["chopped","sawn","collected"].every(function(k){return legacy?Number.isInteger(s.stats[k])&&s.stats[k]>=0&&s.stats[k]<=(k==="chopped"?bases.length:total):count(s.stats[k]);}))return false;
    if(s.sync!==undefined&&(!s.sync||!Number.isInteger(s.sync.revision)||s.sync.revision<0||typeof s.sync.writer!=="string"||s.sync.writer.length>100))return false;
    return true;
  }
  function restore(s){
    if(!validate(s))return null;var n;try{n=clone(s);}catch(e){return null;}
    if(s.version===1){n.stairs=false;n.shore=C.shore.map(function(d){return Object.assign({},d,{collected:false});});n.trees=n.trees.concat(C.trees.slice(3).map(function(t){return Object.assign({},t,{felled:false,collected:false});}));}
    if(s.version<3){n.version=C.version;n.carry=emptyCarry();n.shedLevel=0;}
    if(!Object.prototype.hasOwnProperty.call(n,"galleryRepaired"))n.galleryRepaired=false;
    if(!walkable(n,n.avatar.x,n.avatar.z)){
      var best=null,distance=Infinity;
      for(var dx=-8;dx<=8;dx++)for(var dz=-8;dz<=8;dz++){var x=n.avatar.x+dx*.25,z=n.avatar.z+dz*.25,d=Math.hypot(dx,dz);if(d<distance&&walkable(n,x,z)){distance=d;best={x:x,z:z};}}
      if(!best)return null;n.avatar.x=best.x;n.avatar.z=best.z;
    }
    return n;
  }
  function valid(s){return validate(s);}
  function height(x,z){var t=C.terrain;return -t.shoreDrop*Math.max(0,Math.min(1,(z-t.shoreStart)/(t.shoreEnd-t.shoreStart)));}
  function obstacles(s){
    var l=C.terrain.ledge,list=[{x:-5,z:-4,rx:2.3,rz:1.8},{x:3.8,z:-4.3,rx:1.8,rz:1.3},{x:3.8,z:-1.6,rx:1.65,rz:.72},{x:10,z:-7,rx:1.1,rz:1.1},{x:C.seat.x,z:C.seat.z,rx:.35,rz:1.2}];
    [[l.xMin,l.gapMin],[l.gapMax,l.xMax]].forEach(function(r){list.push({x:(r[0]+r[1])/2,z:l.z,rx:(r[1]-r[0])/2,rz:l.thickness});});
    if(!s.stairs)list.push({x:(l.gapMin+l.gapMax)/2,z:l.z,rx:(l.gapMax-l.gapMin)/2,rz:l.thickness});
    var pool=C.terrain.coastExtension.pool;
    // Match the visible water with the usual .23m foot clearance.
    list.push({x:pool.x,z:pool.z,rx:pool.rx,rz:pool.rz});
    return list.concat(s.trees.filter(function(t){return !t.felled;}).map(function(t){return {x:t.x,z:t.z,rx:.42,rz:.42};}),C.terrain.coastExtension.rocks);
  }
  function inExtension(x,z){
    var v=C.terrain.coastExtension.outline,inside=false;
    for(var i=0,j=v.length-1;i<v.length;j=i++){
      var a=v[j],b=v[i],cross=(x-a[0])*(b[1]-a[1])-(z-a[1])*(b[0]-a[0]);
      if(Math.abs(cross)<1e-9&&x>=Math.min(a[0],b[0])&&x<=Math.max(a[0],b[0])&&z>=Math.min(a[1],b[1])&&z<=Math.max(a[1],b[1]))return true;
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }return inside;
  }
  function inTerrain(x,z){return (x*x)/(16*16)+(z*z)/(12*12)<=.91||inExtension(x,z);}
  function walkable(s,x,z){
    if(!inTerrain(x,z))return false;
    return !obstacles(s).some(function(o){return Math.abs(x-o.x)<o.rx+.23&&Math.abs(z-o.z)<o.rz+.23;});
  }
  function path(s,from,to){
    var q=.5,bounds=C.terrain.coastExtension.bounds,W=Math.round((bounds.xMax-bounds.xMin)/q)+1,H=Math.round((bounds.zMax-bounds.zMin)/q)+1,at=function(x,z){return [Math.round((x-bounds.xMin)/q),Math.round((z-bounds.zMin)/q)];},world=function(p){return {x:p[0]*q+bounds.xMin,z:p[1]*q+bounds.zMin};};
    var a=at(from.x,from.z),b=at(to.x,to.z),key=function(p){return p[0]+","+p[1];};
    function free(p){var v=world(p);return p[0]>=0&&p[0]<W&&p[1]>=0&&p[1]<H&&walkable(s,v.x,v.z);}
    if(!free(b)||(walkable(s,to.x,to.z)&&!clear(s,world(b),to))){var found=null,best=Infinity;for(var dx=-8;dx<=8;dx++)for(var dz=-8;dz<=8;dz++){var p=[b[0]+dx,b[1]+dz],wp=world(p),d=Math.hypot(wp.x-to.x,wp.z-to.z);if(free(p)&&d<best&&(!walkable(s,to.x,to.z)||clear(s,wp,to))){found=p;best=d;}}if(!found)return null;b=found;}
    if(!free(a)||!clear(s,from,world(a))){var start=null,near=Infinity;for(var sx=-8;sx<=8;sx++)for(var sz=-8;sz<=8;sz++){var ap=[a[0]+sx,a[1]+sz],wp=world(ap),ad=Math.hypot(wp.x-from.x,wp.z-from.z);if(free(ap)&&ad<near&&clear(s,from,wp)){start=ap;near=ad;}}if(!start)return null;a=start;}
    var open=[a],prev={},score={};score[key(a)]=0;var goal=key(b),closed=new Set(),steps=0;
    while(open.length&&steps++<W*H){
      var index=0,best=Infinity;
      for(var i=0;i<open.length;i++){var p=open[i],f=score[key(p)]+Math.hypot(p[0]-b[0],p[1]-b[1]);if(f<best){best=f;index=i;}}
      var here=open.splice(index,1)[0],k=key(here);
      if(k===goal){var out=[];while(k!==key(a)){out.push(world(here));here=prev[k];k=key(here);}out.push(world(a));out.reverse();var smooth=[],origin=from;
        for(var j=0;j<out.length;){var far=j;for(var e=j+1;e<out.length;e++){if(!clear(s,origin,out[e]))break;far=e;}smooth.push(out[far]);origin=out[far];j=far+1;}
        if(walkable(s,to.x,to.z)&&clear(s,origin,to))smooth.push({x:to.x,z:to.z});
        return smooth;
      }
      closed.add(k);
      for(var ox=-1;ox<=1;ox++)for(var oz=-1;oz<=1;oz++){
        if(!ox&&!oz)continue;var n=[here[0]+ox,here[1]+oz],nk=key(n);
        if(closed.has(nk)||!free(n)||!clear(s,world(here),world(n))||(ox&&oz&&(!free([here[0]+ox,here[1]])||!free([here[0],here[1]+oz]))))continue;
        var g=score[k]+Math.hypot(ox,oz);if(score[nk]===undefined||g<score[nk]){score[nk]=g;prev[nk]=here;if(!open.some(function(v){return key(v)===nk;}))open.push(n);}
      }
    }
    return null;
  }
  function clear(s,a,b){
    if(!walkable(s,a.x,a.z)||!walkable(s,b.x,b.z))return false;
    // Endpoints suffice only inside the old convex island. Split every other
    // segment at exact ellipse/polygon crossings, then check all open intervals.
    // This also protects A* smoothing from cutting across the new cove's inlet.
    var old=function(p){return p.x*p.x/256+p.z*p.z/144<=.91;};
    if(!old(a)||!old(b)){
      var dx=b.x-a.x,dz=b.z-a.z,cuts=[0,1],v=C.terrain.coastExtension.outline;
      var qa=dx*dx/256+dz*dz/144,qb=2*(a.x*dx/256+a.z*dz/144),qc=a.x*a.x/256+a.z*a.z/144-.91,disc=qb*qb-4*qa*qc;
      if(qa>0&&disc>=0){var root=Math.sqrt(disc);cuts.push((-qb-root)/(2*qa),(-qb+root)/(2*qa));}
      for(var i=0;i<v.length;i++){
        var p=v[i],q=v[(i+1)%v.length],ex=q[0]-p[0],ez=q[1]-p[1],den=dx*ez-dz*ex;
        if(Math.abs(den)<1e-12)continue;
        var t=((p[0]-a.x)*ez-(p[1]-a.z)*ex)/den,u=((p[0]-a.x)*dz-(p[1]-a.z)*dx)/den;
        if(u>=0&&u<=1)cuts.push(t);
      }
      cuts=cuts.filter(function(t){return t>=0&&t<=1;}).sort(function(x,y){return x-y;});
      for(var j=1;j<cuts.length;j++){var mid=(cuts[j-1]+cuts[j])/2;if(!inTerrain(a.x+dx*mid,a.z+dz*mid))return false;}
    }
    return !obstacles(s).some(function(o){
      var lo=0,hi=1;
      for(var i=0;i<2;i++){var k=i?"z":"x",r=(i?o.rz:o.rx)+.23-.000001,min=o[k]-r,max=o[k]+r,d=b[k]-a[k];
        if(Math.abs(d)<.0000001){if(a[k]<min||a[k]>max)return false;}
        else {var t1=(min-a[k])/d,t2=(max-a[k])/d;if(t1>t2){var t=t1;t1=t2;t2=t;}lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return false;}
      }return lo<=hi&&hi>=0&&lo<=1;
    });
  }
  G.CloseModel={config:C,create:create,info:info,finish:finish,valid:valid,restore:restore,capacity:capacity,height:height,path:path,walkable:walkable,clear:clear};
})(globalThis);
