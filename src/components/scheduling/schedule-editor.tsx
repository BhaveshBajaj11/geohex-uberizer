'use client';

import { useState, useEffect } from 'react';
import type { HexagonSchedule, ScheduledHexagon } from '@/types/scheduling';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { X, Clock, MapPin, Plus } from 'lucide-react';
import { 
  generateTimeSlots, 
  getNextAvailableTimeSlot, 
  areAllTimeSlotsFilled,
  validateScheduleName,
  formatTimeSlot,
  sortScheduledHexagonsByTime,
  createCustomTimeSlot
} from '@/lib/scheduling-utils';
import CustomTimeInput from './custom-time-input';

interface ScheduleEditorProps {
  schedule?: HexagonSchedule | null;
  availableHexagons: string[];
  selectedHexagons: Set<string>;
  scheduledHexagons: ScheduledHexagon[];
  onSave: (name: string, hexagons: ScheduledHexagon[]) => void;
  onCancel: () => void;
  onHexagonSelect: (hexagonId: string) => void;
  onHexagonDeselect: (hexagonId: string) => void;
  onHexagonSelectWithCustomTime: (hexagonId: string, timeSlot: any, duration: number) => void;
}

export default function ScheduleEditor({
  schedule,
  availableHexagons,
  selectedHexagons,
  scheduledHexagons,
  onSave,
  onCancel,
  onHexagonSelect,
  onHexagonDeselect,
  onHexagonSelectWithCustomTime,
}: ScheduleEditorProps) {
  const [scheduleName, setScheduleName] = useState(schedule?.name || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [showCustomTimeInput, setShowCustomTimeInput] = useState(false);
  const [selectedHexagonForCustomTime, setSelectedHexagonForCustomTime] = useState<string | null>(null);
  const { toast } = useToast();

  const allTimeSlots = generateTimeSlots();
  const assignedTimeSlots = scheduledHexagons.map(h => h.timeSlot);
  const isAllSlotsFilled = areAllTimeSlotsFilled(allTimeSlots, assignedTimeSlots);

  useEffect(() => {
    if (schedule) {
      setScheduleName(schedule.name);
    }
  }, [schedule]);

  // Detect when a new hexagon is selected via map click and show time input
  useEffect(() => {
    const selectedArray = Array.from(selectedHexagons);
    const scheduledArray = scheduledHexagons.map(h => h.hexagonId);
    
    // Find newly selected hexagons that aren't scheduled yet
    const newlySelected = selectedArray.find(hexId => 
      !scheduledArray.includes(hexId) && 
      !showCustomTimeInput
    );
    
    if (newlySelected) {
      setSelectedHexagonForCustomTime(newlySelected);
      setShowCustomTimeInput(true);
    }
  }, [selectedHexagons, scheduledHexagons, showCustomTimeInput]);

  const handleNameChange = (value: string) => {
    setScheduleName(value);
    setNameError(null);
  };

  const handleAddHexagon = (hexagonId: string) => {
    // Always show custom time input when selecting a hexagon
    setSelectedHexagonForCustomTime(hexagonId);
    setShowCustomTimeInput(true);
  };

  const handleRemoveHexagon = (hexagonId: string) => {
    onHexagonDeselect(hexagonId);
  };

  const handleCustomTimeSelect = (hexagonId: string) => {
    setSelectedHexagonForCustomTime(hexagonId);
    setShowCustomTimeInput(true);
  };

  const handleCustomTimeSlotSelect = (timeSlot: any, duration: number) => {
    if (selectedHexagonForCustomTime) {
      onHexagonSelectWithCustomTime(selectedHexagonForCustomTime, timeSlot, duration);
    }
    setShowCustomTimeInput(false);
    setSelectedHexagonForCustomTime(null);
  };

  const handleCancelCustomTime = () => {
    setShowCustomTimeInput(false);
    setSelectedHexagonForCustomTime(null);
  };

  const handleSave = () => {
    const error = validateScheduleName(scheduleName, []);
    if (error) {
      setNameError(error);
      return;
    }

    if (scheduledHexagons.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Hexagons Selected',
        description: 'Please select at least one hexagon for the schedule.',
      });
      return;
    }

    onSave(scheduleName.trim(), scheduledHexagons);
  };

  const sortedScheduledHexagons = sortScheduledHexagonsByTime(scheduledHexagons);

  return (
    <div className="space-y-4 px-2">
      {/* Schedule Name */}
      <div className="space-y-2">
        <Label htmlFor="schedule-name">Schedule Name</Label>
        <Input
          id="schedule-name"
          value={scheduleName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Enter schedule name..."
          className={nameError ? 'border-destructive' : ''}
        />
        {nameError && (
          <p className="text-sm text-destructive">{nameError}</p>
        )}
      </div>

      <Separator />

      {/* Available Hexagons */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Available Hexagons</h4>
          <Badge variant="outline">
            {Math.max(0, availableHexagons.length - scheduledHexagons.length)} available
          </Badge>
        </div>

        {isAllSlotsFilled && (
          <div className="p-4 bg-destructive/10 border-2 border-destructive/30 rounded-lg">
            <div className="flex items-center gap-2 text-destructive font-semibold">
              <Clock className="h-5 w-5" />
              <span>All Time Slots Filled</span>
            </div>
            <p className="text-sm text-destructive/80 mt-1 font-medium">
              Cannot add more hexagons. Remove hexagons from this schedule to free up slots.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Select hexagons to schedule</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCustomTimeInput(true)}
              className="text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Custom Time
            </Button>
          </div>
          
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
            {availableHexagons.map((hexagonId) => {
              const isSelected = selectedHexagons.has(hexagonId);
              const isScheduled = scheduledHexagons.some(h => h.hexagonId === hexagonId);
              
              return (
                <Button
                  key={hexagonId}
                  variant={isScheduled ? "default" : isSelected ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (isScheduled) {
                      handleRemoveHexagon(hexagonId);
                    } else {
                      handleAddHexagon(hexagonId);
                    }
                  }}
                  disabled={isScheduled ? false : isAllSlotsFilled}
                  title={
                    isScheduled 
                      ? "Click to remove from schedule" 
                      : isAllSlotsFilled 
                        ? "All time slots are filled" 
                        : "Click to set time for this hexagon"
                  }
                  className="justify-start text-xs"
                >
                  <MapPin className="h-3 w-3 mr-1" />
                  Hex #{hexagonId.slice(-4)}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <Separator />

      {/* Scheduled Hexagons */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Scheduled Hexagons</h4>
          <Badge variant="default">
            {scheduledHexagons.length} scheduled
          </Badge>
        </div>

        {scheduledHexagons.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No hexagons scheduled yet.</p>
            <p className="text-xs">Select hexagons from the list above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedScheduledHexagons.map((scheduledHex, index) => (
              <Card key={scheduledHex.hexagonId} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      #{index + 1}
                    </Badge>
                    <div>
                      <p className="font-medium text-sm">
                        Hex #{scheduledHex.hexagonNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeSlot(scheduledHex.timeSlot)}
                        {scheduledHex.customDuration && scheduledHex.customDuration !== 15 && (
                          <span className="ml-1 text-primary">({scheduledHex.customDuration}m)</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveHexagon(scheduledHex.hexagonId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Custom Time Input */}
      {showCustomTimeInput && (
        <div className="mt-4">
          <CustomTimeInput
            existingSlots={assignedTimeSlots}
            onTimeSlotSelect={handleCustomTimeSlotSelect}
            onCancel={handleCancelCustomTime}
            selectedHexagonId={selectedHexagonForCustomTime}
            scheduledHexagons={scheduledHexagons}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <Button onClick={handleSave} className="flex-1">
          {schedule ? 'Update Schedule' : 'Create Schedule'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
