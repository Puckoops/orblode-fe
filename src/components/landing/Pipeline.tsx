"use client";

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";
import { ContourMap } from "./MapCanvases";
import { useSite } from "./SiteContext";
import { SurveyContours } from "./SurveyMaps";

type Node = { id: string; name: string; detail: string; timing?: boolean };

const COLUMNS: { title: string; nodes: Node[] }[] = [
  {
    title: "1 · You upload",
    nodes: [
      { id: "in-survey", name: "Processed survey", detail: "Ortho, DSM, DTM · GeoTIFF" },
      { id: "in-lidar", name: "LiDAR", detail: "LAS / LAZ" },
      { id: "in-design", name: "Design", detail: "LandXML, DXF, IFC" },
      { id: "in-mesh", name: "Meshes", detail: "OBJ, OSGB, 3MX" },
    ],
  },
  {
    title: "2 · Orblode builds",
    nodes: [
      { id: "b-imagery", name: "Imagery tiles", detail: "Streams at any zoom" },
      { id: "b-surfaces", name: "Surfaces", detail: "DSM and DTM on a 0.2 m grid" },
      { id: "b-cloud", name: "Point cloud", detail: "57M points · under 10 min", timing: true },
      { id: "b-mesh", name: "Terrain mesh", detail: "Quantized for the globe" },
    ],
  },
  {
    title: "4 · You get",
    nodes: [
      { id: "o-volumes", name: "Volumes", detail: "Stockpiles, pits, haul roads" },
      { id: "o-cutfill", name: "Cut and fill", detail: "Against design or a fixed level" },
      { id: "o-change", name: "Change", detail: "Survey to survey" },
      { id: "o-share", name: "Reports and links", detail: "Exports and exact-view links" },
    ],
  },
];

const EDGES: readonly (readonly [string, string])[] = [
  ["in-survey", "b-imagery"],
  ["in-survey", "b-surfaces"],
  ["in-lidar", "b-cloud"],
  ["in-lidar", "b-surfaces"],
  ["in-mesh", "b-mesh"],
  ["b-imagery", "twin"],
  ["b-surfaces", "twin"],
  ["b-cloud", "twin"],
  ["b-mesh", "twin"],
  ["in-design", "twin"],
  ["twin", "o-volumes"],
  ["twin", "o-cutfill"],
  ["twin", "o-change"],
  ["twin", "o-share"],
];

function NodeCard({ node }: { node: Node }) {
  return (
    <div data-node={node.id} className={styles.node}>
      <b>{node.name}</b>
      <span className={node.timing ? styles.timing : undefined}>{node.detail}</span>
    </div>
  );
}

function Column({ title, nodes }: { title: string; nodes: Node[] }) {
  return (
    <div className={styles.flowColumn}>
      <h3 className={styles.flowTitle}>{title}</h3>
      {nodes.map((n) => (
        <NodeCard key={n.id} node={n} />
      ))}
    </div>
  );
}

/** How a survey becomes answers, as a graph whose wires are drawn between the rendered cards. */
export function Pipeline() {
  const site = useSite();
  const flowRef = useRef<HTMLDivElement>(null);
  const wiresRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const flow = flowRef.current, svg = wiresRef.current;
    if (!flow || !svg) return;
    const draw = () => {
      if (getComputedStyle(svg).display === "none") return;
      const box = flow.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
      const paths: string[] = [];
      for (const [from, to] of EDGES) {
        const a = flow.querySelector(`[data-node="${from}"]`)?.getBoundingClientRect();
        const b = flow.querySelector(`[data-node="${to}"]`)?.getBoundingClientRect();
        if (!a || !b) continue;
        const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top, x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top, bend = (x2 - x1) / 2;
        const d = `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1 + bend).toFixed(1)},${y1.toFixed(1)} ${(x2 - bend).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
        paths.push(`<path class="${styles.wire}" d="${d}"/><path class="${styles.wireRun}" d="${d}"/>`);
      }
      svg.innerHTML = paths.join("");
    };
    const resizer = new ResizeObserver(draw);
    resizer.observe(flow);
    document.fonts?.ready.then(draw);
    return () => resizer.disconnect();
  }, []);

  return (
    <section id="how" aria-labelledby="how-title" className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>How it works</span>
        <h2 id="how-title" className={styles.sectionTitle}>
          From upload to answers, on one georeferenced ground.
        </h2>
      </div>
      <div ref={flowRef} className={styles.flow}>
        <svg ref={wiresRef} aria-hidden="true" className={styles.flowWires} />
        <Column {...COLUMNS[0]} />
        <Column {...COLUMNS[1]} />
        <div className={styles.flowColumn}>
          <h3 className={styles.flowTitle}>3 · Your twin</h3>
          <div data-node="twin" className={`${styles.node} ${styles.nodeTwin}`}>
            {site.mode === "sample" ? (
              <ContourMap region={{ x0: -300, x1: 160, y0: -100, y1: 158.75 }} step={3} tint minorAlpha={0.16} majorAlpha={0.5} lineWidth={1.2} size={[640, 360]} />
            ) : (
              <SurveyContours label={`Contours of ${site.name}`} size={[640, 360]} />
            )}
            <div className={styles.nodeBody}>
              <b>{site.name}</b>
              <span>
                {site.crs} · {site.mode === "sample" ? `${site.surveyCount} surveys` : `surveyed ${site.surveyDate}`}
              </span>
              <span className={styles.timing}>10 ha cut/fill in 6.5 s</span>
            </div>
          </div>
        </div>
        <Column {...COLUMNS[2]} />
      </div>
    </section>
  );
}
