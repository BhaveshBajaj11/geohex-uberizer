// This file is now a thin client wrapper around API routes.
import * as turf from '@turf/turf';

export type LatLng = { lat: number; lng: number };
export type RoadsInHexResult = { hexIndex: string; polylines: LatLng[][]; totalMeters: number };

// Node and clustering types
export type OSMNode = {
  id: string;
  lat: number;
  lng: number;
  roadSegments: string[]; // IDs of road segments this node belongs to
};

export type RoadSegment = {
  id: string;
  nodes: OSMNode[];
  lengthMeters: number;
  wayId: string;
};

export type NodeCluster = {
  id: string;
  nodes: OSMNode[];
  totalLengthMeters: number;
  segments: RoadSegment[];
  centroid: LatLng;
};

export type NodesInHexResult = {
  hexIndex: string;
  nodes: OSMNode[];
  segments: RoadSegment[];
  clusters: NodeCluster[];
  totalNodes: number;
};

// Graph types for routing
export type GraphEdge = {
  from: string; // node ID
  to: string; // node ID
  weight: number; // distance in meters
  segmentId: string;
};

export type GraphNode = {
  id: string;
  lat: number;
  lng: number;
  edges: GraphEdge[];
  clusterId?: string;
};

export type RoadGraph = {
  nodes: Map<string, GraphNode>;
  clusters: NodeCluster[];
  adjacencyMatrix: number[][]; // cluster-to-cluster distances
};

// Node joining types for creating paths with specific length constraints
export type NodePath = {
  id: string;
  nodes: OSMNode[];
  totalLengthMeters: number;
  pathType: 'optimal' | 'suboptimal' | 'too_short' | 'too_long';
  color: string;
};

export type NodeJoiningResult = {
  hexIndex: string;
  paths: NodePath[];
  totalPaths: number;
  optimalPaths: number;
  suboptimalPaths: number;
};

export async function getRoadsForHexagon(hexIndex: string): Promise<RoadsInHexResult> {
  const res = await fetch('/api/osm/hex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hexIndex })
  });
  if (!res.ok) throw new Error('Failed to fetch roads');
  return res.json();
}

export async function prefetchRoadsForHexagons(hexIndexes: string[], concurrency = 4): Promise<Record<string, RoadsInHexResult>> {
  const res = await fetch('/api/osm/prefetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hexIndexes, concurrency })
  });
  if (!res.ok) throw new Error('Failed to prefetch roads');
  return res.json();
}

export async function getRoadsForPolygon(polygon: LatLng[], hexIndexes: string[]): Promise<Record<string, { polylines: LatLng[][]; totalMeters: number }>> {
  const res = await fetch('/api/osm/polygon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon, hexIndexes })
  });
  if (!res.ok) throw new Error('Failed to fetch polygon roads');
  const json = await res.json();
  return json.hexes || {};
}

export async function getNodesForHexagon(hexIndex: string): Promise<NodesInHexResult> {
  const res = await fetch('/api/osm/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hexIndex })
  });
  if (!res.ok) throw new Error('Failed to fetch nodes');
  return res.json();
}

export async function getNodesForPolygon(polygon: LatLng[], hexIndexes: string[]): Promise<Record<string, NodesInHexResult>> {
  const res = await fetch('/api/osm/nodes-polygon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon, hexIndexes })
  });
  if (!res.ok) throw new Error('Failed to fetch polygon nodes');
  const json = await res.json();
  return json.hexes || {};
}

// Utility functions for graph operations
export function calculateDistance(point1: LatLng, point2: LatLng): number {
  // Use the same approach as the existing nodes API for consistency
  const line = turf.lineString([[point1.lng, point1.lat], [point2.lng, point2.lat]]);
  return turf.length(line, { units: 'meters' });
}

