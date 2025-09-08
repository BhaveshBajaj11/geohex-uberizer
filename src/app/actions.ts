
'use server';

import Papa from 'papaparse';
import type { HexagonSchedule, ScheduledHexagon } from '@/types/scheduling';

function getSheetIdAndGid(url: string): {sheetId: string | null; gid: string | null} {
  const sheetIdRegex = /spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
  const gidRegex = /gid=([0-9]+)/;

  const sheetIdMatch = url.match(sheetIdRegex);
  const gidMatch = url.match(gidRegex);

  return {
    sheetId: sheetIdMatch ? sheetIdMatch[1] : null,
    gid: gidMatch ? gidMatch[1] : null,
  };
}

export async function fetchGoogleSheetData(url: string): Promise<{
  success: boolean;
  data?: { headers: string[]; rows: string[][] };
  error?: string;
}> {
  if (!url || !url.includes('docs.google.com/spreadsheets')) {
    return { success: false, error: 'Please enter a valid Google Sheet URL.' };
  }

  const { sheetId, gid } = getSheetIdAndGid(url);

  if (!sheetId) {
    return { success: false, error: 'Could not parse Sheet ID from the URL.' };
  }

  // If GID is not in the original URL, it defaults to the first sheet (gid=0)
  const gidValue = gid ?? '0';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gidValue}`;
  
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      if (response.status === 400) {
        throw new Error('Failed to fetch sheet. This might be a private sheet or an invalid URL. Please ensure "Anyone with the link can view".');
      }
      throw new Error(`Failed to fetch sheet. Status: ${response.status}`);
    }
    const text = await response.text();
    
    // Check for HTML response which indicates an error page (e.g. login required)
    if (text.trim().startsWith('<!DOCTYPE html>')) {
        throw new Error('Failed to fetch sheet data. The URL may be for a private sheet. Please ensure "Anyone with the link can view".');
    }

    const result = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
    });
    
    if (result.errors.length > 0) {
        console.error('Parsing errors:', result.errors);
        throw new Error('Error parsing CSV data from the sheet.');
    }

    if (result.data.length < 1) {
        return { success: false, error: 'Sheet appears to be empty or in an invalid format.' };
    }
    
    const headers = result.data[0];
    const rows = result.data.slice(1);

    return { success: true, data: { headers, rows } };

  } catch (error) {
    console.error('Error fetching Google Sheet:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: message };
  }
}

// Route-specific types and interfaces
export interface RouteSheetRow {
  'Terminal ID': string;
  'Route Name': string;
  'hexagon_id': string;
  'Start Time': string;
  'End Time': string;
  'Ordering': string;
}

export interface RouteSheetData {
  headers: string[];
  rows: RouteSheetRow[];
}

// Data transformation functions
export async function scheduleToSheetRows(schedule: HexagonSchedule): Promise<RouteSheetRow[]> {
  return schedule.hexagons.map((hexagon, index) => ({
    'Terminal ID': schedule.id,
    'Route Name': schedule.name,
    'hexagon_id': hexagon.hexagonId,
    'Start Time': hexagon.timeSlot.start,
    'End Time': hexagon.timeSlot.end,
    'Ordering': (index + 1).toString(),
  }));
}

export async function sheetRowsToSchedules(rows: RouteSheetRow[]): Promise<HexagonSchedule[]> {
  const scheduleMap = new Map<string, HexagonSchedule>();
  
  rows.forEach((row) => {
    const key = `${row['Terminal ID']}-${row['Route Name']}`;
    
    if (!scheduleMap.has(key)) {
      scheduleMap.set(key, {
        id: row['Terminal ID'],
        name: row['Route Name'],
        hexagons: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    const schedule = scheduleMap.get(key)!;
    const ordering = parseInt(row['Ordering']) - 1; // Convert to 0-based index
    
    // Ensure we have enough slots in the array
    while (schedule.hexagons.length <= ordering) {
      schedule.hexagons.push({
        hexagonId: '',
        hexagonNumber: 0,
        timeSlot: { start: '', end: '', isAvailable: true },
        polygonId: 0,
      });
    }
    
    schedule.hexagons[ordering] = {
      hexagonId: row['hexagon_id'],
      hexagonNumber: ordering + 1,
      timeSlot: {
        start: row['Start Time'],
        end: row['End Time'],
        isAvailable: true,
      },
      polygonId: 0, // Will be updated when the schedule is loaded into the app
    };
  });
  
  // Remove empty slots and return schedules
  return Array.from(scheduleMap.values()).map(schedule => ({
    ...schedule,
    hexagons: schedule.hexagons.filter(h => h.hexagonId !== ''),
  }));
}

// Route-specific Google Sheets actions
export async function fetchRoutesFromGoogleSheet(url: string): Promise<{
  success: boolean;
  data?: HexagonSchedule[];
  error?: string;
}> {
  const result = await fetchGoogleSheetData(url);
  
  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }
  
  try {
    // Validate required columns
    const requiredColumns = ['Terminal ID', 'Route Name', 'hexagon_id', 'Start Time', 'End Time', 'Ordering'];
    const headers = result.data.headers;
    
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      return { 
        success: false, 
        error: `Missing required columns: ${missingColumns.join(', ')}. Required columns: ${requiredColumns.join(', ')}` 
      };
    }
    
    // Convert rows to RouteSheetRow format
    const routeRows: RouteSheetRow[] = result.data.rows.map(row => {
      const rowObj: RouteSheetRow = {
        'Terminal ID': '',
        'Route Name': '',
        'hexagon_id': '',
        'Start Time': '',
        'End Time': '',
        'Ordering': '',
      };
      
      headers.forEach((header, index) => {
        if (header in rowObj && row[index]) {
          (rowObj as any)[header] = row[index];
        }
      });
      
      return rowObj;
    });
    
    // Convert to schedules
    const schedules = await sheetRowsToSchedules(routeRows);
    
    return { success: true, data: schedules };
    
  } catch (error) {
    console.error('Error processing route data:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred while processing route data.';
    return { success: false, error: message };
  }
}

// Test function to check if the webhook is working
export async function testGoogleSheetsWebhook(url: string): Promise<{
  success: boolean;
  error?: string;
  message?: string;
}> {
  const webhookUrl = `https://script.google.com/macros/s/AKfycbwINh9HNnWRvc_DTcCP5X1X87ex1MxwxCoe6jqXNANqqECC9LPRnbic090-98MBqbW-/exec`;
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'GET'
    });
    
    if (!response.ok) {
      return { success: false, error: `HTTP error! status: ${response.status}` };
    }
    
    const result = await response.json();
    return { success: true, message: result.message || 'Webhook is working' };
    
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function saveRouteToGoogleSheet(url: string, schedule: HexagonSchedule): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  values?: any[][];
}> {
  // Validate input
  if (!url || !url.includes('docs.google.com/spreadsheets')) {
    return { success: false, error: 'Please provide a valid Google Sheets URL.' };
  }

  if (!schedule || !schedule.hexagons || schedule.hexagons.length === 0) {
    return { success: false, error: 'Schedule must contain at least one hexagon.' };
  }

  if (!schedule.name || schedule.name.trim() === '') {
    return { success: false, error: 'Schedule must have a name.' };
  }

  if (!schedule.id || schedule.id.trim() === '') {
    return { success: false, error: 'Schedule must have a valid ID.' };
  }
  
  try {
    const rows = await scheduleToSheetRows(schedule);
    
    // Validate the generated rows
    for (const row of rows) {
      if (!row['Terminal ID'] || !row['Route Name'] || !row['hexagon_id'] || 
          !row['Start Time'] || !row['End Time'] || !row['Ordering']) {
        return { 
          success: false, 
          error: 'Invalid route data: missing required fields.' 
        };
      }
    }
    
    // Get sheet ID and GID from URL
    const { sheetId, gid } = getSheetIdAndGid(url);
    if (!sheetId) {
      return { success: false, error: 'Could not parse Sheet ID from the URL.' };
    }

    // First, check if the sheet exists and has the right structure
    const gidValue = gid ?? '0';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gidValue}`;
    
    try {
      const response = await fetch(csvUrl);
      if (!response.ok) {
        return { 
          success: false, 
          error: 'Failed to access Google Sheet. Please ensure the sheet exists and is publicly accessible.' 
        };
      }
      
      const existingData = await response.text();
      
      // Check if sheet has headers
      const hasHeaders = existingData.trim().length > 0;
      
      if (hasHeaders) {
        // Parse existing data to check structure
        const result = Papa.parse<string[]>(existingData, { skipEmptyLines: true });
        if (result.data.length > 0) {
          const headers = result.data[0];
          const requiredColumns = ['Terminal ID', 'Route Name', 'hexagon_id', 'Start Time', 'End Time', 'Ordering'];
          const missingColumns = requiredColumns.filter(col => !headers.includes(col));
          
          if (missingColumns.length > 0) {
            return { 
              success: false, 
              error: `Sheet is missing required columns: ${missingColumns.join(', ')}. Please add these columns to your sheet.` 
            };
          }
        }
      }
      
      // Generate CSV data for the route
      const csvData = Papa.unparse(rows);
      
      // Convert rows to the format expected by Google Sheets
      const values = rows.map(row => [
        row['Terminal ID'],
        row['Route Name'], 
        row['hexagon_id'],
        row['Start Time'],
        row['End Time'],
        row['Ordering']
      ]);
      
      // Try to write directly to Google Sheets using a POST request
      // This approach works if the sheet is set up to accept data via webhook
      try {
        // Create a webhook URL for the Google Sheet
        // This would need to be set up using Google Apps Script
        const webhookUrl = `https://script.google.com/macros/s/AKfycbwRL7UBg5hHcYBFXCpshqbWegixBebn3VYsc0KbKCg2ma_-vYkmOESyJanvQNT5bWHR/exec`;
        
        // Prepare the data for the webhook
        const payload = {
          action: 'append',
          sheetId: sheetId,
          gid: gidValue,
          data: values,
          headers: ['Terminal ID', 'Route Name', 'hexagon_id', 'Start Time', 'End Time', 'Ordering']
        };
        
        // For now, we'll simulate the write operation
        // In a real implementation, you would make a POST request to the webhook
        console.log('Route data to save:', csvData);
        console.log('Route details:', {
          id: schedule.id,
          name: schedule.name,
          hexagonCount: schedule.hexagons.length,
          url: url,
          sheetId: sheetId,
          gid: gidValue,
          values: values,
          webhookUrl: webhookUrl
        });
        
        // Make actual POST request to the webhook
        console.log('Sending data to webhook:', payload);
        console.log('Target Sheet ID:', sheetId);
        console.log('Target GID:', gidValue);
        
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        console.log('Webhook response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Webhook error response:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('Webhook result:', result);
        
        if (result.success) {
          return { 
            success: true, 
            message: 'Route data written to Google Sheets successfully.',
            values: values
          };
        } else {
          console.error('Google Apps Script error:', result.error);
          return { 
            success: false, 
            error: result.error || 'Failed to write to Google Sheets'
          };
        }
        
      } catch (writeError) {
        console.error('Error writing to Google Sheet:', writeError);
        return { 
          success: false, 
          error: 'Failed to write to Google Sheet. Please check the URL and permissions.' 
        };
      }
      
    } catch (fetchError) {
      console.error('Error accessing Google Sheet:', fetchError);
      return { 
        success: false, 
        error: 'Failed to access Google Sheet. Please check the URL and ensure the sheet is publicly accessible.' 
      };
    }
    
  } catch (error) {
    console.error('Error saving route to Google Sheet:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred while saving route.';
    return { success: false, error: message };
  }
}
