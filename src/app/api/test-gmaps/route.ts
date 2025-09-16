import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@googlemaps/google-maps-services-js';

export async function GET() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'Google Maps API key not configured',
      envVars: Object.keys(process.env).filter(key => key.includes('GOOGLE')),
    });
  }

  const client = new Client({});

  try {
    // Test with a simple Geocoding API call
    const response = await client.geocode({
      params: {
        address: 'New York, NY',
        key: apiKey,
      },
    });

    return NextResponse.json({
      success: true,
      apiKeyLength: apiKey.length,
      testResult: 'Geocoding API test successful',
      resultsCount: response.data.results.length,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Google Maps API call failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      apiKeyLength: apiKey.length,
    });
  }
}
