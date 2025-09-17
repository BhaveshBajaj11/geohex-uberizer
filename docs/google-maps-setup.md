# Google Maps Integration Setup

## Environment Configuration

Create a `.env.local` file in the project root with your Google Maps API key:

```env
GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

## Required Google Maps APIs

Make sure the following APIs are enabled in your Google Cloud Console:

1. **Maps JavaScript API** - For rendering the interactive map
2. **Roads API** - For getting real road network data within hexagonal areas ⚠️ **REQUIRED**
3. **Places API** - For extracting geographic features and nodes
4. **Geocoding API** - For coordinate/address conversion

### ⚠️ Important: Roads API Setup

The application now uses the **actual Google Roads API** instead of synthetic road generation. You must:

1. **Enable the Roads API** in your Google Cloud Console
2. **Ensure your API key has Roads API permissions**
3. **Check your billing** - Roads API has usage costs

Without the Roads API enabled, the application will return empty road data.

## Features Migrated

- ✅ Map visualization (from Leaflet to Google Maps)
- ✅ Road network extraction (from Overpass API to Google Roads API)
- ✅ Node clustering and visualization
- ✅ Hexagon overlay support
- ✅ Route optimization features

## API Usage Considerations

- Google Maps APIs have usage quotas and billing
- Roads API is particularly useful for accurate road geometry
- Places API can provide rich metadata about geographic features
- Consider implementing caching for repeated requests
