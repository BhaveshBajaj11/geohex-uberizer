
'use client';

import {useState, useEffect, useRef, useMemo} from 'react';
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
import { NodeClusterVisualizer } from '@/components/node-cluster-visualizer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { HexagonSchedule, ScheduledHexagon } from '@/types/scheduling';
import { generateTimeSlots, getNextAvailableTimeSlot, generateScheduleId, getHexagonNumber, createCustomTimeSlot } from '@/lib/scheduling-utils';
import { getHexagonsForTerminal } from './actions';
import { getRoadsForHexagon, prefetchRoadsForHexagons, getRoadsForPolygon, getNodesForPolygon, getNodesForHexagon, getNodePathsForPolygon, testDistanceCalculation, type NodesInHexResult, type NodeCluster, type NodePath, type NodeJoiningResult } from './osm-actions';

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
  const [roadsForHex, setRoadsForHex] = useState<Record<string, { polylines: LatLngLiteral[][]; totalMeters: number; ts: number }>>({});
  const [activeRoadsHexId, setActiveRoadsHexId] = useState<string | null>(null);
  const inFlightFetchesRef = useRef<Set<string>>(new Set());
  const inFlightPolygonFetchRef = useRef<Set<number>>(new Set());
  const hideOverlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryFailedFetches = useRef<Map<string, { count: number; lastRetry: number }>>(new Map());
  const [clusterHexIds, setClusterHexIds] = useState<Set<string>>(new Set());
  // New UI state for roads/satellite/measurement
  const [basemap, setBasemap] = useState<'osm' | 'satellite'>('satellite');
  const [showHexagons, setShowHexagons] = useState<boolean>(false);
  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<LatLngLiteral[]>([]);
  const [polygonRoads, setPolygonRoads] = useState<LatLngLiteral[][]>([]);
  
  // Compute all roads from both polygon roads and individual hex roads
  const allRoads = useMemo(() => {
    const hexRoads = Object.values(roadsForHex).flatMap(hex => hex.polylines);
    const combined = [...polygonRoads, ...hexRoads];
    console.log('🛣️ All roads computed:', {
      polygonRoads: polygonRoads.length,
      hexRoads: hexRoads.length,
      total: combined.length,
      hexRoadsByHex: Object.entries(roadsForHex).map(([hex, data]) => ({
        hex: hex.slice(-6),
        polylines: data.polylines.length,
        totalMeters: data.totalMeters
      }))
    });
    return combined;
  }, [polygonRoads, roadsForHex]);
  
  // Node clustering state
  const [polygonNodes, setPolygonNodes] = useState<Record<string, NodesInHexResult>>({});
  const [allClusters, setAllClusters] = useState<NodeCluster[]>([]);
  const [showNodes, setShowNodes] = useState<boolean>(false);
  const [nodesLoading, setNodesLoading] = useState<boolean>(false);
  
  // Node paths state
  const [polygonNodePaths, setPolygonNodePaths] = useState<Record<string, NodeJoiningResult>>({});
  const [allNodePaths, setAllNodePaths] = useState<NodePath[]>([]);
  const [showNodePaths, setShowNodePaths] = useState<boolean>(false);
  const [nodePathsLoading, setNodePathsLoading] = useState<boolean>(false);

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

  // Prefetch roads and lengths after polygons/hexes load, with limited concurrency
  // Disable old prefetch flow to reduce requests; polygon batch fetch is used on submit
  // useEffect(() => {}, [selectedH3Indexes]);

  const handlePolygonSubmit = (data: {wkts: string[]; resolution: number; terminalId?: string}) => {
    let totalHexagons = 0;
    const newPolygonsData: PolygonData[] = [];
    const newH3Indexes: string[] = [];

    const perPolygonHexIndexes: string[][] = [];
    const perPolygonLeaflet: LeafletPolygon[] = [];

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
        perPolygonHexIndexes.push(h3Indexes);
        perPolygonLeaflet.push(newLeafletPolygon);

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
      
      // Clear previous node data
      setPolygonNodes({});
      setAllClusters([]);
      setShowNodes(false);
      
      // Clear previous node paths data
      setPolygonNodePaths({});
      setAllNodePaths([]);
      setShowNodePaths(false);
      
      // Switch to polygons tab if currently on schedules
      if (activeTab === 'schedules') {
        setActiveTab('polygons');
      }

      setMapKey(Date.now());

      // Batch fetch roads and nodes once per polygon and split per hex to prime cache
      perPolygonHexIndexes.forEach(async (hexes, idx) => {
        if (hexes.length === 0) return;
        try {
          // Fetch roads
          const res = await getRoadsForPolygon(perPolygonLeaflet[idx], hexes);
          setRoadsForHex(prev => ({
            ...prev,
            ...Object.fromEntries(hexes.map(h => [h, { polylines: (res[h]?.polylines || []) as LatLngLiteral[][], totalMeters: res[h]?.totalMeters || 0, ts: Date.now() }]))
          }));
          // Aggregate all roads across hexes to display for the whole polygon
          const lines = Object.values(res).flatMap(v => (v?.polylines || [])) as LatLngLiteral[][];
          setPolygonRoads(prev => [...prev, ...lines]);
          
          // Fetch nodes and clusters
          setNodesLoading(true);
          console.log('Fetching nodes for polygon', idx, 'with hexes:', hexes.length);
          const nodesRes = await getNodesForPolygon(perPolygonLeaflet[idx], hexes);
          console.log('Nodes response:', nodesRes);
          console.log('Raw response structure:', Object.keys(nodesRes));
          
          // Update polygon nodes
          setPolygonNodes(prev => {
            const updated = { ...prev, ...nodesRes };
            console.log('Updated polygon nodes keys:', Object.keys(updated));
            
            // Aggregate all clusters from ALL polygon nodes (not just this polygon)
            const allClusters = Object.values(updated).flatMap(nodeResult => {
              console.log('Processing hex result:', nodeResult.hexIndex, 'clusters:', nodeResult.clusters.length);
              return nodeResult.clusters;
            });
            console.log('Total clusters found:', allClusters.length);
            setAllClusters(allClusters);
            
            return updated;
          });
          
          setNodesLoading(false);
          
          // Fetch node paths for the polygon
          setNodePathsLoading(true);
          try {
            console.log('Fetching node paths for polygon', idx, 'with hexes:', hexes.length);
            const nodePathsRes = await getNodePathsForPolygon(perPolygonLeaflet[idx], hexes);
            console.log('Node paths response:', nodePathsRes);
            
            // Update polygon node paths
            setPolygonNodePaths(prev => {
              const updated = { ...prev, ...nodePathsRes };
              
              // Aggregate all paths from ALL polygon node paths
              const allPaths = Object.values(updated).flatMap(nodePathResult => {
                console.log('Processing hex node paths result:', nodePathResult.hexIndex, 'paths:', nodePathResult.paths.length);
                return nodePathResult.paths;
              });
              console.log('Total node paths found:', allPaths.length);
              setAllNodePaths(allPaths);
              
              return updated;
            });
            
            setNodePathsLoading(false);
          } catch (err) {
            console.error('Error fetching node paths:', err);
            setNodePathsLoading(false);
          }
        } catch (err) {
          console.error('Error fetching polygon data:', err);
          setNodesLoading(false);
        }
      });

      // Switch to satellite basemap and show roads by default when polygons are added
      setBasemap('satellite');
      setShowHexagons(false);
      setMeasureMode(false);
      setMeasurePoints([]);

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

  // Retry mechanism for failed fetches
  const retryWithBackoff = async (hexIndex: string, fetchFn: () => Promise<any>, maxRetries = 3) => {
    const retryInfo = retryFailedFetches.current.get(hexIndex) || { count: 0, lastRetry: 0 };
    const now = Date.now();
    const backoffMs = Math.min(1000 * Math.pow(2, retryInfo.count), 10000); // Max 10s backoff
    
    if (retryInfo.count >= maxRetries || (now - retryInfo.lastRetry) < backoffMs) {
      return null;
    }
    
    retryInfo.count++;
    retryInfo.lastRetry = now;
    retryFailedFetches.current.set(hexIndex, retryInfo);
    
    console.log(`🔄 Retrying hex ${hexIndex} (attempt ${retryInfo.count}/${maxRetries})`);
    return fetchFn();
  };

  // Function to retry all failed hexagons
  const retryAllFailedHexagons = async () => {
    const failedHexes = Array.from(retryFailedFetches.current.keys());
    console.log(`🔄 Retrying ${failedHexes.length} failed hexagons...`);
    
    for (const hexIndex of failedHexes) {
      try {
        const res = await getRoadsForHexagon(hexIndex);
        if (res && res.polylines && res.polylines.length > 0) {
          setRoadsForHex((prev) => ({
            ...prev,
            [hexIndex]: { polylines: res.polylines, totalMeters: res.totalMeters, ts: Date.now() },
          }));
          retryFailedFetches.current.delete(hexIndex);
          console.log(`✅ Successfully retried hex ${hexIndex}`);
        }
      } catch (error) {
        console.error(`❌ Retry failed for hex ${hexIndex}:`, error);
      }
    }
  };

  // Function to debug specific hexagons
  const debugSpecificHexagons = async () => {
    const problematicHexes = ['8a603601504ffff', '8a6036015a17fff'];
    console.log(`🔍 Debugging specific hexagons: ${problematicHexes.join(', ')}`);
    
    for (const hexIndex of problematicHexes) {
      try {
        console.log(`🔍 Testing hex ${hexIndex}...`);
        const res = await getRoadsForHexagon(hexIndex);
        console.log(`📊 Hex ${hexIndex} result:`, {
          polylines: res.polylines?.length || 0,
          totalMeters: res.totalMeters || 0,
          error: res.error || 'none'
        });
        
        if (res.polylines && res.polylines.length > 0) {
          setRoadsForHex((prev) => ({
            ...prev,
            [hexIndex]: { polylines: res.polylines, totalMeters: res.totalMeters, ts: Date.now() },
          }));
          console.log(`✅ Successfully loaded roads for hex ${hexIndex}`);
        } else {
          console.log(`⚠️ No roads found for hex ${hexIndex}`);
        }
      } catch (error) {
        console.error(`❌ Error testing hex ${hexIndex}:`, error);
      }
    }
  };

  // Function to load roads for all selected hexagons
  const loadAllSelectedHexagonRoads = async () => {
    const selectedHexes = Array.from(selectedH3Indexes);
    console.log(`🛣️ Loading roads for ${selectedHexes.length} selected hexagons...`);
    
    for (const hexIndex of selectedHexes) {
      if (inFlightFetchesRef.current.has(hexIndex)) continue;
      
      try {
        inFlightFetchesRef.current.add(hexIndex);
        const res = await getRoadsForHexagon(hexIndex);
        
        if (res.polylines && res.polylines.length > 0) {
          setRoadsForHex((prev) => {
            const updated = {
              ...prev,
              [hexIndex]: { polylines: res.polylines, totalMeters: res.totalMeters, ts: Date.now() },
            };
            console.log(`✅ Loaded ${res.polylines.length} road segments for hex ${hexIndex}`, {
              totalHexes: Object.keys(updated).length,
              totalRoads: Object.values(updated).reduce((sum, data) => sum + data.polylines.length, 0)
            });
            return updated;
          });
        } else {
          console.log(`⚠️ No roads found for hex ${hexIndex}`);
        }
      } catch (error) {
        console.error(`❌ Failed to load roads for hex ${hexIndex}:`, error);
      } finally {
        inFlightFetchesRef.current.delete(hexIndex);
      }
    }
  };

  const handleHexHover = (index: string | null) => {
    setHoveredHexIndex(index);
    // Graceful hide to avoid flicker when moving cursor quickly
    if (!index) {
      if (hideOverlayTimerRef.current) clearTimeout(hideOverlayTimerRef.current);
      hideOverlayTimerRef.current = setTimeout(() => setActiveRoadsHexId(null), 300);
      return;
    }
    if (hideOverlayTimerRef.current) {
      clearTimeout(hideOverlayTimerRef.current);
      hideOverlayTimerRef.current = null;
    }
    setActiveRoadsHexId(index);

    const cached = roadsForHex[index];
    const now = Date.now();
    const ttlMs = 60_000; // 1 minute TTL for refresh
    // Always refetch immediately if cache is empty; otherwise refresh after TTL
    const shouldFetch = !cached || cached.polylines.length === 0 || (now - cached.ts > ttlMs);
    if (!shouldFetch) return;

    // Prefer fetching once per polygon and splitting per hex
    const owningPolygon = polygons.find(p => p.allH3Indexes.includes(index));
    if (owningPolygon) {
      if (inFlightPolygonFetchRef.current.has(owningPolygon.id)) return;
      inFlightPolygonFetchRef.current.add(owningPolygon.id);
      getRoadsForPolygon(owningPolygon.leafletPolygon, owningPolygon.allH3Indexes)
        .then((res) => {
          const computeHaversine = (a: LatLngLiteral, b: LatLngLiteral) => {
            const R = 6371000;
            const toRad = (x: number) => (x * Math.PI) / 180;
            const dLat = toRad(b.lat - a.lat);
            const dLon = toRad(b.lng - a.lng);
            const lat1 = toRad(a.lat);
            const lat2 = toRad(b.lat);
            const sinDLat = Math.sin(dLat / 2);
            const sinDLon = Math.sin(dLon / 2);
            const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
            const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
            return R * c;
          };
          const computeTotal = (lines: LatLngLiteral[][]) => {
            let total = 0;
            for (const line of lines) {
              for (let i = 1; i < line.length; i++) {
                total += computeHaversine(line[i - 1], line[i]);
              }
            }
            return total;
          };
          setRoadsForHex((prev) => {
            const updates = Object.fromEntries(owningPolygon.allH3Indexes.map(h => {
              const lines = (res[h]?.polylines || []) as LatLngLiteral[][];
              const meters = (res[h]?.totalMeters && res[h]?.totalMeters > 0) ? res[h]!.totalMeters : computeTotal(lines);
              return [h, { polylines: lines, totalMeters: meters, ts: Date.now() }];
            }));
            const updated = { ...prev, ...updates };
            console.log(`🛣️ Updated roadsForHex for polygon ${owningPolygon.id}:`, {
              hexes: Object.keys(updates).length,
              totalRoads: Object.values(updates).reduce((sum, data) => sum + data.polylines.length, 0),
              totalHexes: Object.keys(updated).length
            });
            return updated;
          });
        })
        .catch((error) => {
          console.error(`❌ Failed to fetch roads for polygon ${owningPolygon.id}:`, error);
          // Mark all hexes in this polygon as failed for potential retry
          owningPolygon.allH3Indexes.forEach(hexIndex => {
            const retryInfo = retryFailedFetches.current.get(hexIndex) || { count: 0, lastRetry: 0 };
            retryFailedFetches.current.set(hexIndex, retryInfo);
          });
        })
        .finally(() => {
          inFlightPolygonFetchRef.current.delete(owningPolygon.id);
        });
      return;
    }

    // Fallback: fetch for the single hex if we can't map it to a polygon
    if (inFlightFetchesRef.current.has(index)) return;
    inFlightFetchesRef.current.add(index);
    getRoadsForHexagon(index)
      .then((res) => {
        const computeHaversine = (a: LatLngLiteral, b: LatLngLiteral) => {
          const R = 6371000;
          const toRad = (x: number) => (x * Math.PI) / 180;
          const dLat = toRad(b.lat - a.lat);
          const dLon = toRad(b.lng - a.lng);
          const lat1 = toRad(a.lat);
          const lat2 = toRad(b.lat);
          const sinDLat = Math.sin(dLat / 2);
          const sinDLon = Math.sin(dLon / 2);
          const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
          const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
          return R * c;
        };
        const computeTotal = (lines: LatLngLiteral[][]) => {
          let total = 0;
          for (const line of lines) {
            for (let i = 1; i < line.length; i++) {
              total += computeHaversine(line[i - 1], line[i]);
            }
          }
          return total;
        };
        const polylines = (res.polylines || []) as LatLngLiteral[][];
        const totalMeters = res.totalMeters && res.totalMeters > 0 ? res.totalMeters : computeTotal(polylines);
        setRoadsForHex((prev) => {
          const updated = {
            ...prev,
            [index]: { polylines, totalMeters, ts: Date.now() },
          };
          console.log(`🛣️ Updated roadsForHex for hex ${index}:`, {
            polylines: polylines.length,
            totalMeters,
            totalHexes: Object.keys(updated).length
          });
          return updated;
        });
      })
      .catch((error) => {
        console.error(`❌ Failed to fetch roads for hex ${index}:`, error);
        setRoadsForHex((prev) => ({
          ...prev,
          [index]: { polylines: [], totalMeters: 0, ts: Date.now() },
        }));
        // Schedule a retry if this was a network error
        if (error.message?.includes('Failed to fetch') || error.message?.includes('API failed')) {
          setTimeout(() => {
            retryWithBackoff(index, () => getRoadsForHexagon(index))
              ?.then((res) => {
                if (res) {
                  const polylines = (res.polylines || []) as LatLngLiteral[][];
                  const totalMeters = res.totalMeters || 0;
                  setRoadsForHex((prev) => ({
                    ...prev,
                    [index]: { polylines, totalMeters, ts: Date.now() },
                  }));
                  console.log(`✅ Retry successful for hex ${index}`);
                }
              })
              .catch((retryError) => {
                console.error(`❌ Retry failed for hex ${index}:`, retryError);
              });
          }, 2000); // Wait 2 seconds before retry
        }
      })
      .finally(() => {
        inFlightFetchesRef.current.delete(index);
      });
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
    setPolygonRoads([]);
    setPolygonNodes({});
    setAllClusters([]);
    setShowNodes(false);
    setPolygonNodePaths({});
    setAllNodePaths([]);
    setShowNodePaths(false);
    setBasemap('osm');
    setShowHexagons(false);
    setMeasureMode(false);
    setMeasurePoints([]);
    
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
          <div className="px-2 pt-2">
            <div className="rounded-md bg-black/70 text-white border border-white/20 px-3 py-2 shadow flex items-center gap-2">
              <label className="text-xs mr-1">Basemap</label>
              <button
                className={`text-xs px-2 py-1 rounded ${basemap === 'osm' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                onClick={() => setBasemap('osm')}
              >OSM</button>
              <button
                className={`text-xs px-2 py-1 rounded ${basemap === 'satellite' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                onClick={() => setBasemap('satellite')}
              >Satellite</button>
              <div className="w-px h-4 bg-white/30 mx-2" />
              <label className="text-xs">Nodes</label>
              <button
                className={`text-xs px-2 py-1 rounded ${
                  nodesLoading ? 'bg-blue-600' : 
                  showNodes ? 'bg-purple-600' : 
                  Object.keys(polygonNodes).length === 0 ? 'bg-gray-600 opacity-50' : 'bg-gray-800 hover:bg-gray-700'
                }`}
                onClick={() => setShowNodes((n) => !n)}
                disabled={Object.keys(polygonNodes).length === 0 && !nodesLoading}
                title={
                  nodesLoading ? 'Loading nodes...' :
                  Object.keys(polygonNodes).length === 0 ? 'No node data - draw a polygon first' :
                  `${Object.values(polygonNodes).reduce((sum, n) => sum + n.totalNodes, 0)} nodes, ${allClusters.length} clusters available`
                }
              >
                {nodesLoading ? 'Loading...' : showNodes ? 'On' : 'Off'}
              </button>
              <div className="w-px h-4 bg-white/30 mx-2" />
              <label className="text-xs">Paths</label>
              <button
                className={`text-xs px-2 py-1 rounded ${
                  nodePathsLoading ? 'bg-blue-600' : 
                  showNodePaths ? 'bg-green-600' : 
                  Object.keys(polygonNodePaths).length === 0 ? 'bg-gray-600 opacity-50' : 'bg-gray-800 hover:bg-gray-700'
                }`}
                onClick={() => setShowNodePaths((p) => !p)}
                disabled={Object.keys(polygonNodePaths).length === 0 && !nodePathsLoading}
                title={
                  nodePathsLoading ? 'Loading node paths...' :
                  Object.keys(polygonNodePaths).length === 0 ? 'No node paths data - draw a polygon first' :
                  `${allNodePaths.length} total paths, ${allNodePaths.filter(p => p.pathType === 'optimal').length} optimal (225-270m)`
                }
              >
                {nodePathsLoading ? 'Loading...' : showNodePaths ? 'On' : 'Off'}
              </button>
              <div className="w-px h-4 bg-white/30 mx-2" />
              <label className="text-xs">Measure</label>
              <button
                className={`text-xs px-2 py-1 rounded ${measureMode ? 'bg-emerald-600' : 'bg-gray-800 hover:bg-gray-700'}`}
                onClick={() => setMeasureMode((m) => !m)}
              >{measureMode ? 'On' : 'Off'}</button>
              {measureMode && measurePoints.length > 0 && (
                <button
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 ml-2"
                  onClick={() => setMeasurePoints([])}
                >Clear Points</button>
              )}
              <div className="w-px h-4 bg-white/30 mx-2" />
              <button
                className="text-xs px-2 py-1 rounded bg-orange-600 hover:bg-orange-700"
                onClick={retryAllFailedHexagons}
                title="Retry failed road fetches"
              >Retry Roads</button>
              <button
                className="text-xs px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 ml-2"
                onClick={debugSpecificHexagons}
                title="Debug specific failing hexagons"
              >Debug Hexes</button>
              <button
                className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 ml-2"
                onClick={loadAllSelectedHexagonRoads}
                title="Load roads for all selected hexagons"
                disabled={selectedH3Indexes.size === 0}
              >Load All Roads</button>
              <button
                className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-700 ml-2"
                onClick={() => {
                  console.log('🔄 Force refreshing map...');
                  setMapKey(prev => prev + 1);
                }}
                title="Force refresh map"
              >Refresh Map</button>
              <div className="text-xs text-white/80 ml-2">
                Roads: {allRoads.length} | Hexes: {Object.keys(roadsForHex).length}
              </div>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mx-2 mt-2">
              <TabsTrigger value="input">Input</TabsTrigger>
              <TabsTrigger value="schedules" disabled={availableHexagons.length === 0}>
                Schedule Routes ({Math.max(0, availableHexagons.length - scheduledHexagons.length)})
              </TabsTrigger>
              <TabsTrigger value="nodes">Node Analysis</TabsTrigger>
              <TabsTrigger value="paths">Node Paths</TabsTrigger>
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
            
            <TabsContent value="nodes" className="mt-4">
              <div className="space-y-4">
                {polygons.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Create a polygon first to see node analysis
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Summary for entire polygon */}
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="font-semibold mb-2">Polygon Node Analysis</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>Total Hexagons: <span className="font-medium">{Array.from(selectedH3Indexes).length}</span></div>
                        <div>Total Nodes: <span className="font-medium">{Object.values(polygonNodes).reduce((sum, n) => sum + n.totalNodes, 0)}</span></div>
                        <div>Total Segments: <span className="font-medium">{Object.values(polygonNodes).reduce((sum, n) => sum + n.segments.length, 0)}</span></div>
                        <div>Optimal Clusters: <span className="font-medium text-green-600">{allClusters.length}</span></div>
                      </div>
                      {nodesLoading && (
                        <div className="mt-2 text-sm text-blue-600">Loading node data...</div>
                      )}
                      {!nodesLoading && allClusters.length === 0 && Object.keys(polygonNodes).length > 0 && (
                        <div className="mt-2 text-sm text-yellow-600">
                          No optimal clusters found in this area. Try a more road-dense location.
                        </div>
                      )}
                    </div>

                    {/* Cluster list */}
                    {allClusters.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium">
                          Found {allClusters.filter(c => c.totalLengthMeters >= 225 && c.totalLengthMeters <= 270).length} optimal clusters + {allClusters.filter(c => c.totalLengthMeters < 225).length} sub-optimal
                        </h4>
                        <div className="grid gap-2 max-h-96 overflow-y-auto">
                          {allClusters.map((cluster, index) => {
                            const isOptimal = cluster.totalLengthMeters >= 225 && cluster.totalLengthMeters <= 270;
                            return (
                              <div key={cluster.id} className="bg-gray-50 rounded p-3 text-sm">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-medium">Cluster {index + 1}</span>
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    isOptimal ? 'bg-green-100 text-green-800' : 
                                    cluster.totalLengthMeters > 270 ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {Math.round(cluster.totalLengthMeters)}m {isOptimal ? '✅' : cluster.totalLengthMeters < 225 ? '⚠️' : '❌'}
                                  </span>
                                </div>
                                <div className="text-gray-600">
                                  {cluster.nodes.length} nodes • {cluster.segments.length} segments
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Center: {cluster.centroid.lat.toFixed(6)}, {cluster.centroid.lng.toFixed(6)}
                                </div>
                                <div className="text-xs mt-1">
                                  {isOptimal ? 'Perfect for 15-min delivery' : 
                                   cluster.totalLengthMeters < 225 ? 'Too short for optimal delivery' :
                                   'Too long for single 15-min interval'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Debug section */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <h4 className="font-medium text-yellow-800 mb-2">Debug Info</h4>
                      <div className="text-xs space-y-1">
                        <div>Polygons: {polygons.length}</div>
                        <div>Selected hexes: {Array.from(selectedH3Indexes).length}</div>
                        <div>Node results: {Object.keys(polygonNodes).length}</div>
                        <div>All clusters: {allClusters.length}</div>
                        <div>Button disabled: {(allClusters.length === 0 && !nodesLoading) ? 'Yes' : 'No'}</div>
                        <div>Loading: {nodesLoading ? 'Yes' : 'No'}</div>
                        {Object.keys(polygonNodes).length > 0 && (
                          <div className="mt-2 p-2 bg-white rounded text-xs">
                            <div className="font-medium">Per-hex clusters:</div>
                            {Object.entries(polygonNodes).map(([hexId, result]) => (
                              <div key={hexId}>{hexId.slice(-6)}: {result.clusters.length} clusters</div>
                            ))}
                          </div>
                        )}
                        <button 
                          onClick={async () => {
                            try {
                              console.log('Testing nodes API...');
                              const testHex = '8a2a1072b59ffff'; // Example hex
                              const result = await getNodesForHexagon(testHex);
                              console.log('Test result:', result);
                              alert(`Test successful! Found ${result.clusters.length} clusters`);
                            } catch (err) {
                              console.error('Test failed:', err);
                              alert('Test failed - check console');
                            }
                          }}
                          className="mt-2 px-2 py-1 bg-yellow-500 text-white rounded text-xs"
                        >
                          Test Nodes API
                        </button>
                        <button 
                          onClick={() => {
                            console.log('Testing distance calculation...');
                            testDistanceCalculation();
                            alert('Check console for test results');
                          }}
                          className="mt-2 ml-2 px-2 py-1 bg-blue-500 text-white rounded text-xs"
                        >
                          Test Distance Calc
                        </button>
                      </div>
                    </div>

                    {/* Fallback to manual hex input */}
                    <details className="bg-gray-50 rounded p-4">
                      <summary className="cursor-pointer font-medium">Manual Hex Analysis</summary>
                      <div className="mt-2">
                        <NodeClusterVisualizer />
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="paths" className="mt-4">
              <div className="space-y-4">
                {polygons.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Create a polygon first to see node paths analysis
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Summary for entire polygon */}
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="font-semibold mb-2">Node Paths Analysis</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>Total Hexagons: <span className="font-medium">{Array.from(selectedH3Indexes).length}</span></div>
                        <div>Total Paths: <span className="font-medium">{allNodePaths.length}</span></div>
                        <div>Optimal Paths (225-270m): <span className="font-medium text-green-600">{allNodePaths.filter(p => p.pathType === 'optimal').length}</span></div>
                        <div>Suboptimal Paths: <span className="font-medium text-yellow-600">{allNodePaths.filter(p => p.pathType !== 'optimal').length}</span></div>
                      </div>
                      {nodePathsLoading && (
                        <div className="mt-2 text-sm text-blue-600">Loading node paths data...</div>
                      )}
                      {!nodePathsLoading && allNodePaths.length === 0 && Object.keys(polygonNodePaths).length > 0 && (
                        <div className="mt-2 text-sm text-yellow-600">
                          No node paths found in this area. Try a more road-dense location.
                        </div>
                      )}
                    </div>

                    {/* Path list */}
                    {allNodePaths.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium">
                          Found {allNodePaths.filter(p => p.pathType === 'optimal').length} optimal paths + {allNodePaths.filter(p => p.pathType !== 'optimal').length} suboptimal
                        </h4>
                        <div className="grid gap-2 max-h-96 overflow-y-auto">
                          {allNodePaths.map((path, index) => {
                            const isOptimal = path.pathType === 'optimal';
                            return (
                              <div key={path.id} className="bg-gray-50 rounded p-3 text-sm">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-medium">Path {index + 1}</span>
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    isOptimal ? 'bg-green-100 text-green-800' : 
                                    path.pathType === 'too_short' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {Math.round(path.totalLengthMeters)}m {isOptimal ? '✅' : path.pathType === 'too_short' ? '⚠️' : '❌'}
                                  </span>
                                </div>
                                <div className="text-gray-600">
                                  {path.nodes.length} nodes • {Math.round(path.totalLengthMeters)}m total
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Start: {path.nodes[0].lat.toFixed(6)}, {path.nodes[0].lng.toFixed(6)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  End: {path.nodes[path.nodes.length - 1].lat.toFixed(6)}, {path.nodes[path.nodes.length - 1].lng.toFixed(6)}
                                </div>
                                <div className="text-xs mt-1">
                                  {isOptimal ? 'Perfect for 15-min delivery route' : 
                                   path.pathType === 'too_short' ? 'Too short for optimal delivery' :
                                   'Too long for single 15-min interval'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Debug section */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <h4 className="font-medium text-yellow-800 mb-2">Debug Info</h4>
                      <div className="text-xs space-y-1">
                        <div>Polygons: {polygons.length}</div>
                        <div>Selected hexes: {Array.from(selectedH3Indexes).length}</div>
                        <div>Node paths results: {Object.keys(polygonNodePaths).length}</div>
                        <div>All paths: {allNodePaths.length}</div>
                        <div>Button disabled: {(allNodePaths.length === 0 && !nodePathsLoading) ? 'Yes' : 'No'}</div>
                        <div>Loading: {nodePathsLoading ? 'Yes' : 'No'}</div>
                        {Object.keys(polygonNodePaths).length > 0 && (
                          <div className="mt-2 p-2 bg-white rounded text-xs">
                            <div className="font-medium">Per-hex paths:</div>
                            {Object.entries(polygonNodePaths).map(([hexId, result]) => (
                              <div key={hexId}>{hexId.slice(-6)}: {result.paths.length} paths ({result.optimalPaths} optimal)</div>
                            ))}
                          </div>
                        )}
                        <button 
                          onClick={() => {
                            console.log('Testing distance calculation...');
                            testDistanceCalculation();
                            alert('Check console for test results');
                          }}
                          className="mt-2 px-2 py-1 bg-blue-500 text-white rounded text-xs"
                        >
                          Test Distance Calculation
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
            onHexagonClick={undefined}
            editingHexagonId={editingHexagonId}
            roads={allRoads}
            onHexagonHover={undefined}
            clusterHexIds={clusterHexIds}
            hoveredHexLengthMeters={undefined}
            basemap={basemap}
            showHexagons={showHexagons}
            measureMode={measureMode}
            measurePoints={measurePoints}
            onMapClickForMeasure={(latlng) => setMeasurePoints((pts) => [...pts, latlng])}
            onMeasurePointDrag={(index, latlng) => setMeasurePoints((pts) => pts.map((p, i) => i === index ? latlng : p))}
            clusters={allClusters}
            showNodes={showNodes}
            allNodes={Object.values(polygonNodes).flatMap(nodeResult => nodeResult.nodes)}
            nodePaths={allNodePaths}
            showNodePaths={showNodePaths}
          />
        </main>
      </ResizableSidebarInset>
    </ResizableSidebarProvider>
  );
}
