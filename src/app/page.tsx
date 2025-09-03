'use client';

import {useState} from 'react';
import dynamic from 'next/dynamic';
import type {LatLngLiteral} from 'leaflet';
import {cellToBoundary, polygonToCells} from 'h3-js';
import {Layers} from 'lucide-react';

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

const MapComponent = dynamic(() => import('@/components/map-component'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

type Polygon = LatLngLiteral[];
type Hexagon = LatLngLiteral[];

export default function Home() {
  const [polygon, setPolygon] = useState<Polygon | null>(null);
  const [hexagons, setHexagons] = useState<Hexagon[]>([]);
  const {toast} = useToast();

  const handlePolygonSubmit = (data: {geoJson: string}) => {
    try {
      const parsed = JSON.parse(data.geoJson);
      let coordinates: number[][] = [];

      if (parsed.type === 'FeatureCollection') {
        const polygonFeature = parsed.features.find(
          (f: any) => f.geometry && f.geometry.type === 'Polygon'
        );
        if (!polygonFeature) throw new Error('No Polygon geometry found in FeatureCollection.');
        coordinates = polygonFeature.geometry.coordinates[0];
      } else if (parsed.type === 'Feature' && parsed.geometry && parsed.geometry.type === 'Polygon') {
        coordinates = parsed.geometry.coordinates[0];
      } else if (parsed.type === 'Polygon') {
        coordinates = parsed.coordinates[0];
      } else {
        throw new Error(
          'Invalid GeoJSON: Must be a Polygon, Feature, or FeatureCollection containing a Polygon.'
        );
      }

      // GeoJSON is [lng, lat], Leaflet is {lat, lng}
      const newPolygon: Polygon = coordinates.map(([lng, lat]) => ({lat, lng}));
      setPolygon(newPolygon);

      // H3.js expects [lat, lng] for polygons
      const h3Polygon = coordinates.map(([lng, lat]) => [lat, lng]);
      const h3Resolution = 10;
      const h3Indexes = polygonToCells(h3Polygon, h3Resolution, true);

      const newHexagons: Hexagon[] = h3Indexes.map((index) => {
        const boundary = cellToBoundary(index, true);
        return boundary.map(([lat, lng]) => ({lat, lng}));
      });

      setHexagons(newHexagons);

      toast({
        title: 'Success!',
        description: `Generated ${newHexagons.length} H3 hexagons at resolution ${h3Resolution}.`,
      });
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Invalid GeoJSON format.';
      toast({
        variant: 'destructive',
        title: 'Error Processing GeoJSON',
        description: errorMessage,
      });
      setPolygon(null);
      setHexagons([]);
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
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <main className="relative h-screen w-full">
          <div className="absolute left-4 top-4 z-10">
            <SidebarTrigger />
          </div>
          <MapComponent polygon={polygon} hexagons={hexagons} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
