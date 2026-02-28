"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

type Point3D = { x: number; y: number; z: number };

interface ParticleSphereProps {
  /** 0–1, drives how much the sphere "reacts" (e.g. from voice level) */
  level?: number;
  /** Number of particles on the sphere */
  particleCount?: number;
  /** True while the assistant is generating/answering */
  isResponding?: boolean;
  className?: string;
}

// Fibonacci sphere to distribute points evenly on a sphere
function fibonacciSphere(count: number): Point3D[] {
  const points: Point3D[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = phi * i;
    points.push({
      x: Math.cos(theta) * radiusAtY,
      y,
      z: Math.sin(theta) * radiusAtY,
    });
  }
  return points;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixPoint(a: Point3D, b: Point3D, t: number): Point3D {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

function createCubePointsFromSphere(spherePoints: Point3D[]): Point3D[] {
  const softness = 0.24;
  return spherePoints.map((p) => {
    const maxAxis = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z), 1e-6);
    const t = 1 / maxAxis;
    const cubePoint = { x: p.x * t * 0.82, y: p.y * t * 0.82, z: p.z * t * 0.82 };
    return mixPoint(cubePoint, p, softness);
  });
}

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function ParticleSphere({
  level = 0,
  particleCount = 700,
  isResponding = false,
  className,
}: ParticleSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapePoints = useMemo(() => {
    const sphere = fibonacciSphere(particleCount);
    const cube = createCubePointsFromSphere(sphere);
    return { sphere, cube };
  }, [particleCount]);
  const animationRef = useRef<number>(0);
  const spinTimeRef = useRef(0);
  const waveTimeRef = useRef(0);
  const targetLevelRef = useRef(level);
  const smoothLevelRef = useRef(level);
  const targetRespondRef = useRef(isResponding ? 1 : 0);
  const respondBlendRef = useRef(isResponding ? 1 : 0);
  const spinVelocityRef = useRef(0.004);

  useEffect(() => {
    targetLevelRef.current = level;
  }, [level]);

  useEffect(() => {
    targetRespondRef.current = isResponding ? 1 : 0;
  }, [isResponding]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const size = 280;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = 90;
    const expandScale = 0.52; // max deformation depth before hard cap
    const deformationLevelLimit = 0.72; // loudness threshold where size stops increasing
    const idleSpinSpeed = 0.0042;
    const speakingSpinBoost = 0.011;
    const respondingSpinBoost = 0.005;
    const baseWaveSpeed = 0.018;

    function draw() {
      smoothLevelRef.current += (targetLevelRef.current - smoothLevelRef.current) * 0.12;
      const reactiveLevel = smoothLevelRef.current;
      const isActive = reactiveLevel > 0.01;
      respondBlendRef.current += (targetRespondRef.current - respondBlendRef.current) * 0.08;
      const respondBlend = respondBlendRef.current;
      const cappedLevel = Math.min(reactiveLevel, deformationLevelLimit);
      const overdriveRaw = Math.max(
        0,
        (reactiveLevel - deformationLevelLimit) / (1 - deformationLevelLimit)
      );
      // Smooth transition into "overdrive" instead of abrupt threshold behavior.
      const overdrive = overdriveRaw * overdriveRaw * (3 - 2 * overdriveRaw);

      const targetSpinVelocity =
        idleSpinSpeed + reactiveLevel * speakingSpinBoost + respondBlend * respondingSpinBoost;
      spinVelocityRef.current += (targetSpinVelocity - spinVelocityRef.current) * 0.08;
      spinTimeRef.current += spinVelocityRef.current;
      waveTimeRef.current += baseWaveSpeed + cappedLevel * 0.018 + overdrive * 0.006;
      const spinT = spinTimeRef.current;
      const waveT = waveTimeRef.current;

      ctx.clearRect(0, 0, size, size);

      shapePoints.sphere.forEach((spherePoint, i) => {
        const cubePoint = shapePoints.cube[i];
        const p = mixPoint(spherePoint, cubePoint, smoothstep(respondBlend));

        // Continuous, smooth idle rotation while preserving actual 3D shape.
        const spinAngle = spinT * 0.6;
        const cosA = Math.cos(spinAngle);
        const sinA = Math.sin(spinAngle);
        const x2 = p.x * cosA - p.z * sinA;
        const y2 = p.y;
        const z2 = p.x * sinA + p.z * cosA;

        // Signed deformation so some regions push outward while others pull inward.
        const localPhase = waveT * 2.6 + p.x * 3.2 + p.y * 3.2 + p.z * 3.2;
        const localWave = Math.sin(localPhase);
        const counterWave = Math.sin(
          waveT * 1.9 - p.x * 4.4 + p.y * 2.8 - p.z * 3.5
        );
        const textureWave = Math.sin(
          waveT * (4.3 + overdrive * 1.8) + p.x * 7.6 - p.y * 6.8 + p.z * 7.2
        );
        let signedDisplacement = isActive
          ? localWave * 0.58 +
            counterWave * 0.3 +
            textureWave * (0.12 + overdrive * 0.18)
          : 0;
        const sharpness = 1 + overdrive * 1.6;
        signedDisplacement =
          Math.sign(signedDisplacement) *
          Math.pow(Math.abs(signedDisplacement), sharpness);
        signedDisplacement = Math.max(-1, Math.min(1, signedDisplacement));

        const radiusScale = Math.max(
          0.66,
          Math.min(1.34, 1 + cappedLevel * expandScale * signedDisplacement)
        );
        const r3d = baseRadius * radiusScale;

        // Project to 2D (perspective)
        const perspective = 1 + z2 * 0.4;
        const screenX = centerX + (x2 / perspective) * r3d;
        const screenY = centerY + (y2 / perspective) * r3d;

        const particleRadius = Math.max(0.4, 0.65 + reactiveLevel * 0.55);
        const alpha = 0.18 + 0.68 * (z2 * 0.5 + 0.5);
        const hue = 0;
        const sat = 0;
        const light = 72 + reactiveLevel * 18;
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, particleRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [shapePoints]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("rounded-full pointer-events-none", className)}
      width={280}
      height={280}
      style={{ background: "transparent" }}
      aria-hidden
    />
  );
}
