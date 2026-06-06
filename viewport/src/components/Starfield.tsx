/**
 * Starfield — Parallax star effect behind topology
 *
 * Stars drift outward from center (root node focal point).
 * Occasional hyperdrive bursts on system events.
 */

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';

interface Star {
  x: number;
  y: number;
  z: number; // depth: 0 = far, 1 = near
  prevX: number;
  prevY: number;
}

interface StarfieldProps {
  width: number;
  height: number;
  starCount?: number;
  baseSpeed?: number;
  hyperdriveActive?: boolean;
}

export interface StarfieldHandle {
  triggerHyperdrive: (duration?: number) => void;
}

const LAYERS = {
  far: { minZ: 0, maxZ: 0.3, size: 1, opacity: 0.08, speed: 0.2 },
  mid: { minZ: 0.3, maxZ: 0.7, size: 1.5, opacity: 0.15, speed: 0.5 },
  near: { minZ: 0.7, maxZ: 1, size: 2.5, opacity: 0.25, speed: 1 },
};

function getLayer(z: number) {
  if (z < 0.3) return LAYERS.far;
  if (z < 0.7) return LAYERS.mid;
  return LAYERS.near;
}

export const Starfield = forwardRef<StarfieldHandle, StarfieldProps>(function Starfield({
  width,
  height,
  starCount = 80,
  baseSpeed = 0.15,
  hyperdriveActive = false,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animationRef = useRef<number>(0);
  const hyperdriveRef = useRef(false);
  const hyperdriveTimerRef = useRef<number>(0);

  // Auto-trigger hyperdrive randomly
  const lastHyperdriveRef = useRef(Date.now());

  const centerX = width / 2;
  const centerY = height / 2;

  const createStar = useCallback((fromCenter = false): Star => {
    const angle = Math.random() * Math.PI * 2;
    const z = Math.random();

    if (fromCenter) {
      // Spawn near center
      const dist = Math.random() * 50;
      const x = centerX + Math.cos(angle) * dist;
      const y = centerY + Math.sin(angle) * dist;
      return { x, y, z, prevX: x, prevY: y };
    }

    // Random position for initial population
    const x = Math.random() * width;
    const y = Math.random() * height;
    return { x, y, z, prevX: x, prevY: y };
  }, [width, height, centerX, centerY]);

  // Initialize stars
  useEffect(() => {
    starsRef.current = Array.from({ length: starCount }, () => createStar(false));
  }, [starCount, createStar]);

  // Sync hyperdrive prop
  useEffect(() => {
    if (hyperdriveActive) {
      hyperdriveRef.current = true;
      hyperdriveTimerRef.current = 120; // frames
    }
  }, [hyperdriveActive]);

  // Expose trigger via imperative handle
  const triggerHyperdrive = useCallback((duration = 90) => {
    hyperdriveRef.current = true;
    hyperdriveTimerRef.current = duration;
    lastHyperdriveRef.current = Date.now();
  }, []);

  useImperativeHandle(ref, () => ({
    triggerHyperdrive,
  }), [triggerHyperdrive]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const animate = () => {
      if (!running) return;

      // Random hyperdrive trigger (every 45-90 seconds)
      const now = Date.now();
      if (now - lastHyperdriveRef.current > 45000 && Math.random() < 0.0005) {
        hyperdriveRef.current = true;
        hyperdriveTimerRef.current = 90;
        lastHyperdriveRef.current = now;
      }

      // Decay hyperdrive
      if (hyperdriveTimerRef.current > 0) {
        hyperdriveTimerRef.current--;
        if (hyperdriveTimerRef.current <= 0) {
          hyperdriveRef.current = false;
        }
      }

      const speedMultiplier = hyperdriveRef.current ? 8 : 1;
      const isHyper = hyperdriveRef.current;

      // Clear fully each frame - no trails
      ctx.fillStyle = 'rgb(10, 10, 14)';
      ctx.fillRect(0, 0, width, height);

      // Update and draw stars
      for (const star of starsRef.current) {
        const layer = getLayer(star.z);

        // Store previous position for trails
        star.prevX = star.x;
        star.prevY = star.y;

        // Move outward from center
        const dx = star.x - centerX;
        const dy = star.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // Speed increases with distance from center (perspective)
        const perspectiveSpeed = 0.5 + (dist / (width / 2)) * 1.5;
        const speed = baseSpeed * layer.speed * perspectiveSpeed * speedMultiplier;

        star.x += (dx / dist) * speed;
        star.y += (dy / dist) * speed;

        // Respawn if out of bounds
        const margin = 50;
        if (
          star.x < -margin ||
          star.x > width + margin ||
          star.y < -margin ||
          star.y > height + margin
        ) {
          const newStar = createStar(true);
          star.x = newStar.x;
          star.y = newStar.y;
          star.z = newStar.z;
          star.prevX = star.x;
          star.prevY = star.y;
          continue;
        }

        // Draw
        const size = layer.size * (0.5 + star.z * 0.5);
        const alpha = layer.opacity * (0.5 + star.z * 0.5);

        if (isHyper) {
          // Draw streak
          ctx.strokeStyle = `rgba(180, 200, 255, ${alpha * 0.8})`;
          ctx.lineWidth = size * 0.8;
          ctx.beginPath();
          ctx.moveTo(star.prevX, star.prevY);
          ctx.lineTo(star.x, star.y);
          ctx.stroke();

          // Brighter head
          ctx.fillStyle = `rgba(220, 230, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, size * 1.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Normal star
          ctx.fillStyle = `rgba(200, 210, 230, ${alpha})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      running = false;
      cancelAnimationFrame(animationRef.current);
    };
  }, [width, height, centerX, centerY, baseSpeed, createStar]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
      }}
    />
  );
});

export default Starfield;
