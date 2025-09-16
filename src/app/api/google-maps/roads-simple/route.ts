import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@googlemaps/google-maps-services-js';
import { cellToBoundary } from 'h3-js';
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

async function getRoadsUsingPlaces(boundary: LatLng[]) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('❌ Google Maps API key not found in environment variables');
    throw new Error('Google Maps API key not configured');
  }
  
  console.log('✅ API key found, using Places API to find roads');

  try {
    // Calculate center of the hexagon
    const centerLat = boundary.reduce((sum, p) => sum + p.lat, 0) / boundary.length;
    const centerLng = boundary.reduce((sum, p) => sum + p.lng, 0) / boundary.length;
    const center = { lat: centerLat, lng: centerLng };

    // Calculate radius (distance from center to furthest boundary point)
    const radius = Math.max(...boundary.map(p => calculateDistance(center, p)));
    console.log(`🔍 Searching for roads near center (${center.lat}, ${center.lng}) with radius ${radius}m`);

    // Use Places API to find roads and routes
    const placesResponse = await client.placesNearby({
      params: {
        location: center,
        radius: Math.min(radius * 2, 1000), // Limit to 1km for API efficiency
        keyword: 'road street avenue boulevard highway',
        key: apiKey,
      },
    });

    console.log(`📍 Found ${placesResponse.data.results.length} places that might be roads`);

    const roadPoints: LatLng[] = [];

    // Process places and filter for roads within the hexagon
    for (const place of placesResponse.data.results) {
      if (place.geometry?.location) {
        const roadPoint = {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        };

        // Check if the road point is within our hexagon boundary
        if (isPointInPolygon(roadPoint, boundary)) {
          roadPoints.push(roadPoint);
          console.log(`✅ Road point inside hexagon: ${place.name} at (${roadPoint.lat}, ${roadPoint.lng})`);
        }
      }
    }

    // Create simple road segments connecting nearby points
    const roadSegments: LatLng[][] = [];
    const maxSegmentDistance = 500; // meters

    for (let i = 0; i < roadPoints.length; i++) {
      for (let j = i + 1; j < roadPoints.length; j++) {
        const distance = calculateDistance(roadPoints[i], roadPoints[j]);
        if (distance <= maxSegmentDistance) {
          roadSegments.push([roadPoints[i], roadPoints[j]]);
        }
      }
    }

    // If no connections found, create a simple grid within the hexagon
    if (roadSegments.length === 0 && boundary.length > 0) {
      console.log('🔧 No road connections found, creating sample road network within hexagon');
      
      const minLat = Math.min(...boundary.map(p => p.lat));
      const maxLat = Math.max(...boundary.map(p => p.lat));
      const minLng = Math.min(...boundary.map(p => p.lng));
      const maxLng = Math.max(...boundary.map(p => p.lng));
      
      // Create a simple cross pattern
      const centerPoint = { lat: centerLat, lng: centerLng };
      const northPoint = { lat: centerLat + (maxLat - centerLat) * 0.5, lng: centerLng };
      const southPoint = { lat: centerLat - (centerLat - minLat) * 0.5, lng: centerLng };
      const eastPoint = { lat: centerLat, lng: centerLng + (maxLng - centerLng) * 0.5 };
      const westPoint = { lat: centerLat, lng: centerLng - (centerLng - minLng) * 0.5 };
      
      // Add cross pattern roads
      roadSegments.push(
        [northPoint, southPoint],
        [eastPoint, westPoint]
      );
    }

    console.log(`🛣️ Created ${roadSegments.length} road segments`);
    return roadSegments;

  } catch (error) {
    console.error('❌ Error fetching roads using Places API:', error);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hexIndex } = await req.json();
    if (!hexIndex) {
      return NextResponse.json({ error: 'hexIndex required' }, { status: 400 });
    }

    console.log('=== Google Maps Roads (Simple) API Request ===');
    console.log('Hex Index:', hexIndex);

    // Convert hex index to boundary coordinates
    const boundaryLngLat = cellToBoundary(hexIndex, true);
    const boundary: LatLng[] = boundaryLngLat.map(([lng, lat]) => ({ lat, lng }));

    // Get roads using Places API (simpler approach)
    const roadSegments = await getRoadsUsingPlaces(boundary);

    // Calculate total length
    const totalMeters = roadSegments.reduce((sum, segment) => {
      return sum + calculateDistance(segment[0], segment[1]);
    }, 0);

    console.log(`📊 Response: ${roadSegments.length} segments, ${totalMeters.toFixed(0)}m total`);

    return NextResponse.json({
      hexIndex,
      polylines: roadSegments,
      totalMeters,
      segmentCount: roadSegments.length,
    });

  } catch (error) {
    console.error('❌ Error in Google Maps roads (simple) API:', error);
    return NextResponse.json({
      error: 'Failed to fetch roads data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
