import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';
import { bridgeAuthoredMaterial } from './authored-renderer.js';
import { disposeAuthoredAssets } from './asset-loader.js';
import { resolveEnvironmentLayout } from './environment-layout.js';

// Shared game time/wind and the actor light/fog/lantern. No extra loop or light.
export function bridgeEnvironmentMaterial(source,shared,wind,foliage){
  const material=bridgeAuthoredMaterial(source,shared,'lighter'),compile=material.onBeforeCompile;
  material.transparent=false;material.opacity=1;material.depthWrite=true;material.vertexColors=true;
  material.onBeforeCompile=shader=>{
    compile(shader);Object.assign(shader.uniforms,wind);
    shader.vertexShader='attribute float envWind;\nuniform float uEnvTime, uEnvWindStrength;\nuniform vec2 uEnvWind;\n'+shader.vertexShader;
    const old=`#include <project_vertex>\n      vArtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n      vArtDepth = -mvPosition.z;`;
    shader.vertexShader=shader.vertexShader.replace(old,`vec4 envWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        envWorld = instanceMatrix * envWorld;
      #endif
      envWorld = modelMatrix * envWorld;
      ${foliage ? `#ifdef USE_INSTANCING
        // Drape the existing affine shoreline height under rooted clumps.
        float rootZ = (modelMatrix * instanceMatrix[3]).z;
        float groundHere = -0.55 * clamp((envWorld.z - 3.8) / 2.0, 0.0, 1.0);
        float groundRoot = -0.55 * clamp((rootZ - 3.8) / 2.0, 0.0, 1.0);
        envWorld.y += groundHere - groundRoot;
      #endif` : ''}
      float sway = envWind * envWind * uEnvWindStrength * (0.025 + 0.012 * sin(uEnvTime * 0.8 + envWorld.x * 0.7 + envWorld.z));
      envWorld.xz += uEnvWind * sway;
      vec4 mvPosition = viewMatrix * envWorld;
      gl_Position = projectionMatrix * mvPosition;
      vArtWorld = envWorld.xyz; vArtDepth = -mvPosition.z;`);
    if(!foliage)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      // Visual splash tint only below the existing low shoreline, not tides.
      float envWet = 1.0 - smoothstep(-0.54, -0.50, vArtWorld.y);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.78,0.88,0.90), envWet * 0.55);`);
  };
  material.customProgramCacheKey=()=>`coastal-opaque-lambert-v1:${foliage?'rootwind':'wet'}`;return material;
}
function geometry(source){
  const g=source.index?source.toNonIndexed():source.clone(),c=g.getAttribute('color'),rgb=new Float32Array(c.count*3),wind=new Float32Array(c.count);
  for(let i=0;i<c.count;i++){rgb.set([c.getX(i),c.getY(i),c.getZ(i)],i*3);wind[i]=c.itemSize===4?c.getW(i):0;}
  g.setAttribute('color',new THREE.BufferAttribute(rgb,3));g.setAttribute('envWind',new THREE.BufferAttribute(wind,1));return g;
}
export function rockMatrix(p,sourceHeight=1){
  // Rotation inside scale keeps every normalized radial point inside the exact
  // existing collision ellipse even for anisotropic slab footprints.
  return new THREE.Matrix4().makeTranslation(p.x,p.y,p.z).multiply(new THREE.Matrix4().makeScale(p.rx,p.height/sourceHeight,p.rz)).multiply(new THREE.Matrix4().makeRotationY(p.turn));
}
export class EnvironmentRenderer{
  constructor(scene,camera,asset,shared,config,heightAt){
    if(!asset?.report?.static)throw new Error('Validated coastal kit required.');
    this.scene=scene;this.camera=camera;this.asset=asset;this.layout=resolveEnvironmentLayout(config,heightAt);
    this.group=new THREE.Group();this.group.name='authored-coastal-environment';scene.add(this.group);
    this.wind={uEnvTime:{value:0},uEnvWindStrength:{value:0},uEnvWind:{value:new THREE.Vector2()}};
    this.lods={};this.materials=[];this.geometries=[];this.rockMeshes=[];this.disposed=false;this.frames=0;this.switches=0;this.lod=null;this.quality='standard';
    const roots=Object.fromEntries(asset.scene.children.map(n=>[n.userData?.name||n.name,n.children[0]]));
    const sources=[roots.HeadlandNear.material,roots.GrassNear.material,roots.ShrubNear.material];
    const materials=sources.map((s,i)=>bridgeEnvironmentMaterial(s,shared,this.wind,i>0));this.materials.push(...materials);
    for(const suffix of ['Near','Far']){
      const root=new THREE.Group();root.name='Coastal'+suffix;this.group.add(root);this.lods[suffix]=root;
      const parts=this.layout.rocks.map(p=>geometry(roots[p.type+suffix].geometry).applyMatrix4(rockMatrix(p,asset.report.prototypes[p.type+suffix].height)));
      const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());merged.computeBoundingSphere();this.geometries.push(merged);
      const rock=new THREE.Mesh(merged,materials[0]);rock.name='CoastalRocks'+suffix;root.add(rock);this.rockMeshes.push(rock);
      for(const [kind,placements,index] of [['Grass',this.layout.grass,1],['Shrub',this.layout.shrubs,2]]){
        const g=geometry(roots[kind+suffix].geometry);this.geometries.push(g);const mesh=new THREE.InstancedMesh(g,materials[index],placements.length);mesh.name='Coastal'+kind+suffix;
        placements.forEach((p,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(p.x,p.y,p.z).multiply(new THREE.Matrix4().makeRotationY(p.turn)).multiply(new THREE.Matrix4().makeScale(p.scale,p.scale,p.scale))));
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.35;root.add(mesh);
      }
    }
    this.raycaster=new THREE.Raycaster();this.origin=new THREE.Vector3();this.direction=new THREE.Vector3();this.scratch=new THREE.Vector3();this.center=new THREE.Vector3(17.5,0,1);
    this.group.visible=false;
  }
  begin(){if(!this.disposed)this.group.visible=false;}
  draw(env={}){
    if(this.disposed)return false;this.group.visible=true;this.frames++;this.reducedMotion=!!env.reducedMotion;
    this.wind.uEnvTime.value=Number.isFinite(env.time)?env.time:0;const w=env.wind||{};
    this.wind.uEnvWind.value.set(w.x||0,w.z||0);this.wind.uEnvWindStrength.value=this.reducedMotion?0:Math.max(0,Math.min(1,w.strength||0));return true;
  }
  environment({quality='standard',height=1}={}){
    if(this.disposed)return;this.quality=quality;
    this.scratch.copy(this.center).applyMatrix4(this.camera.matrixWorldInverse);const depth=-this.scratch.z;
    // Projected 1m size includes optical zoom: close observation never selects
    // distant geometry merely because the unmoved eye is far from the island.
    this.projectedMeter=height*this.camera.projectionMatrix.elements[5]/Math.max(.3,depth)/2;
    const threshold=quality==='lighter'?70:48,next=this.lod===null?(this.projectedMeter>threshold?'Near':'Far'):this.lod==='Near'?(this.projectedMeter<threshold*.82?'Far':'Near'):(this.projectedMeter>threshold*1.18?'Near':'Far');
    if(next!==this.lod){this.lod=next;this.switches++;}this.lods.Near.visible=next==='Near';this.lods.Far.visible=next==='Far';
    for(const root of Object.values(this.lods))for(const mesh of root.children)if(mesh.name.startsWith('CoastalGrass'))mesh.count=quality==='lighter'?16:this.layout.grass.length;
    this.group.updateMatrixWorld(true);
  }
  pick(eye,ray,rawHit){
    if(this.disposed||!this.group.visible)return rawHit;this.origin.fromArray(eye);this.direction.fromArray(ray);const length=this.direction.length();this.direction.divideScalar(length);this.raycaster.set(this.origin,this.direction);
    const active=this.rockMeshes.filter(m=>m.parent.visible),hits=this.raycaster.intersectObjects(active,false);
    const hit=hits.find(h=>{const d=-this.scratch.copy(h.point).applyMatrix4(this.camera.matrixWorldInverse).z;return d>=this.camera.near&&d<=this.camera.far;});
    return hit&&(!rawHit||hit.distance/length<rawHit.distance)?{tag:null,distance:hit.distance/length}:rawHit;
  }
  inspect(){
    let triangles=0,draws=0;const root=this.lods[this.lod];if(root&&this.group.visible)root.traverse(m=>{if(m.isMesh){draws++;triangles+=(m.geometry.index?.count||m.geometry.getAttribute('position').count)/3*(m.isInstancedMesh?m.count:1);}});
    return{ready:!this.disposed,version:this.layout.version,lod:this.lod,quality:this.quality,projectedMeter:this.projectedMeter,triangles,drawCallsUpperBound:draws,rocks:this.layout.rocks.length,grass:this.layout.grass.length,shrubs:this.layout.shrubs.length,
      visible:this.group.visible,frames:this.frames,lodSwitches:this.switches,ownFrameLoop:false,ownLights:0,shadowMaps:false,windStrength:this.wind.uEnvWindStrength.value,reducedMotion:this.reducedMotion,picking:'opaque-rock-blockers-only',asset:this.asset?.report};
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.scene.remove(this.group);this.group.clear();this.materials.forEach(m=>m.dispose());this.geometries.forEach(g=>g.dispose());disposeAuthoredAssets({environment:this.asset});this.asset=null;this.materials.length=this.geometries.length=this.rockMeshes.length=0;}
}
