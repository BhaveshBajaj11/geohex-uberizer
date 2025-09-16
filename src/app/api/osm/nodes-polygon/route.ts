import { NextResponse } from 'next/server';
import { cellToBoundary, getResolution } from 'h3-js';
import * as turf from '@turf/turf';

type LatLng = { lat: number; lng: number };

type OSMNode = {
  id: string;
  lat: number;
  lng: number;
  roadSegments: string[];
};

type RoadSegment = {
  id: string;
  nodes: OSMNode[];
  lengthMeters: number;
  wayId: string;
};

type NodeCluster = {
  id: string;
  nodes: OSMNode[];
  totalLengthMeters: number;
  segments: RoadSegment[];
  centroid: LatLng;
};

type NodesInHexResult = {
  hexIndex: string;
  nodes: OSMNode[];
  segments: RoadSegment[];
  clusters: NodeCluster[];
  totalNodes: number;
};

function toOverpassPolyFromBoundary(boundary: LatLng[]): string {
  const coords = boundary.map(p => `${p.lat} ${p.lng}`);
  if (coords.length > 0 && coords[0] !== coords[coords.length - 1]) {
    coords.push(coords[0]);
  }
  return coords.join(' ');
}

function calculateDistance(point1: LatLng, point2: LatLng): number {
  const line = turf.lineString([[point1.lng, point1.lat], [point2.lng, point2.lat]]);
  return turf.length(line, { units: 'meters' });
}

function createClusters(segments: RoadSegment[], minLength: number = 225, maxLength: number = 270): NodeCluster[] {
  console.log(`Creating clusters from ${segments.length} segments, target length: ${minLength}-${maxLength}m`);
  const clusters: NodeCluster[] = [];
  const usedSegments = new Set<string>();
  
  // Log segment lengths for debugging
  segments.forEach(seg => {
    console.log(`Segment ${seg.id}: ${Math.round(seg.lengthMeters)}m with ${seg.nodes.length} nodes`);
  });
  
  for (const segment of segments) {
    if (usedSegments.has(segment.id)) continue;
    
    const cluster: NodeCluster = {
      id: `cluster_${clusters.length + 1}`,
      nodes: [...segment.nodes],
      totalLengthMeters: segment.lengthMeters,
      segments: [segment],
      centroid: { lat: 0, lng: 0 }
    };
    
    usedSegments.add(segment.id);
    
    // Try to add adjacent segments to reach optimal length
    let canExtend = true;
    while (canExtend && cluster.totalLengthMeters < maxLength) {
      canExtend = false;
      
      // Find segments that share nodes with current cluster
      for (const candidateSegment of segments) {
        if (usedSegments.has(candidateSegment.id)) continue;
        
        // Check if this segment shares nodes with the cluster
        const sharedNodes = candidateSegment.nodes.filter(node => 
          cluster.nodes.some(clusterNode => clusterNode.id === node.id)
        );
        
        if (sharedNodes.length > 0) {
          const newLength = cluster.totalLengthMeters + candidateSegment.lengthMeters;
          
          // Only add if it doesn't exceed max length
          if (newLength <= maxLength) {
            // Add new nodes (avoid duplicates)
            candidateSegment.nodes.forEach(node => {
              if (!cluster.nodes.some(n => n.id === node.id)) {
                cluster.nodes.push(node);
              }
            });
            
            cluster.segments.push(candidateSegment);
            cluster.totalLengthMeters = newLength;
            usedSegments.add(candidateSegment.id);
            canExtend = true;
            break;
          }
        }
      }
    }
    
    // Only keep clusters that meet minimum length requirement
    if (cluster.totalLengthMeters >= minLength) {
      // Calculate centroid
      const avgLat = cluster.nodes.reduce((sum, node) => sum + node.lat, 0) / cluster.nodes.length;
      const avgLng = cluster.nodes.reduce((sum, node) => sum + node.lng, 0) / cluster.nodes.length;
      cluster.centroid = { lat: avgLat, lng: avgLng };
      
      console.log(`Added cluster ${clusters.length + 1}: ${Math.round(cluster.totalLengthMeters)}m with ${cluster.nodes.length} nodes`);
      clusters.push(cluster);
    } else {
      console.log(`Rejected cluster: ${Math.round(cluster.totalLengthMeters)}m (below ${minLength}m minimum)`);
    }
  }
  
  // Second pass: create clusters from remaining shorter segments (even if below minimum)
  console.log(`After optimal clustering: ${clusters.length} clusters, ${usedSegments.size}/${segments.length} segments used`);
  
  for (const segment of segments) {
    if (usedSegments.has(segment.id)) continue;
    
    // Create cluster from single shorter segment
    const cluster: NodeCluster = {
      id: `cluster_short_${clusters.length + 1}`,
      nodes: [...segment.nodes],
      totalLengthMeters: segment.lengthMeters,
      segments: [segment],
      centroid: { lat: 0, lng: 0 }
    };
    
    // Calculate centroid
    const avgLat = cluster.nodes.reduce((sum, node) => sum + node.lat, 0) / cluster.nodes.length;
    const avgLng = cluster.nodes.reduce((sum, node) => sum + node.lng, 0) / cluster.nodes.length;
    cluster.centroid = { lat: avgLat, lng: avgLng };
    
    console.log(`Added short cluster ${clusters.length + 1}: ${Math.round(cluster.totalLengthMeters)}m with ${cluster.nodes.length} nodes (sub-optimal)`);
    clusters.push(cluster);
    usedSegments.add(segment.id);
  }
  
  console.log(`Final result: ${clusters.length} total clusters`);
  return clusters;
}

