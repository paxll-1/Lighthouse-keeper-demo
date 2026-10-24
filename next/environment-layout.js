// ENV-001 appearance only. Existing config owns land, barriers and navigation.
export const ENVIRONMENT_VERSION = 'coastal-kit-v1';
export function resolveEnvironmentLayout(config, heightAt) {
  const types = ['Headland','Slab','Headland','Boulder','Headland','Boulder','Boulder','Slab'];
  const rocks = config.terrain.coastExtension.rocks.map((r,i) => {
    let base = heightAt(r.x,r.z);
    for (let n=0;n<16;n++) base=Math.min(base,heightAt(r.x+Math.cos(n*Math.PI/8)*r.rx,r.z+Math.sin(n*Math.PI/8)*r.rz));
    return { id:`coast-rock-${i}`, type:types[i], x:r.x,z:r.z,y:base-.018,rx:r.rx,rz:r.rz,height:r.height,turn:i*.91 };
  });
  // Sheltered pockets, not uniform scatter. Gaps preserve the existing trail.
  const groups=[[11.8,-6.4],[13,-4.4],[13.6,-3.2],[15,-2.25],[17.5,-2.25],[20.45,.3],[20.4,3.55],[21.15,4.9]];
  const grass=[[0,0],[.28,.12],[-.21,.18]].flatMap(([dx,dz],i)=>groups.map(([x,z],g)=>({x:x+dx,z:z+dz,y:heightAt(x+dx,z+dz)-.012,scale:.44+(g+i)%3*.08,turn:g*.83+i*1.7})));
  const shrubs=[[12.8,-5.2],[13.6,-3.9],[15.8,-2.8],[17.4,.45],[20.7,3.35],[21.35,4.9]].map(([x,z],i)=>({x,z,y:heightAt(x,z)-.012,scale:.48+i%3*.05,turn:i*1.42}));
  return { version:ENVIRONMENT_VERSION, rocks,grass,shrubs, realPrototype:'jointed coastal bedrock and sheltered salt/wind-tolerant grass/scrub',
    artisticDeviation:'enlarged readable fractures and composed pockets', technicalDeviation:'static placements inside existing barriers; shader wind/wet tint are visual approximations, not physical simulation' };
}
