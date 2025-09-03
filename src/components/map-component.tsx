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
    // Prevent initialization if the ref is not set
    if (!mapRef.current) return;

    // Initialize map only once
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

    // Clear existing layers from the group
    group.clearLayers();

    const primaryColor = 'hsl(var(--primary))';
    const accentColor = 'hsl(var(--accent))';

    // Add new polygon if it exists
    if (polygon && polygon.length > 0) {
      const leafletPolygon = L.polygon(polygon as LatLngExpression[], {
        color: primaryColor,
        weight: 2,
        opacity: 0.9,
        fillColor: primaryColor,
        fillOpacity: 0.2,
      }).addTo(group);
    }

    // Add new hexagons
    hexagons.forEach((hex) => {
      L.polygon(hex as LatLngExpression[], {
        color: accentColor,
        weight: 1,
        opacity: 0.8,
        fillColor: accentColor,
        fillOpacity: 0.4,
      }).addTo(group);
    });

    // Fit bounds if there are any layers
    if (group.getLayers().length > 0) {
      map.fitBounds(group.getBounds(), {padding: [50, 50]});
    }

    // Cleanup function to remove the map instance
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [polygon, hexagons]); // Rerun effect when polygon or hexagons change

  return <div ref={mapRef} className="h-full w-full" />;
}
