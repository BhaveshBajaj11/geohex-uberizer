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

function generateGridNodesInHexagon(boundary: LatLng[], spacing: number = 0.001): OSMNode[] {
  // Find bounding box
  const minLat = Math.min(...boundary.map(p => p.lat));
  const maxLat = Math.max(...boundary.map(p => p.lat));
  const minLng = Math.min(...boundary.map(p => p.lng));
  const maxLng = Math.max(...boundary.map(p => p.lng));

  const nodes: OSMNode[] = [];
  let nodeId = 1;

  // Generate denser grid points within the hexagon for better village road coverage
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

  // Add additional random points for more realistic village road patterns
  const additionalPoints = 20;
  let attempts = 0;
  const maxAttempts = additionalPoints * 10;

  while (nodes.length < (nodeId - 1 + additionalPoints) && attempts < maxAttempts) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lng = minLng + Math.random() * (maxLng - minLng);
    const point = { lat, lng };
    
    if (isPointInPolygon(point, boundary)) {
      // Check if point is not too close to existing nodes
      const tooClose = nodes.some(existing => 
        calculateDistance(existing, point) < 50 // At least 50m apart
      );
      
      if (!tooClose) {
        nodes.push({
          id: `gm_simple_node_${nodeId++}`,
          lat: point.lat,
          lng: point.lng,
          roadSegments: [],
        });
      }
    }
    attempts++;
  }

  console.log(`Generated ${nodes.length} grid nodes within hexagon (including ${additionalPoints} additional random points)`);
  return nodes;
}

function createRoadSegments(nodes: OSMNode[], maxSegmentDistance: number = 400): RoadSegment[] {
  const segments: RoadSegment[] = [];
  const processedPairs = new Set<string>();

  // Create road segments using multiple strategies for better village road coverage
  
  // Strategy 1: Connect nearby nodes (increased distance for village roads)
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

  // Strategy 2: Create grid-based road patterns for rural areas
  if (segments.length < 10) { // If we don't have many segments, create a grid
    console.log('🔧 Creating grid-based road patterns for rural areas');
    
    // Group nodes by approximate grid positions
    const gridSize = 0.002; // Grid cell size
    const gridMap = new Map<string, OSMNode[]>();
    
    nodes.forEach(node => {
      const gridKey = `${Math.floor(node.lat / gridSize)}_${Math.floor(node.lng / gridSize)}`;
      if (!gridMap.has(gridKey)) {
        gridMap.set(gridKey, []);
      }
      gridMap.get(gridKey)!.push(node);
    });
    
    // Create horizontal and vertical road connections
    const gridKeys = Array.from(gridMap.keys());
    
    // Horizontal connections (same latitude, different longitude)
    const latGroups = new Map<number, OSMNode[]>();
    nodes.forEach(node => {
      const latKey = Math.floor(node.lat / gridSize) * gridSize;
      if (!latGroups.has(latKey)) {
        latGroups.set(latKey, []);
      }
      latGroups.get(latKey)!.push(node);
    });
    
    latGroups.forEach(latNodes => {
      if (latNodes.length >= 2) {
        latNodes.sort((a, b) => a.lng - b.lng);
        for (let i = 0; i < latNodes.length - 1; i++) {
          const node1 = latNodes[i];
          const node2 = latNodes[i + 1];
          const distance = calculateDistance(node1, node2);
          
          if (distance <= maxSegmentDistance * 1.5) { // Allow longer segments for grid roads
            const pairKey = `${Math.min(nodes.indexOf(node1), nodes.indexOf(node2))}_${Math.max(nodes.indexOf(node1), nodes.indexOf(node2))}`;
            
            if (!processedPairs.has(pairKey)) {
              processedPairs.add(pairKey);
              
              const segment: RoadSegment = {
                id: `gm_grid_horizontal_${segments.length + 1}`,
                nodes: [node1, node2],
                lengthMeters: distance,
                wayId: `gm_grid_way_${segments.length + 1}`,
              };
              
              segments.push(segment);
              node1.roadSegments.push(segment.id);
              node2.roadSegments.push(segment.id);
            }
          }
        }
      }
    });
    
    // Vertical connections (same longitude, different latitude)
    const lngGroups = new Map<number, OSMNode[]>();
    nodes.forEach(node => {
      const lngKey = Math.floor(node.lng / gridSize) * gridSize;
      if (!lngGroups.has(lngKey)) {
        lngGroups.set(lngKey, []);
      }
      lngGroups.get(lngKey)!.push(node);
    });
    
    lngGroups.forEach(lngNodes => {
      if (lngNodes.length >= 2) {
        lngNodes.sort((a, b) => a.lat - b.lat);
        for (let i = 0; i < lngNodes.length - 1; i++) {
          const node1 = lngNodes[i];
          const node2 = lngNodes[i + 1];
          const distance = calculateDistance(node1, node2);
          
          if (distance <= maxSegmentDistance * 1.5) {
            const pairKey = `${Math.min(nodes.indexOf(node1), nodes.indexOf(node2))}_${Math.max(nodes.indexOf(node1), nodes.indexOf(node2))}`;
            
            if (!processedPairs.has(pairKey)) {
              processedPairs.add(pairKey);
              
              const segment: RoadSegment = {
                id: `gm_grid_vertical_${segments.length + 1}`,
                nodes: [node1, node2],
                lengthMeters: distance,
                wayId: `gm_grid_way_${segments.length + 1}`,
              };
              
              segments.push(segment);
              node1.roadSegments.push(segment.id);
              node2.roadSegments.push(segment.id);
            }
          }
        }
      }
    });
  }

  // Strategy 3: Connect isolated nodes to the nearest road network
  const isolatedNodes = nodes.filter(node => node.roadSegments.length === 0);
  if (isolatedNodes.length > 0) {
    console.log(`🔧 Connecting ${isolatedNodes.length} isolated nodes to road network`);
    
    isolatedNodes.forEach(isolatedNode => {
      let nearestNode: OSMNode | null = null;
      let minDistance = Infinity;
      
      // Find the nearest connected node
      nodes.forEach(node => {
        if (node.id !== isolatedNode.id && node.roadSegments.length > 0) {
          const distance = calculateDistance(isolatedNode, node);
          if (distance < minDistance && distance < maxSegmentDistance * 2) {
            minDistance = distance;
            nearestNode = node;
          }
        }
      });
      
      if (nearestNode) {
        const pairKey = `${Math.min(nodes.indexOf(isolatedNode), nodes.indexOf(nearestNode))}_${Math.max(nodes.indexOf(isolatedNode), nodes.indexOf(nearestNode))}`;
        
        if (!processedPairs.has(pairKey)) {
          processedPairs.add(pairKey);
          
          const segment: RoadSegment = {
            id: `gm_connector_${segments.length + 1}`,
            nodes: [isolatedNode, nearestNode],
            lengthMeters: minDistance,
            wayId: `gm_connector_way_${segments.length + 1}`,
          };
          
          segments.push(segment);
          isolatedNode.roadSegments.push(segment.id);
          nearestNode.roadSegments.push(segment.id);
        }
      }
    });
  }

  console.log(`Created ${segments.length} road segments from ${nodes.length} nodes (including grid patterns and connectors)`);
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
