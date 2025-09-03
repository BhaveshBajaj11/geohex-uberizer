'use client';

import {useEffect} from 'react';
import type {LatLngExpression} from 'leaflet';
import {MapContainer, TileLayer, Polygon, useMap} from 'react-leaflet';
import L from 'leaflet';
import { Skeleton } from './ui/skeleton';

type MapComponentProps = {
  polygon: LatLngExpression[] | null;
  hexagons: LatLngExpression[][];
};

const MapController = ({polygon}: {polygon: LatLngExpression[] | null}) => {
  const map = useMap();

  useEffect(() => {
    if (map && polygon && polygon.length > 0) {
      const bounds = L.latLngBounds(polygon);
      map.fitBounds(bounds, {padding: [50, 50]});
    }
  }, [map, polygon]);

  return null;
};

export default function MapComponent({polygon, hexagons}: MapComponentProps) {
  const initialCenter: LatLngExpression = [40.7128, -74.006]; // NYC
  const initialZoom = 10;

  const primaryColor = 'hsl(var(--primary))';
  const accentColor = 'hsl(var(--accent))';

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      scrollWheelZoom={true}
      className="h-full w-full"
      placeholder={<Skeleton className="h-full w-full" />}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {polygon && (
        <Polygon
          positions={polygon}
          pathOptions={{
            color: primaryColor,
            weight: 2,
            opacity: 0.9,
            fillColor: primaryColor,
            fillOpacity: 0.2,
          }}
        />
      )}
      {hexagons.map((hex, index) => (
        <Polygon
          key={index}
          positions={hex}
          pathOptions={{
            color: accentColor,
            weight: 1,
            opacity: 0.8,
            fillColor: accentColor,
            fillOpacity: 0.4,
          }}
        />
      ))}
      <MapController polygon={polygon} />
    </MapContainer>
  );
}