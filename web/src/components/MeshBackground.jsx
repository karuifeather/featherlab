import { useEffect, useRef } from "react";
import "./MeshBackground.scss";
import { createMeshField } from "../lib/meshField.js";

/**
 * Decorative infrastructure-topology backdrop. The canvas animation lives entirely in
 * {@link createMeshField}; this component only mounts the canvas and tears the field down.
 * It is marked aria-hidden — it carries no information, only atmosphere.
 */
export function MeshBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const field = createMeshField(canvasRef.current);
    return () => field.destroy();
  }, []);
  return (
    <div className="mesh-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="mesh-bg-canvas" />
      <div className="mesh-bg-glow" />
      <div className="mesh-bg-grid" />
    </div>
  );
}
