import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface HeroSceneOptions {
  canvas: HTMLCanvasElement;
  trigger: HTMLElement;
  copy: HTMLElement | null;
  hint: HTMLElement | null;
  reduceMotion: boolean;
}

const ACCENT = 0xc6f432;
const BG = 0x07090f;

const VERT = `uniform float uT,uM;attribute float aV;varying float vA;
vec3 knot(float u,float v){float a=u*6.28318;
 vec3 c=vec3((2.+cos(3.*a))*cos(2.*a),(2.+cos(3.*a))*sin(2.*a),-sin(3.*a))*.62;
 float a2=a+.01;vec3 c2=vec3((2.+cos(3.*a2))*cos(2.*a2),(2.+cos(3.*a2))*sin(2.*a2),-sin(3.*a2))*.62;
 vec3 T=normalize(c2-c);vec3 N=normalize(cross(T,vec3(0,0,1)));vec3 B=cross(T,N);float b=v*6.28318;
 return c+(N*cos(b)+B*sin(b))*.32;}
vec3 sph(float u,float v){float th=u*6.28318,ph=v*3.14159;return vec3(sin(ph)*cos(th),cos(ph),sin(ph)*sin(th))*2.;}
void main(){float u=position.x,v=aV;vec3 p=mix(knot(u,v),sph(u,v),uM);p*=1.+.025*sin(u*30.+uT);
 vec4 mv=modelViewMatrix*vec4(p,1.);vA=clamp(1.2-(-mv.z-5.)/8.,.15,1.);gl_Position=projectionMatrix*mv;}`;
const FRAG = `uniform vec3 uC;uniform float uO;varying float vA;void main(){gl_FragColor=vec4(uC,uO*vA);}`;

/** Mounts the hero scene. Returns a cleanup function that disposes everything. */
export function mountHeroScene(opts: HeroSceneOptions): () => void {
  const { canvas, trigger, copy, hint, reduceMotion } = opts;
  const mobile = window.innerWidth < 860;
  const state = { rotY: 0, rotX: 0.35, morph: 0, camZ: mobile ? 11 : 9, offX: mobile ? 0 : 1.9 };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setClearColor(BG);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.07);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  const RINGS = mobile ? 36 : 60;
  const SEG = mobile ? 110 : 180;
  const TUBES = mobile ? 10 : 12;
  const RING_SEG = mobile ? 18 : 24;
  const pos: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < SEG; i++) for (let j = 0; j < TUBES; j++) { const a = j / TUBES; pos.push(i / SEG, 0, 0, (i + 1) / SEG, 0, 0); v.push(a, a); }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < RING_SEG; j++) { const u = i / RINGS; pos.push(u, 0, 0, u, 0, 0); v.push(j / RING_SEG, (j + 1) / RING_SEG); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aV', new THREE.Float32BufferAttribute(v, 1));
  const uniforms = { uT: { value: 0 }, uM: { value: 0 }, uC: { value: new THREE.Color(ACCENT) }, uO: { value: 0.42 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const group = new THREE.Group();
  group.add(new THREE.LineSegments(geo, mat));
  scene.add(group);

  const starGeo = new THREE.BufferGeometry();
  const sp: number[] = [];
  const STARS = mobile ? 250 : 500;
  for (let i = 0; i < STARS; i++) sp.push((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, -Math.random() * 25);
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0x8a93a6, size: 0.035, transparent: true, opacity: 0.35 });
  scene.add(new THREE.Points(starGeo, starMat));

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let raf = 0;
  const loop = () => {
    const t = reduceMotion ? 0 : clock.getElapsedTime();
    uniforms.uT.value = t;
    uniforms.uM.value = state.morph;
    group.rotation.set(state.rotX, state.rotY + t * 0.08, 0);
    group.position.x = state.offX;
    group.position.y = mobile ? 1.6 : 0;
    camera.position.z = state.camZ;
    renderer.render(scene, camera);
    if (!reduceMotion) raf = requestAnimationFrame(loop);
  };
  loop();

  let tl: gsap.core.Timeline | null = null;
  if (!reduceMotion) {
    // Short pin (see .rx-hero height). The morph and camera push-in finish at 85% of the pin,
    // so the end state is reached before the hero unpins and the next section scrolls in.
    // The copy stays fully visible and only eases back slightly over the last 15%; it never
    // fades out completely, so there is no empty band while the hero scrolls away.
    tl = gsap.timeline({ scrollTrigger: { trigger, start: 'top top', end: 'bottom bottom', scrub: 0.6 } });
    tl.to(state, { rotY: Math.PI * 1.25, rotX: -0.2, morph: 1, camZ: mobile ? 8 : 6.2, offX: mobile ? 0 : 2.4, ease: 'power1.inOut', duration: 0.85 }, 0);
    if (hint) tl.to(hint, { opacity: 0, duration: 0.15 }, 0);
    if (copy) tl.to(copy, { y: -24, opacity: 0.6, ease: 'none', duration: 0.15 }, 0.85);
  }

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    tl?.scrollTrigger?.kill();
    tl?.kill();
    if (copy) gsap.set(copy, { clearProps: 'all' });
    geo.dispose();
    mat.dispose();
    starGeo.dispose();
    starMat.dispose();
    renderer.dispose();
  };
}
