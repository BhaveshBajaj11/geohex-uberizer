'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { 
  validateCustomTimeSlot, 
  createCustomTimeSlot, 
  formatTimeSlot,
  timeToMinutes,
  minutesToTime,
  getSuggestedStartTime
} from '@/lib/scheduling-utils';
import type { TimeSlot, TimeValidationResult, ScheduledHexagon } from '@/types/scheduling';

interface CustomTimeInputProps {
  existingSlots: TimeSlot[];
  onTimeSlotSelect: (timeSlot: TimeSlot, duration: number) => void;
  onCancel: () => void;
  defaultStartTime?: string;
  defaultDuration?: number;
  selectedHexagonId?: string | null;
  scheduledHexagons?: ScheduledHexagon[];
}

export default function CustomTimeInput({
  existingSlots,
  onTimeSlotSelect,
  onCancel,
  defaultStartTime,
  defaultDuration = 15,
  selectedHexagonId,
  scheduledHexagons = [],
}: CustomTimeInputProps) {
  const suggestedStartTime = defaultStartTime || getSuggestedStartTime(scheduledHexagons);
  const [startTime, setStartTime] = useState(suggestedStartTime);
  const [duration, setDuration] = useState(defaultDuration);
  const [validation, setValidation] = useState<TimeValidationResult>({ isValid: true });

  useEffect(() => {
    const result = validateCustomTimeSlot(startTime, duration, existingSlots);
    setValidation(result);
  }, [startTime, duration, existingSlots]);

  const handleSubmit = () => {
    if (validation.isValid) {
      const timeSlot = createCustomTimeSlot(startTime, duration);
      onTimeSlotSelect(timeSlot, duration);
    }
  };

  const getNextAvailableTime = () => {
    // Find the next available 15-minute slot
    const allSlots = Array.from({ length: 14 }, (_, i) => {
      const startMinutes = 16 * 60 + 30 + (i * 15); // 4:30 PM + 15min intervals
      return {
        start: minutesToTime(startMinutes),
        end: minutesToTime(startMinutes + 15),
        isAvailable: true,
      };
    });

    for (const slot of allSlots) {
      const result = validateCustomTimeSlot(slot.start, duration, existingSlots);
      if (result.isValid) {
        setStartTime(slot.start);
        return;
      }
    }
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">
              {selectedHexagonId ? `Schedule Hex #${selectedHexagonId.slice(-4)}` : 'Custom Time Slot'}
            </h4>
            {selectedHexagonId && (
              <p className="text-xs text-muted-foreground">Set time and duration for this hexagon</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            ×
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="start-time">Start Time</Label>
              {startTime === suggestedStartTime && (
                <Badge variant="secondary" className="text-xs">
                  Suggested
                </Badge>
              )}
            </div>
            <Input
              id="start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={validation.isValid ? '' : 'border-destructive'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              min="5"
              max="120"
              step="5"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 15)}
              className={validation.isValid ? '' : 'border-destructive'}
            />
          </div>
        </div>

        {/* Time Preview */}
        <div className="p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            <span className="font-medium">
              {formatTimeSlot(createCustomTimeSlot(startTime, duration))}
            </span>
            <Badge variant="outline" className="text-xs">
              {formatDuration(duration)}
            </Badge>
          </div>
          {startTime === suggestedStartTime && scheduledHexagons.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Suggested to start when the previous hexagon ends
            </p>
          )}
        </div>

        {/* Validation Message */}
        {!validation.isValid && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">{validation.error}</span>
            </div>
          </div>
        )}

        {validation.isValid && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Time slot is available</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={handleSubmit} 
            disabled={!validation.isValid}
            className="flex-1"
          >
            {selectedHexagonId ? 'Schedule Hexagon' : 'Add Time Slot'}
          </Button>
          <Button variant="outline" onClick={getNextAvailableTime}>
            Find Next
          </Button>
        </div>

        {/* Constraints Info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Time must be between 4:30 PM - 8:00 PM</p>
          <p>• Duration: 5 minutes - 2 hours</p>
          <p>• No overlapping with existing slots</p>
        </div>
      </div>
    </Card>
  );
}
