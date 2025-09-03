'use client';

import {useEffect} from 'react';
import {Map, Polygon, useMap} from '@vis.gl/react-google-maps';
import type {LatLngLiteral} from 'google.maps';

type MapComponentProps = {
  polygon: LatLngLiteral[] | null;
  hexagons: LatLngLiteral[][];
};

const MapController = ({polygon}: {polygon: LatLngLiteral[] | null}) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !polygon || polygon.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    polygon.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 100); // 100px padding
  }, [map, polygon]);

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
        {polygon && (
          <Polygon
            paths={polygon}
            strokeColor="hsl(var(--primary))"
            strokeOpacity={0.9}
            strokeWeight={2}
            fillColor="hsl(var(--primary))"
            fillOpacity={0.2}
          />
        )}
        {hexagons.map((hex, index) => (
          <Polygon
            key={index}
            paths={hex}
            strokeColor="hsl(var(--accent))"
            strokeOpacity={0.8}
            strokeWeight={1}
            fillColor="hsl(var(--accent))"
            fillOpacity={0.4}
          />
        ))}
        <MapController polygon={polygon} />
      </Map>
    </div>
  );
}
