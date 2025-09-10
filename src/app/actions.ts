
'use server';

import Papa from 'papaparse';
import type { HexagonSchedule, ScheduledHexagon } from '@/types/scheduling';

// Hardcoded Google Sheets URLs
const POLYGON_SHEET_URL = 'https://docs.google.com/spreadsheets/d/100PpgFmO116AwqEZduLG_94U7JBUPa1_wvd3keZpL2A/edit?gid=0#gid=0';
const SCHEDULE_ROUTES_SHEET_URL = 'https://docs.google.com/spreadsheets/d/100PpgFmO116AwqEZduLG_94U7JBUPa1_wvd3keZpL2A/edit?gid=1174409#gid=1174409';

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

export async function fetchGoogleSheetData(): Promise<{
  success: boolean;
  data?: { headers: string[]; rows: string[][] };
  error?: string;
}> {
  const url = POLYGON_SHEET_URL;
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
    'Terminal ID': schedule.terminalId,
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
        id: `${row['Terminal ID']}-${row['Route Name']}`,
        name: row['Route Name'],
        terminalId: row['Terminal ID'],
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
export async function fetchRoutesFromGoogleSheet(terminalId?: string): Promise<{
  success: boolean;
  data?: HexagonSchedule[];
  error?: string;
}> {
  const url = SCHEDULE_ROUTES_SHEET_URL;
  const { sheetId, gid } = getSheetIdAndGid(url);

  if (!sheetId) {
    return { success: false, error: 'Could not parse Sheet ID from the URL.' };
  }

  // If GID is not in the original URL, it defaults to the first sheet (gid=0)
  const gidValue = gid ?? '0';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gidValue}`;
  
  let result;
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

    const parseResult = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
    });
    
    if (parseResult.errors.length > 0) {
        console.error('Parsing errors:', parseResult.errors);
        throw new Error('Error parsing CSV data from the sheet.');
    }

    if (parseResult.data.length < 1) {
        return { success: false, error: 'Sheet appears to be empty or in an invalid format.' };
    }
    
    const headers = parseResult.data[0];
    const rows = parseResult.data.slice(1);

    result = { success: true, data: { headers, rows } };

  } catch (error) {
    console.error('Error fetching Google Sheet:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    result = { success: false, error: message };
  }
  
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
    
    console.log('Debug - Terminal ID being filtered:', terminalId);
    console.log('Debug - All schedules found:', schedules.map(s => ({ id: s.id, terminalId: s.terminalId, name: s.name })));
    
    // Filter by terminal ID if provided
    const filteredSchedules = terminalId 
      ? schedules.filter(schedule => schedule.terminalId === terminalId)
      : schedules;
    
    console.log('Debug - Filtered schedules:', filteredSchedules.map(s => ({ id: s.id, terminalId: s.terminalId, name: s.name })));
    
    return { success: true, data: filteredSchedules };
    
  } catch (error) {
    console.error('Error processing route data:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred while processing route data.';
    return { success: false, error: message };
  }
}

// Function to get available terminal IDs from routes
export async function getAvailableTerminalIds(): Promise<{
  success: boolean;
  data?: string[];
  error?: string;
}> {
  const url = SCHEDULE_ROUTES_SHEET_URL;
  const { sheetId, gid } = getSheetIdAndGid(url);

  if (!sheetId) {
    return { success: false, error: 'Could not parse Sheet ID from the URL.' };
  }

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
    
    if (text.trim().startsWith('<!DOCTYPE html>')) {
        throw new Error('Failed to fetch sheet data. The URL may be for a private sheet. Please ensure "Anyone with the link can view".');
    }

    const parseResult = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
    });
    
    if (parseResult.errors.length > 0) {
        console.error('Parsing errors:', parseResult.errors);
        throw new Error('Error parsing CSV data from the sheet.');
    }

    if (parseResult.data.length < 1) {
        return { success: false, error: 'Sheet appears to be empty or in an invalid format.' };
    }
    
    const headers = parseResult.data[0];
    const rows = parseResult.data.slice(1);

    // Find Terminal ID column index
    const terminalIdIndex = headers.indexOf('Terminal ID');
    if (terminalIdIndex === -1) {
      return { success: false, error: 'Terminal ID column not found in the sheet.' };
    }

    // Extract unique terminal IDs
    const terminalIds = new Set<string>();
    rows.forEach(row => {
      const terminalId = row[terminalIdIndex];
      if (terminalId && terminalId.trim()) {
        terminalIds.add(terminalId.trim());
      }
    });

    return { success: true, data: Array.from(terminalIds).sort() };
    
  } catch (error) {
    console.error('Error fetching terminal IDs:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred while fetching terminal IDs.';
    return { success: false, error: message };
  }
}

// Function to get all hexagon IDs for a specific terminal
export async function getHexagonsForTerminal(terminalId: string): Promise<{
  success: boolean;
  data?: string[];
  error?: string;
}> {
  const url = SCHEDULE_ROUTES_SHEET_URL;
  const { sheetId, gid } = getSheetIdAndGid(url);

  if (!sheetId) {
    return { success: false, error: 'Could not parse Sheet ID from the URL.' };
  }

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
    
    if (text.trim().startsWith('<!DOCTYPE html>')) {
        throw new Error('Failed to fetch sheet data. The URL may be for a private sheet. Please ensure "Anyone with the link can view".');
    }

    const parseResult = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
    });
    
    if (parseResult.errors.length > 0) {
        console.error('Parsing errors:', parseResult.errors);
        throw new Error('Error parsing CSV data from the sheet.');
    }

    if (parseResult.data.length < 1) {
        return { success: false, error: 'Sheet appears to be empty or in an invalid format.' };
    }
    
    const headers = parseResult.data[0];
    const rows = parseResult.data.slice(1);

    // Find column indices
    const terminalIdIndex = headers.indexOf('Terminal ID');
    const hexagonIdIndex = headers.indexOf('hexagon_id');
    
    if (terminalIdIndex === -1 || hexagonIdIndex === -1) {
      return { success: false, error: 'Required columns not found in the sheet.' };
    }

    // Extract unique hexagon IDs for the specified terminal
    const hexagonIds = new Set<string>();
    rows.forEach(row => {
      const rowTerminalId = row[terminalIdIndex];
      const hexagonId = row[hexagonIdIndex];
      if (rowTerminalId === terminalId && hexagonId && hexagonId.trim()) {
        hexagonIds.add(hexagonId.trim());
      }
    });

    return { success: true, data: Array.from(hexagonIds) };
    
  } catch (error) {
    console.error('Error fetching hexagons for terminal:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred while fetching hexagons for terminal.';
    return { success: false, error: message };
  }
}

// Test function to check if the webhook is working
export async function testGoogleSheetsWebhook(): Promise<{
  success: boolean;
  error?: string;
  message?: string;
}> {
  const webhookUrl = `https://script.google.com/macros/s/AKfycbw6KiuiyBwM21c9K2I-eC4fVu62i29nsXPR074UdIWB7rxHERm9-G9QwD4kb8BVuSp_/exec`;
  
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

export async function saveRouteToGoogleSheet(schedule: HexagonSchedule): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  values?: any[][];
}> {
  const url = SCHEDULE_ROUTES_SHEET_URL;

  if (!schedule || !schedule.hexagons || schedule.hexagons.length === 0) {
    return { success: false, error: 'Schedule must contain at least one hexagon.' };
  }

  if (!schedule.name || schedule.name.trim() === '') {
    return { success: false, error: 'Schedule must have a name.' };
  }

  if (!schedule.terminalId || schedule.terminalId.trim() === '') {
    return { success: false, error: 'Schedule must have a valid Terminal ID.' };
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
          
          // Check if this route already exists; we'll use this to decide between append vs replace
          const terminalIdIndex = headers.indexOf('Terminal ID');
          const routeNameIndex = headers.indexOf('Route Name');
          
          if (terminalIdIndex !== -1 && routeNameIndex !== -1) {
            const existingRows = result.data.slice(1); // Skip header row
            const routeExists = existingRows.some(row => 
              row[terminalIdIndex] === schedule.terminalId && row[routeNameIndex] === schedule.name
            );
            // Store decision in a flag; if true, we'll send a replace action to the webhook below
            (globalThis as any).__geohex_shouldReplaceRoute__ = routeExists;
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
        const webhookUrl = `https://script.google.com/macros/s/AKfycbw6KiuiyBwM21c9K2I-eC4fVu62i29nsXPR074UdIWB7rxHERm9-G9QwD4kb8BVuSp_/exec`;
        
        // Prepare the data for the webhook
        const shouldReplace = Boolean((globalThis as any).__geohex_shouldReplaceRoute__);
        const payload = {
          action: shouldReplace ? 'replace' : 'append',
          sheetId: sheetId,
          gid: gidValue,
          data: values,
          headers: ['Terminal ID', 'Route Name', 'hexagon_id', 'Start Time', 'End Time', 'Ordering'],
          // Hints for the webhook to identify which rows to replace
          matchColumns: ['Terminal ID', 'Route Name'],
          matchValues: [schedule.terminalId, schedule.name]
        };
        
        // For now, we'll simulate the write operation
        // In a real implementation, you would make a POST request to the webhook
        console.log('Route data to save:', csvData);
        console.log('Route details:', {
          id: schedule.id,
          terminalId: schedule.terminalId,
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
            message: shouldReplace 
              ? 'Route data updated in Google Sheets successfully.' 
              : 'Route data written to Google Sheets successfully.',
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
