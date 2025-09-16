
'use client';

import {useEffect, useRef} from 'react';
import type {LatLngExpression, LatLngLiteral} from 'leaflet';
import L from 'leaflet';

type Hexagon = {
  index: string;
  boundary: LatLngLiteral[];
  number: number;
};

type NodeCluster = {
  id: string;
  nodes: { id: string; lat: number; lng: number; roadSegments: string[] }[];
  totalLengthMeters: number;
  segments: any[];
  centroid: { lat: number; lng: number };
};

type NodePath = {
  id: string;
  nodes: { id: string; lat: number; lng: number; roadSegments: string[] }[];
  totalLengthMeters: number;
  pathType: 'optimal' | 'suboptimal' | 'too_short' | 'too_long';
  color: string;
};

type MapComponentProps = {
  polygons: LatLngLiteral[][];
  hexagons: Hexagon[];
  hoveredHexIndex: string | null;
  scheduledHexagons?: { hexagonId: string; hexagonNumber: number; timeSlot: { start: string; end: string } }[];
  selectedHexagonsForSchedule?: Set<string>;
  onHexagonClick?: (hexagonId: string) => void;
  editingHexagonId?: string | null;
  roads?: LatLngLiteral[][]; // Optional polylines to render (e.g., roads within a hovered hex)
  onHexagonHover?: (hexagonId: string | null) => void;
  clusterHexIds?: Set<string>; // Optional: show a cluster with a distinct style
  hoveredHexLengthMeters?: number; // Optional: show length label on hovered hex
  // New props
  basemap?: 'osm' | 'satellite';
  showHexagons?: boolean;
  measureMode?: boolean;
  measurePoints?: LatLngLiteral[];
  onMapClickForMeasure?: (latlng: LatLngLiteral) => void;
  onMeasurePointDrag?: (index: number, latlng: LatLngLiteral) => void;
  // Node clustering props
  clusters?: NodeCluster[];
  showNodes?: boolean;
  allNodes?: { id: string; lat: number; lng: number; roadSegments: string[] }[]; // Individual nodes to show
  // Node paths props
  nodePaths?: NodePath[];
  showNodePaths?: boolean;
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
  roads = [],
  onHexagonHover,
  clusterHexIds,
  hoveredHexLengthMeters,
  basemap = 'osm',
  showHexagons = true,
  measureMode = false,
  measurePoints = [],
  onMapClickForMeasure,
  onMeasurePointDrag,
  clusters = [],
  showNodes = false,
  allNodes = [],
  nodePaths = [],
  showNodePaths = false,
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const featureGroup = useRef<L.FeatureGroup | null>(null);
  const roadsGroup = useRef<L.FeatureGroup | null>(null);
  const labelGroup = useRef<L.FeatureGroup | null>(null);
  const measureGroup = useRef<L.FeatureGroup | null>(null);
  const nodesGroup = useRef<L.FeatureGroup | null>(null);
  const nodePathsGroup = useRef<L.FeatureGroup | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const hasUserInteracted = useRef<boolean>(false);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView([40.7128, -74.006], 10);

      // Initialize base layer (default OSM)
      baseLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapInstance.current);

      featureGroup.current = L.featureGroup().addTo(mapInstance.current);
      roadsGroup.current = L.featureGroup().addTo(mapInstance.current);
      labelGroup.current = L.featureGroup().addTo(mapInstance.current);
      measureGroup.current = L.featureGroup().addTo(mapInstance.current);
      nodesGroup.current = L.featureGroup().addTo(mapInstance.current);
      nodePathsGroup.current = L.featureGroup().addTo(mapInstance.current);

      // Mark that user interacted to prevent automatic re-fit on updates
      mapInstance.current.on('zoomstart', () => { hasUserInteracted.current = true; });
      mapInstance.current.on('movestart', () => { hasUserInteracted.current = true; });
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

    if (showHexagons) {
    hexagons.forEach((hex) => {
      const isHovered = hex.index === hoveredHexIndex;
      const isInCluster = clusterHexIds?.has(hex.index);
      const isScheduled = scheduledHexagons.some(sh => sh.hexagonId === hex.index);
      const isSelectedForSchedule = selectedHexagonsForSchedule.has(hex.index);
      const isEditing = editingHexagonId === hex.index;
      
      // Determine hexagon color based on state
      let hexColor = 'red';
      let fillColor = 'red';
      let fillOpacity = 0.2;
      let weight = 3;
      
      if (isInCluster) {
        hexColor = '#a21caf'; // purple border
        fillColor = '#a21caf';
        fillOpacity = 0.25;
        weight = 4;
      } else if (isEditing) {
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

      // Hover handlers to inform parent
      if (onHexagonHover) {
        hexPolygon.on('mouseover', () => onHexagonHover(hex.index));
        hexPolygon.on('mouseout', () => onHexagonHover(null));
      }
    });
    }

    if (group.getLayers().length > 0 && !hasUserInteracted.current) {
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {padding: [50, 50]});
      }
    } else if (!hasUserInteracted.current) {
        map.setView([40.7128, -74.006], 2);
    }
  }, [polygons, hexagons, scheduledHexagons, selectedHexagonsForSchedule, onHexagonClick, onHexagonHover, clusterHexIds, showHexagons]);

  // Render roads in a separate layer without refitting bounds or clearing other layers
  useEffect(() => {
    const rGroup = roadsGroup.current;
    if (!rGroup) return;
    rGroup.clearLayers();
    
    console.log('🗺️ MapComponent received roads:', {
      roadsCount: roads?.length || 0,
      roads: roads?.map((road, i) => ({
        index: i,
        points: road?.length || 0,
        firstPoint: road?.[0],
        lastPoint: road?.[road.length - 1]
      }))
    });
    
    if (roads && roads.length > 0) {
      let renderedCount = 0;
      roads.forEach((line, index) => {
        if (line && line.length > 1) {
          try {
            L.polyline(line as LatLngExpression[], {
              color: '#f97316',
              weight: 3,
              opacity: 0.9,
              interactive: false,
              bubblingMouseEvents: false,
            }).addTo(rGroup);
            renderedCount++;
          } catch (error) {
            console.error(`❌ Failed to render road ${index}:`, error, line);
          }
        } else {
          console.warn(`⚠️ Skipping invalid road ${index}:`, line);
        }
      });
      console.log(`✅ Rendered ${renderedCount} roads out of ${roads.length} total`);
    } else {
      console.log('⚠️ No roads to render');
    }
  }, [roads]);

  // Render a floating length label at the center of the hovered hex
  useEffect(() => {
    const lGroup = labelGroup.current;
    if (!lGroup) return;
    lGroup.clearLayers();
    if (!hoveredHexIndex) return;
    const hex = hexagons.find(h => h.index === hoveredHexIndex);
    if (!hex) return;
    const center = getCenter(hex.boundary);
    if (hoveredHexLengthMeters === undefined) return;
    const km = (hoveredHexLengthMeters / 1000).toFixed(2);
    const labelIcon = L.divIcon({
      className: 'hex-length-label',
      html: `<div style="pointer-events:none;backdrop-filter:blur(4px);background:linear-gradient(90deg,rgba(17,17,17,0.8),rgba(17,17,17,0.6));color:#fff;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);box-shadow:0 4px 16px rgba(0,0,0,0.25);font-size:12px;display:flex;gap:6px;align-items:center;">
        <span style="display:inline-block;width:8px;height:8px;background:#f97316;border-radius:9999px;"></span>
        <span style="font-weight:600;letter-spacing:0.2px;">${km} km</span>
      </div>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });
    L.marker(center, { icon: labelIcon, interactive: false }).addTo(lGroup);
  }, [hoveredHexIndex, hoveredHexLengthMeters, hexagons]);

  // Basemap switching
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const current = baseLayerRef.current;
    if (current) {
      map.removeLayer(current);
    }
    if (basemap === 'satellite') {
      baseLayerRef.current = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19,
      });
    } else {
      baseLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      });
    }
    baseLayerRef.current.addTo(map);
  }, [basemap]);

  // Measurement overlay rendering
  useEffect(() => {
    const mGroup = measureGroup.current;
    if (!mGroup) return;
    mGroup.clearLayers();
    if (!measurePoints || measurePoints.length === 0) return;

    const markerStyle = (idx: number) => L.divIcon({
      className: 'measure-marker',
      html: `<div style="background:#10b981;border:2px solid white;width:10px;height:10px;border-radius:9999px;box-shadow:0 0 0 2px rgba(0,0,0,0.15)"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    const toRad = (x: number) => (x * Math.PI) / 180;
    const haversine = (a: LatLngLiteral, b: LatLngLiteral) => {
      const R = 6371000;
      const dLat = toRad(b.lat - a.lat);
      const dLon = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const sinDLat = Math.sin(dLat / 2);
      const sinDLon = Math.sin(dLon / 2);
      const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
      const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      return R * c; // meters
    };

    // Add draggable markers
    measurePoints.forEach((pt, idx) => {
      const mk = L.marker([pt.lat, pt.lng], { icon: markerStyle(idx), draggable: true as any }).addTo(mGroup);
      mk.on('dragend', (e: any) => {
        if (!onMeasurePointDrag) return;
        const latlng = e.target.getLatLng();
        onMeasurePointDrag(idx, { lat: latlng.lat, lng: latlng.lng });
      });
    });

    // Draw per-segment lines and labels
    if (measurePoints.length > 1) {
      for (let i = 1; i < measurePoints.length; i++) {
        const a = measurePoints[i - 1];
        const b = measurePoints[i];
        const seg = [ [a.lat, a.lng], [b.lat, b.lng] ] as unknown as LatLngExpression[];
        L.polyline(seg, { color: '#10b981', weight: 3, dashArray: '6,4' }).addTo(mGroup);

        const meters = haversine(a, b);
        const label = meters < 1000 ? `${meters.toFixed(0)} m` : `${(meters/1000).toFixed(2)} km`;
        const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
        const labelIcon = L.divIcon({
          className: 'measure-seg-label',
          html: `<div style="pointer-events:none;backdrop-filter:blur(4px);background:linear-gradient(90deg,rgba(17,17,17,0.8),rgba(17,17,17,0.6));color:#fff;padding:3px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);box-shadow:0 4px 16px rgba(0,0,0,0.25);font-size:11px;display:flex;gap:6px;align-items:center;">
            <span style="display:inline-block;width:6px;height:6px;background:#10b981;border-radius:9999px;"></span>
            <span style="font-weight:600;letter-spacing:0.2px;">${label}</span>
          </div>`,
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        });
        L.marker([mid.lat, mid.lng], { icon: labelIcon, interactive: false }).addTo(mGroup);
      }
    }
  }, [measurePoints]);

  // Render nodes and clusters
  useEffect(() => {
    const nGroup = nodesGroup.current;
    if (!nGroup) return;
    nGroup.clearLayers();
    
    if (!showNodes) return;

    // Render clusters if they exist
    if (clusters && clusters.length > 0) {
      clusters.forEach((cluster, index) => {
        // Render cluster centroid with size based on optimality
        const isOptimal = cluster.totalLengthMeters >= 225 && cluster.totalLengthMeters <= 270;
        const color = isOptimal ? '#22c55e' : '#f59e0b'; // green for optimal, orange for suboptimal
        
        const clusterIcon = L.divIcon({
          className: 'cluster-marker',
          html: `<div style="
            background: ${color};
            border: 2px solid white;
            width: ${isOptimal ? '12px' : '8px'};
            height: ${isOptimal ? '12px' : '8px'};
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 8px;
            font-weight: bold;
          ">${index + 1}</div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const marker = L.marker([cluster.centroid.lat, cluster.centroid.lng], { 
          icon: clusterIcon,
          title: `Cluster ${index + 1}: ${Math.round(cluster.totalLengthMeters)}m (${cluster.nodes.length} nodes)`
        }).addTo(nGroup);

        // Add popup with cluster details
        marker.bindPopup(`
          <div style="font-size: 12px;">
            <strong>Cluster ${index + 1}</strong><br/>
            Length: ${Math.round(cluster.totalLengthMeters)}m<br/>
            Nodes: ${cluster.nodes.length}<br/>
            Segments: ${cluster.segments.length}<br/>
            Status: ${isOptimal ? '✅ Optimal (15min)' : '⚠️ Suboptimal'}
          </div>
        `);

        // Render individual nodes as smaller dots
        cluster.nodes.forEach(node => {
          const nodeIcon = L.divIcon({
            className: 'node-marker',
            html: `<div style="
              background: ${color};
              border: 1px solid white;
              width: 4px;
              height: 4px;
              border-radius: 50%;
              opacity: 0.7;
            "></div>`,
            iconSize: [4, 4],
            iconAnchor: [2, 2]
          });

          L.marker([node.lat, node.lng], { 
            icon: nodeIcon,
            title: `Node ${node.id}`
          }).addTo(nGroup);
        });
      });
    } else if (allNodes && allNodes.length > 0) {
      // If no clusters but we have individual nodes, show them
      allNodes.forEach(node => {
        const nodeIcon = L.divIcon({
          className: 'node-marker',
          html: `<div style="
            background: #3b82f6;
            border: 1px solid white;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            opacity: 0.8;
          "></div>`,
          iconSize: [4, 4],
          iconAnchor: [2, 2]
        });

        L.marker([node.lat, node.lng], { 
          icon: nodeIcon,
          title: `Node ${node.id}`
        }).addTo(nGroup);
      });
    }
  }, [clusters, showNodes, allNodes]);

  // Node paths visualization
  useEffect(() => {
    const nPathsGroup = nodePathsGroup.current;
    if (!nPathsGroup) return;

    nPathsGroup.clearLayers();

    if (showNodePaths && nodePaths && nodePaths.length > 0) {
      nodePaths.forEach((path, index) => {
        if (path.nodes.length < 2) return;

        // Create polyline for the path
        const pathCoordinates = path.nodes.map(node => [node.lat, node.lng] as [number, number]);
        
        const polyline = L.polyline(pathCoordinates, {
          color: path.color,
          weight: 4,
          opacity: 0.8,
          dashArray: path.pathType === 'optimal' ? undefined : '5, 5'
        }).addTo(nPathsGroup);

        // Add popup with path details
        polyline.bindPopup(`
          <div style="font-size: 12px;">
            <strong>Node Path ${index + 1}</strong><br/>
            Length: ${Math.round(path.totalLengthMeters)}m<br/>
            Nodes: ${path.nodes.length}<br/>
            Type: ${path.pathType === 'optimal' ? '✅ Optimal (225-270m)' : 
                   path.pathType === 'too_short' ? '⚠️ Too Short (<225m)' : 
                   '❌ Too Long (>270m)'}
          </div>
        `);

        // Add markers for start and end nodes
        const startNode = path.nodes[0];
        const endNode = path.nodes[path.nodes.length - 1];

        // Start node marker
        const startIcon = L.divIcon({
          className: 'path-start-marker',
          html: `<div style="
            background: ${path.color};
            border: 2px solid white;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            box-shadow: 0 0 0 2px ${path.color};
          "></div>`,
          iconSize: [8, 8],
          iconAnchor: [4, 4]
        });

        L.marker([startNode.lat, startNode.lng], { 
          icon: startIcon,
          title: `Path ${index + 1} Start`
        }).addTo(nPathsGroup);

        // End node marker (only if different from start)
        if (endNode.id !== startNode.id) {
          const endIcon = L.divIcon({
            className: 'path-end-marker',
            html: `<div style="
              background: ${path.color};
              border: 2px solid white;
              width: 8px;
              height: 8px;
              border-radius: 50%;
              box-shadow: 0 0 0 2px ${path.color};
            "></div>`,
            iconSize: [8, 8],
            iconAnchor: [4, 4]
          });

          L.marker([endNode.lat, endNode.lng], { 
            icon: endIcon,
            title: `Path ${index + 1} End`
          }).addTo(nPathsGroup);
        }

        // Add intermediate node markers (smaller)
        path.nodes.slice(1, -1).forEach(node => {
          const nodeIcon = L.divIcon({
            className: 'path-intermediate-marker',
            html: `<div style="
              background: ${path.color};
              border: 1px solid white;
              width: 4px;
              height: 4px;
              border-radius: 50%;
              opacity: 0.7;
            "></div>`,
            iconSize: [4, 4],
            iconAnchor: [2, 2]
          });

          L.marker([node.lat, node.lng], { 
            icon: nodeIcon,
            title: `Path ${index + 1} Node`
          }).addTo(nPathsGroup);
        });
      });
    }
  }, [nodePaths, showNodePaths]);

  // Map click handler for measurement mode
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const handler = (e: L.LeafletMouseEvent) => {
      if (!measureMode || !onMapClickForMeasure) return;
      const { lat, lng } = e.latlng;
      onMapClickForMeasure({ lat, lng });
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [measureMode, onMapClickForMeasure]);

  return <div ref={mapRef} className="h-full w-full" />;
}
