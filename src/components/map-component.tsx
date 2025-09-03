
'use client';

import {useEffect, useRef} from 'react';
import type {LatLngExpression, LatLngLiteral} from 'leaflet';
import L from 'leaflet';

type MapComponentProps = {
  polygon: LatLngLiteral[] | null;
  hexagons: LatLngLiteral[][];
};

export default function MapComponent({polygon, hexagons}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const featureGroup = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView([40.7128, -74.006], 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapInstance.current);

      featureGroup.current = L.featureGroup().addTo(mapInstance.current);
    }

    const map = mapInstance.current;
    const group = featureGroup.current;

    if (!group) return;

    group.clearLayers();

    const primaryColor = 'hsl(var(--primary))';
    const accentColor = 'hsl(var(--accent))';

    if (polygon && polygon.length > 0) {
      L.polygon(polygon as LatLngExpression[], {
        color: primaryColor,
        weight: 2,
        opacity: 0.9,
        fillColor: primaryColor,
        fillOpacity: 0.2,
      }).addTo(group);
    }

    hexagons.forEach((hex) => {
      L.polygon(hex as LatLngExpression[], {
        color: accentColor,
        weight: 1,
        opacity: 0.8,
        fillColor: accentColor,
        fillOpacity: 0.4,
      }).addTo(group);
    });

    if (group.getLayers().length > 0) {
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {padding: [50, 50]});
      }
    }
  }, [polygon, hexagons]);

  return <div ref={mapRef} className="h-full w-full" />;
}
