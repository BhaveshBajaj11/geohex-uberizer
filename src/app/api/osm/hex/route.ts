import { NextResponse } from 'next/server';
import { cellToBoundary } from 'h3-js';
import * as turf from '@turf/turf';

type LatLng = { lat: number; lng: number };

function toOverpassPolyFromBoundary(boundary: LatLng[]): string {
  const coords = boundary.map(p => `${p.lat} ${p.lng}`);
  if (coords.length > 0 && coords[0] !== coords[coords.length - 1]) {
    coords.push(coords[0]);
  }
  return coords.join(' ');
}

function turfPolygonToMultiLine(poly: turf.helpers.Feature<turf.helpers.Polygon>) {
  const coords = poly.geometry.coordinates;
  const lines = coords.map(ring => turf.lineString(ring));
  return turf.multiLineString(lines.map(l => l.geometry.coordinates));
}

// Robustly split a line by a polygon ring by iteratively splitting on each edge.
function robustSplitLineByRing(
  line: turf.helpers.Feature<turf.helpers.LineString>,
  ring: number[][]
): turf.helpers.Feature<turf.helpers.LineString>[] {
  // ring is expected as [ [lng,lat], ... , [lng,lat] ] closed (first==last)
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

export async function POST(req: Request) {
  try {
    const { hexIndex } = await req.json();
    if (!hexIndex) return NextResponse.json({ error: 'hexIndex required' }, { status: 400 });

    const boundaryLngLat = cellToBoundary(hexIndex, true);
    const boundary: LatLng[] = boundaryLngLat.map(([lng, lat]) => ({ lat, lng }));
    const poly = toOverpassPolyFromBoundary(boundary);

    const query = `
    [out:json][timeout:25];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|service|footway|track|path|bridleway|bus_guideway|raceway|escape)$"](poly:"${poly}");
      way["railway"](poly:"${poly}");
    );
    out geom;
    `;

    const url = 'https://overpass-api.de/api/interpreter';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ data: query }).toString(),
      // Note: Rely on platform default timeout; Overpass sometimes slow
    });
    if (!resp.ok) {
      console.error(`❌ OSM API failed for hex ${hexIndex}: ${resp.status} ${resp.statusText}`);
      return NextResponse.json({ hexIndex, polylines: [], totalMeters: 0, error: `API failed: ${resp.status}` });
    }
    const json = await resp.json();
    console.log('=== OSM API Response Debug ===');
    console.log('Hex Index:', hexIndex);
    console.log('Raw OSM elements count:', json?.elements?.length || 0);
    if (json?.elements?.length > 0) {
      console.log('First element sample:', JSON.stringify(json.elements[0], null, 2));
    }

    const polylines: LatLng[][] = [];
    let totalMeters = 0;

    if (json && Array.isArray(json.elements)) {
      const ring = boundary.map(p => [p.lng, p.lat]);
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push(first);
      }
      const turfPoly = turf.polygon([ring]);
      const polyBoundary = turfPolygonToMultiLine(turfPoly);

      for (const el of json.elements) {
        if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length > 1) {
          const coords = el.geometry.map((g: any) => [g.lon, g.lat]);
          const line = turf.lineString(coords);
          let segments: turf.helpers.Feature<turf.helpers.LineString>[] = [];
          let initialSplitFailed = false;
          try {
            const split = turf.lineSplit(line, polyBoundary);
            segments = (split.features as any) ?? [];
          } catch {
            initialSplitFailed = true;
          }
          // If initial split failed or produced no pieces while the line intersects the hex, use robust split
          const intersectsHex = (() => {
            try { return turf.booleanIntersects(line as any, turfPoly as any); } catch { return false; }
          })();
          if (initialSplitFailed || (segments.length === 0 && intersectsHex)) {
            segments = robustSplitLineByRing(line as any, ring);
          }
          for (const seg of segments) {
            // Extra safety: split at the same boundary again and keep only interior pieces
            let finalPieces: turf.helpers.Feature<turf.helpers.LineString>[] = [];
            try {
              const reSplit = turf.lineSplit(seg, polyBoundary);
              finalPieces = (reSplit.features as any) ?? [];
            } catch {
              finalPieces = [seg as any];
            }
            for (const piece of finalPieces) {
              const mid = piece.geometry.coordinates[Math.floor(piece.geometry.coordinates.length / 2)];
              if (turf.booleanPointInPolygon(turf.point(mid), turfPoly)) {
                const km = turf.length(piece, { units: 'kilometers' });
                const meters = km * 1000;
                if (meters > 0.05) { // drop tiny slivers
                  totalMeters += meters;
                  const latLngSeg: LatLng[] = piece.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
                  polylines.push(latLngSeg);
                }
              }
            }
          }
        }
      }
    }
    console.log('Processed polylines count:', polylines.length);
    console.log('Total meters:', totalMeters);
    console.log('=== End Debug ===');

    return NextResponse.json({ hexIndex, polylines, totalMeters });
  } catch (e) {
    return NextResponse.json({ hexIndex: null, polylines: [], totalMeters: 0 });
  }
}


