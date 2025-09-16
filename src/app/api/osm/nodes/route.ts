import { NextResponse } from 'next/server';
import { cellToBoundary } from 'h3-js';
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
  const clusters: NodeCluster[] = [];
  const usedSegments = new Set<string>();
  
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
      
      clusters.push(cluster);
    }
  }
  
  // Second pass: create clusters from remaining shorter segments (even if below minimum)
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
    
    clusters.push(cluster);
    usedSegments.add(segment.id);
  }
  
  return clusters;
}

export async function POST(req: Request) {
  try {
    const { hexIndex } = await req.json();
    if (!hexIndex) return NextResponse.json({ error: 'hexIndex required' }, { status: 400 });

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
      return NextResponse.json({ hexIndex, nodes: [], segments: [], clusters: [], totalNodes: 0 });
    }

    const json = await resp.json();
    console.log('=== OSM Nodes API Response Debug ===');
    console.log('Hex Index:', hexIndex);
    console.log('Raw OSM elements count:', json?.elements?.length || 0);

    const nodes: OSMNode[] = [];
    const segments: RoadSegment[] = [];
    const nodeMap = new Map<string, OSMNode>();

    if (json && Array.isArray(json.elements)) {
      // Create TurfJS polygon for boundary checking
      const ring = boundary.map(p => [p.lng, p.lat]);
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push(first);
      }
      const turfPoly = turf.polygon([ring]);

      // First pass: collect all nodes
      for (const el of json.elements) {
        if (el.type === 'node' && el.lat && el.lon) {
          const nodePoint = turf.point([el.lon, el.lat]);
          
          // Check if node is within the hexagon
          if (turf.booleanPointInPolygon(nodePoint, turfPoly)) {
            const osmNode: OSMNode = {
              id: el.id.toString(),
              lat: el.lat,
              lng: el.lon,
              roadSegments: []
            };
            
            nodeMap.set(osmNode.id, osmNode);
            nodes.push(osmNode);
          }
        }
      }

      // Second pass: create road segments from ways
      for (const el of json.elements) {
        if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length > 1) {
          // Filter nodes that are within our hexagon and exist in our nodeMap
          const wayNodes = el.nodes
            .map((nodeId: number) => nodeMap.get(nodeId.toString()))
            .filter((node): node is OSMNode => node !== undefined);

          if (wayNodes.length > 1) {
            // Calculate total length of this way segment
            let totalLength = 0;
            for (let i = 0; i < wayNodes.length - 1; i++) {
              totalLength += calculateDistance(wayNodes[i], wayNodes[i + 1]);
            }

            const segment: RoadSegment = {
              id: `way_${el.id}`,
              nodes: wayNodes,
              lengthMeters: totalLength,
              wayId: el.id.toString()
            };

            // Update nodes to reference this segment
            wayNodes.forEach(node => {
              node.roadSegments.push(segment.id);
            });

            segments.push(segment);
          }
        }
      }
    }

    // Create clusters with optimal length between 225-270 meters
    const clusters = createClusters(segments, 225, 270);

    console.log('Processed nodes count:', nodes.length);
    console.log('Processed segments count:', segments.length);
    console.log('Created clusters count:', clusters.length);
    console.log('=== End Debug ===');

    return NextResponse.json({
      hexIndex,
      nodes,
      segments,
      clusters,
      totalNodes: nodes.length
    });
  } catch (e) {
    console.error('Error in nodes API:', e);
    return NextResponse.json({ hexIndex: null, nodes: [], segments: [], clusters: [], totalNodes: 0 });
  }
}
