
'use server';

import Papa from 'papaparse';

export async function fetchGoogleSheetData(url: string): Promise<{
  success: boolean;
  data?: { headers: string[]; rows: string[][] };
  error?: string;
}> {
  if (!url || !url.includes('docs.google.com/spreadsheets')) {
    return { success: false, error: 'Please enter a valid Google Sheet URL.' };
  }

  // Expects a URL for a sheet published as a CSV
  // e.g., https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}
  if (!url.includes('export?format=csv')) {
      return { success: false, error: 'URL must be for a sheet published to the web as a CSV file.' };
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet. Status: ${response.status}`);
    }
    const text = await response.text();
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
