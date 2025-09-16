'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import type { LatLngLiteral } from 'leaflet';

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

type GoogleMapComponentProps = {
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
  basemap?: 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
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

const getCenter = (boundary: LatLngLiteral[]): google.maps.LatLngLiteral => {
  const lats = boundary.map(p => p.lat);
  const lngs = boundary.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
};

export default function GoogleMapComponent({
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
  basemap = 'roadmap',
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
}: GoogleMapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Store overlay references for cleanup
  const polygonOverlays = useRef<google.maps.Polygon[]>([]);
  const hexagonOverlays = useRef<google.maps.Polygon[]>([]);
  const roadPolylines = useRef<google.maps.Polyline[]>([]);
  const nodeMarkers = useRef<google.maps.Marker[]>([]);
  const pathPolylines = useRef<google.maps.Polyline[]>([]);
  const measureMarkers = useRef<google.maps.Marker[]>([]);
  const labelOverlays = useRef<google.maps.OverlayView[]>([]);
  
  const hasUserInteracted = useRef<boolean>(false);

  // Initialize Google Maps
  useEffect(() => {
    if (!mapRef.current) return;

    const initMap = async () => {
      const loader = new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        version: 'weekly',
        libraries: ['geometry', 'places']
      });

      console.log('🗺️ Loading Google Maps with API key:', !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
      console.log('🔑 API key length:', process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.length || 0);

      try {
        console.log('🔄 Loading Google Maps JavaScript API...');
        await loader.load();
        console.log('✅ Google Maps JavaScript API loaded successfully');
        
        if (mapRef.current && !mapInstance.current) {
          mapInstance.current = new google.maps.Map(mapRef.current, {
            center: { lat: 40.7128, lng: -74.006 },
            zoom: 10,
            mapTypeId: basemap as google.maps.MapTypeId,
            streetViewControl: false,
            mapTypeControl: true,
            mapTypeControlOptions: {
              style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
              position: google.maps.ControlPosition.TOP_CENTER,
            },
            fullscreenControl: true,
            zoomControl: true,
          });

          // Mark that user interacted to prevent automatic re-fit on updates
          mapInstance.current.addListener('zoom_changed', () => { 
            hasUserInteracted.current = true; 
          });
          mapInstance.current.addListener('dragstart', () => { 
            hasUserInteracted.current = true; 
          });
          
          setIsLoaded(true);
        }
      } catch (error) {
        console.error('❌ Error loading Google Maps:', error);
        console.error('🔍 Check that your API key is valid and Maps JavaScript API is enabled');
        
        // Show a user-friendly error in the map container
        if (mapRef.current) {
          mapRef.current.innerHTML = `
            <div style="
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100%; 
              background: #f5f5f5; 
              color: #666;
              font-family: system-ui;
              text-align: center;
              padding: 20px;
            ">
              <div>
                <h3 style="margin: 0 0 10px 0; color: #d32f2f;">Google Maps Failed to Load</h3>
                <p style="margin: 0;">Check console for details and verify your API key configuration.</p>
              </div>
            </div>
          `;
        }
      }
    };

    initMap();
  }, [basemap]);

  // Clear all overlays
  const clearOverlays = () => {
    [...polygonOverlays.current, ...hexagonOverlays.current, ...roadPolylines.current, 
     ...nodeMarkers.current, ...pathPolylines.current, ...measureMarkers.current].forEach(overlay => {
      overlay.setMap(null);
    });
    labelOverlays.current.forEach(overlay => overlay.setMap(null));
    
    polygonOverlays.current = [];
    hexagonOverlays.current = [];
    roadPolylines.current = [];
    nodeMarkers.current = [];
    pathPolylines.current = [];
    measureMarkers.current = [];
    labelOverlays.current = [];
  };

  // Render polygons and hexagons
  useEffect(() => {
    if (!mapInstance.current || !isLoaded) return;

    // Clear existing overlays
    [...polygonOverlays.current, ...hexagonOverlays.current].forEach(overlay => {
      overlay.setMap(null);
    });
    polygonOverlays.current = [];
    hexagonOverlays.current = [];

    const map = mapInstance.current;

    // Render polygons
    polygons.forEach((polygon) => {
      if (polygon && polygon.length > 0) {
        const paths = polygon.map(p => ({ lat: p.lat, lng: p.lng }));
        const polygonOverlay = new google.maps.Polygon({
          paths: paths,
          strokeColor: 'hsl(var(--primary))',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: 'hsl(var(--primary))',
          fillOpacity: 0.2,
        });
        
        polygonOverlay.setMap(map);
        polygonOverlays.current.push(polygonOverlay);
      }
    });

    // Render hexagons
    if (showHexagons) {
      hexagons.forEach((hex) => {
        const isHovered = hex.index === hoveredHexIndex;
        const isInCluster = clusterHexIds?.has(hex.index);
        const isScheduled = scheduledHexagons.some(sh => sh.hexagonId === hex.index);
        const isSelectedForSchedule = selectedHexagonsForSchedule.has(hex.index);
        const isEditing = editingHexagonId === hex.index;
        
        // Determine hexagon color based on state
        let strokeColor = '#dc2626'; // red
        let fillColor = '#dc2626';
        let fillOpacity = 0.2;
        let strokeWeight = 3;
        
        if (isInCluster) {
          strokeColor = '#a21caf'; // purple
          fillColor = '#a21caf';
          fillOpacity = 0.25;
          strokeWeight = 4;
        } else if (isEditing) {
          strokeColor = '#f59e0b'; // amber
          fillColor = '#f59e0b';
          fillOpacity = 0.5;
          strokeWeight = 5;
        } else if (isScheduled) {
          strokeColor = '#22c55e'; // green
          fillColor = '#22c55e';
          fillOpacity = 0.4;
        } else if (isSelectedForSchedule) {
          strokeColor = '#3b82f6'; // blue
          fillColor = '#3b82f6';
          fillOpacity = 0.3;
        } else if (isHovered) {
          fillOpacity = 0.6;
        }

        const paths = hex.boundary.map(p => ({ lat: p.lat, lng: p.lng }));
        const hexagonOverlay = new google.maps.Polygon({
          paths: paths,
          strokeColor: strokeColor,
          strokeOpacity: 0.8,
          strokeWeight: strokeWeight,
          fillColor: fillColor,
          fillOpacity: fillOpacity,
        });

        hexagonOverlay.setMap(map);
        hexagonOverlays.current.push(hexagonOverlay);

        // Add click handler
        if (onHexagonClick) {
          hexagonOverlay.addListener('click', () => onHexagonClick(hex.index));
        }

        // Add hover handlers
        if (onHexagonHover) {
          hexagonOverlay.addListener('mouseover', () => onHexagonHover(hex.index));
          hexagonOverlay.addListener('mouseout', () => onHexagonHover(null));
        }

        // Add number marker for scheduled hexagons
        if (isScheduled || isSelectedForSchedule) {
          const selectionOrder = scheduledHexagons.findIndex(sh => sh.hexagonId === hex.index) + 1;
          const center = getCenter(hex.boundary);
          
          const marker = new google.maps.Marker({
            position: center,
            map: map,
            icon: {
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="12" fill="rgba(0,0,0,0.7)" stroke="white" stroke-width="2"/>
                  <text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${selectionOrder}</text>
                </svg>
              `)}`,
              scaledSize: new google.maps.Size(24, 24),
              anchor: new google.maps.Point(12, 12)
            }
          });
          
          if (onHexagonClick) {
            marker.addListener('click', () => onHexagonClick(hex.index));
          }
        }
      });
    }

    // Auto-fit bounds if user hasn't interacted
    if (!hasUserInteracted.current && (polygons.length > 0 || hexagons.length > 0)) {
      const bounds = new google.maps.LatLngBounds();
      
      [...polygons, ...hexagons.map(h => h.boundary)].forEach(shape => {
        shape.forEach(point => {
          bounds.extend({ lat: point.lat, lng: point.lng });
        });
      });
      
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
      }
    }
  }, [polygons, hexagons, scheduledHexagons, selectedHexagonsForSchedule, 
      onHexagonClick, onHexagonHover, clusterHexIds, showHexagons, 
      hoveredHexIndex, editingHexagonId, isLoaded]);

  // Render roads
  useEffect(() => {
    if (!mapInstance.current || !isLoaded) return;

    // Clear existing road polylines
    roadPolylines.current.forEach(polyline => polyline.setMap(null));
    roadPolylines.current = [];

    const map = mapInstance.current;

    roads.forEach((line) => {
      if (line && line.length > 1) {
        const path = line.map(p => ({ lat: p.lat, lng: p.lng }));
        const polyline = new google.maps.Polyline({
          path: path,
          strokeColor: '#f97316',
          strokeWeight: 3,
          strokeOpacity: 0.9,
        });
        
        polyline.setMap(map);
        roadPolylines.current.push(polyline);
      }
    });
  }, [roads, isLoaded]);

  // Render length label for hovered hex
  useEffect(() => {
    if (!mapInstance.current || !isLoaded) return;

    // Clear existing labels
    labelOverlays.current.forEach(overlay => overlay.setMap(null));
    labelOverlays.current = [];

    if (!hoveredHexIndex || hoveredHexLengthMeters === undefined) return;

    const hex = hexagons.find(h => h.index === hoveredHexIndex);
    if (!hex) return;

    const center = getCenter(hex.boundary);
    const km = (hoveredHexLengthMeters / 1000).toFixed(2);

    // Create custom overlay for the label
    class LengthLabel extends google.maps.OverlayView {
      position: google.maps.LatLng;
      content: string;
      div: HTMLDivElement | null = null;

      constructor(position: google.maps.LatLng, content: string) {
        super();
        this.position = position;
        this.content = content;
      }

      onAdd() {
        this.div = document.createElement('div');
        this.div.style.cssText = `
          position: absolute;
          pointer-events: none;
          backdrop-filter: blur(4px);
          background: linear-gradient(90deg,rgba(17,17,17,0.8),rgba(17,17,17,0.6));
          color: #fff;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          font-size: 12px;
          display: flex;
          gap: 6px;
          align-items: center;
          white-space: nowrap;
        `;
        
        this.div.innerHTML = `
          <span style="display:inline-block;width:8px;height:8px;background:#f97316;border-radius:9999px;"></span>
          <span style="font-weight:600;letter-spacing:0.2px;">${this.content}</span>
        `;

        const panes = this.getPanes();
        panes?.overlayMouseTarget.appendChild(this.div);
      }

      draw() {
        if (this.div) {
          const overlayProjection = this.getProjection();
          const sw = overlayProjection.fromLatLngToDivPixel(this.position);
          if (sw) {
            this.div.style.left = sw.x + 'px';
            this.div.style.top = sw.y + 'px';
          }
        }
      }

      onRemove() {
        if (this.div && this.div.parentNode) {
          this.div.parentNode.removeChild(this.div);
          this.div = null;
        }
      }
    }

    const labelOverlay = new LengthLabel(
      new google.maps.LatLng(center.lat, center.lng),
      `${km} km`
    );
    
    labelOverlay.setMap(mapInstance.current);
    labelOverlays.current.push(labelOverlay);
  }, [hoveredHexIndex, hoveredHexLengthMeters, hexagons, isLoaded]);

  // Render nodes and clusters
  useEffect(() => {
    if (!mapInstance.current || !isLoaded || !showNodes) return;

    // Clear existing node markers
    nodeMarkers.current.forEach(marker => marker.setMap(null));
    nodeMarkers.current = [];

    const map = mapInstance.current;

    // Render clusters if they exist
    if (clusters && clusters.length > 0) {
      clusters.forEach((cluster, index) => {
        const isOptimal = cluster.totalLengthMeters >= 225 && cluster.totalLengthMeters <= 270;
        const color = isOptimal ? '#22c55e' : '#f59e0b';
        
        // Cluster centroid marker
        const clusterMarker = new google.maps.Marker({
          position: { lat: cluster.centroid.lat, lng: cluster.centroid.lng },
          map: map,
          icon: {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
              <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="${isOptimal ? 6 : 4}" fill="${color}" stroke="white" stroke-width="2"/>
                <text x="8" y="11" text-anchor="middle" fill="white" font-size="8" font-weight="bold">${index + 1}</text>
              </svg>
            `)}`,
            scaledSize: new google.maps.Size(16, 16),
            anchor: new google.maps.Point(8, 8)
          },
          title: `Cluster ${index + 1}: ${Math.round(cluster.totalLengthMeters)}m (${cluster.nodes.length} nodes)`
        });

        nodeMarkers.current.push(clusterMarker);

        // Individual node markers
        cluster.nodes.forEach(node => {
          const nodeMarker = new google.maps.Marker({
            position: { lat: node.lat, lng: node.lng },
            map: map,
            icon: {
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg width="4" height="4" viewBox="0 0 4 4" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="2" cy="2" r="2" fill="${color}" stroke="white" stroke-width="1" opacity="0.7"/>
                </svg>
              `)}`,
              scaledSize: new google.maps.Size(4, 4),
              anchor: new google.maps.Point(2, 2)
            },
            title: `Node ${node.id}`
          });

          nodeMarkers.current.push(nodeMarker);
        });
      });
    } else if (allNodes && allNodes.length > 0) {
      // If no clusters but we have individual nodes, show them
      allNodes.forEach(node => {
        const nodeMarker = new google.maps.Marker({
          position: { lat: node.lat, lng: node.lng },
          map: map,
          icon: {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
              <svg width="4" height="4" viewBox="0 0 4 4" xmlns="http://www.w3.org/2000/svg">
                <circle cx="2" cy="2" r="2" fill="#3b82f6" stroke="white" stroke-width="1" opacity="0.8"/>
              </svg>
            `)}`,
            scaledSize: new google.maps.Size(4, 4),
            anchor: new google.maps.Point(2, 2)
          },
          title: `Node ${node.id}`
        });

        nodeMarkers.current.push(nodeMarker);
      });
    }
  }, [clusters, showNodes, allNodes, isLoaded]);

  // Render node paths
  useEffect(() => {
    if (!mapInstance.current || !isLoaded || !showNodePaths) return;

    // Clear existing path polylines and markers
    pathPolylines.current.forEach(polyline => polyline.setMap(null));
    pathPolylines.current = [];

    const map = mapInstance.current;

    if (nodePaths && nodePaths.length > 0) {
      nodePaths.forEach((path, index) => {
        if (path.nodes.length < 2) return;

        const pathCoordinates = path.nodes.map(node => ({ lat: node.lat, lng: node.lng }));
        
        const polyline = new google.maps.Polyline({
          path: pathCoordinates,
          strokeColor: path.color,
          strokeWeight: 4,
          strokeOpacity: 0.8,
        });

        polyline.setMap(map);
        pathPolylines.current.push(polyline);

        // Add markers for start and end nodes
        const startNode = path.nodes[0];
        const endNode = path.nodes[path.nodes.length - 1];

        [startNode, endNode].forEach((node, nodeIndex) => {
          if (nodeIndex === 1 && endNode.id === startNode.id) return; // Skip duplicate end marker
          
          const marker = new google.maps.Marker({
            position: { lat: node.lat, lng: node.lng },
            map: map,
            icon: {
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg width="8" height="8" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="4" cy="4" r="4" fill="${path.color}" stroke="white" stroke-width="2"/>
                </svg>
              `)}`,
              scaledSize: new google.maps.Size(8, 8),
              anchor: new google.maps.Point(4, 4)
            },
            title: `Path ${index + 1} ${nodeIndex === 0 ? 'Start' : 'End'}`
          });

          nodeMarkers.current.push(marker);
        });
      });
    }
  }, [nodePaths, showNodePaths, isLoaded]);

  // Handle basemap changes
  useEffect(() => {
    if (!mapInstance.current || !isLoaded) return;
    mapInstance.current.setMapTypeId(basemap as google.maps.MapTypeId);
  }, [basemap, isLoaded]);

  // Map click handler for measurement mode
  useEffect(() => {
    if (!mapInstance.current || !isLoaded) return;

    const handleMapClick = (e: google.maps.MapMouseEvent) => {
      if (!measureMode || !onMapClickForMeasure || !e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      onMapClickForMeasure({ lat, lng });
    };

    const listener = mapInstance.current.addListener('click', handleMapClick);
    
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [measureMode, onMapClickForMeasure, isLoaded]);

  return <div ref={mapRef} className="h-full w-full" />;
}
