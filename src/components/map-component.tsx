
'use client';

import {useEffect, useRef} from 'react';
import type {LatLngExpression, LatLngLiteral} from 'leaflet';
import L from 'leaflet';

type Hexagon = {
  index: string;
  boundary: LatLngLiteral[];
  number: number;
};

type MapComponentProps = {
  polygons: LatLngLiteral[][];
  hexagons: Hexagon[];
  hoveredHexIndex: string | null;
};

const getCenter = (boundary: LatLngLiteral[]): LatLngExpression => {
  const lats = boundary.map(p => p.lat);
  const lngs = boundary.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
};

export default function MapComponent({polygons, hexagons, hoveredHexIndex}: MapComponentProps) {
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
    const highlightColor = 'hsl(var(--accent))';

    polygons.forEach((polygon) => {
        if (polygon && polygon.length > 0) {
            L.polygon(polygon as LatLngExpression[], {
              color: primaryColor,
              weight: 2,
              opacity: 0.9,
              fillColor: primaryColor,
              fillOpacity: 0.2,
            }).addTo(group);
          }
    })

    hexagons.forEach((hex) => {
      const isHovered = hex.index === hoveredHexIndex;
      L.polygon(hex.boundary as LatLngExpression[], {
        color: 'red',
        weight: 3,
        opacity: 0.8,
        fillColor: isHovered ? highlightColor : 'red',
        fillOpacity: isHovered ? 0.6 : 0.2,
      }).addTo(group);

      const center = getCenter(hex.boundary);
      const numberIcon = L.divIcon({
          className: 'hexagon-number-label',
          html: `<div style="font-size: 12px; font-weight: bold; color: white; text-shadow: 0 0 5px black, 0 0 5px black;">${hex.number}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
      });

      L.marker(center, { icon: numberIcon }).addTo(group);
    });

    if (group.getLayers().length > 0) {
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {padding: [50, 50]});
      }
    } else {
        map.setView([40.7128, -74.006], 2);
    }
  }, [polygons, hexagons, hoveredHexIndex]);

  return <div ref={mapRef} className="h-full w-full" />;
}
