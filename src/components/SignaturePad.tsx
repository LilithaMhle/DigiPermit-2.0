import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface SignaturePadHandle {
  clear: () => void;
  toDataURL: () => string | null;
  isEmpty: () => boolean;
  load: (dataUrl: string) => void;
}

interface Props {
  width?: number;
  height?: number;
  initial?: string;
  className?: string;
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { width = 600, height = 200, initial, className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const emptyRef = useRef(true);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const prime = (c: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const x = c.getContext("2d")!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, width, height);
    x.strokeStyle = "#0b1d3a";
    x.lineWidth = 2.2;
    x.lineCap = "round";
    x.lineJoin = "round";
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      const c = canvasRef.current;
      if (!c) return;
      prime(c);
      emptyRef.current = true;
    },
    toDataURL: () => (emptyRef.current ? null : canvasRef.current?.toDataURL("image/png") ?? null),
    isEmpty: () => emptyRef.current,
    load: (dataUrl: string) => {
      const c = canvasRef.current;
      if (!c) return;
      prime(c);
      const img = new Image();
      img.onload = () => {
        c.getContext("2d")!.drawImage(img, 0, 0, width, height);
        emptyRef.current = false;
      };
      img.src = dataUrl;
    },
  }));

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    prime(c);
    if (initial) {
      const img = new Image();
      img.onload = () => {
        c.getContext("2d")!.drawImage(img, 0, 0, width, height);
        emptyRef.current = false;
      };
      img.src = initial;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, initial]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const c = canvasRef.current!;
    c.setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    const x2 = ctx();
    if (!x2) return;
    x2.beginPath();
    x2.moveTo(x, y);
    drawingRef.current = true;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const { x, y } = pos(e);
    const x2 = ctx();
    if (!x2) return;
    x2.lineTo(x, y);
    x2.stroke();
    emptyRef.current = false;
  };
  const onUp = () => {
    drawingRef.current = false;
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      className={`border border-border rounded-md bg-white touch-none cursor-crosshair ${className ?? ""}`}
    />
  );
});