export async function POST(req: Request) {
  try {
    const { polygon, hexIndexes } = await req.json();
    if (!Array.isArray(polygon) || polygon.length < 3 || !Array.isArray(hexIndexes) || hexIndexes.length === 0) {
      return NextResponse.json({ error: 'polygon and hexIndexes required' }, { status: 400 });
    }

    const poly: LatLng[] = polygon.map((p: any) => ({ lat: p.lat, lng: p.lng }));

    // Build a buffered fetch area
    const inputRing = poly.map(p => [p.lng, p.lat]);
    const first = inputRing[0];
    const last = inputRing[inputRing.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      inputRing.push(first);
    }
    const inputPoly = turf.polygon([inputRing]);

    // Calculate buffer based on hex resolution
    const res = getResolution(hexIndexes[0]);
    const firstHexBoundary = cellToBoundary(hexIndexes[0], true).map(([lng, lat]) => [lng, lat]);
    const firstHexPoly = turf.polygon([(() => {
      const f = firstHexBoundary[0];
      const l = firstHexBoundary[firstHexBoundary.length - 1];
      return (f[0] === l[0] && f[1] === l[1]) ? firstHexBoundary : [...firstHexBoundary, f];
    })()]);
    const firstHexCentroid = turf.centroid(firstHexPoly);
    const radiusKm = turf.distance(firstHexCentroid, turf.point(firstHexBoundary[0] as [number, number]), { units: 'kilometers' });
    const bufferKm = Math.max(0.05, radiusKm * 1.05);

    const buffered = turf.buffer(inputPoly, bufferKm, { units: 'kilometers' });
    const bufferedOuter = buffered.geometry.coordinates[0];
    const overpassPoly = toOverpassPolyFromBoundary(bufferedOuter.map(([lng, lat]) => ({ lat, lng })));

    // Query OSM for ways with their nodes
    const query = `
    [out:json][timeout:40];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|service|footway|track|path|bridleway|bus_guideway|raceway|escape)$"](poly:"${overpassPoly}");
      way["railway"](poly:"${overpassPoly}");
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
      return NextResponse.json({ hexes: {} });
    }

    const json = await resp.json();

    // Precompute per-hex geometries
    type HexGeom = {
      id: string;
      poly: turf.helpers.Feature<turf.helpers.Polygon>;
      bbox: turf.helpers.BBox;
      ring: number[][];
    };

    const hexGeoms: HexGeom[] = [];
    for (const h of hexIndexes) {
      const boundaryLngLat = cellToBoundary(h, true);
      const ring = boundaryLngLat.map(([lng, lat]) => [lng, lat]);
      const firstPt = ring[0];
      const lastPt = ring[ring.length - 1];
      if (firstPt[0] !== lastPt[0] || firstPt[1] !== lastPt[1]) {
        ring.push(firstPt);
      }
      const poly = turf.polygon([ring]);
      const bbox = turf.bbox(poly);
      hexGeoms.push({ id: h, poly, bbox, ring });
    }

    const resByHex: Record<string, NodesInHexResult> = Object.fromEntries(
      hexIndexes.map(h => [h, { hexIndex: h, nodes: [], segments: [], clusters: [], totalNodes: 0 }])
    );

    function bboxOverlap(a: turf.helpers.BBox, b: turf.helpers.BBox): boolean {
      return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
    }

    if (json && Array.isArray(json.elements)) {
      // Collect all nodes and ways by hex
      const nodesByHex: Record<string, Map<string, OSMNode>> = {};
      const waysByHex: Record<string, any[]> = {};

      // Initialize structures
      for (const hexId of hexIndexes) {
        nodesByHex[hexId] = new Map();
        waysByHex[hexId] = [];
      }

      // First pass: collect nodes by hex
      for (const el of json.elements) {
        if (el.type === 'node' && el.lat && el.lon) {
          const nodePoint = turf.point([el.lon, el.lat]);
          const nodeBbox = turf.bbox(nodePoint);

          for (const hex of hexGeoms) {
            if (bboxOverlap(nodeBbox, hex.bbox) && turf.booleanPointInPolygon(nodePoint, hex.poly)) {
              const osmNode: OSMNode = {
                id: el.id.toString(),
                lat: el.lat,
                lng: el.lon,
                roadSegments: []
              };
              
              nodesByHex[hex.id].set(osmNode.id, osmNode);
              resByHex[hex.id].nodes.push(osmNode);
            }
          }
        }
      }

      // Second pass: collect ways by hex
      for (const el of json.elements) {
        if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length > 1) {
          for (const hexId of hexIndexes) {
            // Check if any nodes of this way belong to this hex
            const wayNodesInHex = el.nodes.filter((nodeId: number) => 
              nodesByHex[hexId].has(nodeId.toString())
            );

            if (wayNodesInHex.length > 1) {
              waysByHex[hexId].push(el);
            }
          }
        }
      }

      // Third pass: create segments and clusters for each hex
      for (const hexId of hexIndexes) {
        const hexNodes = nodesByHex[hexId];
        const hexWays = waysByHex[hexId];
        const segments: RoadSegment[] = [];

        for (const way of hexWays) {
          const wayNodes = way.nodes
            .map((nodeId: number) => hexNodes.get(nodeId.toString()))
            .filter((node): node is OSMNode => node !== undefined);

          if (wayNodes.length > 1) {
            let totalLength = 0;
            for (let i = 0; i < wayNodes.length - 1; i++) {
              totalLength += calculateDistance(wayNodes[i], wayNodes[i + 1]);
            }

            const segment: RoadSegment = {
              id: `way_${way.id}_hex_${hexId}`,
              nodes: wayNodes,
              lengthMeters: totalLength,
              wayId: way.id.toString()
            };

            wayNodes.forEach(node => {
              node.roadSegments.push(segment.id);
            });

            segments.push(segment);
          }
        }

        resByHex[hexId].segments = segments;
        resByHex[hexId].clusters = createClusters(segments, 225, 270);
        resByHex[hexId].totalNodes = resByHex[hexId].nodes.length;
      }
    }

    console.log('Final result - Total hexes processed:', Object.keys(resByHex).length);
    console.log('Clusters per hex:', Object.entries(resByHex).map(([hexId, result]) => `${hexId}: ${result.clusters.length}`));
    
    return NextResponse.json({ hexes: resByHex });
  } catch (e) {
    console.error('Error in polygon nodes API:', e);
    return NextResponse.json({ hexes: {} });
  }
}
