import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@googlemaps/google-maps-services-js';
import type { LatLng } from '@/app/osm-actions';

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

function isRoadSegmentInPolygon(segment: LatLng[], polygon: LatLng[]): boolean {
  // Check if both endpoints are in the polygon
  const startInPolygon = isPointInPolygon(segment[0], polygon);
  const endInPolygon = isPointInPolygon(segment[1], polygon);
  
  // Road segment is valid if at least one endpoint is in the polygon
  // This allows roads that cross the polygon boundary
  return startInPolygon || endInPolygon;
}

function generateSamplePointsInPolygon(polygon: LatLng[], numPoints: number): LatLng[] {
  // Find bounding box
  const minLat = Math.min(...polygon.map(p => p.lat));
  const maxLat = Math.max(...polygon.map(p => p.lat));
  const minLng = Math.min(...polygon.map(p => p.lng));
  const maxLng = Math.max(...polygon.map(p => p.lng));

  const points: LatLng[] = [];
  
  // Calculate grid size based on polygon area
  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;
  const area = latRange * lngRange;
  const gridSize = Math.sqrt(area / numPoints);
  
  // Generate grid-based points first (more systematic)
  const latSteps = Math.ceil(latRange / gridSize);
  const lngSteps = Math.ceil(lngRange / gridSize);
  
  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lngSteps; j++) {
      const lat = minLat + (i + 0.5) * gridSize;
      const lng = minLng + (j + 0.5) * gridSize;
      const point = { lat, lng };

      if (isPointInPolygon(point, polygon)) {
        points.push(point);
      }
    }
  }
  
  // Add some random points to fill remaining slots
  let attempts = 0;
  const maxAttempts = (numPoints - points.length) * 5;
  
  while (points.length < numPoints && attempts < maxAttempts) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lng = minLng + Math.random() * (maxLng - minLng);
    const point = { lat, lng };

    if (isPointInPolygon(point, polygon)) {
      points.push(point);
    }
    attempts++;
  }

  return points;
}