export function buildRoadGraph(nodesResult: NodesInHexResult): RoadGraph {
  const graphNodes = new Map<string, GraphNode>();
  
  // Create graph nodes from OSM nodes
  for (const osmNode of nodesResult.nodes) {
    const graphNode: GraphNode = {
      id: osmNode.id,
      lat: osmNode.lat,
      lng: osmNode.lng,
      edges: []
    };
    graphNodes.set(osmNode.id, graphNode);
  }
  
  // Add cluster information to nodes
  for (const cluster of nodesResult.clusters) {
    for (const node of cluster.nodes) {
      const graphNode = graphNodes.get(node.id);
      if (graphNode) {
        graphNode.clusterId = cluster.id;
      }
    }
  }
  
  // Create edges from road segments
  for (const segment of nodesResult.segments) {
    for (let i = 0; i < segment.nodes.length - 1; i++) {
      const fromNode = segment.nodes[i];
      const toNode = segment.nodes[i + 1];
      const distance = calculateDistance(fromNode, toNode);
      
      const fromGraphNode = graphNodes.get(fromNode.id);
      const toGraphNode = graphNodes.get(toNode.id);
      
      if (fromGraphNode && toGraphNode) {
        // Add edge in both directions (roads are bidirectional)
        fromGraphNode.edges.push({
          from: fromNode.id,
          to: toNode.id,
          weight: distance,
          segmentId: segment.id
        });
        
        toGraphNode.edges.push({
          from: toNode.id,
          to: fromNode.id,
          weight: distance,
          segmentId: segment.id
        });
      }
    }
  }
  
  // Build adjacency matrix for clusters
  const clusters = nodesResult.clusters;
  const adjacencyMatrix: number[][] = Array(clusters.length)
    .fill(null)
    .map(() => Array(clusters.length).fill(Infinity));
    
  // Set diagonal to 0 (cluster to itself)
  for (let i = 0; i < clusters.length; i++) {
    adjacencyMatrix[i][i] = 0;
  }
  
  // Calculate shortest distances between clusters using their centroids
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const distance = calculateDistance(clusters[i].centroid, clusters[j].centroid);
      adjacencyMatrix[i][j] = distance;
      adjacencyMatrix[j][i] = distance;
    }
  }
  
  return {
    nodes: graphNodes,
    clusters,
    adjacencyMatrix
  };
}

export function findShortestPathBetweenClusters(
  graph: RoadGraph,
  fromClusterId: string,
  toClusterId: string
): { path: string[]; distance: number } | null {
  const fromCluster = graph.clusters.find(c => c.id === fromClusterId);
  const toCluster = graph.clusters.find(c => c.id === toClusterId);
  
  if (!fromCluster || !toCluster) {
    return null;
  }
  
  // Use Dijkstra's algorithm for pathfinding
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set<string>();
  
  // Initialize distances
  for (const [nodeId] of graph.nodes) {
    distances.set(nodeId, Infinity);
    unvisited.add(nodeId);
  }
  
  // Set distance to 0 for all nodes in the starting cluster
  for (const node of fromCluster.nodes) {
    distances.set(node.id, 0);
  }
  
  while (unvisited.size > 0) {
    // Find unvisited node with smallest distance
    let current: string | null = null;
    let minDistance = Infinity;
    
    for (const nodeId of unvisited) {
      const dist = distances.get(nodeId) || Infinity;
      if (dist < minDistance) {
        minDistance = dist;
        current = nodeId;
      }
    }
    
    if (!current || minDistance === Infinity) break;
    
    unvisited.delete(current);
    
    // Check if we reached the target cluster
    const currentNode = graph.nodes.get(current);
    if (currentNode?.clusterId === toClusterId) {
      // Reconstruct path
      const path: string[] = [];
      let step: string | undefined = current;
      
      while (step) {
        path.unshift(step);
        step = previous.get(step);
      }
      
      return { path, distance: minDistance };
    }
    
    // Update distances to neighbors
    const node = graph.nodes.get(current);
    if (node) {
      for (const edge of node.edges) {
        if (unvisited.has(edge.to)) {
          const newDistance = minDistance + edge.weight;
          const currentDistance = distances.get(edge.to) || Infinity;
          
          if (newDistance < currentDistance) {
            distances.set(edge.to, newDistance);
            previous.set(edge.to, current);
          }
        }
      }
    }
  }
  
  return null;
}

