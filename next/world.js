/* Three preview art. The model owns heights, boundaries and every interaction.
   Retained geometry is world-space and never reads clock, wind, night or camera. */
(function(G){
  'use strict';
  const TAU=Math.PI*2;
  const terrainTints=new Map();
  const colors={grass:'#a6b385',grove:'#7f9b7c',sand:'#d9c79f',path:'#dfd0aa',rock:'#8b9b9b',wood:'#a48b64',end:'#e3cba0',rope:'#c3b58f'};
  // Sheltered grove edges, the house's back and the seaward shoulder. The
  // central meadow, trails, storage approaches and collectible logs stay quiet.
  const natureGroups=[[-12.8,1.9,1.08,.62],[-12.4,-1.7,.9,.65],[-8.5,3.1,.85,.5],[-7.9,-5.9,.67,.52],[-2.25,-5.1,.48,.7],[7.9,-8.7,.7,.48],[12.35,-3.1,.75,.55],[-6.5,3.05,1.1,.4]];
  function mix(a,b,t){const ca=a.match(/\w\w/g).map(q=>parseInt(q,16)),cb=b.match(/\w\w/g).map(q=>parseInt(q,16));return '#'+ca.map((v,k)=>Math.round(v+(cb[k]-v)*Math.max(0,Math.min(1,t))).toString(16).padStart(2,'0')).join('');}
  function keep(P,key,fn){if(P.retain)P.retain(key,fn);else fn();}
  function coastPoint(i,n,r=1){const a=i*TAU/n,noise=1+.045*Math.sin(a*7)+.025*Math.cos(a*11);return [Math.cos(a)*17*r*noise,Math.sin(a)*13*r*noise];}
  function slopeBreaks(){const t=G.CloseModel.config.terrain;return [t.shoreStart,t.shoreEnd];}
  function clipZ(vertices,z,above){
    const out=[];
    for(let i=0;i<vertices.length;i++){
      const a=vertices[(i+vertices.length-1)%vertices.length],b=vertices[i];
      const ia=above?a[1]>=z:a[1]<=z,ib=above?b[1]>=z:b[1]<=z;
      if(ia!==ib){const t=(z-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*t,z]);}
      if(ib)out.push(b);
    }
    return out;
  }
  function surface(P,H,vertices,color,lift=0){
    const cuts=slopeBreaks(),bands=[[-Infinity,cuts[0]],[cuts[0],cuts[1]],[cuts[1],Infinity]];
    for(const band of bands){
      let v=vertices;
      if(Number.isFinite(band[0]))v=clipZ(v,band[0],true);
      if(Number.isFinite(band[1]))v=clipZ(v,band[1],false);
      if(v.length<3)continue;
      let area=0;
      for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];area+=a[0]*b[1]-b[0]*a[1];}
      if(Math.abs(area)<1e-10)continue;
      // Within each band H is affine, so every rendered triangle matches H exactly.
      P.poly(v.map(q=>[q[0],H(q[0],q[1])+lift,q[1]]),color);
    }
  }
  function ellipse(P,H,x,z,rx,rz,color,lift=.015,n=24){
    const v=[];
    for(let i=0;i<n;i++){const a=i*TAU/n;v.push([x+Math.cos(a)*rx,z+Math.sin(a)*rz]);}
    // Fans keep slope changes and near-camera clipping local.
    for(let i=0;i<n;i++)surface(P,H,[[x,z],v[i],v[(i+1)%n]],color,lift);
  }
  function ribbon(P,H,points,width,color,lift=.022){
    const edge=[];
    for(let i=0;i<points.length;i++){
      const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
      edge.push([[points[i][0]-dz/len*width/2,points[i][1]+dx/len*width/2],[points[i][0]+dz/len*width/2,points[i][1]-dx/len*width/2]]);
    }
    for(let i=0;i<edge.length-1;i++){
      const a=edge[i][0],b=edge[i][1],c=edge[i+1][1],d=edge[i+1][0];
      surface(P,H,[a,b,c],color,lift);surface(P,H,[a,c,d],color,lift);
    }
  }
  function terrain(P,H){
    const n=64,rings=9;
    function point(i,r){return coastPoint(i,n,r);}
    function tint(x,z,r,i){
      const key=r*n+i;if(terrainTints.has(key))return terrainTints.get(key);
      const grove=Math.max(0,1-Math.hypot((x+10.7)/5,(z-1.1)/5));
      const base=mix('a6b385','7f9b7c',grove*.68);
      const color=mix(base.slice(1),'d9c79f',Math.max(0,Math.min(1,(z-3.1)/3.3)));terrainTints.set(key,color);return color;
    }
    for(let r=1;r<=rings;r++)for(let i=0;i<n;i++){
      const a=point(i,(r-1)/rings),b=point(i+1,(r-1)/rings),c=point(i+1,r/rings),d=point(i,r/rings);
      const x=(a[0]+b[0]+c[0]+d[0])/4,z=(a[1]+b[1]+c[1]+d[1])/4;
      surface(P,H,r===1?[a,c,d]:[a,b,c,d],tint(x,z,r,i));
    }
    // The old exact top outline stays. Diagonal facets and staggered toes make
    // rock outcrops rather than continuous horizontal strata around the island.
    for(let i=0;i<n;i++){
      const a=point(i,1),b=point(i+1,1),south=(a[1]+b[1])/2>4;
      const stops=[0,1];
      for(const z of slopeBreaks())if((a[1]<z&&b[1]>z)||(a[1]>z&&b[1]<z))stops.push((z-a[1])/(b[1]-a[1]));
      stops.sort((u,v)=>u-v);
      for(let j=0;j<stops.length-1;j++){
        const p=[a[0]+(b[0]-a[0])*stops[j],a[1]+(b[1]-a[1])*stops[j]],q=[a[0]+(b[0]-a[0])*stops[j+1],a[1]+(b[1]-a[1])*stops[j+1]];
        const top=H(p[0],p[1]),end=H(q[0],q[1]);
        const a0=i+stops[j],a1=i+stops[j+1];
        function shoulder(v,k){
          const phase=k*TAU/64,t=Math.max(0,Math.min(1,(v[1]-3.8)/2)),flare=1.008+.023*(.5+.5*Math.sin(phase*13));
          const y=(H(v[0],v[1])*.2-.22-.16*Math.sin(phase*11))*(1-t)-.63*t;
          return [v[0]*flare,y,v[1]*flare];
        }
        const u=[p[0],top,p[1]],v=[q[0],end,q[1]],m=shoulder(p,a0),nq=shoulder(q,a1);
        const bp=[p[0]*1.04,-1.03-.13*Math.sin(a0*TAU/64*7),p[1]*1.04],bq=[q[0]*1.04,-1.03-.13*Math.sin(a1*TAU/64*7),q[1]*1.04];
        const tones=south?['#c2b38f','#cdbd98','#a8ac98']:['#899695','#9da69c','#758a91'];
        P.poly([u,v,m],tones[i%3]);P.poly([v,nq,m],tones[(i+1)%3]);
        P.poly([m,nq,bq],south?'#8fa59b':'#637d88');P.poly([m,bq,bp],south?'#95a89c':'#72858d');
      }
    }
    ellipse(P,H,-10.7,1.1,3.2,3.55,'#91a57e',.006,20);
    ellipse(P,H,-12.2,-4.6,1.75,1.48,'#aab298',.012,20);
    ellipse(P,H,-4.2,.8,3.4,1.9,'#a5af83',.008,20);
    // One continuous broad trail makes the route around the eastern end readable.
    ribbon(P,H,[[-5,-1.05],[-5,.5],[-1.5,.7],[2.9,.8],[6.5,1.5],[8.9,2.9],[9.65,4.3],[9.5,5.5],[8.7,6.8],[7.25,7.9],[5,8.8],[5,9.85]],1.3,colors.path);
    ribbon(P,H,[[3.8,.8],[3.8,-.2],[3.8,-1.15]],1.1,colors.path);
    ribbon(P,H,[[6.3,1.5],[7.6,-.7],[8.8,-3.2],[10,-5.9]],1.05,colors.path);
    ribbon(P,H,[[-5.8,.6],[-8.2,.3],[-9.7,1.1],[-10.3,2.75]],1.05,'#adb193');
    ribbon(P,H,[[-8.2,.3],[-9.5,-1.7],[-11.2,-3.1],[-12.8,-4.6]],1.05,'#b6b89d');
    ribbon(P,H,[[2.8,.8],[2.8,2.3],[2.8,3.9]],1.2,colors.path);
    ribbon(P,H,[[2.8,5.7],[3.2,6.9],[5,8.8]],1.2,'#c4b993');
  }
  function rock(P,H,x,z,rx,rz,height,color=colors.rock){
    const y=H(x,z),n=6,phase=seed(x*5.1+z*2.8)*TAU,base=[],shoulder=[];
    for(let i=0;i<n;i++){
      const a=phase+i*TAU/n,w=.82+seed(i+x*9+z*7)*.28;
      base.push([x+Math.cos(a)*rx*w,y-.025,z+Math.sin(a)*rz*w]);
      shoulder.push([x+Math.cos(a+.12)*rx*w*.73,y+height*(.5+seed(i+x*3)*.3),z+Math.sin(a+.12)*rz*w*.73]);
    }
    const peak=[x-rx*.19,y+height,z+rz*.08];
    for(let i=0;i<n;i++){
      const j=(i+1)%n;
      P.poly([base[i],base[j],shoulder[j],shoulder[i]],mix(color.slice(1),y<-.5?'547c80':'667f8a',.13+(i%3)*.08));
      P.poly([shoulder[i],shoulder[j],peak],mix(color.slice(1),'c3c6a9',i%3*.15));
      if(i===0||(P.quality!=='lighter'&&i===3)){
        const a=shoulder[i],b=shoulder[j],c=peak;
        const at=(u,v)=>[a[0]*u+b[0]*v+c[0]*(1-u-v),a[1]*u+b[1]*v+c[1]*(1-u-v)+.003,a[2]*u+b[2]*v+c[2]*(1-u-v)];
        P.poly([at(.62,.15),at(.23,.53),at(.12,.3),at(.35,.12)],y<-.5?'#b7b99a':i?'#91a389':'#b1b994');
      }
    }
  }
  function coast(P,H){
    const n=80;
    for(let i=0;i<n;i++){
      const a=i*TAU/n,south=Math.sin(a)>.28;
      const u=coastPoint(i,n),v=coastPoint(i+1,n);
      const outer=1.11+.018*Math.sin(a*9+.8),inner=1.026;
      P.poly([[u[0]*inner,-.719,u[1]*inner],[v[0]*inner,-.719,v[1]*inner],[v[0]*outer,-.719,v[1]*outer],[u[0]*outer,-.719,u[1]*outer]],south?'#78b0a5':'#5b9e9f',south?.62:.32);
      if(south){
        // A wet edge follows the existing sand lip, not a new walking shelf.
        const k=1.004,l=1.028;
        P.poly([[u[0]*k,-.694,u[1]*k],[v[0]*k,-.694,v[1]*k],[v[0]*l,-.694,v[1]*l],[u[0]*l,-.694,u[1]*l]],i%3?'#839e95':'#a2b39e',.75);
      }
    }
    // Larger irregular stones are confined to the nonwalkable outer margin.
    for(let i=0;i<26;i++){
      const a=i*TAU/26+.04,q=coastPoint(i+.16,26,.987),rho=Math.hypot(q[0]/16,q[1]/12),out=Math.max(1,1.085/rho),x=q[0]*out,z=q[1]*out;
      if(z>7&&x>0)continue;
      const w=.44+seed(i+810)*.79,h=.52+seed(i+820)*.68,bed=()=>-.76;
      rock(P,bed,x,z,w,w*(.5+seed(i+830)*.5),h,i%3?'#899c9d':'#a2aa9e');
      if(P.quality!=='lighter'&&i%3===1)rock(P,bed,x+Math.cos(a)*.45,z+Math.sin(a)*.45,w*.52,w*.47,h*.65,'#758e94');
    }
  }
  function ledge(P,H,s,C){
    const z=C.stairs.z;
    // These rocks coincide with the model's single ledge barrier.
    const blocks=[-2.4,-1.76,-1.12,-.48,.16,.8,1.16,4.44,5.08,5.72,6.36,7,7.46];
    blocks.forEach((x,i)=>rock(P,H,x,z+(seed(i+760)-.5)*.14,(i===6||i===7)?.33:.28+seed(i+770)*.12,.31+seed(i+780)*.08,.23+seed(i+790)*.3,i%3?'#939d8a':'#a2aa94'));
    P.tag('stairs',()=>{
      if(s.stairs){
        // Six broad new treads cross the height change; no rail blocks the route.
        for(let i=0;i<6;i++){
          const pz=3.8+(i+.5)/6*2,top=H(2.8,pz)+.075;
          P.box(C.stairs.x,top-.055,pz,2.18,.11,.345,'#c3a574');
          for(const x of [1.84,3.76])P.poly([[x-.025,top+.002,pz-.07],[x+.025,top+.002,pz-.07],[x+.025,top+.002,pz-.12],[x-.025,top+.002,pz-.12]],'#667267');
        }
        for(const x of [1.62,3.98])P.group({x,y:-.25,z:4.8,rx:.268},()=>P.box(0,0,0,.13,.14,2.1,'#8b7355'));
      }else{
        // Clear broken ends and a fallen boulder close the unrepaired shortcut.
        P.group({x:2.05,y:-.01,z:4.15,ry:.16,rz:.08},()=>P.box(0,0,0,.94,.13,.7,'#91856b'));
        P.group({x:3.59,y:-.16,z:4.58,ry:-.3,rz:-.2},()=>P.box(0,0,0,.91,.13,.75,'#91856b'));
        P.group({x:2.75,y:-.1,z:4.48,ry:.35,rx:.16},()=>P.box(0,0,0,.17,.14,1.52,'#806e52'));
        rock(P,H,2.72,4.36,.57,.4,.43,'#9ea592');
        rock(P,H,3.75,4.2,.35,.36,.27,'#acb09b');
      }
    });
  }
  function paleLog(P,x,y,z,length,radius,angle){
    P.group({x,y,z,ry:angle,rz:Math.PI/2},()=>{
      P.cylinder(0,0,0,radius*.88,radius,length,'#c0ac83',7);
      for(const side of [-1,1]){
        const v=[];
        for(let i=0;i<7;i++){const a=i*TAU/7;v.push([Math.cos(a)*radius*.78,side*(length/2+.003),Math.sin(a)*radius*.78]);}
        P.poly(v,colors.end);
      }
      P.poly([[radius*.54,-length*.4,radius*.4],[radius*.6,length*.36,radius*.4],[radius*.49,length*.31,radius*.51]],'#9e8c69');
    });
  }
  function shore(P,H,s,C){
    (s.shore||C.shore).forEach((d,i)=>{
      if(d.collected)return;
      P.tag('drift:'+d.id,()=>{
        paleLog(P,d.x,H(d.x,d.z)+.22,d.z,1.85,.22,i?.58:-.3);
        paleLog(P,d.x+.2,H(d.x,d.z)+.12,d.z+.46,.88,.1,i?-.25:.24);
      });
    });
    const x=C.pier.x,z=C.pier.z,y=H(x,z)+.045;
    // Low weathered jetty: its entire intact deck stays within the walkable shore.
    P.box(x,y-.09,z,2.15,.12,1.68,'#796e57');
    for(let i=0;i<7;i++)P.box(x,y+.005,z-.72+i*.24,2.18,.075,.218,i%3?'#9e9677':'#b3a582');
    P.box(x-.91,y-.23,z,.12,.4,1.7,'#7f7760');
    P.box(x+.91,y-.23,z,.12,.4,1.7,'#7f7760');
    // Remnant piles are beyond the walking ellipse, in the shallows.
    for(const px of [x-.9,x+.9])P.cylinder(px,-.64,z+1.65,.09,.12,.6,'#847b60',6);
    P.group({x:x+.9,y:-.39,z:z+1.28,rx:.21},()=>P.box(0,0,0,.11,.06,.9,'#b2a37d'));
    // Deck wear stays flat. The open front and walking width are unchanged.
    for(let i=0;i<5;i++)P.poly([[x-.91+i*.39,y+.045,z-.69],[x-.89+i*.39,y+.045,z-.69],[x-.76+i*.39,y+.045,z+.69],[x-.79+i*.39,y+.045,z+.69]],'#c1af85',.55);
    for(const px of [x-.92,x+.92])for(const pz of [z-.62,z+.62])P.poly([[px-.025,y+.046,pz-.025],[px+.025,y+.046,pz-.025],[px+.025,y+.046,pz+.025],[px-.025,y+.046,pz+.025]],'#5a706b');
    // Rock pools and stones lie outside the walking ellipse, along the water line.
    [[-8.2,10.5,.65,.44,.35],[-11.6,8.4,.8,.5,.39],[12.8,7.9,.69,.5,.35],[14.2,6.2,.73,.48,.42],[-3,12.4,.6,.4,.22]].forEach((r,i)=>rock(P,H,...r,i%2?'#a6ad9c':'#949e94'));
  }
  function seat(P,H,C){
    const x=C.seat.x,z=C.seat.z,y=H(x,z);
    ellipse(P,H,x,z,.48,1.12,'#7e927e',.009,16);
    P.tag('seat',()=>P.group({x,y,z,ry:-Math.PI/2},()=>{
      for(const lx of [-.7,.7])P.box(lx,.27,0,.11,.54,.43,'#6f7562');
      for(let i=0;i<3;i++)P.box(0,.55,-.19+i*.19,1.85,.13,.175,i===1?'#bd9f70':'#ad9269');
      P.box(0,.9,-.28,1.85,.14,.09,'#ac9871');
      P.box(0,1.12,-.28,1.85,.14,.09,'#b6a27b');
      for(const lx of [-.72,.72])P.box(lx,.87,-.28,.075,.65,.09,'#707761');
    }));
  }
  function quietDetails(P,H,env){
    const time=env.time||0,wind=env.wind||{x:0,z:0,strength:0};
    // A small mooring buoy bobs outside the accessible island.
    const bob=Math.sin(time*.75)*.035;
    P.cylinder(9.5,-.48+bob,12,.14,.2,.34,'#b16d54',7);
    P.cylinder(9.5,-.34+bob,12,.13,.13,.09,'#dfcf9f',7);
    P.box(9.5,-.19+bob,12,.025,.25,.025,'#786c58');
    // Distant boat, best seen from the western lookout.
    P.group({x:-23+Math.sin(time*.018)*1.3,y:-.64+Math.sin(time*.45)*.025,z:-8.2,ry:.2},()=>{
      P.poly([[-1.4,0,0],[1.4,0,0],[1.05,-.2,.45],[-.95,-.2,.45]],'#5c706c');
      P.poly([[-1.4,0,0],[-.95,-.2,.45],[-1.1,0,.7]],'#7c8370');
      P.poly([[1.4,0,0],[1.1,0,.7],[1.05,-.2,.45]],'#7c8370');
      P.poly([[-1.4,0,0],[-1.1,0,.7],[1.1,0,.7],[1.4,0,0]],'#a19c7e');
      P.box(0,1.2,.29,.045,2.5,.045,'#8d8164');
      P.poly([[-.06,2.4,.31],[-.06,.32,.31],[-1.16,.32,.31]],'#e0d9b9');
      P.poly([[.05,2.18,.31],[1.03,.39,.31],[.05,.39,.31]],'#c8c8aa');
    });

  }
  const seed=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  function water(P,env){
    const t=env.time||0,wind=env.wind||{x:0,z:0,strength:0},segments=P.quality==='lighter'?48:64,rings=P.quality==='lighter'?1:2;
    // Reuse the existing narrow ribbons: each wave approaches the shore and fades.
    for(let ring=0;ring<rings;ring++){
      const phase=(t*.12+ring/rings)%1,envelope=Math.sin(phase*Math.PI),k=1.13-phase*.085,w=.0025+envelope*.004;
      for(let i=0;i<segments;i++){
        if(seed(i+ring*71)>.73)continue;
        const a=(i+.06)*TAU/segments,b=(i+.45+seed(i+82)*.36)*TAU/segments,local=k+Math.sin(i*1.8+ring)*.007;
        const point=(a,r)=>{const noise=1+.045*Math.sin(a*7)+.025*Math.cos(a*11);return [Math.cos(a)*17*r*noise,-.708+ring*.001,Math.sin(a)*13*r*noise];};
        P.poly([point(a,local),point(b,local),point(b,local+w),point(a,local+w)],'#e5ead6',envelope*(.19+phase*.32));
      }
    }
    for(let i=0;i<(P.quality==='lighter'?24:48);i++){
      const x=seed(i+300)*75-37.5,z=seed(i+500)*66-33;
      if((x/18)**2+(z/14)**2<1.08)continue;
      const wave=.5+.5*Math.sin(t*.7+i),length=.45+seed(i+18)*1.4,y=-.716+wave*.008,drift=Math.sin(t*.18+i)*.16;
      const dx=drift*wind.x,dz=drift*wind.z;
      P.poly([[x+dx,y,z+dz],[x+length+dx,y,z+dz],[x+length+.15+dx,y,z+.022+dz],[x-.08+dx,y,z+.018+dz]],i%5?'#abd1c5':'#f2dfb4',(i%5?.1:.2)+wave*.12);
    }
  }
  function garden(P,H,s,env){
    const time=env.time||0,wind=env.wind||{x:0,z:0,strength:0};
    for(let i=0;i<natureGroups.length;i++){
      const [x,z,rx,rz]=natureGroups[i],y=H(x,z);
      if(P.visible&&!P.visible(x,y+.25,z,1.6))continue;
      const count=P.detail===false?4:9;
      for(let j=0;j<count;j++){
        const a=seed(i*29+j)*TAU,r=.25+seed(i*7+j+11)*.62;
        const xx=x+Math.cos(a)*rx*r,zz=z+Math.sin(a)*rz*r,yy=H(xx,zz),h=.15+seed(i*19+j)*.24;
        const bend=env.reducedMotion?0:wind.strength*h*.58*(.9+.1*Math.sin(time*.75+i+j));
        const tip=[xx+wind.x*bend+.06,yy+h,zz+wind.z*bend+.035];
        P.poly([[xx-.04,yy+.012,zz],tip,[xx+.035,yy+.012,zz+.035]],j%3?'#859e6f':'#b1b77e');
        if(P.detail!==false&&j%4===1){
          P.poly([[xx+.02,yy+.014,zz+.02],[tip[0]+.12,tip[1]*.65+yy*.35,tip[2]+.045],[xx+.07,yy+.014,zz+.07]],'#789574');
          if(i===0||i===3||i===6){
            const fx=tip[0],fy=tip[1]-.015,fz=tip[2];
            P.poly([[fx-.07,fy,fz],[fx,fy+.05,fz],[fx+.07,fy,fz],[fx,fy-.035,fz+.02]],i===0?'#d7b8ac':'#e7d49f');
          }
        }
      }
    }
  }
  function naturePatch(P,H,x,z,rx,rz,id,color,lift=.011){
    const v=[];for(let i=0;i<9;i++){const a=i*TAU/9,r=.8+seed(id*17+i)*.25;v.push([x+Math.cos(a)*rx*r,z+Math.sin(a)*rz*r]);}
    for(let i=0;i<v.length;i++)surface(P,H,[[x,z],v[i],v[(i+1)%v.length]],color,lift);
  }
  function natureBeds(P,H){
    for(let i=0;i<natureGroups.length;i++){
      const [x,z,rx,rz]=natureGroups[i];
      naturePatch(P,H,x,z,rx,rz,i,'#95a17c');
      naturePatch(P,H,x-rx*.23,z-rz*.17,rx*.62,rz*.56,i+23,i<3?'#81977c':'#a5ae86',.013);
      const count=P.quality==='lighter'?2:3+i%2;
      for(let j=0;j<count;j++){
        const a=j*2.4+i*.3,r=.2+seed(i*7+j)*.34,xx=x+Math.cos(a)*rx*r,zz=z+Math.sin(a)*rz*r;
        P.blob(xx,H(xx,zz)+.14,zz,.25+seed(j+i)*.12,.19,.22+seed(j+9)*.09,j%2?'#99ad82':'#77967b');
      }
    }
  }
  function shoreEcology(P,H){
    // Three shallow puddles and wrack lines sit on the existing outer sand.
    [[-9.5,9.8,.65,.32],[-5.8,11.2,.8,.3],[12.9,7.1,.55,.29]].forEach((q,i)=>{
      const [x,z,rx,rz]=q;
      naturePatch(P,H,x,z,rx*1.19,rz*1.3,i+61,'#a4ae96',.007);
      naturePatch(P,H,x,z,rx,rz,i+61,'#7baba5',.009);
      ribbon(P,H,[[x-rx*.5,z-rz*.1],[x,z-rz*.25],[x+rx*.42,z-rz*.17]],.025,'#c5d4bd',.011);
    });
    const beds=[[-10.3,9.3],[-7.5,10.6],[-1.8,11.6],[10.7,8.8],[13,6.6]];
    beds.forEach(([x,z],i)=>{
      const n=P.quality==='lighter'?2:4;
      for(let j=0;j<n;j++){
        const xx=x+(j-1.5)*.17,zz=z+Math.sin(j*2+i)*.16,l=.28+seed(i*11+j)*.42;
        ribbon(P,H,[[xx-l*.45,zz],[xx-l*.12,zz+.06],[xx+l*.27,zz+.02],[xx+l*.53,zz+.12]],.045+(j%2)*.025,j%2?'#819174':'#6d8176',.018);
      }
    });
    // Thin, dark twigs read as tide-line debris, apart from the pale tagged logs.
    for(const [x,z] of [[-7.2,10.4],[11.6,8.4]]){
      ribbon(P,H,[[x-.31,z-.07],[x,z],[x+.23,z+.06]],.035,'#8c8369',.022);
      ribbon(P,H,[[x,z],[x+.1,z-.14]],.024,'#8c8369',.023);
    }
  }
  function groundDressing(P,H,C){
    // Flat wear and sparse pebbles connect house, workbench and the existing trail.
    const wear=[[-5,-.42],[-4.8,.37],[-3.8,.63],[-2.1,.75],[.2,.7],[2.25,.82],[3.8,-.48],[4.5,.85],[6.5,1.7],[8.4,2.55],[9.5,3.8],[9.45,5.6],[8.5,6.9],[6.8,8.12],[5.3,8.9],[8,-1.2],[8.85,-3.8],[9.7,-5.2]];
    wear.forEach((q,i)=>{
      const [x,z]=q;
      ellipse(P,H,x,z,.17+seed(i+41)*.25,.04+seed(i+11)*.08,i%3?'#cbbd99':'#b5af8e',.027,7);
      if(P.quality!=='lighter'&&i%3===1)ellipse(P,H,x+.31,z+.24,.06,.045,'#e9d9b3',.03,5);
    });
    // Tiny shore accents remain flat and clear of all interaction approaches.
    if(P.quality!=='lighter')for(let i=0;i<30;i++){
      const x=-10+seed(i+90)*23,z=6+seed(i+125)*5.7;
      if((x/15.5)**2+(z/11.5)**2>.99||Math.hypot(x-5,z-9.6)<1.5||C.shore.some(d=>Math.hypot(d.x-x,d.z-z)<1))continue;
      const y=H(x,z);
      if(i%4===0){P.poly([[x-.19,y+.014,z],[x+.15,y+.014,z+.05],[x+.34,y+.015,z+.13],[x+.12,y+.015,z+.16]],'#9a9f73');}
      else P.blob(x,y+.035,z,.055+seed(i)*.07,.04,.055,'#c7bd9e');
    }
  }
  G.CloseWorld={draw(P,s,env={}){
    const M=G.CloseModel,C=M.config,H=(x,z)=>M.height(x,z);
    const q=P.quality||'standard';
    keep(P,'world:terrain:nat1:'+q,()=>{terrain(P,H);coast(P,H);groundDressing(P,H,C);});
    keep(P,'world:nature-beds:'+q,()=>natureBeds(P,H));
    keep(P,'world:shore-ecology:'+q,()=>shoreEcology(P,H));
    keep(P,'world:ledge:'+Number(!!s.stairs)+':'+q,()=>ledge(P,H,s,C));
    const drift=(s.shore||C.shore).map(d=>d.id+Number(!!d.collected)).join(',');
    keep(P,'world:shore:'+drift+':'+q,()=>shore(P,H,s,C));
    keep(P,'world:seat:'+q,()=>seat(P,H,C));
    water(P,env);quietDetails(P,H,env);garden(P,H,s,env);
    if(G.CloseCoast)G.CloseCoast.draw(P,env.coast,env);
  }};
})(globalThis);
