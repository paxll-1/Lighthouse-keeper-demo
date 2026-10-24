import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { AuthoredAssetError, inspectGLB, disposeAuthoredAssets } from './asset-loader.js';
export const ENVIRONMENT_SPEC=Object.freeze({url:'./assets/models/coastal-kit.glb',types:['Headland','Slab','Boulder','Grass','Shrub']});
export function validateEnvironmentAsset(gltf) {
  const fail=m=>{throw new AuthoredAssetError(`environment: ${m}`);};
  if(!gltf?.scene?.isObject3D||gltf.animations?.length)fail('static scene required; no clips.');
  const identity=new THREE.Matrix4(),prototypes={};gltf.scene.updateMatrixWorld(true);
  if(!gltf.scene.matrix.equals(identity)||gltf.scene.children.length!==10)fail('expected ten identity prototype roots.');
  for(const type of ENVIRONMENT_SPEC.types)for(const lod of ['Near','Far']){
    const name=type+lod,root=gltf.scene.children.find(n=>(n.userData?.name||n.name)===name);
    if(!root||!root.matrix.equals(identity)||root.children.length!==1)fail(`${name}: identity root/one mesh required.`);
    const mesh=root.children[0],g=mesh.geometry,p=g?.getAttribute('position'),n=g?.getAttribute('normal'),c=g?.getAttribute('color');
    if(!mesh.isMesh||mesh.isSkinnedMesh||!mesh.matrix.equals(identity)||!p||!n||!c||p.count!==n.count||p.count!==c.count||![3,4].includes(c.itemSize))fail(`${name}: static colored mesh/normals required.`);
    if(mesh.children.length)fail('nested nodes not allowed.');
    const mat=mesh.material;if(!mat?.isMeshStandardMaterial||Array.isArray(mat)||mat.transparent||mat.metalness!==0)fail(`${name}: one opaque matte material required.`);
    if(Object.values(mat).some(v=>v?.isTexture))fail('external or embedded textures not allowed.');
    const expected=type==='Grass'?'EnvironmentGrass':type==='Shrub'?'EnvironmentShrub':'EnvironmentRock';if(mat.name!==expected)fail(`${name}: material role mismatch.`);
    for(const a of [p,n,c])for(const v of a.array)if(!Number.isFinite(v))fail('nonfinite attribute.');
    const foliage=type==='Grass'||type==='Shrub';if(foliage&&c.itemSize!==4)fail('root wind mask required.');
    for(let i=0;i<p.count;i++)if(Math.hypot(p.getX(i),p.getZ(i))>1.0001||p.getY(i)<-.025||p.getY(i)>1.2)fail(`${name}: bounds exceeded.`);
    const count=g.index?.count||p.count,triangles=count/3;if(count%3||triangles>(foliage?(lod==='Near'?100:32):(lod==='Near'?700:160)))fail(`${name}: triangle budget exceeded.`);
    if(g.index)for(const i of g.index.array)if(i<0||i>=p.count)fail('bad index.');
    let height=0;for(let i=0;i<p.count;i++)height=Math.max(height,p.getY(i));
    prototypes[name]={triangles,vertices:p.count,height,material:mat.name,windMask:foliage};
  }
  return {static:true,prototypes,clips:[],rootCount:10,textures:0};
}
export async function loadEnvironmentAsset({build,baseURL=import.meta.url}={}){
  let asset;try{
    const url=new URL(ENVIRONMENT_SPEC.url,baseURL);if(build)url.searchParams.set('build',build);
    const response=await fetch(url);if(!response.ok)throw new AuthoredAssetError(`environment: GLB load failed (${response.status}).`);
    const buffer=await response.arrayBuffer();inspectGLB(buffer);const gltf=await new GLTFLoader().parseAsync(buffer,new URL('.',url).href);
    asset={scene:gltf.scene,animations:gltf.animations,url:url.href};asset.report=validateEnvironmentAsset(gltf);return Object.freeze(asset);
  }catch(error){if(asset)disposeAuthoredAssets({environment:asset});throw error;}
}
