
'use client';

import {useState} from 'react';
import type {LatLngLiteral} from 'leaflet';
import {cellToBoundary, polygonToCells, cellArea} from 'h3-js';
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
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import area from '@turf/area';
import {polygon as turfPolygon} from '@turf/helpers';
import HexCodeList from '@/components/hex-code-list';

const MapComponent = dynamic(() => import('@/components/map-component'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

type Polygon = LatLngLiteral[];
type Hexagon = LatLngLiteral[];

export default function Home() {
  const [polygon, setPolygon] = useState<Polygon | null>(null);
  const [hexagons, setHexagons] = useState<Hexagon[]>([]);
  const [h3Indexes, setH3Indexes] = useState<string[]>([]);
  const {toast} = useToast();
  const [mapKey, setMapKey] = useState(Date.now());
  const [polygonArea, setPolygonArea] = useState<number | null>(null);
  const [hexagonArea, setHexagonArea] = useState<number | null>(null);
  const [resolution, setResolution] = useState<number>(10);

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
            return {lng, lat};
          })
        );

      const outerRing = rings[0];
      if (outerRing.length < 4) {
        throw new Error('A polygon must have at least 4 coordinate pairs to close the loop.');
      }

      const first = outerRing[0];
      const last = outerRing[outerRing.length - 1];
      if (first.lat !== last.lat || first.lng !== last.lng) {
        outerRing.push(first);
      }

      const newPolygon: Polygon = outerRing.map(({lat, lng}) => ({lat, lng}));
      setPolygon(newPolygon);

      const h3Polygon = rings.map((ring) => ring.map(({lat, lng}) => [lat, lng]));
      const h3Resolution = data.resolution;
      setResolution(h3Resolution);
      const h3Indexes = polygonToCells(h3Polygon, h3Resolution);
      setH3Indexes(h3Indexes);

      const newHexagons: Hexagon[] = h3Indexes.map((index) => {
        const boundary = cellToBoundary(index, false); // Returns [lat, lng]
        return boundary.map(([lat, lng]) => ({lat, lng}));
      });

      const turfCoords = rings.map((ring) => ring.map(({lng, lat}) => [lng, lat]));
      const poly = turfPolygon(turfCoords);
      const calculatedArea = area(poly);
      setPolygonArea(calculatedArea);

      const totalHexagonArea = h3Indexes.reduce((sum, index) => sum + cellArea(index, 'm2'), 0);
      setHexagonArea(totalHexagonArea);

      setHexagons(newHexagons);
      setMapKey(Date.now());

      toast({
        title: 'Success!',
        description: `Generated ${newHexagons.length} H3 hexagons at resolution ${h3Resolution}.`,
      });
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Invalid WKT format.';
      toast({
        variant: 'destructive',
        title: 'Error Processing WKT',
        description: errorMessage,
      });
      setPolygon(null);
      setHexagons([]);
      setPolygonArea(null);
      setHexagonArea(null);
      setH3Indexes([]);
      setMapKey(Date.now());
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
          {polygonArea !== null && (
            <Card className="mx-2 mt-4">
              <CardHeader>
                <CardTitle>Area Calculation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-medium">Polygon Area</h3>
                  <p>{(polygonArea / 1_000_000).toFixed(4)} km²</p>
                  <p className="text-sm text-muted-foreground">{polygonArea.toFixed(2)} m²</p>
                </div>
                {hexagonArea !== null && (
                  <div>
                    <h3 className="font-medium">Total Hexagon Area</h3>
                    <p>{(hexagonArea / 1_000_000).toFixed(4)} km²</p>
                    <p className="text-sm text-muted-foreground">{hexagonArea.toFixed(2)} m²</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {h3Indexes.length > 0 && <HexCodeList h3Indexes={h3Indexes} resolution={resolution} />}
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <main className="relative h-screen w-full">
          <div className="absolute left-4 top-4 z-10">
            <SidebarTrigger />
          </div>
          <MapComponent key={mapKey} polygon={polygon} hexagons={hexagons} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
