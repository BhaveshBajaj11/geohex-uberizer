'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Eye, EyeOff } from 'lucide-react';
import { formatTimeSlot, sortScheduledHexagonsByTime } from '@/lib/scheduling-utils';
import type { HexagonSchedule, ScheduledHexagon } from '@/types/scheduling';

interface ScheduleVisualizerProps {
  schedule: HexagonSchedule;
  onClose?: () => void;
  showOnMap?: boolean;
  onToggleMapView?: () => void;
}

export default function ScheduleVisualizer({
  schedule,
  onClose,
  showOnMap = false,
  onToggleMapView,
}: ScheduleVisualizerProps) {
  const sortedHexagons = sortScheduledHexagonsByTime(schedule.hexagons);

  const getScheduleDuration = () => {
    if (schedule.hexagons.length === 0) return 'No hexagons';
    
    const firstSlot = sortedHexagons[0].timeSlot;
    const lastSlot = sortedHexagons[sortedHexagons.length - 1].timeSlot;
    
    return `${formatTimeSlot(firstSlot)} - ${formatTimeSlot(lastSlot)}`;
  };

  const getTotalDuration = () => {
    if (schedule.hexagons.length === 0) return '0 minutes';
    
    const firstSlot = sortedHexagons[0].timeSlot;
    const lastSlot = sortedHexagons[sortedHexagons.length - 1].timeSlot;
    
    const [startHour, startMin] = firstSlot.start.split(':').map(Number);
    const [endHour, endMin] = lastSlot.end.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const totalMinutes = endMinutes - startMinutes;
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">{schedule.name}</h3>
            <p className="text-sm text-muted-foreground">
              {schedule.hexagons.length} hexagon{schedule.hexagons.length !== 1 ? 's' : ''} • {getTotalDuration()}
            </p>
          </div>
          <div className="flex gap-2">
            {onToggleMapView && (
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleMapView}
              >
                {showOnMap ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                ×
              </Button>
            )}
          </div>
        </div>

        {/* Schedule Info */}
        <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="font-medium">{getScheduleDuration()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Time</p>
            <p className="font-medium">{getTotalDuration()}</p>
          </div>
        </div>

        {/* Hexagon Sequence */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Route Sequence</h4>
            <Badge variant="outline">
              {sortedHexagons.length} stops
            </Badge>
          </div>

          {sortedHexagons.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hexagons in this schedule.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedHexagons.map((scheduledHex, index) => (
                <div
                  key={scheduledHex.hexagonId}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <Badge variant="default" className="text-xs">
                    #{index + 1}
                  </Badge>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        Hex #{scheduledHex.hexagonNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {formatTimeSlot(scheduledHex.timeSlot)}
                      </span>
                    </div>
                  </div>

                  <Badge variant="secondary" className="text-xs">
                    {scheduledHex.hexagonId.slice(-4)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map Visualization Info */}
        {showOnMap && (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 text-primary">
              <Eye className="h-4 w-4" />
              <span className="text-sm font-medium">Map View Active</span>
            </div>
            <p className="text-xs text-primary/80 mt-1">
              Scheduled hexagons are highlighted on the map with sequence numbers.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
