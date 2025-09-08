import type { TimeSlot, ScheduledHexagon, TimeValidationResult } from '@/types/scheduling';

/**
 * Generate 14 time slots from 4:30 PM to 8:00 PM (15-minute intervals)
 */
export const generateTimeSlots = (): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const startHour = 16; // 4 PM
  const startMinute = 30; // 4:30 PM
  
  for (let i = 0; i < 14; i++) {
    const startMinutes = startMinute + (i * 15);
    const startHourTotal = startHour + Math.floor(startMinutes / 60);
    const startMinuteFinal = startMinutes % 60;
    
    const endMinutes = startMinutes + 15;
    const endHourTotal = startHour + Math.floor(endMinutes / 60);
    const endMinuteFinal = endMinutes % 60;
    
    const start = `${startHourTotal.toString().padStart(2, '0')}:${startMinuteFinal.toString().padStart(2, '0')}`;
    const end = `${endHourTotal.toString().padStart(2, '0')}:${endMinuteFinal.toString().padStart(2, '0')}`;
    
    slots.push({
      start,
      end,
      isAvailable: true,
    });
  }
  
  return slots;
};

/**
 * Get available time slots by filtering out assigned slots
 */
export const getAvailableTimeSlots = (
  allSlots: TimeSlot[],
  assignedSlots: TimeSlot[]
): TimeSlot[] => {
  const assignedStartTimes = new Set(assignedSlots.map(slot => slot.start));
  
  return allSlots
    .filter(slot => !assignedStartTimes.has(slot.start))
    .map(slot => ({ ...slot, isAvailable: true }));
};

/**
 * Format time slot for display (e.g., "4:30 PM - 4:45 PM")
 */
export const formatTimeSlot = (slot: TimeSlot): string => {
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };
  
  return `${formatTime(slot.start)} - ${formatTime(slot.end)}`;
};

/**
 * Get the next available time slot
 */
export const getNextAvailableTimeSlot = (
  allSlots: TimeSlot[],
  assignedSlots: TimeSlot[]
): TimeSlot | null => {
  const availableSlots = getAvailableTimeSlots(allSlots, assignedSlots);
  return availableSlots.length > 0 ? availableSlots[0] : null;
};

/**
 * Check if all time slots are filled
 */
export const areAllTimeSlotsFilled = (
  allSlots: TimeSlot[],
  assignedSlots: TimeSlot[]
): boolean => {
  return assignedSlots.length >= allSlots.length;
};

/**
 * Generate a unique schedule ID
 */
export const generateScheduleId = (): string => {
  return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Sort scheduled hexagons by time slot
 */
export const sortScheduledHexagonsByTime = (hexagons: ScheduledHexagon[]): ScheduledHexagon[] => {
  return [...hexagons].sort((a, b) => {
    if (a.timeSlot.start < b.timeSlot.start) return -1;
    if (a.timeSlot.start > b.timeSlot.start) return 1;
    return 0;
  });
};

/**
 * Get hexagon number from hexagon ID and existing hexagons
 */
export const getHexagonNumber = (hexagonId: string, allHexagons: string[]): number => {
  return allHexagons.indexOf(hexagonId) + 1;
};

/**
 * Validate schedule name
 */
export const validateScheduleName = (name: string, existingSchedules: { name: string }[]): string | null => {
  if (!name.trim()) {
    return 'Schedule name is required';
  }
  
  if (name.trim().length < 2) {
    return 'Schedule name must be at least 2 characters long';
  }
  
  if (existingSchedules.some(schedule => schedule.name.toLowerCase() === name.toLowerCase())) {
    return 'A schedule with this name already exists';
  }
  
  return null;
};

/**
 * Convert time string to minutes since midnight
 */
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Convert minutes since midnight to time string
 */
export const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

/**
 * Create a time slot with custom duration
 */
export const createCustomTimeSlot = (startTime: string, durationMinutes: number): TimeSlot => {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + durationMinutes;
  
  return {
    start: startTime,
    end: minutesToTime(endMinutes),
    isAvailable: true,
  };
};

/**
 * Check if two time slots overlap
 */
export const doTimeSlotsOverlap = (slot1: TimeSlot, slot2: TimeSlot): boolean => {
  const start1 = timeToMinutes(slot1.start);
  const end1 = timeToMinutes(slot1.end);
  const start2 = timeToMinutes(slot2.start);
  const end2 = timeToMinutes(slot2.end);
  
  return start1 < end2 && start2 < end1;
};

/**
 * Validate custom time slot against constraints and existing slots
 */
export const validateCustomTimeSlot = (
  startTime: string,
  durationMinutes: number,
  existingSlots: TimeSlot[],
  minStartTime: string = '16:30',
  maxEndTime: string = '20:00'
): TimeValidationResult => {
  // Check duration constraints
  if (durationMinutes < 5) {
    return { isValid: false, error: 'Duration must be at least 5 minutes' };
  }
  
  if (durationMinutes > 120) {
    return { isValid: false, error: 'Duration cannot exceed 2 hours' };
  }
  
  // Check time constraints
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + durationMinutes;
  const minStartMinutes = timeToMinutes(minStartTime);
  const maxEndMinutes = timeToMinutes(maxEndTime);
  
  if (startMinutes < minStartMinutes) {
    return { isValid: false, error: `Start time must be after ${formatTimeSlot({ start: minStartTime, end: minStartTime, isAvailable: true })}` };
  }
  
  if (endMinutes > maxEndMinutes) {
    return { isValid: false, error: `End time must be before ${formatTimeSlot({ start: maxEndTime, end: maxEndTime, isAvailable: true })}` };
  }
  
  // Check for overlaps with existing slots
  const newSlot = createCustomTimeSlot(startTime, durationMinutes);
  const hasOverlap = existingSlots.some(existingSlot => doTimeSlotsOverlap(newSlot, existingSlot));
  
  if (hasOverlap) {
    return { isValid: false, error: 'This time slot overlaps with an existing scheduled hexagon' };
  }
  
  return { isValid: true };
};

/**
 * Get next available time slot with custom duration
 */
export const getNextAvailableTimeSlotWithDuration = (
  allSlots: TimeSlot[],
  assignedSlots: TimeSlot[],
  durationMinutes: number = 15
): TimeSlot | null => {
  const availableSlots = getAvailableTimeSlots(allSlots, assignedSlots);
  
  for (const slot of availableSlots) {
    const slotDuration = timeToMinutes(slot.end) - timeToMinutes(slot.start);
    if (slotDuration >= durationMinutes) {
      return createCustomTimeSlot(slot.start, durationMinutes);
    }
  }
  
  return null;
};

/**
 * Get the latest end time from existing scheduled hexagons
 */
export const getLatestEndTime = (scheduledHexagons: ScheduledHexagon[]): string => {
  if (scheduledHexagons.length === 0) {
    return '16:30'; // Default start time
  }
  
  const sortedHexagons = sortScheduledHexagonsByTime(scheduledHexagons);
  const latestHexagon = sortedHexagons[sortedHexagons.length - 1];
  return latestHexagon.timeSlot.end;
};

/**
 * Get suggested start time for next hexagon (latest end time)
 */
export const getSuggestedStartTime = (scheduledHexagons: ScheduledHexagon[]): string => {
  return getLatestEndTime(scheduledHexagons);
};
