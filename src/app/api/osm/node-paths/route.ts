import { NextResponse } from 'next/server';
import { cellToBoundary } from 'h3-js';
import * as turf from '@turf/turf';
import type { LatLng, OSMNode, NodePath, NodeJoiningResult } from '@/app/osm-actions';
import { createNodePaths } from '@/app/osm-actions';

function toOverpassPolyFromBoundary(boundary: LatLng[]): string {
  return boundary.map(p => `${p.lat} ${p.lng}`).join(' ');
}

function calculateDistance(point1: LatLng, point2: LatLng): number {
  const line = turf.lineString([[point1.lng, point1.lat], [point2.lng, point2.lat]]);
  return turf.length(line, { units: 'meters' });
}


export async function POST(req: Request) {
  try {
    const { polygon, hexIndexes } = await req.json();
    if (!polygon || !hexIndexes || !Array.isArray(hexIndexes)) {
      return NextResponse.json({ error: 'polygon and hexIndexes required' }, { status: 400 });
    }

    console.log(`🔍 API: Processing ${hexIndexes.length} hexagons for cross-hexagon node paths`);

    // First, collect ALL nodes from ALL hexagons
    const allNodes: OSMNode[] = [];
    const nodeMap = new Map<string, OSMNode>();
    const hexToNodes = new Map<string, OSMNode[]>();

    // Process each hexagon to collect nodes
    for (const hexIndex of hexIndexes) {
      try {
        const boundaryLngLat = cellToBoundary(hexIndex, true);
        const boundary: LatLng[] = boundaryLngLat.map(([lng, lat]) => ({ lat, lng }));
        const poly = toOverpassPolyFromBoundary(boundary);

        // Query OSM for ways with their nodes
        const query = `
        [out:json][timeout:25];
        (
          way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|service|footway|track|path|bridleway|bus_guideway|raceway|escape)$"](poly:"${poly}");
          way["railway"](poly:"${poly}");
        );
        (._;>;);
        out geom;
        `;

        const url = 'https://overpass-api.de/api/interpreter';
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ data: query }).toString(),
        });

        if (!resp.ok) {
          console.log(`❌ Failed to fetch data for hex ${hexIndex}`);
          hexToNodes.set(hexIndex, []);
          continue;
        }

        const json = await resp.json();
        const hexNodes: OSMNode[] = [];

        if (json && Array.isArray(json.elements)) {
          // Create TurfJS polygon for boundary checking
          const ring = boundary.map(p => [p.lng, p.lat]);
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push(first);
          }
          const turfPoly = turf.polygon([ring]);

          // Collect all nodes within the hexagon
          for (const el of json.elements) {
            if (el.type === 'node' && el.lat && el.lon) {
              const nodePoint = turf.point([el.lon, el.lat]);
              
              // Check if node is within the hexagon
              if (turf.booleanPointInPolygon(nodePoint, turfPoly)) {
                const nodeId = el.id.toString();
                
                // Only add if not already collected (avoid duplicates across hexagons)
                if (!nodeMap.has(nodeId)) {
                  const osmNode: OSMNode = {
                    id: nodeId,
                    lat: el.lat,
                    lng: el.lon,
                    roadSegments: []
                  };
                  
                  nodeMap.set(nodeId, osmNode);
                  allNodes.push(osmNode);
                }
                
                // Add to hex-specific list (even if duplicate)
                const node = nodeMap.get(nodeId)!;
                hexNodes.push(node);
              }
            }
          }
        }

        hexToNodes.set(hexIndex, hexNodes);
        console.log(`📊 Hex ${hexIndex}: Found ${hexNodes.length} nodes`);

      } catch (error) {
        console.error(`Error processing hex ${hexIndex}:`, error);
        hexToNodes.set(hexIndex, []);
      }
    }

    console.log(`🎯 Total unique nodes across all hexagons: ${allNodes.length}`);

    // Now create paths using ALL nodes (cross-hexagon connections)
    const allPaths = createNodePaths(allNodes, 225, 270);
    console.log(`✅ Created ${allPaths.length} total paths (including cross-hexagon)`);

    // Distribute paths back to hexagons based on which hexagons contain the path nodes
    const results: Record<string, NodeJoiningResult> = {};

    for (const hexIndex of hexIndexes) {
      const hexNodes = hexToNodes.get(hexIndex) || [];
      const hexNodeIds = new Set(hexNodes.map(n => n.id));
      
      // Find paths that involve nodes from this hexagon
      const hexPaths = allPaths.filter(path => 
        path.nodes.some(node => hexNodeIds.has(node.id))
      );

      const optimalPaths = hexPaths.filter(p => p.pathType === 'optimal').length;
      const suboptimalPaths = hexPaths.filter(p => p.pathType !== 'optimal').length;

      results[hexIndex] = {
        hexIndex,
        paths: hexPaths,
        totalPaths: hexPaths.length,
        optimalPaths,
        suboptimalPaths
      };

      console.log(`📋 Hex ${hexIndex}: ${hexPaths.length} paths (${optimalPaths} optimal)`);
    }

    return NextResponse.json({ hexes: results });
  } catch (error) {
    console.error('Node paths API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
