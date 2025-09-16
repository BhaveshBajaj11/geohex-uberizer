import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@googlemaps/google-maps-services-js';
import { cellToBoundary } from 'h3-js';
import type { LatLng } from '@/app/osm-actions';

const client = new Client({});

type RoadSegment = {
  id: string;
  path: LatLng[];
  lengthMeters: number;
};

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

async function getRoadsInArea(boundary: LatLng[]): Promise<RoadSegment[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('❌ Google Maps API key not found in environment variables');
    throw new Error('Google Maps API key not configured');
  }
  
  console.log('✅ API key found, proceeding with Google Maps API calls');

  try {
    // Calculate center and approximate radius of the hexagon
    const centerLat = boundary.reduce((sum, p) => sum + p.lat, 0) / boundary.length;
    const centerLng = boundary.reduce((sum, p) => sum + p.lng, 0) / boundary.length;
    const center = { lat: centerLat, lng: centerLng };

    // Calculate max distance from center to any boundary point for radius
    const radius = Math.max(...boundary.map(p => calculateDistance(center, p)));

    // Use Places API to find roads near the center
    const placesResponse = await client.placesNearby({
      params: {
        location: center,
        radius: Math.min(radius * 1.5, 5000), // Cap at 5km for API limits
        type: 'route', // This finds roads/routes
        key: apiKey,
      },
    });

    const roadSegments: RoadSegment[] = [];

    // For each road found, get more detailed information
    for (const place of placesResponse.data.results) {
      if (!place.place_id) continue;

      try {
        // Get place details including geometry
        const placeDetails = await client.placeDetails({
          params: {
            place_id: place.place_id,
            fields: ['geometry', 'name', 'types'],
            key: apiKey,
          },
        });

        const location = placeDetails.data.result.geometry?.location;
        if (!location) continue;

        const roadPoint = { lat: location.lat, lng: location.lng };

        // Check if this road point is within our hexagon boundary
        if (isPointInPolygon(roadPoint, boundary)) {
          // For now, create a simple road segment
          // In a more sophisticated implementation, you might use Roads API
          // to get the actual road geometry
          roadSegments.push({
            id: place.place_id,
            path: [roadPoint],
            lengthMeters: 0, // Would need additional API calls to calculate
          });
        }
      } catch (error) {
        console.warn(`Error getting details for place ${place.place_id}:`, error);
        continue;
      }
    }

    // Alternative approach: Use Roads API with sample points
    // This is more accurate but requires generating sample points within the hexagon
    const samplePoints = generateSamplePointsInHexagon(boundary, 20);
    
    for (let i = 0; i < samplePoints.length - 1; i += 2) {
      try {
        const point1 = samplePoints[i];
        const point2 = samplePoints[i + 1];

        // Use Roads API to snap points to roads and get the path between them
        const roadsResponse = await client.snapToRoads({
          params: {
            path: [point1, point2],
            interpolate: true,
            key: apiKey,
          },
        });

        if (roadsResponse.data.snappedPoints && roadsResponse.data.snappedPoints.length > 1) {
          const pathPoints = roadsResponse.data.snappedPoints.map(sp => ({
            lat: sp.location.latitude,
            lng: sp.location.longitude,
          }));

          // Calculate total length
          let totalLength = 0;
          for (let j = 0; j < pathPoints.length - 1; j++) {
            totalLength += calculateDistance(pathPoints[j], pathPoints[j + 1]);
          }

          // Filter out points outside the hexagon
          const filteredPath = pathPoints.filter(p => isPointInPolygon(p, boundary));
          
          if (filteredPath.length >= 2) {
            roadSegments.push({
              id: `road_${i}_${Date.now()}`,
              path: filteredPath,
              lengthMeters: totalLength,
            });
          }
        }
      } catch (error) {
        console.warn(`Error snapping roads for points ${i}:`, error);
        continue;
      }
    }

    return roadSegments;
  } catch (error) {
    console.error('Error fetching roads from Google Maps:', error);
    return [];
  }
}

function generateSamplePointsInHexagon(boundary: LatLng[], numPoints: number): LatLng[] {
  // Find bounding box
  const minLat = Math.min(...boundary.map(p => p.lat));
  const maxLat = Math.max(...boundary.map(p => p.lat));
  const minLng = Math.min(...boundary.map(p => p.lng));
  const maxLng = Math.max(...boundary.map(p => p.lng));

  const points: LatLng[] = [];
  let attempts = 0;
  const maxAttempts = numPoints * 10;

  while (points.length < numPoints && attempts < maxAttempts) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lng = minLng + Math.random() * (maxLng - minLng);
    const point = { lat, lng };

    if (isPointInPolygon(point, boundary)) {
      points.push(point);
    }
    attempts++;
  }

  return points;
}

export async function POST(req: NextRequest) {
  try {
    const { hexIndex } = await req.json();
    if (!hexIndex) {
      return NextResponse.json({ error: 'hexIndex required' }, { status: 400 });
    }

    console.log('=== Google Maps Roads API Request ===');
    console.log('Hex Index:', hexIndex);
    console.log('API Key configured:', !!process.env.GOOGLE_MAPS_API_KEY);
    console.log('API Key length:', process.env.GOOGLE_MAPS_API_KEY?.length || 0);

    // Convert hex index to boundary coordinates
    const boundaryLngLat = cellToBoundary(hexIndex, true);
    const boundary: LatLng[] = boundaryLngLat.map(([lng, lat]) => ({ lat, lng }));

    // Get roads using Google Maps APIs
    const roadSegments = await getRoadsInArea(boundary);

    console.log('Found road segments:', roadSegments.length);

    // Convert to polylines format expected by the frontend
    const polylines: LatLng[][] = roadSegments.map(segment => segment.path);
    const totalMeters = roadSegments.reduce((sum, segment) => sum + segment.lengthMeters, 0);

    return NextResponse.json({
      hexIndex,
      polylines,
      totalMeters,
      segmentCount: roadSegments.length,
    });

  } catch (error) {
    console.error('Error in Google Maps roads API:', error);
    return NextResponse.json({
      error: 'Failed to fetch roads data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
