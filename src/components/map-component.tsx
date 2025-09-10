
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
  scheduledHexagons?: { hexagonId: string; hexagonNumber: number; timeSlot: { start: string; end: string } }[];
  selectedHexagonsForSchedule?: Set<string>;
  onHexagonClick?: (hexagonId: string) => void;
  editingHexagonId?: string | null;
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

export default function MapComponent({
  polygons, 
  hexagons, 
  hoveredHexIndex, 
  scheduledHexagons = [], 
  selectedHexagonsForSchedule = new Set(),
  onHexagonClick,
  editingHexagonId = null,
}: MapComponentProps) {
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
      const isScheduled = scheduledHexagons.some(sh => sh.hexagonId === hex.index);
      const isSelectedForSchedule = selectedHexagonsForSchedule.has(hex.index);
      const isEditing = editingHexagonId === hex.index;
      
      // Determine hexagon color based on state
      let hexColor = 'red';
      let fillColor = 'red';
      let fillOpacity = 0.2;
      let weight = 3;
      
      if (isEditing) {
        hexColor = '#f59e0b'; // Amber for editing
        fillColor = '#f59e0b';
        fillOpacity = 0.5;
        weight = 5;
      } else if (isScheduled) {
        hexColor = '#22c55e'; // Green for scheduled
        fillColor = '#22c55e';
        fillOpacity = 0.4;
      } else if (isSelectedForSchedule) {
        hexColor = '#3b82f6'; // Blue for selected
        fillColor = '#3b82f6';
        fillOpacity = 0.3;
      } else if (isHovered) {
        fillColor = highlightColor;
        fillOpacity = 0.6;
      }

      const hexPolygon = L.polygon(hex.boundary as LatLngExpression[], {
        color: hexColor,
        weight: weight,
        opacity: 0.8,
        fillColor: fillColor,
        fillOpacity: fillOpacity,
      }).addTo(group);

      const center = getCenter(hex.boundary);
      
      // Create marker with appropriate icon and click handler
      let marker;
      
      // Show numbers for scheduled hexagons (edit mode) and for actively selected ones (create mode)
      if (isScheduled || isSelectedForSchedule) {
        // Get the selection order by finding the index in the scheduledHexagons array
        const selectionOrder = scheduledHexagons.findIndex(sh => sh.hexagonId === hex.index) + 1;
        
        const numberIcon = L.divIcon({
            className: 'hexagon-number-label',
            html: `<div style="font-size: 12px; font-weight: bold; color: white; text-shadow: 0 0 5px black, 0 0 5px black;">${selectionOrder}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        marker = L.marker(center, { icon: numberIcon }).addTo(group);
      } else {
        // When not showing numbers, add an invisible marker for interaction
        const invisibleIcon = L.divIcon({
          className: 'invisible-marker',
          html: '<div></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        marker = L.marker(center, { icon: invisibleIcon }).addTo(group);
      }
      
      // Always add click handlers if provided, to both polygon and marker
      if (onHexagonClick) {
        hexPolygon.on('click', () => onHexagonClick(hex.index));
        if (marker) {
          marker.on('click', () => onHexagonClick(hex.index));
        }
      }
    });

    if (group.getLayers().length > 0) {
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {padding: [50, 50]});
      }
    } else {
        map.setView([40.7128, -74.006], 2);
    }
  }, [polygons, hexagons, hoveredHexIndex, scheduledHexagons, selectedHexagonsForSchedule, onHexagonClick]);

  return <div ref={mapRef} className="h-full w-full" />;
}
