export interface TimeSlot {
  start: string; // "16:30", "16:45", etc.
  end: string;   // "16:45", "17:00", etc.
  isAvailable: boolean;
}

export interface ScheduledHexagon {
  hexagonId: string;
  hexagonNumber: number;
  timeSlot: TimeSlot;
  polygonId: number;
  customDuration?: number; // Duration in minutes (optional, defaults to 15)
}

export interface TimeValidationResult {
  isValid: boolean;
  error?: string;
}

export interface HexagonSchedule {
  id: string;
  name: string;
  hexagons: ScheduledHexagon[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HexagonSelection {
  hexagonId: string;
  hexagonNumber: number;
  polygonId: number;
  isSelected: boolean;
}
