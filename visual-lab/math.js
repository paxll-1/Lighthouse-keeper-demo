// Shared camera and animation math. Column-major matrices, WebGL clip space.
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
export function frameCamera(camera,aspect){
  const z=norm(sub(camera.eye,camera.target)),x=norm(cross([0,1,0],z)),y=cross(z,x);
  const view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,camera.eye),-dot(y,camera.eye),-dot(z,camera.eye),1];
  const f=1/Math.tan(camera.fov*Math.PI/360),n=camera.near??.1,fa=camera.far??180;
  const p=[f/aspect,0,0,0,0,f,0,0,0,0,(fa+n)/(n-fa),-1,0,0,2*fa*n/(n-fa),0];
  const out=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=p[k*4+r]*view[c*4+k];
  return {viewProjection:out,eye:camera.eye};
}
export function pose(mesh,time,motion){
  const a=mesh.animation;if(!a||!motion)return [0,0,0];
  const phase=time*(a.speed??1)+(a.phase??0),amp=a.amplitude??.03;
  if(a.kind==='float')return [Math.sin(phase*.5)*amp,Math.sin(phase)*amp*.3,0];
  if(a.kind==='smoke')return [Math.sin(phase)*amp,Math.cos(phase*.6)*amp*.3,Math.sin(phase*.7)*amp*.4];
  return [Math.sin(phase)*amp,0,Math.sin(phase*.8)*amp*.35];
}
