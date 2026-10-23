/* Original northern-island art for the isolated Three preview. State is read-only.
   Buildings and state items are retained; wind, smoke and actual work stay dynamic. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const C = {
    plaster: '#f0dfba', foundation: '#899a9a', roof: '#a65f4d', roofLight: '#c07e59',
    timber: '#715943', wood: '#b99b6a', cut: '#e4c89a', dark: '#34565b',
    leaf: '#779a78', leafLight: '#a5b77e', pine: '#4e8078', iron: '#48666b'
  };
  const seed=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  function keep(P,key,fn){if(P.retain)P.retain(key,fn);else fn();}
  function ground(P,x,z,rx,rz,color,alpha=1,y=.018){
    const v=[];for(let i=0;i<12;i++){const a=i*TAU/12;v.push([x+Math.cos(a)*rx,y,z+Math.sin(a)*rz]);}P.poly(v,color,alpha);
  }
  function front(P, x, y, z, w, h, color) {
    P.poly([[x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z]], color);
  }
  function roof(P, x, z, w, d, eave, peak, color) {
    const l=x-w/2, r=x+w/2, b=z-d/2, f=z+d/2;
    P.poly([[l,eave,f],[x,peak,f],[x,peak,b],[l,eave,b]], color);
    const slate=color!==C.roof,right=slate?'#78918c':C.roofLight;
    P.poly([[x,peak,f],[r,eave,f],[r,eave,b],[x,peak,b]],right);
    P.poly([[l,eave,f],[r,eave,f],[x,peak,f]], C.plaster);
    P.poly([[r,eave,b],[l,eave,b],[x,peak,b]], C.plaster);
    // Staggered terracotta courses follow the real roof plane.
    for(const side of [-1,1])for(let row=0;row<5;row++)for(let col=0;col<9;col++){
      const u=(row+.13)/5,v=(row+.88)/5,zz=b+.04+col*(d-.08)/9,ww=(d-.08)/9-.025;
      const xx=x+side*u*w/2,xe=x+side*v*w/2,yy=peak-u*(peak-eave)+.012,ye=peak-v*(peak-eave)+.012;
      if(P.quality==='lighter'&&col%2)continue;
      P.poly([[xx,yy,zz],[xe,ye,zz],[xe,ye,zz+ww],[xx,yy,zz+ww]],slate?((row+col)%4===0?'#8d9b8e':side===1?'#79908a':'#536e73'):(row+col)%4===0?'#cb8b62':side===1?'#bb7956':'#9d5e4c');
    }
    P.box(x,peak+.025,z,.1,.1,d+.12,slate?'#82988e':'#c58c66');
    for(const xx of [l,r])P.box(xx,eave-.015,z,.09,.15,d+.08,'#e0c69b');
  }
  function window(P, x, y, z, lit) {
    front(P,x,y,z,.72,.84,C.timber);
    front(P,x,y,z+.008,.56,.67,lit?'#efbb6d':'#718d89');
    front(P,x,y,z+.012,.045,.67,C.plaster);
    front(P,x,y,z+.013,.56,.045,C.plaster);
    P.box(x,y-.47,z+.05,.88,.1,.22,C.plaster);
    front(P,x-.13,y+.15,z+.014,.16,.21,lit?'#ffe0a1':'#a9bdb0');
  }
  function log(P, x, y, z, length, radius, turn=0) {
    P.group({x,y,z,rz:Math.PI/2,ry:turn},()=>{
      P.cylinder(0,0,0,radius,radius,length,C.timber,6);
      // End grain discs: a small offset keeps them clear of the bark end caps.
      const cap=[];
      for(let i=0;i<6;i++) cap.push([Math.cos(i*TAU/6)*radius*.86,length/2+.004,Math.sin(i*TAU/6)*radius*.86]);
      P.poly([...cap].reverse(),C.cut);
      P.poly(cap.map(v=>[v[0],-v[1],v[2]]),C.cut);
    });
  }
  function crown(P, x, y, z, radius, height, color) {
    // Asymmetric broad lobes: a quiet, broken outline rather than identical balls.
    const n=7,lo=[],mid=[],hi=[];
    for(let i=0;i<n;i++){
      const a=i*TAU/n+.17,w=.89+seed(i+x*7+z*11)*.17;
      lo.push([x+Math.cos(a)*radius*w*.65,y-height*.28,z+Math.sin(a)*radius*w*.72]);
      mid.push([x+Math.cos(a)*radius*w,y+height*(seed(i+43)*.14-.03),z+Math.sin(a)*radius*w*.88]);
      hi.push([x+Math.cos(a)*radius*w*.64-.12*radius,y+height*(.3+seed(i+21)*.09),z+Math.sin(a)*radius*w*.55]);
    }
    for(let i=0;i<n;i++){const j=(i+1)%n;P.poly([lo[i],lo[j],mid[j],mid[i]],color);P.poly([mid[i],mid[j],hi[j],hi[i]],i%3?color:C.leafLight);P.poly([hi[i],hi[j],[x-radius*.15,y+height*.44,z]],i%3===1?C.leafLight:color);}
    P.poly(lo.slice().reverse(),color);
  }
  function house(P,s) {
    P.shadow(-5,-3.9,2.55,2.1);
    ground(P,-5,-1.59,1.1,.6,'#71877d',.24,.021);
    P.tag('step',()=>{
      P.box(-5,.17,-4,4.18,.34,3.18,C.foundation);
      P.box(-5,1.52,-4,4,2.5,3,C.plaster);
      front(P,-5,.53,-2.484,3.99,.48,'#d4ceb1');
      roof(P,-5,-4,4.5,3.5,2.82,3.85,C.roof);
      P.box(-5,2.72,-2.448,4.1,.14,.12,'#b79a72');
      for(const x of [-6.91,-3.09])P.box(x,1.51,-2.46,.13,2.37,.12,'#e7d1a7');
      // Side glazing and a small roof overhang remain inside the old house volume.
      P.poly([[-7.006,1.19,-4.66],[-7.006,1.19,-3.85],[-7.006,2.04,-3.85],[-7.006,2.04,-4.66]],C.timber);
      P.poly([[-7.013,1.28,-4.57],[-7.013,1.28,-3.94],[-7.013,1.96,-3.94],[-7.013,1.96,-4.57]],s.repaired?'#efbb6d':'#6e9293');
      P.box(-7.035,1.62,-4.25,.025,.67,.047,'#efdfb9');
      P.box(-6.12,3.45,-4.7,.43,1.2,.5,C.foundation);
      P.box(-6.12,4.07,-4.7,.56,.16,.62,C.plaster);
      for(let row=0;row<4;row++)for(let col=0;col<2;col++)front(P,-6.23+col*.22,3.13+row*.22,-4.444,.19,.015,'#757f77');
      front(P,-5,1.19,-2.485,.91,1.82,C.timber);
      front(P,-5,1.25,-2.475,.7,1.57,'#59776d');
      front(P,-4.76,1.18,-2.456,.065,.065,C.cut);
      window(P,-6.24,1.65,-2.478,s.repaired);
      window(P,-3.76,1.65,-2.478,s.repaired);
      // Shutters, lintels and a small lamp give the facade its own silhouette.
      for(const wx of [-6.24,-3.76]){
        for(const side of [-1,1]){P.box(wx+side*.48,1.64,-2.43,.16,.91,.07,'#6b8c7b');for(let j=0;j<4;j++)front(P,wx+side*.48,1.34+j*.19,-2.387,.13,.018,'#4e7164');}
        P.box(wx,2.12,-2.435,.96,.09,.13,'#eee0ba');
      }
      P.box(-5,2.24,-2.42,1.1,.13,.19,'#e8d4ad');
      P.box(-5.72,2.25,-2.28,.08,.08,.35,C.iron);P.box(-5.72,2.03,-2.1,.17,.29,.16,C.iron);front(P,-5.72,2.03,-2.011,.1,.19,s.repaired?'#f2ce7d':'#bbc1a1');
      // A substantial porch makes the missing middle tread easy to see.
      P.box(-5,.29,-2.03,2.1,.3,.97,C.timber);
      for(let i=0;i<4;i++)P.box(-5,.46,-2.4+i*.25,2.16,.07,.23,i%3?'#b99b6a':'#c4a776');
      P.box(-5,.36,-1.53,2.17,.16,.09,'#8e7152');
      P.box(-5.8,.11,-1.14,.16,.22,.72,C.timber);
      P.box(-4.2,.11,-1.14,.16,.22,.72,C.timber);
      if(s.repaired) {
        P.box(-5,.23,-1.02,1.95,.14,.62,'#c19a66');
        P.box(-5,.32,-1.36,1.95,.1,.23,'#c9a672');
        // Dark nail heads are single faces, not expensive tiny cylinders.
        for(const x of [-5.77,-4.23]) P.poly([[x-.024,.303,-.84],[x+.024,.303,-.84],[x+.024,.303,-.89],[x-.024,.303,-.89]],C.iron);
      } else {
        P.group({x:-5.54,y:.22,z:-1.01,rz:-.065},()=>P.box(0,0,0,.85,.13,.59,'#95806a'));
        P.group({x:-4.43,y:.14,z:-1.07,rz:.18},()=>P.box(0,0,0,.53,.13,.56,'#95806a'));
        P.poly([[-5.12,.295,-.72],[-5.12,.295,-1.3],[-4.97,.295,-1.3],[-5.05,.295,-1.17],[-4.99,.295,-1.05],[-5.11,.295,-.93]],C.cut);
      }
    });
    if(s.repaired) {
      P.box(-3.2,.31,-2.24,.7,.5,.62,'#ad765c');
      for(let i=0;i<3;i++) {
        const x=-3.42+i*.22, y=.85+(i%2)*.1;
        P.box(x,.61,-2.24,.035,.4,.035,C.pine);
        P.blob(x,y,-2.24,.14,.12,.14,i===1?'#e7c680':'#ca8f83');
      }
    }
    // Foundation stones and timber grain are inexpensive planar accents.
    for(let i=0;i<10;i++)front(P,-6.83+i*.4,.18,-2.402,.018,.24,'#6c8078');
    for(let i=0;i<5;i++)front(P,-5.27+i*.13,1.25,-2.468,.012,1.54,'#3e6158');
  }
  function houseSmoke(P,env){
    if(P.detail!==false)for(let i=0;i<4;i++){
      const phase=((env.time||0)*.18+i*.25)%1;
      const wind=env.wind||{x:0,z:0,strength:0};
      P.blob(-6.12+wind.x*wind.strength*phase*1.2,4.19+phase*1.5,-4.7+wind.z*wind.strength*phase*1.2,.12+phase*.25,.17+phase*.2,.12+phase*.22,'#e7e4cf',(1-phase)*.2);
    }
  }
  function workshop(P) {
    P.shadow(3.8,-3.4,2,2.1);
    // An open-front shelter, with no wall in front of the working surface.
    P.box(3.8,1.04,-5.25,3,2.08,.15,'#78938b');
    P.box(2.35,1,-4.3,.14,2,1.9,'#9ca88e');
    // The eastern wall is opened for the attached woodshed; the old obstacle
    // and working bench remain. Roof and all new solids stay inside that area.
    roof(P,3.48,-4.3,2.76,2.4,2.13,2.87,'#53747a');
    P.box(3.48,1.95,-3.18,2.27,.17,.16,'#8b8163');
    P.group({x:2.39,y:1.69,z:-3.25,rz:-.66},()=>P.box(0,0,0,.105,.61,.14,'#b19d75'));
    // Back wall planking is rendered as thin flat seams.
    for(let i=0;i<6;i++) front(P,2.57+i*.49,1,-5.162,.022,1.95,'#7b826d');
    P.box(2.75,.36,-4.5,.67,.72,.67,C.wood);
    front(P,2.75,.36,-4.156,.6,.045,C.timber);
    for(let i=0;i<5;i++)P.box(2.6+i*.46,2.04,-3.14,.07,.13,.13,'#d6bd8f');
    // Pegboard: recognisable tools, without a new interaction target.
    P.box(3.7,1.32,-5.13,1.25,.65,.045,'#a88b61');
    for(const x of [3.35,3.75,4.13]){P.box(x,1.3,-5.085,.045,.42,.04,'#765b43');P.box(x,1.48,-5.065,.23,.1,.06,C.iron);}
    P.box(2.72,.77,-4.5,.77,.07,.73,'#d1b380');
    P.poly([[2.3,.84,-4.5],[2.6,.82,-4.15],[2.96,.84,-4.3],[2.96,.8,-4.67]],'#d9d3ad');
    P.tag('bench',()=>{
      P.shadow(3.8,-1.6,1.7,.68);
      for(const x of [2.75,4.85]) P.box(x,.48,-1.6,.16,.9,.76,C.timber);
      P.box(3.8,.39,-1.6,2.16,.13,.15,C.wood);
      P.box(3.8,.98,-1.6,2.85,.22,1.02,'#b99a6b');
      P.box(3.8,.83,-1.6,2.64,.13,.88,'#8b7657');
      for(const x of [2.52,5.08])P.box(x,1.099,-1.6,.055,.012,.93,'#78837a');
      ground(P,4.25,-1.1,.78,.36,'#ceb585',.65,.029);
      ground(P,4.22,-1.12,.49,.22,'#e2c994',.55,.03);
      for(let i=0;i<3;i++) P.poly([[2.39,1.096,-1.92+i*.28],[5.21,1.096,-1.92+i*.28],[5.21,1.096,-1.905+i*.28],[2.39,1.096,-1.905+i*.28]],C.timber);
      // A compact vise sits on the existing bench, within its collision footprint.
      P.box(5.05,1.16,-1.55,.22,.13,.43,C.iron);
      P.box(5.05,1.27,-1.38,.29,.18,.09,'#6c827d');
      P.box(5.05,1.27,-1.76,.29,.18,.09,'#617c77');
      P.box(5.22,1.18,-1.54,.36,.035,.04,'#b2b9a4');
      // Familiar hand tools stay on the rear edge.
      P.box(2.77,1.12,-1.93,.12,.08,.52,C.timber);
      P.box(2.77,1.17,-2.11,.34,.15,.15,C.iron);
      for(const x of [2.54,5.06])for(const z of [-1.97,-1.24])P.cylinder(x,1.105,z,.018,.018,.012,C.iron,5);
    });
  }
  function eastFace(P,x,y,z,w,h,color){
    P.poly([[x,y-h/2,z-w/2],[x,y+h/2,z-w/2],[x,y+h/2,z+w/2],[x,y-h/2,z+w/2]],color);
  }
  function stockCount(P,x,y,z,amount){
    // Small carved numerals remain readable even when an imported save exceeds
    // the initial shelf capacity. Every real stored piece is drawn as well.
    const glyphs=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
    const letters={a:[0,.1,.085,.018],b:[.045,.05,.018,.084],c:[.045,-.05,.018,.084],d:[0,-.1,.085,.018],e:[-.045,-.05,.018,.084],f:[-.045,.05,.018,.084],g:[0,0,.085,.018]};
    const text=String(amount);
    for(let i=0;i<text.length;i++)for(const part of glyphs[Number(text[i])]||''){
      const [u,v,w,h]=letters[part];eastFace(P,x,y+v,z+(i-(text.length-1)/2)*.135+u,w,h,'#f0d8a5');
    }
  }
  function shedStructure(P,level){
    // Sole storage building: all solids lie in the old workshop reservation
    // x[2,5.6], z[-5.6,-3]. Its eastern face stays open at both levels.
    const raised=level===1,low=raised?2.18:1.97,high=raised?2.53:2.39;
    P.shadow(4.9,-4.25,.63,1.16);
    const cells=[{tag:'shed:logs',back:-5.48,front:-4.28},{tag:'shed:boards',back:-4.28,front:-3.08}];
    for(const cell of cells)P.tag(cell.tag,()=>{
      const z=(cell.back+cell.front)/2,d=cell.front-cell.back;
      P.box(4.93,.13,z,1.17,.12,d-.04,'#8a795b');
      for(const x of [4.49,5.4])P.box(x,.075,z,.1,.15,d-.03,'#627b76');
      // A tagged roof section makes its compartment pickable from higher views.
      P.poly([[4.39,high,cell.back],[5.55,low,cell.back],[5.55,low,cell.front],[4.39,high,cell.front]],raised?'#527b80':'#85918a');
      P.poly([[4.39,high-.075,cell.back],[4.39,high-.075,cell.front],[5.55,low-.075,cell.front],[5.55,low-.075,cell.back]],'#687f79');
      P.box(5.515,low-.04,z,.07,.13,d,'#b8a37b');
      if(raised){
        P.box(4.93,.85,z,1.11,.08,d-.075,'#bca171');
        P.box(5.46,.82,z,.07,.14,d-.075,'#897a5c');
        for(let i=0;i<5;i++){
          const zz=cell.back+.08+i*(d-.16)/4;
          P.poly([[4.41,high+.006,zz],[5.54,low+.006,zz],[5.54,low+.006,zz+.025],[4.41,high+.006,zz+.025]],'#a5b2a0');
        }
      }else{
        for(let i=0;i<4;i++){
          const zz=cell.back+.11+i*(d-.22)/3;
          P.poly([[4.42,high+.006,zz],[5.54,low+.006,zz],[5.54,low+.006,zz+.017],[4.42,high+.006,zz+.017]],'#6c837d');
        }
      }
    });
    for(const z of [-5.42,-4.28,-3.14]){
      const tag=z<-4.3?'shed:logs':z<-3.2?'shed:boards':'shed:upgrade';
      P.tag(tag,()=>{
        P.box(5.44,(low-.05)/2,z,.115,low-.05,.115,'#967e5b');
        P.box(4.47,1.15,z,.1,2.3,.1,'#7b8067');
      });
    }
    // A low stop separates the bins without concealing the first stored log
    // from the unchanged working/result camera on the southern side.
    P.tag('shed:logs',()=>P.box(4.95,.212,-4.28,1.12,.045,.065,'#85917c'));
    P.tag('shed:upgrade',()=>{
      // Upgrade plate on the front corner is distinct from both resource bins.
      P.box(5.12,.63,-3.077,.45,.34,.06,'#627e79');
      P.poly([[5.04,.52,-3.043],[5.2,.52,-3.043],[5.2,.66,-3.043],[5.27,.66,-3.043],[5.12,.77,-3.043],[4.97,.66,-3.043],[5.04,.66,-3.043]],raised?'#b8c497':'#e4c18b');
      if(raised)P.poly([[5.04,.62,-3.038],[5.1,.56,-3.038],[5.24,.71,-3.038],[5.21,.74,-3.038],[5.1,.63,-3.038],[5.07,.66,-3.038]],'#f0dfba');
    });
  }
  function shedLogs(P,amount,level){
    P.tag('shed:logs',()=>{
      // Normal/legacy stocks are fully individual (up to 8/16). Defensive
      // schema bounds can be much larger; keep geometry bounded, count exact.
      for(let i=0;i<Math.min(amount,8);i++){
        const row=Math.floor(i/4),x=4.69+(i%4)*.22;
        // Use the visible upper shelf first after the shelf upgrade.
        const y=level===1?1-row*.7:.3+row*.215;
        // Present the pale cut ends to the unchanged southern camera.
        log(P,x,y,-4.94,.98,.105,Math.PI/2);
      }
      P.box(5.49,1.48,-4.88,.055,.35,.57,'#657e76');
      // Round cut end and rectangular planks form different silhouettes/icons.
      const disc=[];for(let i=0;i<8;i++){const a=i*TAU/8;disc.push([5.521,1.48+Math.sin(a)*.073,-5.055+Math.cos(a)*.073]);}
      P.poly(disc,'#d8ba88');
      eastFace(P,5.525,1.48,-5.055,.055,.018,'#8f805f');
      stockCount(P,5.526,1.48,-4.79,amount);
    });
  }
  function shedBoards(P,amount,level){
    P.tag('shed:boards',()=>{
      for(let i=0;i<Math.min(amount,16);i++){
        const shelf=level===1?Math.floor(i/8):0,within=level===1?i%8:i,lane=within%2,row=Math.floor(within/2);
        const y=.225+shelf*.7+row*.067,z=-3.96+lane*.45;
        P.box(4.91,y,z,1.14,.058,.32,i%3?'#c6a773':'#dcc08b');
        eastFace(P,5.482,y,z,.286,.008,'#9c8762');
      }
      P.box(5.49,1.48,-3.67,.055,.35,.64,'#657e76');
      for(let i=0;i<2;i++)eastFace(P,5.521,1.45+i*.07,-3.875,.13,.035,'#dfc18c');
      stockCount(P,5.526,1.48,-3.555,amount);
    });
  }
  function benchWork(P,env){
    if(env.work?.id!=='saw')return;
    P.tag('bench',()=>{
      if(env.work.progress<.86){
        log(P,3.76,1.29,-1.6,2.02,.22);
        const q=Math.sin((env.work.cycle||0)*TAU)*.22;
        P.poly([[4.2,1.2,-1.95+q],[4.2,1.56,-1.8+q],[4.2,1.56,-.93+q],[4.2,1.26,-1.01+q]],'#b6c5bf');
        P.box(4.2,1.56,-.86+q,.13,.21,.29,C.timber);
      }else for(let i=0;i<2;i++)P.box(4.2,1.16+i*.13,-1.45,1.45,.12,.27,'#cda66e');
    });
  }
  function lighthouse(P) {
    P.shadow(10,-7,1.65,1.35);
    P.tag('lighthouse',()=>{
      P.cylinder(10,.18,-7,1.2,1.3,.36,C.foundation,12);
      P.cylinder(10,.4,-7,1.02,1.16,.16,'#b5b8a1',12);
      P.cylinder(10,2.65,-7,.74,1.02,5.0,C.plaster,12);
      P.cylinder(10,4.86,-7,.79,.81,.21,'#ac6953',10);
      P.cylinder(10,5.22,-7,1.04,1.04,.16,C.iron,10);
      for(let i=0;i<4;i++) {
        const a=i*TAU/4+Math.PI/4;
        P.box(10+Math.cos(a)*.57,5.66,-7+Math.sin(a)*.57,.065,.82,.065,C.iron);
      }
      P.cylinder(10,6.13,-7,.055,.98,.48,'#53767a',8);
      P.cylinder(10,6.45,-7,.045,.045,.24,C.iron,6);
      // Gallery rail, lantern ribs, masonry bands and copper roof seams.
      for(let i=0;i<12;i++){const a=i*TAU/12,b=(i+1)*TAU/12;P.box(10+Math.cos(a)*.96,5.48,-7+Math.sin(a)*.96,.036,.46,.036,C.iron);P.poly([[10+Math.cos(a)*.96,5.69,-7+Math.sin(a)*.96],[10+Math.cos(b)*.96,5.69,-7+Math.sin(b)*.96],[10+Math.cos(b)*.96,5.725,-7+Math.sin(b)*.96],[10+Math.cos(a)*.96,5.725,-7+Math.sin(a)*.96]],C.iron);}
      for(const y of [1.62,2.97,4.3]){const r=1.02-(y-.15)*.056;P.cylinder(10,y,-7,r+.012,r+.012,.025,'#ded6ba',12);}
      front(P,10,.99,-5.976,.68,1.52,C.timber);
      front(P,10,1.03,-5.961,.51,1.34,'#60776c');
      // Rounded lintel and a shallow stone surround give the tower a human scale.
      const arch=[[9.59,.23,-5.982],[10.41,.23,-5.982],[10.41,1.48,-5.982]];
      for(let i=0;i<=8;i++){const a=i*Math.PI/8;arch.push([10+Math.cos(a)*.41,1.48+Math.sin(a)*.41,-5.982]);}
      P.poly(arch,'#cfc8a6');
      const door=[[9.73,.23,-5.966],[10.27,.23,-5.966],[10.27,1.43,-5.966]];
      for(let i=0;i<=8;i++){const a=i*Math.PI/8;door.push([10+Math.cos(a)*.27,1.43+Math.sin(a)*.27,-5.966]);}
      P.poly(door,'#456b70');
      for(const x of [9.85,10,10.15])front(P,x,.83,-5.958,.012,1.05,'#355d64');
      front(P,10.15,.92,-5.95,.045,.08,'#d9bd83');
      front(P,10,3.65,-6.185,.31,.58,C.iron);
      front(P,10,3.65,-6.174,.21,.46,'#9bb3a6');
      P.box(10,.17,-5.91,.85,.16,.32,'#b9b7a0');
      for(let i=0;i<8;i++){
        const a=i*TAU/8,xx=10+Math.sin(a)*1.19,zz=-7+Math.cos(a)*1.19;
        P.poly([[xx,.06,zz],[xx,.29,zz],[xx+.025,.29,zz+.015],[xx+.025,.06,zz+.015]],'#718b8d');
      }
    });
  }
  function lantern(P,env){
    P.tag('lighthouse',()=>{
      P.cylinder(10,5.65,-7,.7,.7,.74,env.night>.2?'#edca83':'#8facaa',8);
      P.cylinder(10,5.61,-7,.14,.21,.4,env.night>.2?'#ffe1a0':'#b7bc9d',8);
      if((env.night||0)>.05)P.blob(10,5.65,-7,.77,.43,.77,'#edca83',Math.min(.13,env.night*.13));
    });
  }
  function trunk(P,index){
    P.cylinder(0,1.03,0,.17,.29,2.06,C.timber,8);
    // A pale broken stripe reads as bark at the keeper's scale.
    P.poly([[-.15,.22,.25],[-.12,1.61,.15],[-.075,1.78,.16],[-.07,.28,.28]],'#a68b63');
    for(const side of [-1,1])P.group({x:side*.17,y:1.58,z:0,rz:side*(.5+index*.025)},()=>P.cylinder(0,0,0,.065,.12,.82,'#897455',6));
    for(let i=0;i<3;i++)P.group({ry:i*TAU/3+.3},()=>P.poly([[-.11,.12,.08],[.11,.1,.09],[.06,.012,.57],[-.06,.012,.64]],'#927e59'));
  }
  function treeGround(P,t){
    const {x,z}=t;
    P.shadow(x,z,t.felled?.61:1.35,t.felled?.5:1.04);
    ground(P,x,z,t.felled?.43:.64,t.felled?.36:.5,'#7f9478',.58,.019);
    const count=P.quality==='lighter'?3:6;
    for(let i=0;i<count;i++){
      const a=i*2.4+x,r=.3+seed(i+z*7)*.38,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;
      P.poly([[xx-.09,.021,zz],[xx+.03,.021,zz-.035],[xx+.13,.021,zz+.025],[xx,.021,zz+.07]],i%3?'#a3ad7f':'#b6b18a');
    }
  }
  function treeStatic(P,t,index){
    const {x,z}=t;
    if(t.felled){
      P.cylinder(x,.19,z,.23,.32,.38,C.timber,7);
      P.cylinder(x,.388,z,.21,.21,.012,C.cut,7);
      P.cylinder(x,.397,z,.12,.12,.004,'#bda67d',7);
      P.cylinder(x,.401,z,.095,.095,.004,C.cut,7);
      if(!t.collected)P.tag('logs:'+t.id,()=>{
        log(P,x+.54,.2,z+.32,1.5,.19);
        log(P,x+.65,.21,z-.14,1.28,.2);
        log(P,x+.63,.53,z+.09,1.05,.17);
      });
    }else P.tag('tree:'+t.id,()=>P.group({x,z},()=>trunk(P,index)));
  }
  function conifer(P,index){
    const taller=[1,1.06,.91,1.08,.94][index]||1;
    const spread=[1,.95,1.05,1.1,.87][index]||1;
    const tiers=index===4?3:4,lean=index%2?.1:-.14;
    const palette=['#4b7e78','#628e7c','#779b80','#90aa87'];
    for(let tier=0;tier<tiers;tier++){
      const radius=(1.09-tier*(tiers===3?.27:.205))*spread,base=(1.18+tier*(tiers===3?.7:.57))*taller,tipY=(2.66+tier*(tiers===3?.52:.41))*taller,n=7;
      const phase=tier*.71+index*.37,dx=lean*(tier+.35),dz=-tier*.055,edge=[];
      for(let i=0;i<n;i++){
        const a=phase+i*TAU/n,w=.76+seed(index*17+tier*9+i)*.31;
        edge.push([dx+Math.cos(a)*radius*w,base-.25*seed(i+tier*11),dz+Math.sin(a)*radius*w*.82]);
      }
      const top=[dx+.08*Math.sin(index+1),tipY,dz-.07];
      for(let i=0;i<n;i++){
        const j=(i+1)%n,inner=[dx,base+.12,dz];
        P.poly([edge[i],edge[j],top],palette[(tier+(i===1?1:0))%4]);
        P.poly([edge[j],edge[i],inner],'#426f6c');
      }
    }
  }
  function treeMoving(P,t,env,index){
    if(t.felled)return;
    const chopping=env.work?.id==='chop:'+t.id,p=chopping?(env.work.progress||0):0;
    const tilt=p>.78?((p-.78)/.22)*1.28:0;
    const wind=env.wind||{x:0,z:0,strength:0},pulse=.9+.1*Math.sin((env.time||0)*.64+index*1.8),bend=env.reducedMotion?0:wind.strength*.045*pulse;
    P.tag('tree:'+t.id,()=>P.group({x:t.x,z:t.z,y:0,rz:tilt},()=>{
      if(chopping)trunk(P,index);
      P.group({rz:-wind.x*bend,rx:wind.z*bend},()=>{
        if(index===0||t.id==='oak-a'){
          crown(P,.13,2.83,0,1.15,1.5,'#779a78');
          crown(P,-.78,2.46,.13,.83,1.04,'#94ab7d');
          crown(P,.87,2.68,-.12,.78,1.15,'#89a578');
          crown(P,.38,3.31,-.16,.74,.88,'#acbb83');
          crown(P,-.15,2.37,.64,.78,.9,'#739775');
        }else conifer(P,index);
      });
      if(chopping&&p>.2){
        front(P,0,.64,.29,.29,.1,C.cut);
        const a=(env.work.cycle||0)%1;
        if(a>.46&&a<.8){
          const q=(a-.46)/.34;
          P.poly([[.25+q*.5,.51+Math.sin(q*Math.PI)*.37,.4+q*.4],[.35+q*.5,.57+Math.sin(q*Math.PI)*.37,.4+q*.4],[.31+q*.5,.55+Math.sin(q*Math.PI)*.37,.53+q*.4]],C.cut);
        }
      }
    }));
  }
  function draw(P,s,env={}){
    const q=P.quality||'standard';
    keep(P,'scene:house:'+Number(!!s.repaired)+':'+q,()=>house(P,s));
    keep(P,'scene:workshop:'+q,()=>workshop(P));
    const level=s.shedLevel===1?1:0;
    keep(P,'scene:shed-structure:'+level+':'+q,()=>shedStructure(P,level));
    keep(P,'scene:shed-logs:'+level+':'+s.logs+':'+q,()=>shedLogs(P,s.logs,level));
    keep(P,'scene:shed-boards:'+level+':'+s.boards+':'+q,()=>shedBoards(P,s.boards,level));
    keep(P,'scene:lighthouse:'+q,()=>lighthouse(P));
    houseSmoke(P,env);benchWork(P,env);lantern(P,env);
    (s.trees||[]).forEach((t,i)=>{
      const flags=Number(!!t.felled)+':'+Number(!!t.collected);
      keep(P,'scene:tree-ground:'+t.id+':'+Number(!!t.felled)+':'+q,()=>treeGround(P,t));
      // During chopping the same trunk participates in the actual falling tilt.
      if(env.work?.id!=='chop:'+t.id||t.felled)keep(P,'scene:tree:'+t.id+':'+flags+':'+q,()=>treeStatic(P,t,i));
      treeMoving(P,t,env,i);
    });
  }
  globalThis.CloseScene={draw};
})();
