"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

interface SharedState {
  target: number;
  value: number;
  smoother: number;
  entered: boolean;
  active: number;
}

interface OceanCanvasProps {
  stateRef: React.MutableRefObject<SharedState>;
  entered: boolean;
}

const FOG_COLOR = new THREE.Color("#052236");
const WATER_TOP = new THREE.Color("#193653");
const WATER_BOTTOM = new THREE.Color("#021436");

// Custom Y/Z fog injected like theirs (T0 globe onBeforeCompile)
function applyFogHack(mat: THREE.Material) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fogYThreshold = { value: new THREE.Vector2(-0.88, -4.3) };
    shader.uniforms.fogZThreshold = { value: new THREE.Vector2(1.98, 0.8) };
    shader.uniforms.fogColor = { value: FOG_COLOR.clone() };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec2 fogYThreshold; uniform vec2 fogZThreshold; uniform vec3 fogColor;
        varying vec3 vFogWorldPos;`,
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vFogWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )
      .replace(
        "#include <dithering_fragment>",
        `float fogFactorY = smoothstep(fogYThreshold.x, fogYThreshold.y, vFogWorldPos.y);
        float fogFactorZ = smoothstep(fogZThreshold.x, fogZThreshold.y, vFogWorldPos.z);
        float fogFactor = max(fogFactorY, fogFactorZ);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.5);
        #include <dithering_fragment>`,
      );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vFogWorldPos;",
    );
  };
}

