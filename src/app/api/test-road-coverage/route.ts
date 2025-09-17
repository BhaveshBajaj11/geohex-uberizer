import { NextRequest, NextResponse } from 'next/server';
import { cellToBoundary } from 'h3-js';
import type { LatLng } from '@/app/osm-actions';

export async function POST(req: NextRequest) {
  try {
    const { hexIndex } = await req.json();
    if (!hexIndex) {
      return NextResponse.json({ error: 'hexIndex required' }, { status: 400 });
    }

    console.log('=== Testing Road Coverage ===');
    console.log('Hex Index:', hexIndex);

    // Convert hex index to boundary coordinates
    const boundaryLngLat = cellToBoundary(hexIndex, true);
    const boundary: LatLng[] = boundaryLngLat.map(([lng, lat]) => ({ lat, lng }));

    console.log('Hex boundary points:', boundary.length);
    console.log('Boundary coordinates:', boundary);

    // Test both road APIs
    const results = {
      hexIndex,
      boundary,
      roadTests: {} as any,
      nodeTests: {} as any
    };

    // Test roads-polygon API (new approach)
    try {
      console.log('🔍 Testing roads-polygon API...');
      const roadsResponse = await fetch(`${req.nextUrl.origin}/api/google-maps/roads-polygon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polygon: boundary })
      });
      
      if (roadsResponse.ok) {
        const roadsData = await roadsResponse.json();
        results.roadTests.polygon = {
          success: true,
          segmentCount: roadsData.segmentCount,
          totalMeters: roadsData.totalMeters,
          polylines: roadsData.polylines.length
        };
        console.log('✅ Roads-polygon API success:', results.roadTests.polygon);
      } else {
        results.roadTests.polygon = {
          success: false,
          error: await roadsResponse.text()
        };
        console.log('❌ Roads-polygon API failed:', results.roadTests.polygon.error);
      }
    } catch (error) {
      results.roadTests.polygon = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.log('❌ Roads-polygon API error:', error);
    }

    // Test roads-simple API (legacy)
    try {
      console.log('🔍 Testing roads-simple API (legacy)...');
      const roadsResponse = await fetch(`${req.nextUrl.origin}/api/google-maps/roads-simple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hexIndex })
      });
      
      if (roadsResponse.ok) {
        const roadsData = await roadsResponse.json();
        results.roadTests.simple = {
          success: true,
          segmentCount: roadsData.segmentCount,
          totalMeters: roadsData.totalMeters,
          polylines: roadsData.polylines.length
        };
        console.log('✅ Roads-simple API success:', results.roadTests.simple);
      } else {
        results.roadTests.simple = {
          success: false,
          error: await roadsResponse.text()
        };
        console.log('❌ Roads-simple API failed:', results.roadTests.simple.error);
      }
    } catch (error) {
      results.roadTests.simple = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.log('❌ Roads-simple API error:', error);
    }

    // Test nodes-simple API
    try {
      console.log('🔍 Testing nodes-simple API...');
      const nodesResponse = await fetch(`${req.nextUrl.origin}/api/google-maps/nodes-simple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hexIndex })
      });
      
      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json();
        results.nodeTests.simple = {
          success: true,
          totalNodes: nodesData.totalNodes,
          segmentCount: nodesData.segments.length,
          clusterCount: nodesData.clusters.length
        };
        console.log('✅ Nodes-simple API success:', results.nodeTests.simple);
      } else {
        results.nodeTests.simple = {
          success: false,
          error: await nodesResponse.text()
        };
        console.log('❌ Nodes-simple API failed:', results.nodeTests.simple.error);
      }
    } catch (error) {
      results.nodeTests.simple = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.log('❌ Nodes-simple API error:', error);
    }

    // Calculate hexagon area for context
    const minLat = Math.min(...boundary.map(p => p.lat));
    const maxLat = Math.max(...boundary.map(p => p.lat));
    const minLng = Math.min(...boundary.map(p => p.lng));
    const maxLng = Math.max(...boundary.map(p => p.lng));
    
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const approximateArea = latDiff * lngDiff * 111000 * 111000; // Rough area in square meters
    
    results.hexagonInfo = {
      center: {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2
      },
      approximateArea: Math.round(approximateArea),
      latSpan: latDiff,
      lngSpan: lngDiff
    };

    console.log('=== Road Coverage Test Complete ===');
    return NextResponse.json(results);

  } catch (error) {
    console.error('❌ Error in road coverage test:', error);
    return NextResponse.json({
      error: 'Failed to test road coverage',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