async function getRoadsForPolygonUsingGoogleRoadsAPI(polygon: LatLng[]): Promise<LatLng[][]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('❌ Google Maps API key not found in environment variables');
    throw new Error('Google Maps API key not configured');
  }
  
  console.log('✅ Using Google Roads API for polygon road data');

  try {
    // Generate sample points within the polygon boundary with better distribution
    const samplePoints = generateSamplePointsInPolygon(polygon, 100); // Reduced to avoid API limits
    console.log(`📍 Generated ${samplePoints.length} sample points within polygon`);

    if (samplePoints.length === 0) {
      console.warn('⚠️ No sample points generated within polygon boundary');
      return [];
    }

    // Process points in batches to avoid API limits
    const batchSize = 50; // Google Roads API limit is typically 100 points per request
    const allSnappedPoints: any[] = [];
    
    for (let i = 0; i < samplePoints.length; i += batchSize) {
      const batch = samplePoints.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(samplePoints.length/batchSize)} with ${batch.length} points`);
      
      try {
        const roadsResponse = await client.snapToRoads({
          params: {
            path: batch.map(p => `${p.lat},${p.lng}`),
            interpolate: true, // Interpolate additional points along the road
            key: apiKey,
          },
        });
        
        if (roadsResponse.data.snappedPoints) {
          allSnappedPoints.push(...roadsResponse.data.snappedPoints);
        }
        
        // Small delay between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (batchError) {
        console.warn(`⚠️ Batch ${Math.floor(i/batchSize) + 1} failed:`, batchError);
        continue;
      }
    }
    
    console.log(`🛣️ Google Roads API returned ${allSnappedPoints.length} total snapped points from ${Math.ceil(samplePoints.length/batchSize)} batches`);

    if (allSnappedPoints.length === 0) {
      console.warn('⚠️ No roads found by Google Roads API');
      return [];
    }

    // Convert snapped points to road segments with better filtering
    const roadSegments: LatLng[][] = [];
    const snappedPoints = allSnappedPoints;

    // Group points by placeId to identify actual road segments
    const pointsByPlaceId = new Map<string, typeof snappedPoints>();
    
    for (const point of snappedPoints) {
      if (point.placeId) {
        if (!pointsByPlaceId.has(point.placeId)) {
          pointsByPlaceId.set(point.placeId, []);
        }
        pointsByPlaceId.get(point.placeId)!.push(point);
      }
    }

    console.log(`🛣️ Found ${pointsByPlaceId.size} unique road segments by placeId`);

    // Create road segments from points with the same placeId
    for (const [placeId, points] of pointsByPlaceId) {
      if (points.length < 2) continue;

      // Sort points by originalIndex to maintain order
      const sortedPoints = points.sort((a, b) => (a.originalIndex || 0) - (b.originalIndex || 0));

      // Create segments connecting consecutive points on the same road
      for (let i = 0; i < sortedPoints.length - 1; i++) {
        const currentPoint = sortedPoints[i];
        const nextPoint = sortedPoints[i + 1];

        if (currentPoint.location && nextPoint.location) {
          const segment: LatLng[] = [
            { lat: currentPoint.location.latitude, lng: currentPoint.location.longitude },
            { lat: nextPoint.location.latitude, lng: nextPoint.location.longitude }
          ];

          // Filter out segments that are too long (likely connecting different roads)
          const segmentDistance = calculateDistance(segment[0], segment[1]);
          if (segmentDistance > 200) { // Skip segments longer than 200m
            console.log(`⚠️ Skipping long segment: ${segmentDistance.toFixed(0)}m`);
            continue;
          }

          // Only include segments that are within or intersect the polygon boundary
          if (isRoadSegmentInPolygon(segment, polygon)) {
            roadSegments.push(segment);
          }
        }
      }
    }

    // Also try nearestRoads API for additional road coverage
    try {
      const allNearestPoints: any[] = [];
      
      for (let i = 0; i < samplePoints.length; i += batchSize) {
        const batch = samplePoints.slice(i, i + batchSize);
        
        try {
          const nearestRoadsResponse = await client.nearestRoads({
            params: {
              points: batch.map(p => `${p.lat},${p.lng}`),
              key: apiKey,
            },
          });
          
          if (nearestRoadsResponse.data.snappedPoints) {
            allNearestPoints.push(...nearestRoadsResponse.data.snappedPoints);
          }
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (batchError) {
          console.warn(`⚠️ Nearest Roads batch ${Math.floor(i/batchSize) + 1} failed:`, batchError);
          continue;
        }
      }

      console.log(`🛣️ Google Nearest Roads API returned ${allNearestPoints.length} nearest road points`);

      if (allNearestPoints.length > 0) {
        const nearestPoints = allNearestPoints;
        
        // Group nearest road points by placeId for better filtering
        const nearestPointsByPlaceId = new Map<string, typeof nearestPoints>();
        
        for (const point of nearestPoints) {
          if (point.placeId) {
            if (!nearestPointsByPlaceId.has(point.placeId)) {
              nearestPointsByPlaceId.set(point.placeId, []);
            }
            nearestPointsByPlaceId.get(point.placeId)!.push(point);
          }
        }

        // Create additional segments from nearest roads with same filtering
        for (const [placeId, points] of nearestPointsByPlaceId) {
          if (points.length < 2) continue;

          const sortedPoints = points.sort((a, b) => (a.originalIndex || 0) - (b.originalIndex || 0));

          for (let i = 0; i < sortedPoints.length - 1; i++) {
            const currentPoint = sortedPoints[i];
            const nextPoint = sortedPoints[i + 1];

            if (currentPoint.location && nextPoint.location) {
              const segment: LatLng[] = [
                { lat: currentPoint.location.latitude, lng: currentPoint.location.longitude },
                { lat: nextPoint.location.latitude, lng: nextPoint.location.longitude }
              ];

              // Filter out segments that are too long
              const segmentDistance = calculateDistance(segment[0], segment[1]);
              if (segmentDistance > 200) {
                continue;
              }

              if (isRoadSegmentInPolygon(segment, polygon)) {
                // Check if this segment is already included
                const isDuplicate = roadSegments.some(existing => 
                  calculateDistance(existing[0], segment[0]) < 10 && 
                  calculateDistance(existing[1], segment[1]) < 10
                );
                
                if (!isDuplicate) {
                  roadSegments.push(segment);
                }
              }
            }
          }
        }
      }
    } catch (nearestRoadsError) {
      console.warn('⚠️ Nearest Roads API failed:', nearestRoadsError);
    }

    console.log(`🛣️ Created ${roadSegments.length} road segments from Google Roads API for polygon`);
    return roadSegments;

  } catch (error) {
    console.error('❌ Error using Google Roads API for polygon:', error);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const { polygon } = await req.json();
    if (!polygon || !Array.isArray(polygon) || polygon.length < 3) {
      return NextResponse.json({ error: 'Valid polygon coordinates required' }, { status: 400 });
    }

    console.log('=== Google Roads API (Polygon) Request ===');
    console.log('Polygon points:', polygon.length);

    // Get roads for the entire polygon using Google Roads API
    const roadSegments = await getRoadsForPolygonUsingGoogleRoadsAPI(polygon);

    // Calculate total length
    const totalMeters = roadSegments.reduce((sum, segment) => {
      return sum + calculateDistance(segment[0], segment[1]);
    }, 0);

    console.log(`📊 Response: ${roadSegments.length} segments, ${totalMeters.toFixed(0)}m total`);

    return NextResponse.json({
      polylines: roadSegments,
      totalMeters,
      segmentCount: roadSegments.length,
    });

  } catch (error) {
    console.error('❌ Error in Google Roads API (polygon):', error);
    return NextResponse.json({
      error: 'Failed to fetch roads data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
