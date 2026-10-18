"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Lottie } from "lottie-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PET_3D_PALETTES, PET_VARIANTS } from "./constants";
const sparkleAnimation = {
  v: "5.7.4",
  fr: 30,
  ip: 0,
  op: 90,
  w: 220,
  h: 220,
  nm: "moli-sparkles",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "sparkle-a",
      sr: 1,
      ks: {
        o: { k: 75 },
        r: { k: 0 },
        p: { k: [60, 54, 0] },
        a: { k: [0, 0, 0] },
        s: { k: [100, 100, 100] }
      },
      shapes: [
        {
          ty: "gr",
          it: [
            { ty: "el", p: { k: [0, 0] }, s: { k: [15, 15] }, nm: "dot" },
            { ty: "fl", c: { k: [1, 0.78, 0.2, 1] }, o: { k: 100 }, nm: "fill" },
            { ty: "tr", p: { k: [0, 0] }, a: { k: [0, 0] }, s: { k: [100, 100] }, r: { k: 0 }, o: { k: 100 } }
          ],
          nm: "dot-group"
        }
      ],
      ip: 0,
      op: 90,
      st: 0,
      bm: 0
    },
    {
      ddd: 0,
      ind: 2,
      ty: 4,
      nm: "sparkle-b",
      sr: 1,
      ks: {
        o: { k: 65 },
        r: { k: 0 },
        p: { k: [168, 72, 0] },
        a: { k: [0, 0, 0] },
        s: { k: [80, 80, 100] }
      },
      shapes: [
        {
          ty: "gr",
          it: [
            { ty: "el", p: { k: [0, 0] }, s: { k: [12, 12] }, nm: "dot" },
            { ty: "fl", c: { k: [0.55, 0.84, 1, 1] }, o: { k: 100 }, nm: "fill" },
            { ty: "tr", p: { k: [0, 0] }, a: { k: [0, 0] }, s: { k: [100, 100] }, r: { k: 0 }, o: { k: 100 } }
          ],
          nm: "dot-group"
        }
      ],
      ip: 0,
      op: 90,
      st: 0,
      bm: 0
    }
  ]
};
const RIGGED_PET_MODELS = {
  "moly-3d": { src: "/models/moli-pet/moli-cat.glb", label: "M\xE8o Moly 3D" },
  "moly-3d-hog": { src: "/models/moli-pet/moli-hog.glb", label: "Heo Moly 3D" },
  "moly-3d-penguin": { src: "/models/moli-pet/moli-penguin.glb", label: "Chim c\xE1nh c\u1EE5t Moly 3D" },
  "moly-3d-fox": { src: "/models/moli-pet/moli-fox.glb", label: "C\xE1o Moly 3D" },
  "moly-3d-crab": { src: "/models/moli-pet/moli-crab.glb", label: "Cua Moly 3D" },
  "moly-3d-panda": { src: "/models/moli-pet/moli-panda.glb", label: "G\u1EA5u tr\xFAc Moly 3D" }
};
function MolyThreeCat({
  color,
  variant,
  mood,
  walking,
  facing
}) {
  const mountRef = useRef(null);
  const [webglOk, setWebglOk] = useState(true);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const palette = variant === "cat" ? PET_3D_PALETTES[color] : PET_VARIANTS[variant];
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.85, 1.85, 1.85, -1.85, 0.1, 20);
    camera.position.set(0, 0.15, 6);
    camera.lookAt(0, 0.15, 0);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      setWebglOk(false);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    renderer.setSize(96, 96, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "h-full w-full";
    mount.appendChild(renderer.domElement);
    setWebglOk(true);
    const root = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.46, metalness: 0.04 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.5 });
    const innerEarMaterial = new THREE.MeshStandardMaterial({ color: palette.innerEar, roughness: 0.6 });
    const cheekMaterial = new THREE.MeshStandardMaterial({ color: palette.cheek, roughness: 0.55 });
    const blackMaterial = new THREE.MeshStandardMaterial({ color: 988970, roughness: 0.36 });
    const faceInkMaterial = new THREE.MeshBasicMaterial({ color: 988970 });
    const faceWhiteMaterial = new THREE.MeshBasicMaterial({ color: 16777215 });
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 16777215, roughness: 0.5 });
    const blueEyeMaterial = new THREE.MeshStandardMaterial({ color: 2389959, roughness: 0.36, metalness: 0.08 });
    const mouthMaterial = new THREE.MeshStandardMaterial({ color: 7018277, roughness: 0.48 });
    const goldMaterial = new THREE.MeshStandardMaterial({ color: 16109400, roughness: 0.36, metalness: 0.12 });
    const lineMaterial = new THREE.MeshStandardMaterial({ color: 2374498, roughness: 0.46 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 24), bodyMaterial);
    body.scale.set(variant === "cat" ? 0.96 : 0.74, variant === "cat" ? 0.76 : 0.92, 0.86);
    body.position.set(0, variant === "cat" ? -0.52 : -0.6, 0);
    root.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), whiteMaterial);
    belly.scale.set(variant === "cat" ? 1.18 : 0.9, variant === "cat" ? 0.78 : 0.98, 0.2);
    belly.position.set(0, variant === "cat" ? -0.48 : -0.58, 0.64);
    root.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.96, 36, 28), bodyMaterial);
    head.scale.set(variant === "star" ? 1.08 : 1.06, variant === "bunny" ? 1.04 : 0.98, 0.9);
    head.position.set(0, variant === "cat" ? 0.38 : 0.34, 0.08);
    root.add(head);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), whiteMaterial);
    muzzle.scale.set(1.42, 0.68, 0.2);
    muzzle.position.set(0, 0.08, 0.86);
    root.add(muzzle);
    const makeCatEar = (x, rotationZ) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.7, 5), bodyMaterial);
      ear.position.set(x, 1.12, 0.02);
      ear.rotation.set(0, 0, rotationZ);
      root.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.38, 5), innerEarMaterial);
      inner.position.set(x * 0.99, 1.05, 0.17);
      inner.rotation.set(0, 0, rotationZ);
      inner.scale.set(0.86, 0.86, 0.2);
      root.add(inner);
    };
    if (variant === "cat") {
      makeCatEar(-0.6, 0.3);
      makeCatEar(0.6, -0.3);
    } else if (variant === "star") {
      [-0.52, 0.52].forEach((x) => {
        const sideHair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), accentMaterial);
        sideHair.scale.set(0.75, 1.85, 0.54);
        sideHair.position.set(x, 0.2, 0.08);
        sideHair.rotation.z = x < 0 ? -0.2 : 0.2;
        root.add(sideHair);
      });
      const bang = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 16), accentMaterial);
      bang.scale.set(1.35, 0.72, 0.34);
      bang.position.set(-0.08, 0.98, 0.36);
      bang.rotation.z = -0.28;
      root.add(bang);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), accentMaterial);
      bun.scale.set(0.96, 0.84, 0.72);
      bun.position.set(0.76, 0.78, 0.02);
      root.add(bun);
      const starGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), whiteMaterial);
      starGem.position.set(-0.36, 0.72, 0.9);
      starGem.rotation.z = 0.3;
      root.add(starGem);
    } else {
      [-0.35, 0.35].forEach((x) => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), whiteMaterial);
        ear.scale.set(0.72, 2.05, 0.45);
        ear.position.set(x, 1.18, 0.02);
        ear.rotation.z = x < 0 ? -0.28 : 0.28;
        root.add(ear);
        const inner = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), innerEarMaterial);
        inner.scale.set(0.62, 1.64, 0.24);
        inner.position.set(x, 1.17, 0.18);
        inner.rotation.z = ear.rotation.z;
        root.add(inner);
      });
      const heart = new THREE.Group();
      const lobeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), innerEarMaterial);
      const lobeRight = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), innerEarMaterial);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.24, 3), innerEarMaterial);
      lobeLeft.position.set(-0.06, 0.03, 0);
      lobeRight.position.set(0.06, 0.03, 0);
      tip.position.set(0, -0.08, 0);
      tip.rotation.z = Math.PI;
      heart.add(lobeLeft, lobeRight, tip);
      heart.position.set(0.12, 1.1, 0.64);
      heart.rotation.z = -0.1;
      root.add(heart);
    }
    const tail = new THREE.Group();
    if (variant === "cat") {
      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.68, -0.3, -0.16),
        new THREE.Vector3(1.12, -0.04, -0.08),
        new THREE.Vector3(0.95, 0.46, 0.02),
        new THREE.Vector3(0.7, 0.22, 0.1)
      ]);
      tail.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 28, 0.07, 8), bodyMaterial));
    } else if (variant === "star") {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), accentMaterial);
      orb.scale.set(1.05, 0.96, 0.76);
      orb.position.set(0.86, 0.36, 0.02);
      tail.add(orb);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), whiteMaterial);
      star.position.set(0.92, 0.42, 0.25);
      tail.add(star);
    } else {
      const ringCurve = new THREE.EllipseCurve(0, 0, 0.98, 1.18, 0.18, Math.PI * 1.55);
      const points = ringCurve.getPoints(42).map((point) => new THREE.Vector3(point.x, point.y, -0.24));
      const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 42, 0.011, 6), whiteMaterial);
      ring.position.set(0.03, 0.33, 0);
      ring.rotation.x = 0.1;
      tail.add(ring);
    }
    root.add(tail);
    const eyeScaleY = mood === "sleepy" ? 0.18 : mood === "happy" ? 0.72 : 1;
    const makeEye = (x) => {
      const isCat = variant === "cat";
      const eyeSize = variant === "bunny" ? 0.17 : isCat ? 0.145 : 0.125;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeSize, 28, 20), variant === "bunny" ? blueEyeMaterial : isCat ? faceInkMaterial : blackMaterial);
      eye.scale.set(variant === "bunny" ? 1.05 : isCat ? 0.94 : 0.9, eyeScaleY, isCat ? 0.48 : 0.42);
      eye.position.set(x, variant === "bunny" ? 0.44 : isCat ? 0.49 : 0.48, isCat ? 0.94 : 0.9);
      root.add(eye);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(isCat ? 0.05 : 0.04, 12, 8), isCat ? faceWhiteMaterial : whiteMaterial);
      shine.position.set(x - (isCat ? 0.045 : 0.035), variant === "bunny" ? 0.53 : isCat ? 0.565 : 0.54, isCat ? 1.06 : 0.98);
      root.add(shine);
      if (isCat) {
        const lowerShine = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), faceWhiteMaterial);
        lowerShine.position.set(x + 0.045, 0.45, 1.065);
        root.add(lowerShine);
      }
      if (variant === "bunny") {
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), blackMaterial);
        pupil.scale.set(0.9, 1, 0.24);
        pupil.position.set(x, 0.42, 1.02);
        root.add(pupil);
      }
    };
    if (variant === "star") {
      makeEye(-0.34);
      const wink = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 8), lineMaterial);
      wink.position.set(0.34, 0.48, 0.94);
      wink.rotation.z = Math.PI / 2 - 0.18;
      root.add(wink);
    } else {
      makeEye(-0.34);
      makeEye(0.34);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(variant === "cat" ? 0.085 : 0.065, variant === "cat" ? 0.12 : 0.1, 3), variant === "cat" ? faceInkMaterial : blackMaterial);
    nose.position.set(0, 0.2, variant === "cat" ? 1.08 : 1.02);
    nose.rotation.z = Math.PI;
    nose.scale.set(variant === "cat" ? 1.08 : 1, 0.8, variant === "cat" ? 0.58 : 0.5);
    root.add(nose);
    const makeLine = (x, y, z, length, angle, material = blackMaterial) => {
      const radius = variant === "cat" ? 0.011 : 7e-3;
      const line = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
      line.position.set(x, y, z);
      line.rotation.z = Math.PI / 2 + angle;
      root.add(line);
      return line;
    };
    if (variant === "cat") {
      [-0.12, 0.12].forEach((x) => makeLine(x, 0.11, 1.09, 0.14, x < 0 ? -0.7 : 0.7, faceInkMaterial));
      [-0.52, 0.52].forEach((side) => {
        makeLine(side, 0.11, 1.04, 0.39, side < 0 ? 0.12 : -0.12, faceInkMaterial);
        makeLine(side, -0.02, 1.055, 0.4, side < 0 ? -0.08 : 0.08, faceInkMaterial);
      });
    } else {
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), mouthMaterial);
      mouth.scale.set(1, 0.55, 0.2);
      mouth.position.set(0, 0.03, 1.02);
      root.add(mouth);
      makeLine(-0.18, 0.72, 0.9, 0.16, -0.18, lineMaterial);
    }
    [-0.45, 0.45].forEach((x) => {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), cheekMaterial);
      cheek.scale.set(1.28, 0.58, 0.14);
      cheek.position.set(x, 0.08, 0.9);
      root.add(cheek);
    });
    const paws = [];
    [-0.34, 0.34].forEach((x) => {
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), accentMaterial);
      paw.scale.set(1.05, 0.58, 0.68);
      paw.position.set(x, -0.86, 0.48);
      root.add(paw);
      paws.push(paw);
    });
    if (variant === "star") {
      const dress = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.62, 5), accentMaterial);
      dress.position.set(0, -0.82, 0.44);
      dress.rotation.z = Math.PI;
      dress.scale.set(1, 0.86, 0.32);
      root.add(dress);
      const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), goldMaterial);
      badge.position.set(0, -0.44, 0.88);
      badge.rotation.z = 0.3;
      root.add(badge);
      [-0.66, 0.66].forEach((x) => {
        const arm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), bodyMaterial);
        arm.scale.set(1.15, 0.48, 0.52);
        arm.position.set(x, -0.35, 0.54);
        arm.rotation.z = x < 0 ? 0.32 : -0.32;
        root.add(arm);
      });
    } else if (variant === "bunny") {
      const dress = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), whiteMaterial);
      dress.scale.set(1, 0.42, 0.18);
      dress.position.set(0, -0.85, 0.62);
      root.add(dress);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.018, 8, 48), accentMaterial);
      trim.scale.set(1, 0.28, 0.2);
      trim.position.set(0, -0.82, 0.68);
      root.add(trim);
      const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.72, 8), whiteMaterial);
      wand.position.set(-0.62, -0.38, 0.72);
      wand.rotation.z = -0.72;
      root.add(wand);
      const wandStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), accentMaterial);
      wandStar.position.set(-0.82, -0.1, 0.82);
      root.add(wandStar);
    } else {
      const forehead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), accentMaterial);
      forehead.scale.set(0.8, 0.28, 0.16);
      forehead.position.set(0, 0.82, 0.86);
      root.add(forehead);
    }
    root.position.y = 0;
    scene.add(root);
    scene.add(new THREE.AmbientLight(16777215, 1.7));
    const keyLight = new THREE.DirectionalLight(16777215, 2.7);
    keyLight.position.set(2.4, 3.2, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(10218238, 1.6);
    rimLight.position.set(-2, 1.2, 2);
    scene.add(rimLight);
    let frameId = 0;
    const start = performance.now();
    const animate = () => {
      const t = (performance.now() - start) / 1e3;
      const pace = walking ? 9.2 : 2.8;
      const bounce = Math.sin(t * pace);
      root.scale.x = facing === "left" ? -1 : 1;
      root.position.y = 0.04 + (walking ? Math.abs(bounce) * 0.12 : Math.sin(t * 2.6) * 0.045);
      root.rotation.z = (walking ? bounce * 0.055 : Math.sin(t * 2.1) * 0.028) * (facing === "left" ? -1 : 1);
      tail.rotation.z = Math.sin(t * (walking ? 8 : 3.3)) * 0.18;
      paws[0].position.y = -0.86 + (walking ? Math.max(0, bounce) * 0.12 : 0);
      paws[1].position.y = -0.86 + (walking ? Math.max(0, -bounce) * 0.12 : 0);
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };
    animate();
    return () => {
      window.cancelAnimationFrame(frameId);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      });
      renderer.dispose();
    };
  }, [color, facing, mood, variant, walking]);
  if (!webglOk) {
    return <div className="flex h-20 w-20 items-center justify-center text-lg font-black text-cyan-700 drop-shadow-[0_10px_18px_rgba(15,23,42,0.22)]">
        =^.^=
      </div>;
  }
  return <div ref={mountRef} className="h-20 w-20" aria-hidden="true" />;
}
function MolyRiggedPet({
  color,
  mood,
  walking,
  facing,
  waving,
  modelSrc,
  modelLabel,
  previewSrc
}) {
  const mountRef = useRef(null);
  const liveStateRef = useRef({ mood, walking, facing, waving });
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  liveStateRef.current = { mood, walking, facing, waving };
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setLoaded(false);
    setLoadFailed(false);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power"
      });
    } catch {
      setLoadFailed(true);
      return;
    }
    let disposed = false;
    let frameId = 0;
    let mixer = null;
    let modelRoot = null;
    let currentAction = null;
    let currentClipName = "";
    const actions = new Map();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.42, 1.42, 1.42, -1.42, 0.1, 30);
    const clock = new THREE.Clock();
    camera.position.set(3.4, 2.25, 5.2);
    camera.lookAt(0, 0.02, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(112, 112, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = "block h-full w-full";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(16777215, 7891615, 2.7));
    const keyLight = new THREE.DirectionalLight(16777215, 4.2);
    keyLight.position.set(3.2, 5.5, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(PET_3D_PALETTES[color].accent, 2.1);
    rimLight.position.set(-4, 2.5, 1.5);
    scene.add(rimLight);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.76, 32),
      new THREE.MeshBasicMaterial({
        color: 4995941,
        transparent: true,
        opacity: 0.16,
        depthWrite: false
      })
    );
    shadow.scale.set(1.3, 0.52, 1);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -1.08, 0.02);
    scene.add(shadow);
    const disposeObject = (root) => {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        });
      });
    };
    const loader = new GLTFLoader();
    loader.load(
      modelSrc,
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        const model = gltf.scene;
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.frustumCulled = false;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if ("map" in material && material.map instanceof THREE.Texture) {
              material.map.colorSpace = THREE.SRGBColorSpace;
            }
          });
        });
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const normalizedScale = Math.min(
          2.12 / Math.max(size.y, 0.01),
          2.45 / Math.max(size.x, 0.01),
          2.35 / Math.max(size.z, 0.01)
        );
        model.position.copy(center).multiplyScalar(-normalizedScale);
        model.scale.setScalar(normalizedScale);
        modelRoot = new THREE.Group();
        modelRoot.add(model);
        modelRoot.position.y = -0.02;
        scene.add(modelRoot);
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => actions.set(clip.name.toLowerCase(), mixer.clipAction(clip)));
        setLoaded(true);
      },
      void 0,
      () => {
        if (!disposed) setLoadFailed(true);
      }
    );
    const chooseClip = () => {
      const state = liveStateRef.current;
      if (reduceMotion) return "static";
      if (state.waving) return "gesture-positive";
      if (state.walking) return "walk";
      if (state.mood === "focus") return "static";
      return "idle";
    };
    const playClip = (name) => {
      const nextAction = actions.get(name) ?? actions.get("idle") ?? actions.get("static");
      if (!nextAction) return;
      const nextName = nextAction.getClip().name;
      const speed = name === "idle" ? liveStateRef.current.mood === "sleepy" ? 0.4 : 0.62 : 0.85;
      if (nextName === currentClipName) {
        nextAction.setEffectiveTimeScale(speed);
        return;
      }
      nextAction.reset().setEffectiveTimeScale(speed).setEffectiveWeight(1).fadeIn(0.2).play();
      currentAction?.fadeOut(0.2);
      currentAction = nextAction;
      currentClipName = nextName;
    };
    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      if (modelRoot && mixer) {
        const state = liveStateRef.current;
        playClip(chooseClip());
        modelRoot.scale.x = state.facing === "left" ? -1 : 1;
        modelRoot.rotation.y = state.facing === "left" ? 0.42 : -0.42;
        mixer.update(delta);
      }
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };
    animate();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      mixer?.stopAllAction();
      actions.clear();
      disposeObject(scene);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [color, modelSrc]);
  return <div className="relative h-20 w-20">
      <div
    className={`pointer-events-none absolute inset-1 grid place-items-center transition-opacity duration-200 ${loaded && !loadFailed ? "opacity-0" : "opacity-100"}`}
  >
        <img
    src={previewSrc}
    alt=""
    className="h-16 w-16 object-contain"
  />
      </div>
      <div
    ref={mountRef}
    className={`absolute inset-[-4px] transition-opacity duration-300 ${loaded && !loadFailed ? "opacity-100" : "opacity-0"}`}
    role="img"
    aria-label={`${modelLabel} \u0111ang c\u1EED \u0111\u1ED9ng`}
  />
    </div>;
}
export function PetFace({
  color,
  variant,
  mood,
  walking = false,
  facing = "right",
  waving = false
}) {
  const waveSideClass = facing === "left" ? "left-1" : "right-1";
  const riggedPet = RIGGED_PET_MODELS[variant];
  if (riggedPet) {
    const previewSrc = PET_VARIANTS[variant].preview || "/models/moli-pet/previews/panda.png";
    return <div className="relative h-20 w-20">
        <MolyRiggedPet
      color={color}
      mood={mood}
      walking={walking}
      facing={facing}
      waving={waving}
      modelSrc={riggedPet.src}
      modelLabel={riggedPet.label}
      previewSrc={previewSrc}
    />
      </div>;
  }
  if (variant === "moly-purple" || variant === "moly-chibi") {
    return <div className="relative h-20 w-20">
        <div className="pointer-events-none absolute inset-[-14px] opacity-45">
          <Lottie animationData={sparkleAnimation} loop autoplay />
        </div>
        <MolyReferencePet variant={variant} walking={walking} facing={facing} />
        {waving && <WavePaw sideClass={waveSideClass} />}
      </div>;
  }
  if (variant === "star" || variant === "bunny") {
    return <div className="relative h-20 w-20">
        <div className="pointer-events-none absolute inset-[-14px] opacity-45">
          <Lottie animationData={sparkleAnimation} loop autoplay />
        </div>
        <MolyPlushPet variant={variant} walking={walking} facing={facing} />
        {waving && <WavePaw sideClass={waveSideClass} />}
      </div>;
  }
  return <div className="relative h-20 w-20">
      <div className="pointer-events-none absolute inset-[-14px] opacity-50">
        <Lottie animationData={sparkleAnimation} loop autoplay />
      </div>
      <MolyThreeCat color={color} variant={variant} mood={mood} walking={walking} facing={facing} />
      {waving && <WavePaw sideClass={waveSideClass} />}
    </div>;
}
function WavePaw({ sideClass }) {
  return <span
    aria-hidden="true"
    className={`moli-wave-paw pointer-events-none absolute top-8 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/80 bg-cyan-100 shadow-[0_8px_18px_rgba(14,165,233,0.28)] ${sideClass}`}
  >
      <span className="relative h-3.5 w-3.5 rounded-full bg-white">
        <span className="absolute -top-1 left-0.5 h-1.5 w-1.5 rounded-full bg-white" />
        <span className="absolute -top-1 left-2 h-1.5 w-1.5 rounded-full bg-white" />
        <span className="absolute left-1 top-1.5 h-1.5 w-2 rounded-full bg-cyan-300/80" />
      </span>
    </span>;
}
function MolyReferencePet({
  variant,
  walking,
  facing
}) {
  const id = useId().replace(/:/g, "");
  const isChibi = variant === "moly-chibi";
  const shellClass = `moli-plush-shell relative h-20 w-20 ${walking ? "moli-plush-walking" : ""}`;
  return <div
    className={shellClass}
    style={{ "--moli-dir": facing === "left" ? "-1" : "1" }}
  >
      {isChibi ? <MolyChibiSvg id={id} /> : <MolyPurpleCatSvg id={id} />}
    </div>;
}
function MolyPurpleCatSvg({ id }) {
  const fur = `moly-purple-fur-${id}`;
  const belly = `moly-purple-belly-${id}`;
  const eye = `moly-purple-eye-${id}`;
  const shadow = `moly-purple-shadow-${id}`;
  return <svg className="h-full w-full overflow-visible" viewBox="0 0 96 96" role="img" aria-label="Moly mèo tím">
      <defs>
        <radialGradient id={fur} cx="34%" cy="22%" r="78%">
          <stop offset="0%" stopColor="#d6c0ff" />
          <stop offset="50%" stopColor="#ad79ff" />
          <stop offset="100%" stopColor="#8054d9" />
        </radialGradient>
        <radialGradient id={belly} cx="42%" cy="22%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="72%" stopColor="#f3e9ff" />
          <stop offset="100%" stopColor="#d8c1ff" />
        </radialGradient>
        <radialGradient id={eye} cx="35%" cy="25%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="28%" stopColor="#3b244a" />
          <stop offset="72%" stopColor="#1b1322" />
          <stop offset="100%" stopColor="#050509" />
        </radialGradient>
        <filter id={shadow} x="-35%" y="-35%" width="170%" height="180%">
          <feDropShadow dx="0" dy="9" stdDeviation="5" floodColor="#7c3aed" floodOpacity="0.32" />
        </filter>
      </defs>

      <ellipse cx="48" cy="86" rx="27" ry="6" fill="#0f172a" opacity="0.18" />
      <path d="M20 64c-12 8-15 21-7 24 12 4 26-7 29-22 2-12-9-9-22-2Z" fill={`url(#${fur})`} filter={`url(#${shadow})`} />
      <path d="M72 58c13 5 18 16 11 21-8 6-22-2-23-13-.6-7 4-11 12-8Z" fill={`url(#${fur})`} filter={`url(#${shadow})`} />
      <ellipse cx="48" cy="60" rx="29" ry="31" fill={`url(#${fur})`} filter={`url(#${shadow})`} />
      <ellipse cx="48" cy="69" rx="15" ry="17" fill={`url(#${belly})`} opacity="0.96" />

      <path d="M22 36 12 9l24 16Z" fill={`url(#${fur})`} stroke="#7f56d9" strokeWidth="2.4" />
      <path d="M18 28 15 15l12 9Z" fill="#ffb7d3" opacity="0.95" />
      <path d="M74 36 84 9 60 25Z" fill={`url(#${fur})`} stroke="#7f56d9" strokeWidth="2.4" />
      <path d="M78 28 81 15l-12 9Z" fill="#ffb7d3" opacity="0.95" />

      <ellipse cx="48" cy="38" rx="34" ry="31" fill={`url(#${fur})`} filter={`url(#${shadow})`} />
      <path d="M39 9c7-6 13-2 11 8 7-6 12-2 8 7 7-2 11 1 7 7-7-7-23-11-38-4 5-5 9-6 12-18Z" fill="#9362e8" opacity="0.95" />
      <path d="M13 43c7 2 10 4 14 9M83 43c-7 2-10 4-14 9" fill="none" stroke="#f7d6ff" strokeLinecap="round" strokeWidth="2" opacity="0.82" />
      <path d="M17 53c7 1 10 1 15 4M79 53c-7 1-10 1-15 4" fill="none" stroke="#f7d6ff" strokeLinecap="round" strokeWidth="2" opacity="0.72" />

      <g className="moli-blink" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx="35" cy="39" r="7.4" fill={`url(#${eye})`} />
        <circle cx="61" cy="39" r="7.4" fill={`url(#${eye})`} />
        <circle cx="32" cy="36" r="2.6" fill="#ffffff" />
        <circle cx="58" cy="36" r="2.6" fill="#ffffff" />
        <circle cx="39" cy="42.5" r="1" fill="#ffffff" opacity="0.9" />
        <circle cx="65" cy="42.5" r="1" fill="#ffffff" opacity="0.9" />
      </g>
      <ellipse cx="26" cy="51" rx="5" ry="3.2" fill="#ff8fb8" opacity="0.78" />
      <ellipse cx="70" cy="51" rx="5" ry="3.2" fill="#ff8fb8" opacity="0.78" />
      <path d="M45 47c2-2 4-2 6 0l-3 3Z" fill="#4b2030" />
      <path d="M39 54c4 7 14 7 18 0" fill="none" stroke="#80253f" strokeLinecap="round" strokeWidth="3" />
      <path d="M41 56c1.5 5 12.5 5 14 0-3 4-11 4-14 0Z" fill="#ff6f9d" opacity="0.8" />

      <path d="M30 62c7 4 28 4 36 0" fill="none" stroke="#53d6ff" strokeLinecap="round" strokeWidth="4" />
      <circle cx="48" cy="65" r="6.2" fill="#ffd166" stroke="#bf7c1f" strokeWidth="1.8" />
      <circle cx="46" cy="63" r="1.4" fill="#fff8c8" />
      <ellipse cx="33" cy="80" rx="8" ry="5" fill="#8e61e8" />
      <ellipse cx="63" cy="80" rx="8" ry="5" fill="#8e61e8" />
    </svg>;
}
function MolyChibiSvg({ id }) {
  const hood = `moly-chibi-hood-${id}`;
  const skin = `moly-chibi-skin-${id}`;
  const hair = `moly-chibi-hair-${id}`;
  const eye = `moly-chibi-eye-${id}`;
  const shadow = `moly-chibi-shadow-${id}`;
  return <svg className="h-full w-full overflow-visible" viewBox="0 0 96 104" role="img" aria-label="Moly chibi áo mèo">
      <defs>
        <radialGradient id={hood} cx="35%" cy="22%" r="78%">
          <stop offset="0%" stopColor="#fff7f7" />
          <stop offset="62%" stopColor="#ffe6ea" />
          <stop offset="100%" stopColor="#ffb6c9" />
        </radialGradient>
        <radialGradient id={skin} cx="38%" cy="25%" r="78%">
          <stop offset="0%" stopColor="#fff6ed" />
          <stop offset="72%" stopColor="#ffd9c9" />
          <stop offset="100%" stopColor="#f6b69f" />
        </radialGradient>
        <radialGradient id={hair} cx="40%" cy="20%" r="78%">
          <stop offset="0%" stopColor="#b98775" />
          <stop offset="62%" stopColor="#7b4b3f" />
          <stop offset="100%" stopColor="#4a2c2b" />
        </radialGradient>
        <radialGradient id={eye} cx="34%" cy="25%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#6d463f" />
          <stop offset="76%" stopColor="#2c1a1d" />
          <stop offset="100%" stopColor="#090608" />
        </radialGradient>
        <filter id={shadow} x="-35%" y="-35%" width="170%" height="180%">
          <feDropShadow dx="0" dy="9" stdDeviation="5" floodColor="#fb7185" floodOpacity="0.28" />
        </filter>
        <radialGradient id={`${shadow}-shoe`} cx="35%" cy="25%" r="78%">
          <stop offset="0%" stopColor="#ffd4df" />
          <stop offset="55%" stopColor="#ffb6c9" />
          <stop offset="100%" stopColor="#e88aa0" />
        </radialGradient>
      </defs>

      {
    /* Ground shadow */
  }
      <ellipse cx="48" cy="100" rx="24" ry="4" fill="#0f172a" opacity="0.12" />

      {
    /* Cat hood ears */
  }
      <path d="M22 34 12 9l24 15Z" fill={`url(#${hood})`} stroke="#e88aa0" strokeWidth="2.4" />
      <path d="M18 27 15 15l12 8Z" fill="#ffc4d0" opacity="0.96" />
      <path d="M74 34 84 9 60 24Z" fill={`url(#${hood})`} stroke="#e88aa0" strokeWidth="2.4" />
      <path d="M78 27 81 15l-12 8Z" fill="#ffc4d0" opacity="0.96" />

      {
    /* Hood head */
  }
      <ellipse cx="48" cy="41" rx="34" ry="34" fill={`url(#${hood})`} filter={`url(#${shadow})`} />

      {
    /* Body / torso under hood */
  }
      <path d="M21 44c-4 20 12 35 27 35s31-15 27-35c-7 12-47 12-54 0Z" fill={`url(#${hood})`} filter={`url(#${shadow})`} />

      {
    /* ===== ARMS - chibi style ===== */
  }
      {
    /* Left arm - short chubby arm */
  }
      <path
    d="M20 64c-5 3-9 8-9 14s3 8 7 7 6-6 5-12"
    fill={`url(#${skin})`}
    stroke="#dba090"
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
      {
    /* Left hand - round mitten */
  }
      <ellipse cx="14" cy="78" rx="5.8" ry="5.2" fill={`url(#${skin})`} stroke="#dba090" strokeWidth="1.4" />
      {
    /* Left thumb nub */
  }
      <ellipse cx="18.5" cy="80.5" rx="2.5" ry="2" fill={`url(#${skin})`} stroke="#dba090" strokeWidth="1" transform="rotate(-20 18.5 80.5)" />
      {
    /* Left finger line hint */
  }
      <path d="M11 76.5c0 3.5 1 5.5 2 6.5" fill="none" stroke="#e0a898" strokeLinecap="round" strokeWidth="0.9" opacity="0.5" />
      {
    /* Left hand highlight */
  }
      <ellipse cx="13.5" cy="76.5" rx="2.6" ry="2" fill="#fff6ed" opacity="0.45" />

      {
    /* Right arm - short chubby arm */
  }
      <path
    d="M76 64c5 3 9 8 9 14s-3 8-7 7-6-6-5-12"
    fill={`url(#${skin})`}
    stroke="#dba090"
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
      {
    /* Right hand - round mitten */
  }
      <ellipse cx="82" cy="78" rx="5.8" ry="5.2" fill={`url(#${skin})`} stroke="#dba090" strokeWidth="1.4" />
      {
    /* Right thumb nub */
  }
      <ellipse cx="77.5" cy="80.5" rx="2.5" ry="2" fill={`url(#${skin})`} stroke="#dba090" strokeWidth="1" transform="rotate(20 77.5 80.5)" />
      {
    /* Right finger line hint */
  }
      <path d="M85 76.5c0 3.5-1 5.5-2 6.5" fill="none" stroke="#e0a898" strokeLinecap="round" strokeWidth="0.9" opacity="0.5" />
      {
    /* Right hand highlight */
  }
      <ellipse cx="82.5" cy="76.5" rx="2.6" ry="2" fill="#fff6ed" opacity="0.45" />

      {
    /* Hood sleeve cuffs */
  }
      <path d="M20 62c-3 2-5 6-5 10 3-3 6-5 10-4" fill={`url(#${hood})`} stroke="#e88aa0" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M76 62c3 2 5 6 5 10-3-3-6-5-10-4" fill={`url(#${hood})`} stroke="#e88aa0" strokeWidth="1.4" strokeLinejoin="round" />

      {
    /* ===== BODY BOTTOM / SKIRT ===== */
  }
      <path d="M32 72c8 9 24 9 32 0 2 11-5 17-16 17S30 83 32 72Z" fill="#fff1f3" stroke="#f1a5b5" strokeWidth="1.4" />
      <path d="M42 72c2 4 10 4 12 0" fill="none" stroke="#f18ba6" strokeLinecap="round" strokeWidth="2" />

      {
    /* ===== LEGS - short chibi legs ===== */
  }
      {
    /* Left leg */
  }
      <ellipse cx="40" cy="88" rx="4.5" ry="7" fill={`url(#${skin})`} stroke="#dba090" strokeWidth="1.2" />
      {
    /* Left shoe */
  }
      <ellipse cx="40" cy="96" rx="6" ry="3.5" fill={`url(#${shadow}-shoe)`} stroke="#d4768e" strokeWidth="1.3" />
      <ellipse cx="38.5" cy="95" rx="2.4" ry="1.3" fill="#ffd6e2" opacity="0.6" />

      {
    /* Right leg */
  }
      <ellipse cx="56" cy="88" rx="4.5" ry="7" fill={`url(#${skin})`} stroke="#dba090" strokeWidth="1.2" />
      {
    /* Right shoe */
  }
      <ellipse cx="56" cy="96" rx="6" ry="3.5" fill={`url(#${shadow}-shoe)`} stroke="#d4768e" strokeWidth="1.3" />
      <ellipse cx="54.5" cy="95" rx="2.4" ry="1.3" fill="#ffd6e2" opacity="0.6" />

      {
    /* Face skin */
  }
      <ellipse cx="48" cy="43" rx="26" ry="25" fill={`url(#${skin})`} />
      {
    /* Hair bangs */
  }
      <path d="M25 37c7-18 41-18 47 0-11-8-36-8-47 0Z" fill={`url(#${hair})`} />
      <path d="M29 32c7 11 30 12 39 2-1 10-4 17-8 21-6-7-18-8-25-1-5-5-7-12-6-22Z" fill={`url(#${hair})`} opacity="0.96" />
      <path d="M31 32c6 5 8 13 5 20M42 29c5 6 5 13 2 19M56 29c-1 8 1 14 6 19" fill="none" stroke="#f0b5a7" strokeLinecap="round" strokeWidth="1.8" opacity="0.5" />

      {
    /* Eyes */
  }
      <g className="moli-blink" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx="36" cy="45" r="7.1" fill={`url(#${eye})`} />
        <circle cx="60" cy="45" r="7.1" fill={`url(#${eye})`} />
        <circle cx="33.5" cy="42" r="2.4" fill="#ffffff" />
        <circle cx="57.5" cy="42" r="2.4" fill="#ffffff" />
        <circle cx="39.5" cy="48.5" r="1" fill="#ffffff" opacity="0.9" />
        <circle cx="63.5" cy="48.5" r="1" fill="#ffffff" opacity="0.9" />
      </g>
      {
    /* Blush cheeks */
  }
      <ellipse cx="29" cy="55" rx="5.4" ry="3.3" fill="#ff9aaf" opacity="0.78" />
      <ellipse cx="67" cy="55" rx="5.4" ry="3.3" fill="#ff9aaf" opacity="0.78" />
      {
    /* Nose & mouth */
  }
      <path d="M45.5 54.2c1.7 1.4 3.3 1.4 5 0" fill="none" stroke="#7d303c" strokeLinecap="round" strokeWidth="2" />
      <path d="M41.5 57.6c3.2 4.4 9.8 4.4 13 0" fill="none" stroke="#b84055" strokeLinecap="round" strokeWidth="2.25" />
      <path d="M44.5 59.1c2.2 2 4.8 2 7 0" fill="none" stroke="#ff8aa4" strokeLinecap="round" strokeWidth="1.2" opacity="0.55" />

      {
    /* Hair highlight */
  }
      <path d="M57 19c7-5 18 2 15 12-7-6-15-7-24-4 1-4 4-6 9-8Z" fill="#fff8fb" opacity="0.65" />
    </svg>;
}
function MolyPlushPet({
  variant,
  walking,
  facing
}) {
  const isStar = variant === "star";
  const id = useId().replace(/:/g, "");
  const headGradient = `moly-head-${variant}-${id}`;
  const accentGradient = `moly-accent-${variant}-${id}`;
  const eyeGradient = `moly-eye-${variant}-${id}`;
  const softShadow = `moly-shadow-${variant}-${id}`;
  return <div
    className={`moli-plush-shell relative h-20 w-20 ${walking ? "moli-plush-walking" : ""}`}
    style={{ "--moli-dir": facing === "left" ? "-1" : "1" }}
  >
      <svg className="h-full w-full overflow-visible" viewBox="0 0 80 80" role="img" aria-label={isStar ? "Moly c\xF4ng ch\xFAa sao" : "Moly th\u1ECF tim"}>
        <defs>
          <radialGradient id={headGradient} cx="34%" cy="24%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="58%" stopColor={isStar ? "#eef8ff" : "#fff1f8"} />
            <stop offset="100%" stopColor={isStar ? "#bddfff" : "#ffd7e9"} />
          </radialGradient>
          <linearGradient id={accentGradient} x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor={isStar ? "#ffffff" : "#ffd4e9"} />
            <stop offset="52%" stopColor={isStar ? "#bfe6ff" : "#f7a6cd"} />
            <stop offset="100%" stopColor={isStar ? "#69aee9" : "#c9efff"} />
          </linearGradient>
          <radialGradient id={eyeGradient} cx="34%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="32%" stopColor={isStar ? "#8bd9ff" : "#6fc7ff"} />
            <stop offset="72%" stopColor={isStar ? "#3f4bbd" : "#0d5598"} />
            <stop offset="100%" stopColor={isStar ? "#36135e" : "#082b5f"} />
          </radialGradient>
          <filter id={softShadow} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="8" stdDeviation="4" floodColor={isStar ? "#2563eb" : "#ec4899"} floodOpacity="0.2" />
          </filter>
        </defs>

        <ellipse cx="40" cy="73" rx="22" ry="5" fill="#0f172a" opacity="0.12" />

        {isStar ? <>
            <path d="M16 35c-8 8-8 24 0 31 9 8 21 1 20-11-.8-11-10-25-20-20Z" fill={`url(#${accentGradient})`} filter={`url(#${softShadow})`} />
            <path d="M63 17c8 3 12 11 9 18-3 8-13 10-20 5-7-5-6-17 1-21 3-2 6-3 10-2Z" fill={`url(#${accentGradient})`} filter={`url(#${softShadow})`} />
            <ellipse cx="40" cy="39" rx="29" ry="27" fill={`url(#${headGradient})`} filter={`url(#${softShadow})`} />
            <path d="M18 29c8-16 34-22 44-3-11-5-34-1-44 3Z" fill={`url(#${accentGradient})`} opacity="0.95" />
            <path d="M25 12c12-7 28-2 34 10-12-5-29 0-42 11 1-9 3-17 8-21Z" fill={`url(#${accentGradient})`} />
            <path d="M22 30c8-3 18-2 28 1-9 3-19 4-31 1l3-2Z" fill="#ffffff" opacity="0.45" />
            <path d="M20 22l3 5 5 2-5 3-3 5-3-5-5-3 5-2 3-5Z" fill="#ffffff" stroke="#7ec9ff" strokeWidth="1.5" />
            <g className="moli-blink" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
              <circle cx="28" cy="39" r="7.8" fill={`url(#${eyeGradient})`} />
              <circle cx="25.5" cy="36.5" r="2.6" fill="#ffffff" />
              <circle cx="31" cy="42" r="1" fill="#ffffff" opacity="0.9" />
            </g>
            <path d="M49 39c3 4 8 4 11 0" fill="none" stroke="#23346f" strokeLinecap="round" strokeWidth="3" />
            <ellipse cx="22" cy="50" rx="5" ry="3" fill="#f9a8d4" opacity="0.72" />
            <ellipse cx="58" cy="50" rx="5" ry="3" fill="#f9a8d4" opacity="0.68" />
            <path d="M36 50c3 5 9 5 12 0" fill="none" stroke="#7f1d1d" strokeLinecap="round" strokeWidth="3" />
            <path d="M38 57l-10 17h24L42 57h-4Z" fill={`url(#${accentGradient})`} filter={`url(#${softShadow})`} />
            <path d="M33 60h14" stroke="#ffffff" strokeLinecap="round" strokeWidth="2" opacity="0.8" />
            <path d="M40 62l2 4 4 1-4 2-2 4-2-4-4-2 4-1 2-4Z" fill="#fff5b8" stroke="#d8b640" strokeWidth="1" />
          </> : <>
            <path d="M24 8c-7 1-8 25-2 36 2 4 8 3 9-1 3-12 1-34-7-35Z" fill="#ffffff" filter={`url(#${softShadow})`} />
            <path d="M56 8c7 1 8 25 2 36-2 4-8 3-9-1-3-12-1-34 7-35Z" fill="#ffffff" filter={`url(#${softShadow})`} />
            <path d="M25 15c-3 4-3 16 0 25" stroke="#ffd4e8" strokeLinecap="round" strokeWidth="5" opacity="0.9" />
            <path d="M55 15c3 4 3 16 0 25" stroke="#ffd4e8" strokeLinecap="round" strokeWidth="5" opacity="0.9" />
            <ellipse cx="40" cy="41" rx="29" ry="28" fill={`url(#${headGradient})`} filter={`url(#${softShadow})`} />
            <path d="M34 13c3-7 12-7 15 0 7-1 11 6 7 12-5 7-20 6-27 0-5-5-1-12 5-12Z" fill="#f9b8d5" filter={`url(#${softShadow})`} />
            <g className="moli-blink" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
              <circle cx="29" cy="41" r="7.8" fill={`url(#${eyeGradient})`} />
              <circle cx="51" cy="41" r="7.8" fill={`url(#${eyeGradient})`} />
              <circle cx="26.5" cy="37.5" r="2.6" fill="#ffffff" />
              <circle cx="48.5" cy="37.5" r="2.6" fill="#ffffff" />
              <circle cx="33" cy="44.5" r="1" fill="#ffffff" opacity="0.9" />
              <circle cx="55" cy="44.5" r="1" fill="#ffffff" opacity="0.9" />
            </g>
            <path d="M21 35c2-3 5-4 8-4" stroke="#1f3b78" strokeLinecap="round" strokeWidth="2" />
            <path d="M59 35c-2-3-5-4-8-4" stroke="#1f3b78" strokeLinecap="round" strokeWidth="2" />
            <ellipse cx="24" cy="52" rx="5" ry="3" fill="#f9a8d4" opacity="0.78" />
            <ellipse cx="56" cy="52" rx="5" ry="3" fill="#f9a8d4" opacity="0.72" />
            <path d="M37 51c3 4 8 4 11 0" fill="none" stroke="#7f1d1d" strokeLinecap="round" strokeWidth="3" />
            <path d="M30 61c7 6 18 6 25 0l4 13H26l4-13Z" fill="#ffffff" filter={`url(#${softShadow})`} />
            <path d="M30 68c8 3 18 3 26 0" stroke="#9ee8ff" strokeLinecap="round" strokeWidth="2" />
            <path d="M14 24c18 0 27 13 26 35" fill="none" stroke="#ffffff" strokeLinecap="round" strokeWidth="2" opacity="0.7" />
          </>}
      </svg>
    </div>;
}
