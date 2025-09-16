import { NextRequest, NextResponse } from 'next/server';
import { cellToBoundary } from 'h3-js';
import type { LatLng, OSMNode, RoadSegment, NodeCluster } from '@/app/osm-actions';

function calculateDistance(point1: LatLng, point2: LatLng): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  const x = point.lng;
  const y = point.lat;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function generateGridNodesInHexagon(boundary: LatLng[], spacing: number = 0.002): OSMNode[] {
  // Find bounding box
  const minLat = Math.min(...boundary.map(p => p.lat));
  const maxLat = Math.max(...boundary.map(p => p.lat));
  const minLng = Math.min(...boundary.map(p => p.lng));
  const maxLng = Math.max(...boundary.map(p => p.lng));

  const nodes: OSMNode[] = [];
  let nodeId = 1;

  // Generate grid points within the hexagon
  for (let lat = minLat; lat <= maxLat; lat += spacing) {
    for (let lng = minLng; lng <= maxLng; lng += spacing) {
      const point = { lat, lng };
      if (isPointInPolygon(point, boundary)) {
        nodes.push({
          id: `gm_simple_node_${nodeId++}`,
          lat: point.lat,
          lng: point.lng,
          roadSegments: [], // Will be populated when creating segments
        });
      }
    }
  }

  console.log(`Generated ${nodes.length} grid nodes within hexagon`);
  return nodes;
}

function createRoadSegments(nodes: OSMNode[], maxSegmentDistance: number = 300): RoadSegment[] {
  const segments: RoadSegment[] = [];
  const processedPairs = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const node1 = nodes[i];
      const node2 = nodes[j];
      
      const distance = calculateDistance(node1, node2);
      
      if (distance <= maxSegmentDistance) {
        const pairKey = `${Math.min(i, j)}_${Math.max(i, j)}`;
        
        if (!processedPairs.has(pairKey)) {
          processedPairs.add(pairKey);

          const segment: RoadSegment = {
            id: `gm_simple_segment_${segments.length + 1}`,
            nodes: [node1, node2],
            lengthMeters: distance,
            wayId: `gm_simple_way_${segments.length + 1}`,
          };

          segments.push(segment);

          // Update nodes to reference this segment
          node1.roadSegments.push(segment.id);
          node2.roadSegments.push(segment.id);
        }
      }
    }
  }

  console.log(`Created ${segments.length} road segments from ${nodes.length} nodes`);
  return segments;
}

function createClusters(segments: RoadSegment[], minLength: number = 225, maxLength: number = 270): NodeCluster[] {
  console.log(`Creating clusters from ${segments.length} segments`);
  
  if (segments.length === 0) return [];

  const clusters: NodeCluster[] = [];
  const usedSegments = new Set<string>();

  // Build adjacency map for segments
  const segmentGraph = new Map<string, Set<string>>();
  const nodeToSegments = new Map<string, string[]>();

  // Build node-to-segments mapping
  segments.forEach(segment => {
    segment.nodes.forEach(node => {
      if (!nodeToSegments.has(node.id)) {
        nodeToSegments.set(node.id, []);
      }
      nodeToSegments.get(node.id)!.push(segment.id);
    });
  });

  // Build segment adjacency graph
  segments.forEach(segment => {
    segmentGraph.set(segment.id, new Set());
    
    segment.nodes.forEach(node => {
      const connectedSegments = nodeToSegments.get(node.id) || [];
      connectedSegments.forEach(connectedSegmentId => {
        if (connectedSegmentId !== segment.id) {
          segmentGraph.get(segment.id)!.add(connectedSegmentId);
        }
      });
    });
  });

  // Create clusters using graph traversal
  segments.forEach(startSegment => {
    if (usedSegments.has(startSegment.id)) return;

    const clusterSegments: RoadSegment[] = [];
    const clusterNodes = new Map<string, OSMNode>();
    let totalLength = 0;

    // BFS to find connected segments within length constraints
    const queue = [startSegment.id];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const segmentId = queue.shift()!;
      if (visited.has(segmentId) || usedSegments.has(segmentId)) continue;
      
      const segment = segments.find(s => s.id === segmentId);
      if (!segment) continue;

      // Check if adding this segment would exceed max length
      if (totalLength + segment.lengthMeters > maxLength) continue;

      visited.add(segmentId);
      clusterSegments.push(segment);
      totalLength += segment.lengthMeters;

      // Add nodes to cluster
      segment.nodes.forEach(node => {
        clusterNodes.set(node.id, node);
      });

      // Add connected segments to queue if we haven't reached max length
      if (totalLength < maxLength) {
        const connectedSegments = segmentGraph.get(segmentId) || new Set();
        connectedSegments.forEach(connectedId => {
          if (!visited.has(connectedId)) {
            queue.push(connectedId);
          }
        });
      }
    }

    // Create cluster if it meets minimum length requirement
    if (totalLength >= minLength && clusterSegments.length > 0) {
      // Mark segments as used
      clusterSegments.forEach(segment => {
        usedSegments.add(segment.id);
      });

      // Calculate centroid
      const allNodes = Array.from(clusterNodes.values());
      const centroid = {
        lat: allNodes.reduce((sum, node) => sum + node.lat, 0) / allNodes.length,
        lng: allNodes.reduce((sum, node) => sum + node.lng, 0) / allNodes.length,
      };

      const cluster: NodeCluster = {
        id: `gm_simple_cluster_${clusters.length + 1}`,
        nodes: allNodes,
        totalLengthMeters: totalLength,
        segments: clusterSegments,
        centroid,
      };

      clusters.push(cluster);
    }
  });

  console.log(`Created ${clusters.length} clusters`);
  return clusters;
}

export async function POST(req: NextRequest) {
  try {
    const { hexIndex } = await req.json();
    if (!hexIndex) {
      return NextResponse.json({ error: 'hexIndex required' }, { status: 400 });
    }

    console.log('=== Google Maps Nodes (Simple) API Request ===');
    console.log('Hex Index:', hexIndex);

    // Convert hex index to boundary coordinates
    const boundaryLngLat = cellToBoundary(hexIndex, true);
    const boundary: LatLng[] = boundaryLngLat.map(([lng, lat]) => ({ lat, lng }));

    // Generate nodes using a simple grid approach
    const nodes = generateGridNodesInHexagon(boundary);

    // Create road segments connecting nearby nodes
    const segments = createRoadSegments(nodes);

    // Create clusters from the segments
    const clusters = createClusters(segments);

    console.log('=== Google Maps Nodes (Simple) API Response ===');
    console.log('Total nodes:', nodes.length);
    console.log('Total segments:', segments.length);
    console.log('Total clusters:', clusters.length);

    return NextResponse.json({
      hexIndex,
      nodes,
      segments,
      clusters,
      totalNodes: nodes.length,
    });

  } catch (error) {
    console.error('❌ Error in Google Maps nodes (simple) API:', error);
    return NextResponse.json({
      error: 'Failed to fetch nodes data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
