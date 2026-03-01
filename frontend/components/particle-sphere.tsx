"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

type Point3D = { x: number; y: number; z: number };

interface ParticleSphereProps {
  /** 0–1, drives how much the sphere "reacts" (e.g. from voice level) */
  level?: number;
  /** Number of particles on the sphere */
  particleCount?: number;
  /** True while the assistant is generating/thinking */
  isResponding?: boolean;
  /** True while TTS audio is actively playing */
  isSpeaking?: boolean;
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

function createHourglassPointsFromSphere(spherePoints: Point3D[]): Point3D[] {
  const softness = 0.14;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return spherePoints.map((p, i) => {
    const y = p.y * 0.78;
    const absY = Math.min(Math.abs(y), 0.999);
    const lobeCenter = 0.5;
    const lobeWidth = 0.2;
    const lobe = Math.exp(-Math.pow((absY - lobeCenter) / lobeWidth, 2));
    const edgeClose = Math.pow(Math.max(0, 1 - absY), 0.55);
    const waistRadius = 0.05;
    const lobeRadius = 0.55;
    const targetRadius = (waistRadius + lobeRadius * lobe) * edgeClose;
    const radialLength = Math.hypot(p.x, p.z);
    const theta = radialLength > 1e-4 ? Math.atan2(p.z, p.x) : i * goldenAngle;
    const hourglassPoint = {
      x: Math.cos(theta) * targetRadius,
      y,
      z: Math.sin(theta) * targetRadius,
    };
    return mixPoint(hourglassPoint, p, softness);
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
  isSpeaking = false,
  className,
}: ParticleSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapePoints = useMemo(() => {
    const sphere = fibonacciSphere(particleCount);
    const hourglass = createHourglassPointsFromSphere(sphere);
    return { sphere, hourglass };
  }, [particleCount]);
  const animationRef = useRef<number>(0);
  const spinTimeRef = useRef(0);
  const waveTimeRef = useRef(0);
  const targetLevelRef = useRef(level);
  const smoothLevelRef = useRef(level);
  const targetThinkRef = useRef(isResponding ? 1 : 0);
  const thinkBlendRef = useRef(isResponding ? 1 : 0);
  const targetSpeakRef = useRef(isSpeaking ? 1 : 0);
  const speakBlendRef = useRef(isSpeaking ? 1 : 0);
  const spinVelocityRef = useRef(0.004);

  useEffect(() => {
    targetLevelRef.current = level;
  }, [level]);

  useEffect(() => {
    targetThinkRef.current = isResponding ? 1 : 0;
  }, [isResponding]);

  useEffect(() => {
    targetSpeakRef.current = isSpeaking ? 1 : 0;
  }, [isSpeaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const context: CanvasRenderingContext2D = ctx;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const size = 280;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    context.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = 90;
    const expandScale = 0.52; // max deformation depth before hard cap
    const deformationLevelLimit = 0.82; // loudness threshold where size stops increasing
    const idleSpinSpeed = 0.0042;
    const speakingSpinBoost = 0.011;
    const respondingSpinBoost = 0.005;
    const baseWaveSpeed = 0.018;

    function draw() {
      smoothLevelRef.current += (targetLevelRef.current - smoothLevelRef.current) * 0.08;
      const reactiveLevel = smoothLevelRef.current;
      const isActive = reactiveLevel > 0.01;
      thinkBlendRef.current += (targetThinkRef.current - thinkBlendRef.current) * 0.08;
      speakBlendRef.current += (targetSpeakRef.current - speakBlendRef.current) * 0.08;
      const thinkBlend = thinkBlendRef.current;
      const speakBlend = speakBlendRef.current;
      const speakWaveStrength = smoothstep(speakBlend);
      const cappedLevel = Math.min(reactiveLevel, deformationLevelLimit);
      const overdriveRaw = Math.max(
        0,
        (reactiveLevel - deformationLevelLimit) / (1 - deformationLevelLimit)
      );
      // Smooth transition into "overdrive" instead of abrupt threshold behavior.
      const overdrive = overdriveRaw * overdriveRaw * (3 - 2 * overdriveRaw);

      const targetSpinVelocity =
        (idleSpinSpeed +
          reactiveLevel * speakingSpinBoost +
          thinkBlend * respondingSpinBoost) *
        (1 - speakWaveStrength);
      spinVelocityRef.current += (targetSpinVelocity - spinVelocityRef.current) * 0.05;
      spinTimeRef.current += spinVelocityRef.current;
      waveTimeRef.current += baseWaveSpeed + cappedLevel * 0.015 + overdrive * 0.002;
      const spinT = spinTimeRef.current;
      const waveT = waveTimeRef.current;

      context.clearRect(0, 0, size, size);

      const thinkMorphStrength = smoothstep(thinkBlend) * (1 - speakWaveStrength);

      shapePoints.sphere.forEach((spherePoint, i) => {
        const hourglassPoint = shapePoints.hourglass[i];
        const basePoint = mixPoint(spherePoint, hourglassPoint, thinkMorphStrength);
        const lineT = particleCount > 1 ? i / (particleCount - 1) : 0.5;
        const hash = Math.sin(i * 12.9898) * 43758.5453;
        const noise = hash - Math.floor(hash);
        const lane = (i % 7) - 3;
        const laneOffsetY = lane * 0.04;
        const laneOffsetX = (noise - 0.5) * 0.045;
        const chaosPhase = waveT * (2 + noise * 1.7) + i * 0.13;
        const jitterX = Math.sin(chaosPhase * 1.9 + noise * 9.7) * 0.06;
        const jitterY = Math.sin(chaosPhase * 2.7 - noise * 13.3) * 0.08;
        const jitterZ = Math.cos(chaosPhase * 2.3 + noise * 7.1) * 0.045;
        const lineX = lerp(-1.1, 1.1, lineT) + laneOffsetX + jitterX * speakWaveStrength;
        const lineY =
          Math.sin(lineX * 8 + waveT * 4.2) * 0.29 +
          laneOffsetY * 0.62 +
          jitterY * speakWaveStrength;
        const lineZ = (noise - 0.5) * 0.03 + jitterZ * speakWaveStrength;
        const ttsPoint = { x: lineX, y: lineY, z: lineZ };
        const p = mixPoint(basePoint, ttsPoint, speakWaveStrength);
        const px = p.x;
        const py = p.y;
        const pz = p.z;

        // Continuous, smooth idle rotation while preserving actual 3D shape.
        const spinAngle = spinT * 0.6;
        const cosA = Math.cos(spinAngle);
        const sinA = Math.sin(spinAngle);
        const x2 = px * cosA - pz * sinA;
        const y2 = py;
        const z2 = px * sinA + pz * cosA;

        // Signed deformation so some regions push outward while others pull inward.
        const localPhase = waveT * 2.6 + p.x * 3.2 + p.y * 3.2 + p.z * 3.2;
        const localWave = Math.sin(localPhase);
        const counterWave = Math.sin(
          waveT * 1.9 - p.x * 4.4 + p.y * 2.8 - p.z * 3.5
        );
        const textureWave = Math.sin(
          waveT * (4.3 + overdrive * 0.9) + p.x * 7.6 - p.y * 6.8 + p.z * 7.2
        );
        let signedDisplacement = isActive
          ? localWave * 0.58 +
            counterWave * 0.3 +
            textureWave * (0.1 + overdrive * 0.1)
          : 0;
        signedDisplacement *= 1 - speakWaveStrength;
        const sharpness = 1 + overdrive * 0.7;
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
        const perspectiveFactor = lerp(0.4, 0.1, speakWaveStrength);
        const perspective = 1 + z2 * perspectiveFactor;
        const screenX = centerX + (x2 / perspective) * r3d;
        const screenY = centerY + (y2 / perspective) * r3d;

        const ttsRadiusScale = lerp(1, 0.72, speakWaveStrength);
        const ttsScatterScale = lerp(1, 0.84 + noise * 0.22, speakWaveStrength);
        const particleRadius =
          Math.max(0.9, 1.25 + reactiveLevel * 0.95) * ttsRadiusScale * ttsScatterScale;
        const alphaBase = 0.18 + 0.68 * (1 - (z2 * 0.5 + 0.5));
        const alphaJitter = lerp(1, 0.68 + noise * 0.45, speakWaveStrength);
        const alpha = alphaBase * alphaJitter;
        const hue = 0;
        const sat = 0;
        const light = 72 + reactiveLevel * 18;
        context.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
        context.beginPath();
        context.arc(screenX, screenY, particleRadius, 0, Math.PI * 2);
        context.fill();
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
