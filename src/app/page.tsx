
'use client';

import {useState, useEffect} from 'react';
import type {LatLngLiteral} from 'leaflet';
import {cellToBoundary, polygonToCells} from 'h3-js';
import {Layers} from 'lucide-react';
import dynamic from 'next/dynamic';
import PolygonForm from '@/components/polygon-form';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {useToast} from '@/hooks/use-toast';
import {Skeleton} from '@/components/ui/skeleton';
import PolygonList from '@/components/polygon-list';

const MapComponent = dynamic(() => import('@/components/map-component'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export type LeafletPolygon = LatLngLiteral[];

export type PolygonData = {
  id: number;
  leafletPolygon: LeafletPolygon;
  resolution: number;
  allH3Indexes: string[];
};

type Hexagon = {
  index: string;
  boundary: LatLngLiteral[];
  number: number;
};

export default function Home() {
  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const [selectedH3Indexes, setSelectedH3Indexes] = useState<Set<string>>(new Set());
  const [renderedHexagons, setRenderedHexagons] = useState<Hexagon[]>([]);
  const {toast} = useToast();
  const [mapKey, setMapKey] = useState(Date.now());
  const [hoveredHexIndex, setHoveredHexIndex] = useState<string | null>(null);

  useEffect(() => {
    // Update map hexagons when selection changes
    const selectedHexagons: Hexagon[] = Array.from(selectedH3Indexes).map((index, i) => {
      const boundary = cellToBoundary(index, true); // Returns [lat, lng]
      return {
        index,
        boundary: boundary.map(([lat, lng]) => ({lat, lng})),
        number: i + 1,
      };
    });
    setRenderedHexagons(selectedHexagons);
  }, [selectedH3Indexes]);

  const handlePolygonSubmit = (data: {wkt: string; resolution: number}) => {
    try {
      const wkt = data.wkt.trim();
      if (!wkt.toUpperCase().startsWith('POLYGON')) {
        throw new Error('Invalid WKT format: Must start with POLYGON.');
      }

      const coordString = wkt.substring(wkt.indexOf('(') + 1, wkt.lastIndexOf(')'));
      const rings = coordString
        .slice(1, -1)
        .split('),(')
        .map((ring) =>
          ring.split(',').map((pair) => {
            const [lng, lat] = pair.trim().split(/\s+/).map(Number);
            if (isNaN(lng) || isNaN(lat)) {
              throw new Error(`Invalid coordinate pair found: "${pair.trim()}"`);
            }
            return [lng, lat];
          })
        );

      if (rings.length === 0 || rings[0].length < 4) {
        throw new Error('A polygon must have at least 4 coordinate pairs to close the loop.');
      }

      const first = rings[0][0];
      const last = rings[0][rings[0].length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        rings[0].push(first);
      }

      const newLeafletPolygon: LeafletPolygon = rings[0].map(([lng, lat]) => ({lng, lat}));

      const h3Polygon = rings.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
      const h3Resolution = data.resolution;

      const h3Indexes = polygonToCells(h3Polygon, h3Resolution, true);

      const newPolygonData: PolygonData = {
        id: Date.now(),
        leafletPolygon: newLeafletPolygon,
        resolution: h3Resolution,
        allH3Indexes: h3Indexes,
      };

      setPolygons((prev) => [...prev, newPolygonData]);

      // Add new indexes to selection
      setSelectedH3Indexes((prev) => {
        const newSet = new Set(prev);
        h3Indexes.forEach((index) => newSet.add(index));
        return newSet;
      });

      setMapKey(Date.now());

      toast({
        title: 'Polygon Added!',
        description: `Generated ${h3Indexes.length} H3 hexagons at resolution ${h3Resolution}.`,
      });
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Invalid WKT format.';
      toast({
        variant: 'destructive',
        title: 'Error Processing WKT',
        description: errorMessage,
      });
    }
  };

  const handleHexagonSelectionChange = (index: string, isSelected: boolean) => {
    setSelectedH3Indexes((prevSelected) => {
      const newSelected = new Set(prevSelected);
      if (isSelected) {
        newSelected.add(index);
      } else {
        newSelected.delete(index);
      }
      return newSelected;
    });
  };

  const handleSelectAllInPolygon = (polygonIndexes: string[], selectAll: boolean) => {
    setSelectedH3Indexes((prev) => {
      const newSet = new Set(prev);
      if (selectAll) {
        polygonIndexes.forEach((index) => newSet.add(index));
      } else {
        polygonIndexes.forEach((index) => newSet.delete(index));
      }
      return newSet;
    });
  };

  const handleHexHover = (index: string | null) => {
    setHoveredHexIndex(index);
  };

  const handleRemovePolygon = (polygonId: number) => {
    setPolygons((prev) => prev.filter((p) => p.id !== polygonId));
    // Optional: remove its hexes from selection as well
    const polygonToRemove = polygons.find((p) => p.id === polygonId);
    if (polygonToRemove) {
      setSelectedH3Indexes((prev) => {
        const newSet = new Set(prev);
        polygonToRemove.allH3Indexes.forEach((index) => newSet.delete(index));
        return newSet;
      });
    }
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-3 p-2">
            <Layers className="h-8 w-8 text-primary" />
            <h1 className="font-headline text-xl font-semibold">GeoHex Uberizer</h1>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <PolygonForm onSubmit={handlePolygonSubmit} />
          <PolygonList
            polygons={polygons}
            selectedH3Indexes={selectedH3Indexes}
            onSelectionChange={handleHexagonSelectionChange}
            onSelectAll={handleSelectAllInPolygon}
            onHexHover={handleHexHover}
            onRemovePolygon={handleRemovePolygon}
          />
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <main className="relative h-screen w-full">
          <div className="absolute left-4 top-4 z-10">
            <SidebarTrigger />
          </div>
          <MapComponent
            key={mapKey}
            polygons={polygons.map((p) => p.leafletPolygon)}
            hexagons={renderedHexagons}
            hoveredHexIndex={hoveredHexIndex}
          />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
