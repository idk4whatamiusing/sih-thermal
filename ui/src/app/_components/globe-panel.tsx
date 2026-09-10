"use client";

// Revolving FIRMS globe (left panel of the landing page).
// Plain three.js (no fiber): sphere + Blue Marble texture + live thermal
// dots. Export-safe: three is dynamically imported so SSR/static prerender
// never touches WebGL. Anonymous visitors get the globe without dots
// (the gateway 401s /api/* without a session); logged-in users get dots.
// Click (not drag) routes: user ? /dashboard/default : loginHref.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient, FIRMS_POINTS_QUERY, type FirmsPoint } from "@/lib/gqlClient";
import { useAuth } from "@/lib/auth/AuthProvider";

const api = createClient(process.env.NEXT_PUBLIC_API_URL ?? "");

// Same palette as the dashboard map (thermal-map.tsx) so the landing globe
// and the FIRMS-clone dashboard read as one product.
const COLORS: Record<string, [number, number, number]> = {
  industrial_flare: [0.937, 0.267, 0.267],
  thermal_power: [0.976, 0.451, 0.086],
  mining: [0.659, 0.333, 0.969],
  forest: [0.133, 0.773, 0.369],
  agriculture: [0.918, 0.702, 0.192],
  unknown: [0.42, 0.447, 0.502],
};

function latLonToXYZ(lat: number, lon: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

export function GlobePanel() {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user, loginHref } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const loginRef = useRef(loginHref);
  loginRef.current = loginHref;
  const [status, setStatus] = useState<"loading" | "live" | "locked">("loading");

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let renderer: import("three").WebGLRenderer | null = null;

    (async () => {
      const THREE = await import("three");
      if (cancelled || !ref.current) return;
      const el = ref.current;
      const w = el.clientWidth || 480;
      const h = el.clientHeight || 480;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
      camera.position.set(0, 0, 3.1);

      const globe = new THREE.Group();
      scene.add(globe);

      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 64),
        new THREE.MeshBasicMaterial({
          map: new THREE.TextureLoader().load("/textures/earth-blue-marble.jpg"),
        }),
      );
      globe.add(earth);
      // Soft atmosphere rim (cheap fresnel fake: slightly larger back-side shell)
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.03, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.12 }),
      );
      globe.add(halo);

      // Live dots: best-effort (401s without a session -> locked state)
      try {
        const d = await api.graphql<{ firmsPoints: FirmsPoint[] }>(FIRMS_POINTS_QUERY, {
          bbox: { minLat: -60, minLon: -180, maxLat: 75, maxLon: 180 },
          limit: 2000,
        });
        if (cancelled) return;
        const pts = d.firmsPoints.slice(0, 2000);
        const pos = new Float32Array(pts.length * 3);
        const col = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => {
          const [x, y, z] = latLonToXYZ(p.latitude, p.longitude, 1.015);
          pos.set([x, y, z], i * 3);
          col.set(COLORS[p.predictedClass] ?? COLORS.unknown, i * 3);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        globe.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.014, vertexColors: true })));
        setStatus("live");
      } catch {
        if (!cancelled) setStatus("locked");
      }

      // Drag-to-spin + click-to-enter (click = press+release within 5px)
      let velY = 0.0016; // idle auto-revolve
      let dragging = false;
      let px = 0;
      let py = 0;
      let downX = 0;
      let downY = 0;
      let rotX = 0.25;
      const cv = renderer.domElement;
      const onDown = (e: PointerEvent) => {
        dragging = true;
        px = downX = e.clientX;
        py = downY = e.clientY;
        cv.setPointerCapture(e.pointerId);
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        const dx = e.clientX - px;
        const dy = e.clientY - py;
        px = e.clientX;
        py = e.clientY;
        globe.rotation.y += dx * 0.005;
        rotX = Math.max(-1.2, Math.min(1.2, rotX + dy * 0.003));
        velY = dx * 0.0004;
      };
      const onUp = (e: PointerEvent) => {
        dragging = false;
        if (Math.hypot(e.clientX - downX, e.clientY - downY) < 5) {
          if (userRef.current) router.push("/dashboard/default");
          else window.location.href = loginRef.current;
        }
      };
      cv.addEventListener("pointerdown", onDown);
      cv.addEventListener("pointermove", onMove);
      cv.addEventListener("pointerup", onUp);

      const onResize = () => {
        const nw = el.clientWidth || 480;
        const nh = el.clientHeight || 480;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer?.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);

      const tick = () => {
        if (!dragging) {
          globe.rotation.y += velY;
          velY += (0.0016 - velY) * 0.02; // ease back to idle revolve
        }
        globe.rotation.x = rotX;
        renderer?.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      tick();

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        cv.removeEventListener("pointerdown", onDown);
        cv.removeEventListener("pointermove", onMove);
        cv.removeEventListener("pointerup", onUp);
        scene.traverse((o) => {
          const m = o as import("three").Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as import("three").Material | undefined;
          mat?.dispose?.();
        });
        renderer?.dispose();
        renderer?.domElement.remove();
      };
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [router]);

  return (
    <div className="relative h-[420px] w-full lg:h-[560px]">
      <div ref={ref} className="h-full w-full cursor-pointer" title="Click to open the live map" />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
        {status === "loading" && "spinning up…"}
        {status === "live" && "live FIRMS detections — click globe to open map"}
        {status === "locked" && "sign in to see live fires — click globe to sign in"}
      </div>
    </div>
  );
}