export function OceanCanvas({ stateRef, entered }: OceanCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const enteredRef = useRef(entered);
  enteredRef.current = entered;

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    const cleanups: (() => void)[] = [];
    const clock = new THREE.Clock();

    const initScene = async (el: HTMLDivElement, W: () => number, H: () => number) => {
      el.dataset.webgl = "loading";
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W(), H());
      el.appendChild(renderer.domElement);
      const R = renderer;

      // --- loaders ---
      const ktx2 = new KTX2Loader();
      ktx2.setTranscoderPath("/libs/basis/");
      ktx2.detectSupport(R);
      const gltf = new GLTFLoader();

      const loadKtx = (url: string, srgb = false, wrapping = false) =>
        ktx2.loadAsync(url).then((t) => {
          t.flipY = false;
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          if (wrapping) t.wrapS = t.wrapT = THREE.RepeatWrapping;
          return t;
        });
      const loadTex = (url: string) =>
        new Promise<THREE.Texture>((res, rej) =>
          new THREE.TextureLoader().load(url, res, undefined, rej),
        );
      const loadGlb = (url: string) =>
        gltf.loadAsync(url).then((g) => g.scene);

      // ================= GLOBE SCENE (intro, fov 22) =================
      const globeScene = new THREE.Scene();
      globeScene.background = new THREE.Color("#000d15");
      const globeCam = new THREE.PerspectiveCamera(22, W() / H(), 0.5, 500);
      const globeGroup = new THREE.Group();
      globeScene.add(globeGroup);
      const globeCamPos = new THREE.Vector3(0, 0, 6.5);
      const globeLook = new THREE.Vector3(0, 0, 0);

      const globeDir = new THREE.DirectionalLight("#b8cadf", 2.3);
      globeDir.position.set(5, 3, 5);
      globeScene.add(globeDir, new THREE.AmbientLight("#0a2038", 1.2));

      // ================= TIMELINE SCENE (island, fov 10) =================
      const tlScene = new THREE.Scene();
      tlScene.background = new THREE.Color("#001224");
      const tlCam = new THREE.PerspectiveCamera(10, W() / H(), 0.5, 500);
      const tlCamPos = new THREE.Vector3(0, 0, 0); // scroll-drift offsets only
      const tlLook = new THREE.Vector3(0, 0, 0);

      const tlDir = new THREE.DirectionalLight(0xffffff, 5);
      tlDir.position.set(10, 20, 8);
      tlScene.add(tlDir, new THREE.AmbientLight("#1a3a5c", 0.8));

      // --- state for scroll/camera ---
      const scroll = {
        pos: 0,
        delta: 0,
        smootherDelta: 0,
        abs: 0,
        smoothAbs: 0,
        isTouch: matchMedia("(hover: none)").matches,
      };
      const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
      const onPointer = (e: PointerEvent) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      };
      window.addEventListener("pointermove", onPointer);
      cleanups.push(() => {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("pointermove", onPointer);
      });

      // --- load models + textures (their manifest) ---
      const [
        earth,
        clouds,
        land,
        buoy,
        ship,
        seagull,
        earthDiffuse,
        earthNormal,
        earthRough,
        earthClouds,
        landDiffuse,
        buoyDiffuse,
        gullDiffuse,
        waterDepth,
        envMap,
        waterNormal,
        markersJson,
      ] = await Promise.all([
        loadGlb("/webgl/models/earth.glb"),
        loadGlb("/webgl/models/clouds.glb"),
        loadGlb("/webgl/models/land.glb"),
        loadGlb("/webgl/models/buoy.glb"),
        loadGlb("/webgl/models/ship.glb"),
        loadGlb("/webgl/models/seagull.glb"),
        loadKtx("/webgl/textures/earth_diffuse_grade.ktx2", true),
        loadKtx("/webgl/textures/earth_normal.ktx2"),
        loadKtx("/webgl/textures/earth_roughness.ktx2"),
        loadKtx("/webgl/textures/earth_clouds.ktx2", true),
        loadKtx("/webgl/textures/land_diffuse.ktx2", true),
        loadKtx("/webgl/textures/bouy_diffuse.ktx2", true),
        loadKtx("/webgl/textures/seagull_diffuse.ktx2"),
        loadKtx("/webgl/textures/water-depth-2.ktx2", false, true),
        loadTex("/webgl/textures/ocean-envmap.jpg"),
        loadTex("/webgl/textures/water-normal.webp"),
        fetch("/webgl/earth_markers.json").then((r) => r.json()),
      ]);
      if (cancelled) return;
      el.dataset.webgl = "models:17";

      envMap.mapping = THREE.EquirectangularReflectionMapping;
      envMap.colorSpace = THREE.SRGBColorSpace;

      // --- globe assembly ---
      earth.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat) {
            if (mat.map) mat.map = earthDiffuse;
            mat.normalMap = earthNormal;
            mat.roughnessMap = earthRough;
            mat.envMap = envMap;
            mat.envMapIntensity = 0.7;
            applyFogHack(mat);
          }
        }
      });
      const earthGroup = new THREE.Group();
      earthGroup.add(earth);
      globeGroup.add(earthGroup);

      const cloudGroup = new THREE.Group();
      clouds.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mat = new THREE.MeshStandardMaterial({
            map: earthClouds,
            transparent: true,
            depthWrite: false,
            opacity: 0.85,
          });
          m.material = mat;
          applyFogHack(mat);
        }
      });
      cloudGroup.add(clouds);
      cloudGroup.scale.setScalar(1.015);
      globeGroup.add(cloudGroup);

      // atmosphere shell (additive, DoubleSide)
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 48),
        new THREE.MeshBasicMaterial({
          color: "#35a2f5",
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      atmosphere.scale.setScalar(1.08);
      globeGroup.add(atmosphere);

      // markers (additive sprites, uRevealProgress-style stagger)
      const markerGroup = new THREE.Group();
      const markerMats: THREE.MeshBasicMaterial[] = [];
      const markerGeo = new THREE.PlaneGeometry(0.09, 0.09);
      const markerBase = new THREE.CanvasTexture(
        (() => {
          const c = document.createElement("canvas");
          c.width = c.height = 64;
          const g = c.getContext("2d")!;
          const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
          grad.addColorStop(0, "rgba(255,255,255,1)");
          grad.addColorStop(0.4, "rgba(144,224,239,0.9)");
          grad.addColorStop(1, "rgba(144,224,239,0)");
          g.fillStyle = grad;
          g.fillRect(0, 0, 64, 64);
          return c;
        })(),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const points: any[] = markersJson.points ?? [];
      points.forEach((p) => {
        const mat = new THREE.MeshBasicMaterial({
          map: markerBase,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const s = new THREE.Mesh(markerGeo, mat);
        s.position.set(p.pos[0], p.pos[1], p.pos[2]);
        s.quaternion.set(p.orient[0], p.orient[1], p.orient[2], p.orient[3]);
        markerMats.push(mat);
        markerGroup.add(s);
      });
      globeGroup.add(markerGroup);

      // --- island assembly ---
      land.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat) {
            mat.map = landDiffuse;
            mat.envMap = envMap;
            mat.envMapIntensity = 0.4;
            applyFogHack(mat);
          }
        }
      });
      tlScene.add(land);

      // water plane
      waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
      waterNormal.repeat.set(6, 6);
      const waterMat = new THREE.MeshStandardMaterial({
        color: "#204462",
        normalMap: waterNormal,
        normalScale: new THREE.Vector2(0.7, 0.7),
        transparent: true,
        opacity: 0.94,
        roughness: 0.35,
        metalness: 0.1,
        envMap,
        envMapIntensity: 0.8,
      });
      applyFogHack(waterMat);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 160), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(-40, -0.4, 10);
      tlScene.add(water);

      // water gradient dome backdrop
      const gradMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor1: { value: new THREE.Color("#001224") },
          uColor2: { value: new THREE.Color("#1a486b") },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform vec3 uColor1; uniform vec3 uColor2;
          void main(){ gl_FragColor = vec4(mix(uColor1, uColor2, vUv.y), 1.0); }`,
        side: THREE.BackSide,
        depthWrite: false,
      });
      tlScene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 32), gradMat));

      // ship + buoy
      // ship sails the chapter route (west → east across the island)
      ship.position.set(-90, 0, 4);
      ship.rotation.y = Math.PI / 2; // bow toward +x travel direction
      tlScene.add(ship);
      const buoyMesh = buoy.clone();
      buoyMesh.position.set(-5, 0, 3);
      tlScene.add(buoyMesh);

      // seagulls x7
      const gulls: THREE.Group[] = [];
      for (let i = 0; i < 7; i++) {
        const g = seagull.clone() as THREE.Group;
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat) mat.map = gullDiffuse;
          }
        });
        const a = (i / 7) * Math.PI * 2;
        g.position.set(Math.cos(a) * 9, 6 + Math.random() * 4, Math.sin(a) * 9);
        g.userData = { speed: 7 + Math.random() * 3, offset: Math.random() * Math.PI * 2, r: 9 };
        gulls.push(g);
        tlScene.add(g);
      }

      // cloud billboards cloud0-8
      const cloudTexs = await Promise.all(
        Array.from({ length: 9 }, (_, i) => loadTex(`/webgl/textures/clouds/cloud${i}.webp`)),
      );
      if (cancelled) return;
      const cloudBillboards: THREE.Mesh[] = [];
      cloudTexs.forEach((t, i) => {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(14, 7),
          new THREE.MeshBasicMaterial({
            map: t,
            color: "#a2bad9",
            transparent: true,
            depthWrite: false,
            opacity: 0.1 + Math.random() * 0.1,
            blending: THREE.AdditiveBlending,
          }),
        );
        m.position.set(-105 + i * 16 + Math.random() * 3, 14 + Math.random() * 8, -25 - Math.random() * 10);
        cloudBillboards.push(m);
        tlScene.add(m);
      });

      // crossfade targets
      let globeWeight = 1;
      const isTouch = matchMedia("(hover: none)").matches;

      const onResize = () => {
        const w = W();
        const h = H();
        globeCam.aspect = w / h;
        globeCam.updateProjectionMatrix();
        tlCam.aspect = w / h;
        tlCam.updateProjectionMatrix();
        R.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      let time = 0;
      const tick = () => {
        const dt = Math.min(clock.getDelta(), 0.016);
        time += dt;
        const s = stateRef.current;
        const normDelta = dt / 0.016;

        // --- scroll delta (their onScroll math) ---
        const e = s.entered ? s.value * 0.5 : 0;
        const t = e - scroll.pos;
        scroll.pos = e;
        const deltaSpeed = isTouch ? 10 : 25;
        scroll.delta -= t * deltaSpeed;
        scroll.delta = THREE.MathUtils.clamp(scroll.delta, -1.3, 1.3);
        scroll.abs += Math.abs(t);
        scroll.smoothAbs += (scroll.abs - scroll.smoothAbs) * 0.1 * normDelta;
        scroll.delta += (0 - scroll.delta) * 0.01 * normDelta;
        scroll.smootherDelta += (scroll.delta - scroll.smootherDelta) * 0.03 * normDelta;

        // --- phase: globe → island crossfade just after entering ---
        const target = s.entered && s.value > 0.02 ? 0 : 1;
        globeWeight += (target - globeWeight) * 0.04;

        // --- globe update ---
        clouds.rotation.y += 0.0001 + Math.abs(scroll.delta) * 0.0004;
        earthGroup.rotation.y += (pointer.x * 0.1 - earthGroup.rotation.y) * 0.03 + 0.0006;
        // markers reveal staggered by chapter
        const reveal = THREE.MathUtils.clamp((s.value - 0.06) * 6, 0, 1);
        markerMats.forEach((m, i) => {
          const local = THREE.MathUtils.clamp(reveal * markerMats.length - i, 0, 1);
          m.opacity += (local * 0.95 - m.opacity) * 0.06;
        });

        // --- island update ---
        waterNormal.offset.x += dt * 0.008;
        waterNormal.offset.y += dt * 0.004;
        // --- ship sails through the chapters; camera tracks it ---
        const journey = THREE.MathUtils.clamp((s.value - 0.08) / 0.8, 0, 1);
        const shipX = -90 + journey * 120;
        ship.position.x += (shipX - ship.position.x) * 0.08;
        ship.position.y = Math.sin(time * 0.7 + 1) * 0.15;
        ship.rotation.z = Math.sin(time * 0.5) * 0.02;
        buoyMesh.position.y = Math.sin(time * 1.2) * 0.25;
        buoyMesh.rotation.z = Math.sin(time * 0.9) * 0.08;

        gulls.forEach((g, i) => {
          const u = g.userData;
          const a = time * 0.08 * (u.speed / 8) + u.offset;
          const cx = ship.position.x * 0.6;
          g.position.set(cx + Math.cos(a) * u.r, 6 + Math.sin(time * 0.9 + u.offset) * 1.2 + (i % 3), Math.sin(a) * u.r);
          g.rotation.y = -a;
          g.rotation.z = Math.sin(time * 3 + u.offset) * 0.25;
        });
        cloudBillboards.forEach((c) => {
          c.position.x -= Math.abs(t) * 40 * normDelta * 0.1 + dt * 0.15;
          if (c.position.x < -115) c.position.x = 45;
          c.lookAt(tlCam.position);
        });

        // --- cameras (their lerp constants), timeline tracks the ship ---
        globeCamPos.x += (scroll.smootherDelta - globeCamPos.x) * 0.06 * normDelta;
        globeCam.position.copy(globeCamPos);
        globeCam.lookAt(globeLook);

        tlCamPos.x += (scroll.smootherDelta - tlCamPos.x) * 0.06 * normDelta;
        tlCamPos.y += (scroll.smootherDelta - tlCamPos.x) * 0.1 * normDelta;
        tlLook.x += (scroll.smootherDelta - tlLook.x) * 0.07 * normDelta;
        const sx = ship.position.x;
        tlCam.position.set(tlCamPos.x + sx + 14, 26 + tlCamPos.y, 30);
        tlCam.lookAt(tlLook.x + sx, 2, 4);

        // pointer pivot
        pointer.sx += (pointer.x - pointer.sx) * 0.032;
        pointer.sy += (pointer.y - pointer.sy) * 0.032;

        R.autoClear = true;
        if (globeWeight > 0.02) {
          R.render(globeScene, globeCam);
        }
        if (globeWeight < 0.98) {
          R.autoClear = false;
          R.clearDepth();
          // fade island in via scene background already opaque; crossfade approx by render order
          R.render(tlScene, tlCam);
        }

        raf = requestAnimationFrame(tick);
      };
      tick();
    };

    (async () => {
      if (!ref.current) return;
      const el = ref.current;
      try {
        await initScene(
          el,
          () => el.clientWidth || window.innerWidth,
          () => el.clientHeight || window.innerHeight,
        );
        if (!cancelled) el.dataset.webgl = "ready";
      } catch (err) {
        console.error("OceanCanvas failed, gradient fallback:", err);
        el.dataset.webgl = `error:${err instanceof Error ? err.message : String(err)}`;
        el.style.background =
          "radial-gradient(ellipse 80% 60% at 50% 110%, #1a486b 0%, #001224 55%, #000d15 100%)";
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
      renderer?.dispose();
      renderer?.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="ox-webgl-canvas" />;
}
