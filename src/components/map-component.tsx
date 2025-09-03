'use client';

import {useEffect, useState} from 'react';
import {AdvancedMarker, Map, useMap} from '@vis.gl/react-google-maps';
import type {LatLngLiteral} from 'google.maps';

type MapComponentProps = {
  polygon: LatLngLiteral[] | null;
  hexagons: LatLngLiteral[][];
};

const MapController = ({
  polygon,
  hexagons,
}: {
  polygon: LatLngLiteral[] | null;
  hexagons: LatLngLiteral[][];
}) => {
  const map = useMap();
  const [drawnPolygons, setDrawnPolygons] = useState<google.maps.Polygon[]>([]);

  useEffect(() => {
    if (!map) return;

    // Clear existing polygons
    drawnPolygons.forEach((p) => p.setMap(null));
    const newDrawnPolygons: google.maps.Polygon[] = [];

    // Draw main polygon
    if (polygon && polygon.length > 0) {
      const poly = new window.google.maps.Polygon({
        paths: polygon,
        strokeColor: 'hsl(var(--primary))',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: 'hsl(var(--primary))',
        fillOpacity: 0.2,
      });
      poly.setMap(map);
      newDrawnPolygons.push(poly);
    }

    // Draw hexagons
    hexagons.forEach((hex) => {
      const hexPoly = new window.google.maps.Polygon({
        paths: hex,
        strokeColor: 'hsl(var(--accent))',
        strokeOpacity: 0.8,
        strokeWeight: 1,
        fillColor: 'hsl(var(--accent))',
        fillOpacity: 0.4,
      });
      hexPoly.setMap(map);
      newDrawnPolygons.push(hexPoly);
    });

    setDrawnPolygons(newDrawnPolygons);

    // Fit map to bounds of the main polygon
    if (polygon && polygon.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      polygon.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 100); // 100px padding
    }

    // Cleanup on unmount
    return () => {
      newDrawnPolygons.forEach((p) => p.setMap(null));
    };
  }, [map, polygon, hexagons]);

  return null;
};

export default function MapComponent({polygon, hexagons}: MapComponentProps) {
  const mapId = 'a1b2c3d4e5f6'; // Custom map ID for styling
  const initialCenter = {lat: 40.7128, lng: -74.006}; // Default to NYC
  const initialZoom = 10;

  return (
    <div className="h-full w-full">
      <Map
        defaultCenter={initialCenter}
        defaultZoom={initialZoom}
        mapId={mapId}
        disableDefaultUI={true}
        gestureHandling={'greedy'}
        className="h-full w-full">
        <MapController polygon={polygon} hexagons={hexagons} />
      </Map>
    </div>
  );
}