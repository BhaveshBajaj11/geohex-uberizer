import { NextResponse } from 'next/server';
import { cellToBoundary, getResolution, latLngToCell } from 'h3-js';
import * as turf from '@turf/turf';

type LatLng = { lat: number; lng: number };

function toOverpassPolyFromBoundary(boundary: LatLng[]): string {
  const coords = boundary.map(p => `${p.lat} ${p.lng}`);
  if (coords.length > 0 && coords[0] !== coords[coords.length - 1]) {
    coords.push(coords[0]);
  }
  return coords.join(' ');
}

export async function POST(req: Request) {
  try {
    const { polygon, hexIndexes } = await req.json();
    if (!Array.isArray(polygon) || polygon.length < 3 || !Array.isArray(hexIndexes) || hexIndexes.length === 0) {
      return NextResponse.json({ error: 'polygon and hexIndexes required' }, { status: 400 });
    }

    const poly: LatLng[] = polygon.map((p: any) => ({ lat: p.lat, lng: p.lng }));

    // Build a buffered fetch area so border hexagons get full coverage even if they extend outside the input polygon
    const inputRing = poly.map(p => [p.lng, p.lat]);
    const first = inputRing[0];
    const last = inputRing[inputRing.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      inputRing.push(first);
    }
    const inputPoly = turf.polygon([inputRing]);

    // Approximate hex radius from the first hex index
    const res = getResolution(hexIndexes[0]);
    const firstHexBoundary = cellToBoundary(hexIndexes[0], true).map(([lng, lat]) => [lng, lat]);
    const firstHexPoly = turf.polygon([(() => {
      const f = firstHexBoundary[0];
      const l = firstHexBoundary[firstHexBoundary.length - 1];
      return (f[0] === l[0] && f[1] === l[1]) ? firstHexBoundary : [...firstHexBoundary, f];
    })()]);
    const firstHexCentroid = turf.centroid(firstHexPoly);
    const radiusKm = turf.distance(firstHexCentroid, turf.point(firstHexBoundary[0] as [number, number]), { units: 'kilometers' });
    const bufferKm = Math.max(0.05, radiusKm * 1.05); // add 5% safety, minimum 50m

    const buffered = turf.buffer(inputPoly, bufferKm, { units: 'kilometers' });
    const bufferedOuter = buffered.geometry.coordinates[0];
    const overpassPoly = toOverpassPolyFromBoundary(bufferedOuter.map(([lng, lat]) => ({ lat, lng })));

    const query = `
    [out:json][timeout:40];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|service|footway|track|path|bridleway|bus_guideway|raceway|escape)$"](poly:"${overpassPoly}");
      way["railway"](poly:"${overpassPoly}");
    );
    out geom;
    `;

    const url = 'https://overpass-api.de/api/interpreter';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ data: query }).toString(),
    });

    if (!resp.ok) {
      console.error(`❌ OSM API failed for polygon: ${resp.status} ${resp.statusText}`);
      return NextResponse.json({ hexes: {}, error: `API failed: ${resp.status}` });
    }

    const json = await resp.json();

    // Precompute per-hex: polygon, boundary lines, and bbox for fast candidate filtering
    type HexGeom = {
      id: string;
      poly: turf.helpers.Feature<turf.helpers.Polygon>;
      edges: turf.helpers.Feature<turf.helpers.MultiLineString>;
      bbox: turf.helpers.BBox;
      ring: number[][]; // closed ring [lng,lat]
    };
    const hexGeoms: HexGeom[] = [];
    for (const h of hexIndexes) {
      const boundaryLngLat = cellToBoundary(h, true); // [lng, lat]
      const ring = boundaryLngLat.map(([lng, lat]) => [lng, lat]);
      const firstPt = ring[0];
      const lastPt = ring[ring.length - 1];
      if (firstPt[0] !== lastPt[0] || firstPt[1] !== lastPt[1]) {
        ring.push(firstPt);
      }
      const poly = turf.polygon([ring]);
      const edges = turf.multiLineString([ring]);
      const bbox = turf.bbox(poly);
      hexGeoms.push({ id: h, poly, edges, bbox, ring });
    }

    const resByHex: Record<string, { polylines: LatLng[][]; totalMeters: number }> = Object.fromEntries(
      hexIndexes.map(h => [h, { polylines: [], totalMeters: 0 }])
    );

    // resolution already computed above

    function bboxOverlap(a: turf.helpers.BBox, b: turf.helpers.BBox): boolean {
      // [minX, minY, maxX, maxY]
      return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
    }

    // Robustly split a line by a polygon ring by iteratively splitting on each edge.
    function robustSplitLineByRing(
      line: turf.helpers.Feature<turf.helpers.LineString>,
      ring: number[][]
    ): turf.helpers.Feature<turf.helpers.LineString>[] {
      const edges: turf.helpers.Feature<turf.helpers.LineString>[] = [];
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        edges.push(turf.lineString([a as [number, number], b as [number, number]]));
      }
      let segments: turf.helpers.Feature<turf.helpers.LineString>[] = [line];
      for (const edge of edges) {
        const next: turf.helpers.Feature<turf.helpers.LineString>[] = [];
        for (const seg of segments) {
          try {
            const split = turf.lineSplit(seg, edge);
            const feats = (split.features as any) as turf.helpers.Feature<turf.helpers.LineString>[];
            if (feats && feats.length > 0) {
              next.push(...feats);
            } else {
              next.push(seg);
            }
          } catch {
            next.push(seg);
          }
        }
        segments = next;
      }
      return segments;
    }

    if (json && Array.isArray(json.elements)) {
      for (const el of json.elements) {
        if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length > 1) {
          const coords = el.geometry.map((g: any) => [g.lon, g.lat]);
          const line = turf.lineString(coords);
          const lineBbox = turf.bbox(line);
          for (const hex of hexGeoms) {
            if (!bboxOverlap(lineBbox, hex.bbox)) continue;
            try {
              if (!turf.booleanIntersects(line as any, hex.poly as any)) continue;
            } catch {
              // If intersects check fails, continue conservatively to attempt a split
            }
            let pieces: turf.helpers.Feature<turf.helpers.LineString>[] = [];
            let initialSplitFailed = false;
            try {
              const split = turf.lineSplit(line, hex.edges);
              pieces = (split.features as any) ?? [];
            } catch {
              initialSplitFailed = true;
            }
            const intersects = (() => { try { return turf.booleanIntersects(line as any, hex.poly as any); } catch { return false; } })();
            if (initialSplitFailed || (pieces.length === 0 && intersects)) {
              pieces = robustSplitLineByRing(line as any, hex.ring);
            }
            for (const piece of pieces) {
              const mid = piece.geometry.coordinates[Math.floor(piece.geometry.coordinates.length / 2)];
              if (turf.booleanPointInPolygon(turf.point(mid), hex.poly)) {
                const km = turf.length(piece, { units: 'kilometers' });
                const meters = km * 1000;
                if (meters > 0.05) {
                  const latLngSeg: LatLng[] = piece.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
                  resByHex[hex.id].polylines.push(latLngSeg);
                  resByHex[hex.id].totalMeters += meters;
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ hexes: resByHex });
  } catch (e) {
    return NextResponse.json({ hexes: {} });
  }
}


