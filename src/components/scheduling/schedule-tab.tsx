'use client';

import { useMemo, useState } from 'react';
import type { HexagonSchedule, ScheduledHexagon } from '@/types/scheduling';
import ScheduleList from './schedule-list';
import ScheduleEditor from './schedule-editor';
import GoogleSheetsConfig from './google-sheets-config';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ScheduleTabProps {
  schedules: HexagonSchedule[];
  availableHexagons: string[];
  onScheduleCreate: (name: string, hexagons: ScheduledHexagon[], terminalId?: string) => void;
  onScheduleUpdate: (id: string, updates: Partial<HexagonSchedule>) => void;
  onScheduleDelete: (id: string) => void;
  onScheduleDuplicate: (id: string) => void;
  onHexagonSelect: (hexagonId: string) => void;
  onHexagonDeselect: (hexagonId: string) => void;
  onHexagonSelectWithCustomTime: (hexagonId: string, timeSlot: any, duration: number) => void;
  selectedHexagons: Set<string>;
  scheduledHexagons: ScheduledHexagon[];
  onRoutesLoaded?: (routes: HexagonSchedule[]) => void;
  onViewChange?: (view: 'list' | 'create' | 'edit') => void;
  onLocalScheduledHexagonsChange?: (hexagons: ScheduledHexagon[]) => void;
  selectedTerminalId?: string;
  onClearSchedulingState?: () => void;
  onHexagonVisualSelect?: (hexagonId: string) => void;
}

export default function ScheduleTab({
  schedules,
  availableHexagons,
  onScheduleCreate,
  onScheduleUpdate,
  onScheduleDelete,
  onScheduleDuplicate,
  onHexagonSelect,
  onHexagonDeselect,
  onHexagonSelectWithCustomTime,
  selectedHexagons,
  scheduledHexagons,
  onRoutesLoaded,
  onViewChange,
  onLocalScheduledHexagonsChange,
  selectedTerminalId,
  onClearSchedulingState,
  onHexagonVisualSelect,
}: ScheduleTabProps) {
  const [currentView, setCurrentView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingSchedule, setEditingSchedule] = useState<HexagonSchedule | null>(null);
  const { toast } = useToast();

  const hasScheduleForSelectedTerminal = useMemo(() => {
    if (!selectedTerminalId) return false;
    return schedules.some(s => s.terminalId === selectedTerminalId);
  }, [schedules, selectedTerminalId]);

  const handleCreateNew = () => {
    setCurrentView('create');
    setEditingSchedule(null);
    // Clear the global scheduling state when creating a new schedule
    // This ensures we start with a clean slate
    if (onClearSchedulingState) {
      onClearSchedulingState();
    }
    // Notify parent about view change
    if (onViewChange) {
      onViewChange('create');
    }
  };

  const handleEdit = (schedule: HexagonSchedule) => {
    setEditingSchedule(schedule);
    setCurrentView('edit');
    // Clear current visual selections and global scheduled state; editor will rehydrate
    if (onClearSchedulingState) {
      onClearSchedulingState();
    }
    // Notify parent about view change
    if (onViewChange) {
      onViewChange('edit');
    }
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setEditingSchedule(null);
    // Notify parent about view change
    if (onViewChange) {
      onViewChange('list');
    }
  };

  const handleSave = (name: string, hexagons: ScheduledHexagon[]) => {
    if (editingSchedule) {
      onScheduleUpdate(editingSchedule.id, { name, hexagons, updatedAt: new Date() });
    } else {
      if (hasScheduleForSelectedTerminal) {
        toast({
          variant: 'destructive',
          title: 'Limit Reached',
          description: 'Only one route per terminal is allowed. Edit the existing route instead.',
        });
        setCurrentView('list');
        if (onViewChange) onViewChange('list');
        return;
      }
      onScheduleCreate(name, hexagons, selectedTerminalId);
    }
    handleBackToList();
  };

  const handleRoutesLoaded = (routes: HexagonSchedule[]) => {
    if (onRoutesLoaded) {
      onRoutesLoaded(routes);
    }
  };

  const handleRouteSave = async (route: HexagonSchedule) => {
    // This will be handled by the GoogleSheetsConfig component
    // We could add auto-save functionality here if needed
  };

  if (availableHexagons.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <p>No hexagons available for scheduling.</p>
        <p className="mt-2">Generate hexagons from polygons first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {currentView === 'list' && (
        <>
          <GoogleSheetsConfig
            onRouteSave={handleRouteSave}
            onRoutesLoaded={handleRoutesLoaded}
            currentRoutes={schedules}
            selectedTerminalId={selectedTerminalId}
          />
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col">
              <h3 className="text-lg font-semibold">Schedule Routes</h3>
              {hasScheduleForSelectedTerminal && (
                <span className="text-xs text-muted-foreground">Only one route per terminal is allowed.</span>
              )}
            </div>
            <Button onClick={handleCreateNew} size="sm" disabled={hasScheduleForSelectedTerminal} title={hasScheduleForSelectedTerminal ? 'Only one route per terminal is allowed. Edit the existing route.' : ''}>
              <Plus className="h-4 w-4 mr-2" />
              New Schedule
            </Button>
          </div>
          <ScheduleList
            schedules={schedules}
            onEdit={handleEdit}
            onDelete={onScheduleDelete}
            onDuplicate={onScheduleDuplicate}
          />
        </>
      )}

      {(currentView === 'create' || currentView === 'edit') && (
        <>
          <div className="flex items-center gap-2 px-2">
            <Button variant="ghost" size="sm" onClick={handleBackToList}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h3 className="text-lg font-semibold">
              {editingSchedule ? 'Edit Schedule' : 'Create New Schedule'}
            </h3>
          </div>
          <ScheduleEditor
            schedule={editingSchedule}
            availableHexagons={availableHexagons}
            selectedHexagons={selectedHexagons}
            scheduledHexagons={editingSchedule ? editingSchedule.hexagons : []}
            onSave={handleSave}
            onCancel={handleBackToList}
            onHexagonSelect={onHexagonSelect}
            onHexagonDeselect={onHexagonDeselect}
            onHexagonSelectWithCustomTime={onHexagonSelectWithCustomTime}
            onLocalScheduledHexagonsChange={onLocalScheduledHexagonsChange}
            onHexagonVisualSelect={onHexagonVisualSelect}
          />
        </>
      )}
    </div>
  );
}