// Simplified node pathfinding - find direct connections within distance range
export function createNodePaths(
  nodes: OSMNode[], 
  minLength: number = 225, 
  maxLength: number = 270
): NodePath[] {
  console.log(`🔍 createNodePaths: Starting with ${nodes.length} nodes, range ${minLength}-${maxLength}m`);
  
  if (nodes.length < 2) {
    console.log('❌ createNodePaths: Not enough nodes (< 2)');
    return [];
  }
  
  // Debug: Log some sample distances
  if (nodes.length >= 2) {
    const sampleDistance = calculateDistance(nodes[0], nodes[1]);
    console.log(`📏 Sample distance between first two nodes: ${sampleDistance.toFixed(2)}m`);
  }
  
  const paths: NodePath[] = [];
  const usedNodes = new Set<string>();
  
  // Find all direct connections within the distance range
  for (let i = 0; i < nodes.length; i++) {
    if (usedNodes.has(nodes[i].id)) continue;
    
    for (let j = i + 1; j < nodes.length; j++) {
      if (usedNodes.has(nodes[j].id)) continue;
      
      const distance = calculateDistance(nodes[i], nodes[j]);
      console.log(`📏 Distance between nodes ${i} and ${j}: ${distance.toFixed(2)}m`);
      
      if (distance >= minLength && distance <= maxLength) {
        const path = createNodePath([nodes[i], nodes[j]], distance);
        paths.push(path);
        usedNodes.add(nodes[i].id);
        usedNodes.add(nodes[j].id);
        console.log(`✅ Created path: ${nodes[i].id} -> ${nodes[j].id} (${distance.toFixed(2)}m)`);
        break; // Only create one path per starting node
      }
    }
  }
  
  console.log(`✅ Final result: ${paths.length} direct connection paths`);
  return paths;
}


function createNodePath(nodes: OSMNode[], length: number): NodePath {
  const pathType = length >= 225 && length <= 270 ? 'optimal' : 
                   length < 225 ? 'too_short' : 'too_long';
  
  const color = pathType === 'optimal' ? '#10b981' : 
                pathType === 'too_short' ? '#f59e0b' : '#ef4444';
  
  return {
    id: `path_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    nodes,
    totalLengthMeters: length,
    pathType,
    color
  };
}


// Test function to verify distance calculations
export function testDistanceCalculation(): void {
  console.log('🧪 Testing distance calculation...');
  
  // Test with known coordinates (roughly 1km apart)
  const node1: OSMNode = { id: '1', lat: 40.7128, lng: -74.0060, roadSegments: [] };
  const node2: OSMNode = { id: '2', lat: 40.7218, lng: -74.0060, roadSegments: [] };
  
  const distance = calculateDistance(node1, node2);
  console.log(`📏 Distance between test nodes: ${distance.toFixed(2)}m (expected ~1000m)`);
  
  // Test with nodes that should be in our range
  const node3: OSMNode = { id: '3', lat: 40.7128, lng: -74.0060, roadSegments: [] };
  const node4: OSMNode = { id: '4', lat: 40.7148, lng: -74.0060, roadSegments: [] };
  
  const distance2 = calculateDistance(node3, node4);
  console.log(`📏 Distance between closer nodes: ${distance2.toFixed(2)}m (should be ~222m)`);
  
  // Test pathfinding with these nodes
  const testNodes = [node3, node4];
  const testPaths = createNodePaths(testNodes, 225, 270);
  console.log(`🎯 Test pathfinding result: ${testPaths.length} paths found`);
}

export async function getNodePathsForPolygon(
  polygon: LatLng[], 
  hexIndexes: string[]
): Promise<Record<string, NodeJoiningResult>> {
  const res = await fetch('/api/osm/node-paths', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon, hexIndexes })
  });
  if (!res.ok) throw new Error('Failed to fetch node paths');
  const json = await res.json();
  return json.hexes || {};
}


