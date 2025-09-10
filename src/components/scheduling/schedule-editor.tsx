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
import { X, Clock, MapPin, Plus, Edit } from 'lucide-react';
import { 
  generateTimeSlots, 
  getNextAvailableTimeSlot, 
  areAllTimeSlotsFilled,
  validateScheduleName,
  formatTimeSlot,
  sortScheduledHexagonsByTime,
  createCustomTimeSlot,
  getHexagonNumber
} from '@/lib/scheduling-utils';
import CustomTimeInput from './custom-time-input';
import { timeToMinutes, minutesToTime } from '@/lib/scheduling-utils';

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
  onLocalScheduledHexagonsChange?: (hexagons: ScheduledHexagon[]) => void;
  onHexagonVisualSelect?: (hexagonId: string) => void;
  onTimeInputOpenChange?: (isOpen: boolean) => void;
  onEditHexagonChange?: (hexId: string | null) => void;
  selectedTerminalId?: string;
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
  onLocalScheduledHexagonsChange,
  onHexagonVisualSelect,
  onTimeInputOpenChange,
  onEditHexagonChange,
  selectedTerminalId,
}: ScheduleEditorProps) {
  const [scheduleName, setScheduleName] = useState(schedule?.name || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [showCustomTimeInput, setShowCustomTimeInput] = useState(false);
  const [selectedHexagonForCustomTime, setSelectedHexagonForCustomTime] = useState<string | null>(null);
  const { toast } = useToast();

  // Local state for managing scheduled hexagons for both create and edit
  const [localScheduledHexagons, setLocalScheduledHexagons] = useState<ScheduledHexagon[]>([]);
  
  // Always use local scheduled state for rendering; initialize from schedule when editing
  const currentScheduledHexagons = localScheduledHexagons;

  const allTimeSlots = generateTimeSlots();
  const assignedTimeSlots = currentScheduledHexagons.map(h => h.timeSlot);
  const isAllSlotsFilled = areAllTimeSlotsFilled(allTimeSlots, assignedTimeSlots);

  useEffect(() => {
    if (schedule) {
      setScheduleName(schedule.name);
      setLocalScheduledHexagons(schedule.hexagons || []);
    } else {
      // When creating a new schedule, reset local state
      setScheduleName('');
      setLocalScheduledHexagons([]);
    }
  }, [schedule]);

  // Notify parent when local scheduled hexagons change (for both create and edit)
  useEffect(() => {
    if (onLocalScheduledHexagonsChange) {
      onLocalScheduledHexagonsChange(localScheduledHexagons);
    }
  }, [localScheduledHexagons, onLocalScheduledHexagonsChange]);

  // Detect when a new hexagon is selected via map click and show time input
  useEffect(() => {
    const selectedArray = Array.from(selectedHexagons);
    const scheduledArray = currentScheduledHexagons.map(h => h.hexagonId);
    
    // Find newly selected hexagons that aren't scheduled yet
    const newlySelected = selectedArray.find(hexId => 
      !scheduledArray.includes(hexId) && 
      !showCustomTimeInput
    );
    
    if (newlySelected) {
      setSelectedHexagonForCustomTime(newlySelected);
      setShowCustomTimeInput(true);
      if (onTimeInputOpenChange) onTimeInputOpenChange(true);
    }
  }, [selectedHexagons, currentScheduledHexagons, showCustomTimeInput]);

  const handleNameChange = (value: string) => {
    setScheduleName(value);
    setNameError(null);
  };

  const handleAddHexagon = (hexagonId: string) => {
    if (showCustomTimeInput) return; // lock selection while time input is open
    // Always show custom time input when selecting a hexagon
    // Trigger visual selection on the map so the hexagon turns blue
    if (onHexagonVisualSelect) {
      onHexagonVisualSelect(hexagonId);
    }
    setSelectedHexagonForCustomTime(hexagonId);
    setShowCustomTimeInput(true);
    if (onTimeInputOpenChange) onTimeInputOpenChange(true);
  };

  const handleRemoveHexagon = (hexagonId: string) => {
    // Always inform parent to clear visual selection and any global state
    onHexagonDeselect(hexagonId);
    // Update local state (both create and edit)
    setLocalScheduledHexagons(prev => prev.filter(h => h.hexagonId !== hexagonId));
  };

  const handleCustomTimeSelect = (hexagonId: string) => {
    setSelectedHexagonForCustomTime(hexagonId);
    setShowCustomTimeInput(true);
    if (onEditHexagonChange) onEditHexagonChange(hexagonId);
  };

  const handleCustomTimeSlotSelect = (timeSlot: any, duration: number) => {
    if (!selectedHexagonForCustomTime) {
      setShowCustomTimeInput(false);
      if (onTimeInputOpenChange) onTimeInputOpenChange(false);
      return;
    }

    const isEditingExisting = localScheduledHexagons.some(h => h.hexagonId === selectedHexagonForCustomTime);

    if (isEditingExisting) {
      // Cascade update from the edited hexagon forward, preserving durations
      const sorted = sortScheduledHexagonsByTime(localScheduledHexagons);
      const idx = sorted.findIndex(h => h.hexagonId === selectedHexagonForCustomTime);
      if (idx === -1) {
        setShowCustomTimeInput(false);
        setSelectedHexagonForCustomTime(null);
        if (onTimeInputOpenChange) onTimeInputOpenChange(false);
        return;
      }

      const updated = [...sorted];
      // Update the edited hexagon
      const edited = { ...updated[idx] };
      edited.timeSlot = { ...edited.timeSlot, start: timeSlot.start, end: timeSlot.end };
      edited.customDuration = duration;
      updated[idx] = edited;

      // Recompute subsequent hexagons preserving their durations
      for (let i = idx + 1; i < updated.length; i++) {
        const prevEnd = updated[i - 1].timeSlot.end;
        const dur = updated[i].customDuration ?? (timeToMinutes(updated[i].timeSlot.end) - timeToMinutes(updated[i].timeSlot.start));
        const newStart = prevEnd;
        const newEnd = minutesToTime(timeToMinutes(newStart) + dur);
        updated[i] = {
          ...updated[i],
          timeSlot: { ...updated[i].timeSlot, start: newStart, end: newEnd },
          customDuration: dur,
        };
      }

      // Constraint: last end must be <= 20:00
      const lastEndMinutes = timeToMinutes(updated[updated.length - 1].timeSlot.end);
      if (lastEndMinutes > timeToMinutes('20:00')) {
        toast({
          variant: 'destructive',
          title: 'Time exceeds allowed range',
          description: 'Schedules must fit between 4:30 PM and 8:00 PM.',
        });
        return; // do not apply
      }

      // Apply updates back to local state preserving original unsorted order by hexagonId mapping
      const updatedById = new Map(updated.map(h => [h.hexagonId, h] as const));
      setLocalScheduledHexagons(prev => prev.map(h => updatedById.get(h.hexagonId) || h));
    } else {
      // New selection case
      const hexagonNumber = getHexagonNumber(selectedHexagonForCustomTime, availableHexagons);
      const newScheduledHexagon: ScheduledHexagon = {
        hexagonId: selectedHexagonForCustomTime,
        hexagonNumber,
        timeSlot,
        polygonId: 0,
        customDuration: duration,
      };
      setLocalScheduledHexagons(prev => [...prev, newScheduledHexagon]);
      onHexagonSelectWithCustomTime(selectedHexagonForCustomTime, timeSlot, duration);
    }

    setShowCustomTimeInput(false);
    setSelectedHexagonForCustomTime(null);
    if (onTimeInputOpenChange) onTimeInputOpenChange(false);
    if (onEditHexagonChange) onEditHexagonChange(null);
  };

  const handleEditScheduledHexagon = (hexagonId: string) => {
    setSelectedHexagonForCustomTime(hexagonId);
    setShowCustomTimeInput(true);
    if (onTimeInputOpenChange) onTimeInputOpenChange(true);
    if (onEditHexagonChange) onEditHexagonChange(hexagonId);
  };

  const handleCancelCustomTime = () => {
    setShowCustomTimeInput(false);
    // If this was a new selection (not yet scheduled), deselect it visually
    if (selectedHexagonForCustomTime && !localScheduledHexagons.some(h => h.hexagonId === selectedHexagonForCustomTime)) {
      onHexagonDeselect(selectedHexagonForCustomTime);
    }
    setSelectedHexagonForCustomTime(null);
    if (onTimeInputOpenChange) onTimeInputOpenChange(false);
    if (onEditHexagonChange) onEditHexagonChange(null);
  };

  const handleSave = () => {
    const error = validateScheduleName(scheduleName, []);
    if (error) {
      setNameError(error);
      return;
    }

    if (currentScheduledHexagons.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Hexagons Selected',
        description: 'Please select at least one hexagon for the schedule.',
      });
      return;
    }

    onSave(scheduleName.trim(), currentScheduledHexagons);
  };

  const sortedScheduledHexagons = sortScheduledHexagonsByTime(currentScheduledHexagons);
  const existingSlotsForValidation = (() => {
    if (!selectedHexagonForCustomTime) return assignedTimeSlots;
    const isEditingExisting = currentScheduledHexagons.some(h => h.hexagonId === selectedHexagonForCustomTime);
    if (!isEditingExisting) {
      // Creating new: validate against all current slots
      return assignedTimeSlots;
    }
    // Editing existing: only validate against prior hexagons; future ones will be shifted
    const sorted = sortScheduledHexagonsByTime(currentScheduledHexagons);
    const idx = sorted.findIndex(h => h.hexagonId === selectedHexagonForCustomTime);
    if (idx <= 0) return [];
    return sorted.slice(0, idx).map(h => h.timeSlot);
  })();

  return (
    <div className="space-y-4 px-2">
      {selectedTerminalId && (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">Terminal ID:</span> {selectedTerminalId}
        </div>
      )}
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
            {Math.max(0, availableHexagons.length - currentScheduledHexagons.length)} available
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
              const isScheduled = currentScheduledHexagons.some(h => h.hexagonId === hexagonId);
              
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
            {currentScheduledHexagons.length} scheduled
          </Badge>
        </div>

        {currentScheduledHexagons.length === 0 ? (
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
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditScheduledHexagon(scheduledHex.hexagonId)}
                      title="Edit time"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveHexagon(scheduledHex.hexagonId)}
                      title="Remove from schedule"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Custom Time Input */}
      {showCustomTimeInput && (
        <div className="mt-4">
          {(() => {
            const editing = currentScheduledHexagons.find(h => h.hexagonId === selectedHexagonForCustomTime);
            const defStart = editing ? editing.timeSlot.start : undefined;
            const defDuration = editing ? (editing.customDuration ?? (timeToMinutes(editing.timeSlot.end) - timeToMinutes(editing.timeSlot.start))) : undefined;
            return (
              <CustomTimeInput
                existingSlots={existingSlotsForValidation}
                onTimeSlotSelect={handleCustomTimeSlotSelect}
                onCancel={handleCancelCustomTime}
                selectedHexagonId={selectedHexagonForCustomTime}
                scheduledHexagons={currentScheduledHexagons}
                defaultStartTime={defStart}
                defaultDuration={defDuration}
              />
            );
          })()}
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
