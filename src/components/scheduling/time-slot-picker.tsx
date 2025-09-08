'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertCircle } from 'lucide-react';
import { formatTimeSlot } from '@/lib/scheduling-utils';
import type { TimeSlot } from '@/types/scheduling';

interface TimeSlotPickerProps {
  allTimeSlots: TimeSlot[];
  assignedTimeSlots: TimeSlot[];
  selectedTimeSlot?: TimeSlot | null;
  onTimeSlotSelect?: (timeSlot: TimeSlot) => void;
  disabled?: boolean;
}

export default function TimeSlotPicker({
  allTimeSlots,
  assignedTimeSlots,
  selectedTimeSlot,
  onTimeSlotSelect,
  disabled = false,
}: TimeSlotPickerProps) {
  const availableTimeSlots = allTimeSlots.filter(
    slot => !assignedTimeSlots.some(assigned => assigned.start === slot.start)
  );

  const isAllSlotsFilled = availableTimeSlots.length === 0;

  const getSlotStatus = (slot: TimeSlot) => {
    const isAssigned = assignedTimeSlots.some(assigned => assigned.start === slot.start);
    const isSelected = selectedTimeSlot?.start === slot.start;
    
    if (isAssigned) return 'assigned';
    if (isSelected) return 'selected';
    return 'available';
  };

  const handleSlotClick = (slot: TimeSlot) => {
    if (disabled || getSlotStatus(slot) === 'assigned') return;
    onTimeSlotSelect?.(slot);
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Time Slots</h4>
          <div className="flex gap-2">
            <Badge variant="outline">
              {availableTimeSlots.length} available
            </Badge>
            <Badge variant="secondary">
              {assignedTimeSlots.length} assigned
            </Badge>
          </div>
        </div>

        {isAllSlotsFilled && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">All Time Slots Filled</span>
            </div>
            <p className="text-xs text-destructive/80 mt-1">
              Remove hexagons from other schedules to free up time slots.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {allTimeSlots.map((slot) => {
            const status = getSlotStatus(slot);
            const isClickable = !disabled && status !== 'assigned';

            return (
              <div
                key={slot.start}
                className={`p-3 rounded-lg border text-sm transition-colors ${
                  status === 'assigned'
                    ? 'bg-muted text-muted-foreground border-muted cursor-not-allowed'
                    : status === 'selected'
                    ? 'bg-primary text-primary-foreground border-primary cursor-pointer'
                    : isClickable
                    ? 'bg-background border-border hover:bg-muted cursor-pointer'
                    : 'bg-background border-border cursor-not-allowed'
                }`}
                onClick={() => handleSlotClick(slot)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    <span className="font-medium">
                      {formatTimeSlot(slot)}
                    </span>
                  </div>
                  {status === 'assigned' && (
                    <Badge variant="secondary" className="text-xs">
                      Used
                    </Badge>
                  )}
                  {status === 'selected' && (
                    <Badge variant="default" className="text-xs">
                      Selected
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-primary rounded"></div>
            <span>Selected</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-muted rounded"></div>
            <span>Assigned</span>
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
