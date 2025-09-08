# Google Sheets Integration Setup

To enable direct writing to Google Sheets (instead of CSV download), you need to set up a Google Apps Script webhook.

## Setup Instructions

### Step 1: Create a Google Apps Script

1. Go to [Google Apps Script](https://script.google.com/)
2. Create a new project
3. Replace the default code with the following:

```javascript
function doPost(e) {
  try {
    console.log('Received POST request');
    console.log('Post data:', e.postData);
    
    if (!e.postData || !e.postData.contents) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'No data received' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const data = JSON.parse(e.postData.contents);
    console.log('Parsed data:', data);
    
    const { action, sheetId, gid, data: routeData, headers } = data;
    
    if (action === 'append') {
      console.log('Processing append action');
      console.log('Sheet ID:', sheetId);
      console.log('GID:', gid);
      console.log('Route data:', routeData);
      
      // Open the spreadsheet
      const spreadsheet = SpreadsheetApp.openById(sheetId);
      console.log('Opened spreadsheet:', spreadsheet.getName());
      
      // Get the specific sheet by GID - this is the key fix
      let sheet;
      if (gid && gid !== '0') {
        // Find sheet by GID using the getSheetById method
        try {
          sheet = spreadsheet.getSheetById(parseInt(gid));
          if (!sheet) {
            // Fallback: try to find by index if getSheetById doesn't work
            const sheets = spreadsheet.getSheets();
            const gidIndex = parseInt(gid);
            if (gidIndex < sheets.length) {
              sheet = sheets[gidIndex];
            } else {
              sheet = spreadsheet.getActiveSheet();
            }
          }
        } catch (error) {
          console.log('Error getting sheet by GID, using active sheet:', error);
          sheet = spreadsheet.getActiveSheet();
        }
      } else {
        sheet = spreadsheet.getActiveSheet();
      }
      
      console.log('Using sheet:', sheet.getName());
      
      // Check if sheet is empty and add headers if needed
      const lastRow = sheet.getLastRow();
      if (lastRow === 0 && headers) {
        console.log('Adding headers to empty sheet');
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
      
      // Append the data
      if (routeData && routeData.length > 0) {
        console.log('Appending data rows:', routeData.length);
        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, routeData.length, routeData[0].length).setValues(routeData);
        console.log('Data appended successfully');
      }
      
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Data written successfully' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Invalid action: ' + action }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error in doPost:', error);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Script error: ' + error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ message: 'Google Sheets Webhook is running', timestamp: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Step 2: Deploy as Web App

1. Click "Deploy" → "New deployment"
2. Choose "Web app" as the type
3. Set "Execute as" to "Me"
4. Set "Who has access" to "Anyone"
5. Click "Deploy"
6. Copy the web app URL

### Step 3: Update the Application

1. In your Google Sheets, note the Sheet ID from the URL
2. Update the `webhookUrl` in the `saveRouteToGoogleSheet` function in `src/app/actions.ts`
3. Replace `YOUR_SCRIPT_ID` with your actual script ID from the web app URL

### Step 4: Test the Integration

1. Create some routes in the app
2. Enter your Google Sheets URL
3. Click "Save to Google Sheets"
4. Check your Google Sheet to see if the data was written

## Required Google Sheets Structure

Your Google Sheet should have these columns in the first row:
- Terminal ID
- Route Name
- hexagon_id
- Start Time
- End Time
- Ordering

## Troubleshooting

- Make sure the Google Sheet is publicly accessible
- Verify the webhook URL is correct
- Check the Google Apps Script execution logs
- Ensure the sheet has the required column headers

## Security Note

This setup allows anyone with the webhook URL to write to your Google Sheet. For production use, consider adding authentication or IP restrictions.
