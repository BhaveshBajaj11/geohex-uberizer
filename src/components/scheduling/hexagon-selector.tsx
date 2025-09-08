'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, List, Eye } from 'lucide-react';

interface HexagonSelectorProps {
  availableHexagons: string[];
  selectedHexagons: Set<string>;
  scheduledHexagons: { hexagonId: string; hexagonNumber: number; timeSlot: { start: string; end: string } }[];
  onHexagonSelect: (hexagonId: string) => void;
  onHexagonDeselect: (hexagonId: string) => void;
  onMapClick?: (hexagonId: string) => void;
  isAllSlotsFilled: boolean;
}

export default function HexagonSelector({
  availableHexagons,
  selectedHexagons,
  scheduledHexagons,
  onHexagonSelect,
  onHexagonDeselect,
  onMapClick,
  isAllSlotsFilled,
}: HexagonSelectorProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'map'>('list');

  const handleHexagonToggle = (hexagonId: string) => {
    const isScheduled = scheduledHexagons.some(h => h.hexagonId === hexagonId);
    
    if (isScheduled) {
      onHexagonDeselect(hexagonId);
    } else if (!isAllSlotsFilled) {
      onHexagonSelect(hexagonId);
    }
  };

  const getHexagonStatus = (hexagonId: string) => {
    const isScheduled = scheduledHexagons.some(h => h.hexagonId === hexagonId);
    const isSelected = selectedHexagons.has(hexagonId);
    
    if (isScheduled) return 'scheduled';
    if (isSelected) return 'selected';
    return 'available';
  };

  const getHexagonTimeSlot = (hexagonId: string) => {
    const scheduled = scheduledHexagons.find(h => h.hexagonId === hexagonId);
    return scheduled ? scheduled.timeSlot : null;
  };

  const formatTimeSlot = (timeSlot: { start: string; end: string }) => {
    const formatTime = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    };
    
    return `${formatTime(timeSlot.start)} - ${formatTime(timeSlot.end)}`;
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Hexagon Selection</h4>
          <div className="flex gap-2">
            <Badge variant="outline">
              {Math.max(0, availableHexagons.length - scheduledHexagons.length)} available
            </Badge>
            <Badge variant="default">
              {scheduledHexagons.length} scheduled
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'list' | 'map')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              List View
            </TabsTrigger>
            <TabsTrigger value="map" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Map View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-3">
        {isAllSlotsFilled && (
          <div className="p-4 bg-destructive/10 border-2 border-destructive/30 rounded-lg">
            <div className="flex items-center gap-2 text-destructive font-semibold">
              <Eye className="h-5 w-5" />
              <span>All Time Slots Filled</span>
            </div>
            <p className="text-sm text-destructive/80 mt-1 font-medium">
              Cannot add more hexagons. Remove hexagons to free up slots.
            </p>
          </div>
        )}

            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
              {availableHexagons.map((hexagonId) => {
                const status = getHexagonStatus(hexagonId);
                const timeSlot = getHexagonTimeSlot(hexagonId);
                const hexagonNumber = availableHexagons.indexOf(hexagonId) + 1;

                return (
                  <div
                    key={hexagonId}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      status === 'scheduled'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : status === 'selected'
                        ? 'bg-secondary border-secondary'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                    onClick={() => handleHexagonToggle(hexagonId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span className="font-medium">Hex #{hexagonNumber}</span>
                        <Badge variant="outline" className="text-xs">
                          {hexagonId.slice(-4)}
                        </Badge>
                      </div>
                      {timeSlot && (
                        <Badge variant="secondary" className="text-xs">
                          {formatTimeSlot(timeSlot)}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="map" className="space-y-3">
            <div className="p-4 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Map view integration coming soon.</p>
              <p className="text-xs">Click on hexagons in the main map to select them.</p>
            </div>
            
            {onMapClick && (
              <div className="text-xs text-muted-foreground">
                <p>💡 Tip: Click on hexagons in the main map to add them to your schedule.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-primary rounded"></div>
            <span>Scheduled</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-secondary rounded"></div>
            <span>Selected</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-background border rounded"></div>
            <span>Available</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
