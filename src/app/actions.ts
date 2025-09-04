
'use server';

import Papa from 'papaparse';

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
