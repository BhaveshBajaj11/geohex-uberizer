'use client';

import type { HexagonSchedule } from '@/types/scheduling';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { MoreVertical, Edit, Trash2, Copy, Eye } from 'lucide-react';
import { formatTimeSlot, sortScheduledHexagonsByTime } from '@/lib/scheduling-utils';

interface ScheduleListProps {
  schedules: HexagonSchedule[];
  onEdit: (schedule: HexagonSchedule) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export default function ScheduleList({ schedules, onEdit, onDelete, onDuplicate }: ScheduleListProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const getScheduleDuration = (schedule: HexagonSchedule) => {
    if (schedule.hexagons.length === 0) return 'No hexagons';
    
    const sortedHexagons = sortScheduledHexagonsByTime(schedule.hexagons);
    const firstSlot = sortedHexagons[0].timeSlot;
    const lastSlot = sortedHexagons[sortedHexagons.length - 1].timeSlot;
    
    return `${formatTimeSlot(firstSlot)} - ${formatTimeSlot(lastSlot)}`;
  };

  if (schedules.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <p>No schedules created yet.</p>
        <p className="mt-2">Create your first schedule to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-2">
      {schedules.map((schedule) => (
        <Card key={schedule.id} className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold truncate">{schedule.name}</h4>
                <Badge variant="secondary" className="text-xs">
                  {schedule.hexagons.length} hexagon{schedule.hexagons.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Duration: {getScheduleDuration(schedule)}</p>
                <p>Created: {formatDate(schedule.createdAt)}</p>
                {schedule.updatedAt.getTime() !== schedule.createdAt.getTime() && (
                  <p>Updated: {formatDate(schedule.updatedAt)}</p>
                )}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(schedule)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(schedule.id)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Eye className="h-4 w-4 mr-2" />
                  View (Coming Soon)
                </DropdownMenuItem>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{schedule.name}"? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(schedule.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Card>
      ))}
    </div>
  );
}



