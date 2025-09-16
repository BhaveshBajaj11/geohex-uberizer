import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@googlemaps/google-maps-services-js';
import { cellToBoundary } from 'h3-js';
import type { LatLng, OSMNode, RoadSegment, NodeCluster } from '@/app/osm-actions';

const client = new Client({});

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

function generateGridPointsInHexagon(boundary: LatLng[], spacing: number = 0.001): LatLng[] {
  // Find bounding box
  const minLat = Math.min(...boundary.map(p => p.lat));
  const maxLat = Math.max(...boundary.map(p => p.lat));
  const minLng = Math.min(...boundary.map(p => p.lng));
  const maxLng = Math.max(...boundary.map(p => p.lng));

  const points: LatLng[] = [];

  // Generate grid points
  for (let lat = minLat; lat <= maxLat; lat += spacing) {
    for (let lng = minLng; lng <= maxLng; lng += spacing) {
      const point = { lat, lng };
      if (isPointInPolygon(point, boundary)) {
        points.push(point);
      }
    }
  }

  return points;
}

async function getNodesInArea(boundary: LatLng[]): Promise<{ nodes: OSMNode[]; segments: RoadSegment[] }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    // Generate grid points within the hexagon for road snapping
    const gridPoints = generateGridPointsInHexagon(boundary, 0.0005); // Smaller spacing for more nodes
    console.log(`Generated ${gridPoints.length} grid points for road snapping`);

    const nodes: OSMNode[] = [];
    const segments: RoadSegment[] = [];
    const processedLocations = new Set<string>();

    // Process points in batches to avoid API limits
    const batchSize = 10;
    for (let i = 0; i < gridPoints.length; i += batchSize) {
      const batch = gridPoints.slice(i, i + batchSize);
      
      try {
        // Snap points to roads to find actual road locations
        const roadsResponse = await client.snapToRoads({
          params: {
            path: batch,
            interpolate: true,
            key: apiKey,
          },
        });

        if (roadsResponse.data.snappedPoints) {
          for (const snappedPoint of roadsResponse.data.snappedPoints) {
            const location = {
              lat: snappedPoint.location.latitude,
              lng: snappedPoint.location.longitude,
            };

            // Create a unique key for this location (rounded to avoid duplicates)
            const locationKey = `${location.lat.toFixed(6)}_${location.lng.toFixed(6)}`;
            
            if (!processedLocations.has(locationKey) && isPointInPolygon(location, boundary)) {
              processedLocations.add(locationKey);

              // Create a node for this road location
              const node: OSMNode = {
                id: `gm_node_${nodes.length + 1}_${Date.now()}`,
                lat: location.lat,
                lng: location.lng,
                roadSegments: [], // Will be populated when creating segments
              };

              nodes.push(node);
            }
          }
        }

        // Small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.warn(`Error processing batch ${i}:`, error);
        continue;
      }
    }

    console.log(`Found ${nodes.length} unique road nodes`);

    // Create road segments by connecting nearby nodes
    const maxSegmentDistance = 100; // meters
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
              id: `gm_segment_${segments.length + 1}_${Date.now()}`,
              nodes: [node1, node2],
              lengthMeters: distance,
              wayId: `gm_way_${segments.length + 1}`,
            };

            segments.push(segment);

            // Update nodes to reference this segment
            node1.roadSegments.push(segment.id);
            node2.roadSegments.push(segment.id);
          }
        }
      }
    }

    console.log(`Created ${segments.length} road segments`);

    return { nodes, segments };

  } catch (error) {
    console.error('Error fetching nodes from Google Maps:', error);
    return { nodes: [], segments: [] };
  }
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
        id: `gm_cluster_${clusters.length + 1}_${Date.now()}`,
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

    console.log('=== Google Maps Nodes API Request ===');
    console.log('Hex Index:', hexIndex);

    // Convert hex index to boundary coordinates
    const boundaryLngLat = cellToBoundary(hexIndex, true);
    const boundary: LatLng[] = boundaryLngLat.map(([lng, lat]) => ({ lat, lng }));

    // Get nodes and segments using Google Maps APIs
    const { nodes, segments } = await getNodesInArea(boundary);

    // Create clusters from the segments
    const clusters = createClusters(segments);

    console.log('=== Google Maps Nodes API Response ===');
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
    console.error('Error in Google Maps nodes API:', error);
    return NextResponse.json({
      error: 'Failed to fetch nodes data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
