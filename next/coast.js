/* Optional shore observations. Session presentation only: no game/save state,
   navigation, picking tags, timers or animation loop belong to this module. */
(function(G){
  'use strict';
  const TAU=Math.PI*2,states=new WeakMap();
  const rules=Object.freeze({alertRadius:3.1,takeoffRadius:2.05,clearRadius:3.5,alertSeconds:.65,calmSeconds:1.4,takeoffSeconds:1.3,minFlightSeconds:7.6,quietSeconds:4.5,returnSeconds:2.8,orbitSeconds:8.6});
  const homes=Object.freeze([
    Object.freeze({id:'west-gull',x:-11.752,y:-.154,z:8.44,heading:-.35,direction:1}),
    Object.freeze({id:'east-gull',x:14.0613,y:-.124,z:6.2384,heading:2.2,direction:-1})
  ]);
  const crabRules=Object.freeze({hideRadius:2.2,clearRadius:3.05,quietSpeed:.16,quietSeconds:2.6,retreatSeconds:.6,emergeSeconds:2.3});
  // The two former slope-straddling perches move within the existing pool
  // onto the flat low shore. Pose support is an art placement constraint, not
  // new terrain, adaptive IK, navigation or changes to reaction rules.
  const crabHomes=Object.freeze([
    Object.freeze({id:'pool-crab-a',x:19.5,z:6.12,heading:-.4,refugeX:19.12,refugeZ:6.16,color:'#ab6c4e',scale:1.1}),
    Object.freeze({id:'pool-crab-b',x:20.05,z:6.05,heading:.7,refugeX:19.86,refugeZ:6.10,color:'#bc8157',scale:.88}),
    Object.freeze({id:'pool-crab-c',x:20.87,z:6.10,heading:-1.2,refugeX:21.15,refugeZ:6.13,color:'#965d4a',scale:1}),
    Object.freeze({id:'pool-crab-d',x:20.55,z:6.55,heading:2.7,refugeX:20.92,refugeZ:6.53,color:'#b47855',scale:.82})
  ]);
  const points=Object.freeze([
    Object.freeze({id:'west-watch',name:'Западные камни',detail:'Чайка оглядывает воду с плоского камня. С этого места можно спокойно смотреть издали.',stand:Object.freeze({x:-8.4,z:6.9}),look:Object.freeze({x:-11.752,y:.12,z:8.44})}),
    Object.freeze({id:'tide-line',name:'Полоса прилива',detail:'В мелкой лужице отражается небо. Светлые ракушки и тёмные водоросли отмечают край отлива.',stand:Object.freeze({x:-4.4,z:9.65}),look:Object.freeze({x:-5.8,y:-.53,z:11.2})}),
    Object.freeze({id:'east-watch',name:'Восточный дозор',detail:'На высоком прибрежном камне сидит вторая чайка. Близкий подход заставит её подняться над водой.',stand:Object.freeze({x:10.3,z:6}),look:Object.freeze({x:14.0613,y:.15,z:6.2384})}),
    Object.freeze({id:'crab-cove',name:'Крабовая бухта',detail:'За каменным проходом осталась приливная лужа. Крабы прячутся от близких шагов и понемногу выходят, если смотреть издали без движения.',stand:Object.freeze({x:18.45,z:2.6}),look:Object.freeze({x:20.87,y:-.44,z:6.10})})
  ]);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const smooth=n=>n*n*(3-2*n);
  const finite=(n,fallback)=>Number.isFinite(n)?n:fallback;
  function angle(n){return Math.atan2(Math.sin(n),Math.cos(n));}
  function axes(h){const length=Math.hypot(h.x/16,h.z/12);return {x:h.x/16/length,z:h.z/12/length};}
  function orbit(b,reduced){
    const h=b.home,o=axes(h),a=reduced?0:b.flightTime*TAU/rules.orbitSeconds*h.direction;
    const along=3.4+.9*Math.cos(a),across=1.45*Math.sin(a);
    const dx=-o.x*.9*Math.sin(a)-o.z*1.45*Math.cos(a),dz=-o.z*.9*Math.sin(a)+o.x*1.45*Math.cos(a);
    return {x:h.x+o.x*along-o.z*across,y:h.y+2.1+(reduced?0:.14*Math.sin(a*2)),z:h.z+o.z*along+o.x*across,heading:reduced?Math.atan2(-o.x,-o.z):Math.atan2(dx*h.direction,dz*h.direction)};
  }
  function homePose(b){return {x:b.home.x,y:b.home.y,z:b.home.z,heading:b.home.heading};}
  function blend(from,to,t){const u=smooth(clamp(t,0,1));return {x:from.x+(to.x-from.x)*u,y:from.y+(to.y-from.y)*u,z:from.z+(to.z-from.z)*u,heading:from.heading+angle(to.heading-from.heading)*u};}
  function pose(b,s){
    let p;
    if(b.phase==='takeoff')p=blend(b.departure,orbit(b,s.reducedMotion),b.elapsed/rules.takeoffSeconds);
    else if(b.phase==='flight')p=orbit(b,s.reducedMotion);
    else if(b.phase==='return')p=blend(b.arrival,homePose(b),b.elapsed/rules.returnSeconds);
    else p=homePose(b);
    const flying=b.phase==='takeoff'||b.phase==='flight'||b.phase==='return';
    let turn=0;
    if(!s.reducedMotion){
      if(b.phase==='alert'&&s.avatar)turn=clamp(angle(Math.atan2(s.avatar.x-b.home.x,s.avatar.z-b.home.z)-p.heading),-1.15,1.15);
      else if(!flying)turn=.37*Math.sin(s.time*.42+(b.home.direction===1?0:2.2));
    }
    return {id:b.home.id,phase:b.phase,x:p.x,y:p.y,z:p.z,heading:p.heading,headTurn:turn,alert:b.phase==='alert',flying,flap:flying&&!s.reducedMotion?Math.sin(s.time*8.4+b.home.direction):0};
  }
  function enter(b,phase){b.phase=phase;b.elapsed=0;b.quiet=0;}
  function exposure(c){
    if(c.phase==='hidden')return 0;
    if(c.phase==='retreat')return c.departure*(1-smooth(clamp(c.elapsed/crabRules.retreatSeconds,0,1)));
    if(c.phase==='emerge')return smooth(clamp(c.elapsed/crabRules.emergeSeconds,0,1));
    return 1;
  }
  function crabPose(c,s){
    const h=c.home,visible=exposure(c),foraging=c.phase==='forage'&&!s.reducedMotion,drift=foraging?Math.sin(s.time*.63+h.heading)*.07:0;
    const x=h.refugeX+(h.x-h.refugeX)*visible+drift,z=h.refugeZ+(h.z-h.refugeZ)*visible;
    return {id:h.id,phase:c.phase,x,y:G.CloseModel.height(x,z)-.12*(1-visible),z,heading:h.heading,visibility:visible,color:h.color,scale:h.scale,legWave:s.reducedMotion?0:Math.sin(s.time*5+h.heading)*.045,clawLift:foraging?.018+.025*Math.sin(s.time*.9+h.heading):0};
  }
  function advanceCrab(c,dt,s){
    const d=s.avatar?Math.hypot(s.avatar.x-c.home.x,s.avatar.z-c.home.z):Infinity;
    let remaining=dt,transitions=0;
    while(remaining>1e-9&&transitions++<12){
      if((c.phase==='forage'||c.phase==='emerge')&&d<=crabRules.hideRadius){c.departure=exposure(c);enter(c,'retreat');}
      let until=Infinity,next=null;
      if(c.phase==='retreat'){until=Math.max(0,crabRules.retreatSeconds-c.elapsed);next='hidden';}
      else if(c.phase==='hidden'){
        if(d>=crabRules.clearRadius&&!s.moving){until=Math.max(0,crabRules.quietSeconds-c.quiet);next='emerge';}
        else c.quiet=0;
      }else if(c.phase==='emerge'){until=Math.max(0,crabRules.emergeSeconds-c.elapsed);next='forage';}
      const consumed=Math.min(remaining,until);c.elapsed+=consumed;remaining-=consumed;
      if(c.phase==='hidden'&&d>=crabRules.clearRadius&&!s.moving)c.quiet+=consumed;
      if(next&&consumed>=until)enter(c,next);else break;
    }
  }
  function advance(b,dt,s){
    const d=s.avatar?Math.hypot(s.avatar.x-b.home.x,s.avatar.z-b.home.z):Infinity;
    let remaining=dt,transitions=0;
    // Consume exact phase boundaries so a slow frame cannot skip the response.
    while(remaining>1e-9&&transitions++<16){
      let until=Infinity,next=null;
      if(b.phase==='perched'){
        if(d<=rules.alertRadius){enter(b,'alert');continue;}
      }else if(b.phase==='alert'){
        if(d<=rules.takeoffRadius){until=Math.max(0,rules.alertSeconds-b.elapsed);next='takeoff';}
        else if(d>=rules.clearRadius){until=Math.max(0,rules.calmSeconds-b.quiet);next='perched';}
        else b.quiet=0;
      }else if(b.phase==='takeoff'){until=Math.max(0,rules.takeoffSeconds-b.elapsed);next='flight';}
      else if(b.phase==='flight'){
        if(d>=rules.clearRadius){until=Math.max(0,rules.minFlightSeconds-b.elapsed,rules.quietSeconds-b.quiet);next='return';}
        else b.quiet=0;
      }else if(b.phase==='return'){
        if(d<=rules.alertRadius){b.departure=pose(b,s);b.flightTime=0;enter(b,'takeoff');continue;}
        until=Math.max(0,rules.returnSeconds-b.elapsed);next='perched';
      }
      const consumed=Math.min(remaining,until);
      b.elapsed+=consumed;
      if((b.phase==='alert'||b.phase==='flight')&&d>=rules.clearRadius)b.quiet+=consumed;
      if(b.phase==='flight')b.flightTime+=consumed;
      remaining-=consumed;
      if(next&&consumed>=until){
        if(next==='takeoff'){b.departure=homePose(b);b.flightTime=0;}
        if(next==='return')b.arrival=orbit(b,s.reducedMotion);
        if(next==='perched')b.flightTime=0;
        enter(b,next);
      }else break;
    }
  }
  function create(){
    const controller=Object.freeze({});
    states.set(controller,{time:0,reducedMotion:false,quality:'standard',avatar:null,moving:false,birds:homes.map(home=>({home,phase:'perched',elapsed:0,quiet:0,flightTime:0,departure:null,arrival:null})),crabs:crabHomes.map(home=>({home,phase:'forage',elapsed:0,quiet:0,departure:1}))});
    return controller;
  }
  const resting=create();
  function update(controller,dt,env={}){
    const s=states.get(controller);if(!s)return;
    const seconds=clamp(finite(dt,0),0,60);
    s.time=finite(env.time,s.time+seconds);s.reducedMotion=!!env.reducedMotion;s.quality=env.quality==='lighter'?'lighter':'standard';
    const avatar=env.avatar&&Number.isFinite(env.avatar.x)&&Number.isFinite(env.avatar.z)?{x:env.avatar.x,z:env.avatar.z}:null;
    s.moving=!!(avatar&&s.avatar&&seconds>0&&Math.hypot(avatar.x-s.avatar.x,avatar.z-s.avatar.z)/seconds>crabRules.quietSpeed);s.avatar=avatar;
    for(const b of s.birds)advance(b,seconds,s);
    for(const c of s.crabs)advanceCrab(c,seconds,s);
  }
  function snapshot(controller){
    const s=states.get(controller);if(!s)return null;
    return Object.freeze({time:s.time,reducedMotion:s.reducedMotion,quality:s.quality,birds:Object.freeze(s.birds.map(b=>Object.freeze(pose(b,s)))),crabs:Object.freeze(s.crabs.map(c=>Object.freeze(crabPose(c,s))))});
  }
  function keep(P,key,fn){if(P.retain)P.retain(key,fn);else fn();}
  function smallBody(P,x,y,z,rx,ry,rz,color,lighter){
    if(!lighter){P.blob(x,y,z,rx,ry,rz,color);return;}
    // Eight facets retain the same readable body/head silhouette in lighter mode.
    const v=[[x-rx,y,z],[x,y,z+rz],[x+rx,y,z],[x,y,z-rz]],top=[x,y+ry,z],bottom=[x,y-ry,z];
    for(let i=0;i<4;i++){P.poly([v[i],v[(i+1)%4],top],color);P.poly([v[(i+1)%4],v[i],bottom],color);}
  }
  function gull(P,p,lighter){
    P.group({x:p.x,y:p.y,z:p.z,ry:p.heading},()=>{
      smallBody(P,0,.18,0,.095,p.alert?.135:.105,.18,'#dce2ce',lighter);
      const headY=p.alert?.36:.29;
      P.group({y:headY,z:.14,ry:p.headTurn},()=>{
        smallBody(P,0,0,0,.067,.07,.073,'#edf0d9',lighter);
        P.poly([[-.028,-.005,.055],[.028,-.005,.055],[0,-.023,.137]],'#c2a570');
        if(!lighter)for(const side of [-1,1])P.poly([[side*.061,.019,.018],[side*.063,.008,.018],[side*.061,.009,.032]],'#3e5555');
      });
      P.poly([[-.05,.18,-.14],[.05,.18,-.14],[.035,.15,-.3],[-.035,.15,-.3]],'#b6c9be');
      for(const side of [-1,1]){
        if(p.flying){
          const tip=side*.49,lift=.15+p.flap*.14;
          P.poly([[side*.06,.2,.08],[side*.27,.24,-.025],[tip,lift,-.11],[side*.21,.19,-.14]],'#e0e6d1');
          if(!lighter)P.poly([[side*.27,.24,-.025],[tip,lift,-.11],[side*.45,lift-.025,-.18]],'#819c99');
        }else{
          P.poly([[side*.075,.22,.07],[side*(p.alert?.135:.103),.17,-.07],[side*.045,.16,-.21]],'#8da7a0');
          if(!lighter)P.box(side*.035,.045,.025,.014,.09,.016,'#a29c74');
          else P.poly([[side*.035-.009,.01,.02],[side*.035+.009,.01,.02],[side*.035,.11,.025]],'#a29c74');
        }
      }
    });
  }
  function tideDetails(P,lighter){
    const H=G.CloseModel.height;
    // Accents inside the old outer-sand puddle. Nothing covers timber, the
    // existing broad eastern trail, either stair approach or the pier.
    const shells=[[-5.16,11.12,.12],[-5.43,10.95,-.42],[-6.35,11.22,.47]];
    for(let k=0;k<(lighter?1:shells.length);k++){
      const [x,z,heading]=shells[k],y=H(x,z)+.022;
      P.group({x,y,z,ry:heading},()=>{
        const count=lighter?3:5;
        for(let i=0;i<count;i++){
          const a=-1.15+i*2.3/count,b=-1.15+(i+1)*2.3/count;
          P.poly([[0,0,-.028],[Math.sin(a)*.095,.005,Math.cos(a)*.11],[Math.sin(b)*.095,.005,Math.cos(b)*.11]],i%2?'#e5d5ac':'#c9c6a5');
        }
      });
    }
    for(let k=0;k<(lighter?2:4);k++){
      const x=-6.2+k*.25,z=11.36+Math.sin(k*1.7)*.07,y=H(x,z)+.024;
      P.poly([[x-.13,y,z],[x+.12,y,z+.04],[x+.2,y,z+.08],[x+.01,y,z+.06]],k%2?'#697f73':'#819176');
    }
    for(let i=0;i<(lighter?1:3);i++){
      const x=-6.17+i*.28,z=11.09-i*.035,y=H(x,z)+.019;
      P.poly([[x,y,z],[x+.15,y,z-.01],[x+.19,y,z+.006],[x+.025,y,z+.016]],'#c7dbca',.63);
    }
  }
  function crabShelters(P,lighter){
    const wet=G.ThreeIslandPreview?.materialLibrary?.materials?.wetSlate?.baseColor||'#627c7c';
    for(const h of crabHomes){
      const x=h.refugeX,z=h.refugeZ,y=G.CloseModel.height(x,z);
      // Low, split refuge behind the animal leaves the pincers/shell readable
      // from the existing observation stand. Contact is broad, never a square pad.
      P.poly([[x-.22,y+.007,z-.1],[x+.17,y+.007,z-.12],[x+.25,y+.008,z+.14],[x-.19,y+.008,z+.19]],wet,.38);
      smallBody(P,x-.085,y+.032,z+.17,.18,.036,.14,'#82968f',false);
      smallBody(P,x+.14,y+.024,z+.19,.11,.028,.105,'#9da88f',false);
      if(!lighter)P.poly([[x-.2,y+.018,z+.12],[x-.17,y+.023,z+.19],[x-.07,y+.022,z+.24],[x-.13,y+.023,z+.15]],'#638579');
    }
  }
  function crab(P,p,lighter,reducedMotion){
    if(p.visibility<.015)return;
    var clip=p.phase==='retreat'?'Retreat':p.phase==='emerge'?'Emerge':reducedMotion?'Idle':'Scuttle';
    // Presentation consumes the same four existing poses/AI, never owns travel,
    // reaction radii, quiet timers or save. One authored species, shared geometry.
    P.shadow(p.x,p.z,.2*p.scale,.15*p.scale,p.y+.006);
    P.drawAuthored('crab',p.id,{position:[p.x,p.y,p.z],heading:p.heading,scale:p.scale,clip:clip,speed:reducedMotion?0:1});
  }
  function draw(P,controller,env={}){
    const s=states.get(controller)||states.get(resting),lighter=(P.quality||env.quality||s.quality)==='lighter';
    keep(P,'coast:tideline:1:'+Number(lighter),()=>tideDetails(P,lighter));
    keep(P,'coast:crab-shelters:2:'+Number(lighter),()=>crabShelters(P,lighter));
    // No P.tag call: gulls and tiny shore details never intercept game actions.
    for(const b of s.birds)gull(P,pose(b,s),lighter);
    for(const c of s.crabs)crab(P,crabPose(c,s),lighter,s.reducedMotion);
  }
  G.CloseCoast=Object.freeze({create,update,snapshot,points,draw,rules,crabRules});
})(globalThis);
