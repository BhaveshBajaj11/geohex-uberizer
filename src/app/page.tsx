
'use client';

import {useState, useEffect} from 'react';
import type {LatLngLiteral} from 'leaflet';
import {cellToBoundary, polygonToCellsExperimental} from 'h3-js';
import {Layers} from 'lucide-react';
import dynamic from 'next/dynamic';
import PolygonForm from '@/components/polygon-form';
import {
  ResizableSidebar,
  ResizableSidebarContent,
  ResizableSidebarHeader,
  ResizableSidebarInset,
  ResizableSidebarProvider,
  ResizableSidebarTrigger,
} from '@/components/ui/resizable-sidebar';
import {useToast} from '@/hooks/use-toast';
import {Skeleton} from '@/components/ui/skeleton';
import PolygonList from '@/components/polygon-list';
import ScheduleTab from '@/components/scheduling/schedule-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { HexagonSchedule, ScheduledHexagon } from '@/types/scheduling';
import { generateTimeSlots, getNextAvailableTimeSlot, generateScheduleId, getHexagonNumber, createCustomTimeSlot } from '@/lib/scheduling-utils';
import { getHexagonsForTerminal } from './actions';

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
  
  // Scheduling state
  const [schedules, setSchedules] = useState<HexagonSchedule[]>([]);
  const [selectedHexagonsForSchedule, setSelectedHexagonsForSchedule] = useState<Set<string>>(new Set());
  const [scheduledHexagons, setScheduledHexagons] = useState<ScheduledHexagon[]>([]);
  const [activeTab, setActiveTab] = useState<string>('input');
  const [scheduleView, setScheduleView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>('');
  const [terminalHexagons, setTerminalHexagons] = useState<string[]>([]);
  const [isTimeInputOpen, setIsTimeInputOpen] = useState<boolean>(false);
  const [editingHexagonId, setEditingHexagonId] = useState<string | null>(null);

  useEffect(() => {
    // Update map hexagons when selection changes
    const selectedHexagons: Hexagon[] = Array.from(selectedH3Indexes).map((index, i) => {
      const boundary = cellToBoundary(index, true); // Returns [lng, lat]
      return {
        index,
        boundary: boundary.map(([lng, lat]) => ({lat, lng})), // This is the correct mapping for Leaflet
        number: i + 1,
      };
    });
    setRenderedHexagons(selectedHexagons);
  }, [selectedH3Indexes]);

  const handlePolygonSubmit = (data: {wkts: string[]; resolution: number; terminalId?: string}) => {
    let totalHexagons = 0;
    const newPolygonsData: PolygonData[] = [];
    const newH3Indexes: string[] = [];

    data.wkts.forEach((wktString, i) => {
      try {
        const wkt = wktString.trim();
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

        const newLeafletPolygon: LeafletPolygon = rings[0].map(([lng, lat]) => ({lat, lng}));

        const h3Polygon = rings.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
        const h3Resolution = data.resolution;

        const h3Indexes = polygonToCellsExperimental(h3Polygon, h3Resolution, "containmentOverlapping", false);
        totalHexagons += h3Indexes.length;

        const newPolygonData: PolygonData = {
          id: Date.now() + Math.random(),
          leafletPolygon: newLeafletPolygon,
          resolution: h3Resolution,
          allH3Indexes: h3Indexes,
        };
        newPolygonsData.push(newPolygonData);
        newH3Indexes.push(...h3Indexes);

      } catch (error) {
        console.error(`Error processing WKT string #${i + 1}:`, wktString, error);
        const errorMessage = error instanceof Error ? error.message : 'Invalid WKT format.';
        toast({
          variant: 'destructive',
          title: `Error in Polygon #${i + 1}`,
          description: errorMessage,
        });
        // Continue to next WKT string instead of stopping
      }
    });

    if(newPolygonsData.length > 0) {
      setPolygons((prev) => [...prev, ...newPolygonsData]);

      // Add new indexes to selection
      setSelectedH3Indexes((prev) => {
        const newSet = new Set(prev);
        newH3Indexes.forEach((index) => newSet.add(index));
        return newSet;
      });

      // Clear scheduling state when new hexagons are generated
      // This ensures old scheduled hexagons don't persist when switching terminals
      setSchedules([]);
      setSelectedHexagonsForSchedule(new Set());
      setScheduledHexagons([]);
      
      // Switch to polygons tab if currently on schedules
      if (activeTab === 'schedules') {
        setActiveTab('polygons');
      }

      setMapKey(Date.now());

      // Set the terminal ID if provided
      if (data.terminalId) {
        setSelectedTerminalId(data.terminalId);
      }

      toast({
        title: `${newPolygonsData.length} Polygon(s) Added!`,
        description: `Generated ${totalHexagons} H3 hexagons at resolution ${data.resolution}. Previous schedules have been cleared.`,
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
      
      // Also remove any scheduled hexagons from this polygon
      setScheduledHexagons((prev) => 
        prev.filter((sh) => !polygonToRemove.allH3Indexes.includes(sh.hexagonId))
      );
      setSelectedHexagonsForSchedule((prev) => {
        const newSet = new Set(prev);
        polygonToRemove.allH3Indexes.forEach((index) => newSet.delete(index));
        return newSet;
      });
    }
  };

  const handleClearAll = () => {
    setPolygons([]);
    setSelectedH3Indexes(new Set());
    setMapKey(Date.now());
    
    // Reset scheduling state when polygons are cleared
    setSchedules([]);
    setSelectedHexagonsForSchedule(new Set());
    setScheduledHexagons([]);
    
    // Switch back to polygons tab if currently on schedules
    if (activeTab === 'schedules') {
      setActiveTab('polygons');
    }
    
    toast({
      title: 'Cleared All Polygons',
      description: 'The map, list, and schedules have been reset.',
    });
  };

  // Scheduling functions
  const handleScheduleCreate = (name: string, hexagons: ScheduledHexagon[], terminalId?: string) => {
    const newSchedule: HexagonSchedule = {
      id: generateScheduleId(),
      name,
      terminalId: terminalId || selectedTerminalId || '',
      hexagons,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setSchedules(prev => [...prev, newSchedule]);
    setSelectedHexagonsForSchedule(new Set());
    setScheduledHexagons([]);
    
    toast({
      title: 'Schedule Created',
      description: `"${name}" has been created with ${hexagons.length} hexagons.`,
    });
  };

  const handleScheduleUpdate = (id: string, updates: Partial<HexagonSchedule>) => {
    setSchedules(prev => prev.map(schedule => {
      if (schedule.id === id) {
        const updatedSchedule = { ...schedule, ...updates, updatedAt: new Date() };
        
        // Ensure hexagons have correct polygonId
        if (updatedSchedule.hexagons) {
          updatedSchedule.hexagons = updatedSchedule.hexagons.map(hexagon => ({
            ...hexagon,
            polygonId: polygons.find(p => p.allH3Indexes.includes(hexagon.hexagonId))?.id || hexagon.polygonId,
          }));
        }
        
        return updatedSchedule;
      }
      return schedule;
    }));
    
    toast({
      title: 'Schedule Updated',
      description: 'The schedule has been updated successfully.',
    });
  };

  const handleScheduleDelete = (id: string) => {
    setSchedules(prev => prev.filter(schedule => schedule.id !== id));
    
    toast({
      title: 'Schedule Deleted',
      description: 'The schedule has been deleted successfully.',
    });
  };

  const handleScheduleDuplicate = (id: string) => {
    const scheduleToDuplicate = schedules.find(s => s.id === id);
    if (!scheduleToDuplicate) return;

    // Enforce one route per terminal
    const terminalIdForSchedule = scheduleToDuplicate.terminalId || '';
    const alreadyHasRouteForTerminal = schedules.some(s => s.terminalId === terminalIdForSchedule);
    if (alreadyHasRouteForTerminal) {
      toast({
        variant: 'destructive',
        title: 'Limit Reached',
        description: 'Only one route per terminal is allowed. Edit the existing route instead.',
      });
      return;
    }

    const duplicatedSchedule: HexagonSchedule = {
      ...scheduleToDuplicate,
      id: generateScheduleId(),
      name: `${scheduleToDuplicate.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setSchedules(prev => [...prev, duplicatedSchedule]);
    
    toast({
      title: 'Schedule Duplicated',
      description: `"${duplicatedSchedule.name}" has been created.`,
    });
  };

  const handleClearSchedulingState = () => {
    setSelectedHexagonsForSchedule(new Set());
    setScheduledHexagons([]);
  };

  const handleScheduleViewChange = (view: 'list' | 'create' | 'edit') => {
    setScheduleView(view);
  };

  const handleLocalScheduledHexagonsChange = (hexagons: ScheduledHexagon[]) => {
    // Update global state with local scheduled hexagons for new schedules
    setScheduledHexagons(hexagons);
  };

  const handleRoutesLoaded = (loadedRoutes: HexagonSchedule[]) => {
    // Merge loaded routes with existing schedules
    // Avoid duplicates by checking IDs
    // Also fix polygonId for each hexagon
    setSchedules(prev => {
      const existingIds = new Set(prev.map(s => s.id));
      const newRoutes = loadedRoutes.filter(route => !existingIds.has(route.id));
      
      // Fix polygonId for each hexagon in the loaded routes
      const fixedRoutes = newRoutes.map(route => ({
        ...route,
        hexagons: route.hexagons.map(hexagon => ({
          ...hexagon,
          polygonId: polygons.find(p => p.allH3Indexes.includes(hexagon.hexagonId))?.id || 0,
        })),
      }));
      
      return [...prev, ...fixedRoutes];
    });
    
    toast({
      title: 'Routes Loaded',
      description: `Loaded ${loadedRoutes.length} routes from Google Sheets.`,
    });
  };


  // Load hexagons for the selected terminal
  useEffect(() => {
    const loadTerminalHexagons = async () => {
      if (!selectedTerminalId) {
        setTerminalHexagons([]);
        return;
      }

      try {
        const result = await getHexagonsForTerminal(selectedTerminalId);
        if (result.success && result.data) {
          setTerminalHexagons(result.data);
        } else {
          console.error('Failed to load hexagons for terminal:', result.error);
          setTerminalHexagons([]);
        }
      } catch (error) {
        console.error('Error loading hexagons for terminal:', error);
        setTerminalHexagons([]);
      }
    };

    loadTerminalHexagons();
  }, [selectedTerminalId]);

  const handleHexagonSelect = (hexagonId: string) => {
    const allTimeSlots = generateTimeSlots();
    const assignedTimeSlots = scheduledHexagons.map(h => h.timeSlot);
    const nextSlot = getNextAvailableTimeSlot(allTimeSlots, assignedTimeSlots);
    
    if (!nextSlot) {
      // No toast popup - visual indicators in the UI are sufficient
      return;
    }

    const hexagonNumber = getHexagonNumber(hexagonId, Array.from(selectedH3Indexes));
    const polygonId = polygons.find(p => p.allH3Indexes.includes(hexagonId))?.id || 0;
    
    const newScheduledHexagon: ScheduledHexagon = {
      hexagonId,
      hexagonNumber,
      timeSlot: nextSlot,
      polygonId,
    };

    setScheduledHexagons(prev => [...prev, newScheduledHexagon]);
    setSelectedHexagonsForSchedule(prev => new Set([...prev, hexagonId]));
  };

  // New handler for map clicks that triggers time input
  const handleMapHexagonClick = (hexagonId: string) => {
    // Prevent selecting another hexagon while time input is open
    if (isTimeInputOpen) {
      return;
    }
    // Check if hexagon is already scheduled
    const isScheduled = scheduledHexagons.some(h => h.hexagonId === hexagonId);
    
    if (isScheduled) {
      // If already scheduled, deselect it
      handleHexagonDeselect(hexagonId);
    } else {
      // If not scheduled, add it to selected hexagons (this will trigger time input in ScheduleEditor)
      setSelectedHexagonsForSchedule(prev => new Set([...prev, hexagonId]));
    }
  };

  const handleHexagonDeselect = (hexagonId: string) => {
    setScheduledHexagons(prev => prev.filter(h => h.hexagonId !== hexagonId));
    setSelectedHexagonsForSchedule(prev => {
      const newSet = new Set(prev);
      newSet.delete(hexagonId);
      return newSet;
    });
  };

  const handleHexagonSelectWithCustomTime = (hexagonId: string, timeSlot: any, duration: number) => {
    const hexagonNumber = getHexagonNumber(hexagonId, Array.from(selectedH3Indexes));
    const polygonId = polygons.find(p => p.allH3Indexes.includes(hexagonId))?.id || 0;
    
    const newScheduledHexagon: ScheduledHexagon = {
      hexagonId,
      hexagonNumber,
      timeSlot,
      polygonId,
      customDuration: duration,
    };

    setScheduledHexagons(prev => [...prev, newScheduledHexagon]);
    setSelectedHexagonsForSchedule(prev => new Set([...prev, hexagonId]));
  };

  // Get all available hexagons for scheduling
  // Include both current session hexagons and terminal hexagons
  const sessionHexagons = Array.from(selectedH3Indexes);
  const availableHexagons = Array.from(new Set([...sessionHexagons, ...terminalHexagons]));


  return (
    <ResizableSidebarProvider defaultWidth={320} minWidth={200} maxWidth={500}>
      <ResizableSidebar>
        <ResizableSidebarHeader>
          <div className="flex items-center gap-3 p-2">
            <Layers className="h-8 w-8 text-primary" />
            <h1 className="font-headline text-xl font-semibold">GeoHex Uberizer</h1>
          </div>
        </ResizableSidebarHeader>
        <ResizableSidebarContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mx-2 mt-2">
              <TabsTrigger value="input">Input</TabsTrigger>
              <TabsTrigger value="schedules" disabled={availableHexagons.length === 0}>
                Schedule Routes ({Math.max(0, availableHexagons.length - scheduledHexagons.length)})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="input" className="mt-4">
              <PolygonForm onSubmit={handlePolygonSubmit} />
              <PolygonList
                polygons={polygons}
                selectedH3Indexes={selectedH3Indexes}
                onSelectionChange={handleHexagonSelectionChange}
                onSelectAll={handleSelectAllInPolygon}
                onHexHover={handleHexHover}
                onRemovePolygon={handleRemovePolygon}
                onClearAll={handleClearAll}
              />
            </TabsContent>
            
            <TabsContent value="schedules" className="mt-4">
              <ScheduleTab
                schedules={schedules}
                availableHexagons={availableHexagons}
                onScheduleCreate={handleScheduleCreate}
                onScheduleUpdate={handleScheduleUpdate}
                onScheduleDelete={handleScheduleDelete}
                onScheduleDuplicate={handleScheduleDuplicate}
                onHexagonSelect={handleHexagonSelect}
                onHexagonDeselect={handleHexagonDeselect}
                onHexagonSelectWithCustomTime={handleHexagonSelectWithCustomTime}
                selectedHexagons={selectedHexagonsForSchedule}
                scheduledHexagons={scheduledHexagons}
                onRoutesLoaded={handleRoutesLoaded}
                onViewChange={handleScheduleViewChange}
                onLocalScheduledHexagonsChange={handleLocalScheduledHexagonsChange}
                selectedTerminalId={selectedTerminalId}
                onClearSchedulingState={handleClearSchedulingState}
                onHexagonVisualSelect={(hexagonId) => setSelectedHexagonsForSchedule(prev => new Set([...prev, hexagonId]))}
                onTimeInputOpenChange={(open) => setIsTimeInputOpen(open)}
                onEditHexagonChange={(hexId) => setEditingHexagonId(hexId)}
              />
            </TabsContent>
          </Tabs>
        </ResizableSidebarContent>
      </ResizableSidebar>
      <ResizableSidebarInset>
        <main className="relative h-screen w-full">
          <div className="absolute left-4 top-4 z-10">
            <ResizableSidebarTrigger />
          </div>
          <MapComponent
            key={mapKey}
            polygons={polygons.map((p) => p.leafletPolygon)}
            hexagons={renderedHexagons}
            hoveredHexIndex={hoveredHexIndex}
            scheduledHexagons={scheduledHexagons}
            selectedHexagonsForSchedule={selectedHexagonsForSchedule}
            onHexagonClick={activeTab === 'schedules' && (scheduleView === 'create' || scheduleView === 'edit') ? handleMapHexagonClick : undefined}
            editingHexagonId={editingHexagonId}
          />
        </main>
      </ResizableSidebarInset>
    </ResizableSidebarProvider>
  );
}
