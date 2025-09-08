'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, Upload, Link as LinkIcon } from 'lucide-react';
import { fetchRoutesFromGoogleSheet, saveRouteToGoogleSheet, testGoogleSheetsWebhook } from '@/app/actions';
import type { HexagonSchedule } from '@/types/scheduling';

interface GoogleSheetsConfigProps {
  onRoutesLoaded: (routes: HexagonSchedule[]) => void;
  onRouteSave: (route: HexagonSchedule) => Promise<void>;
  currentRoutes: HexagonSchedule[];
}

export default function GoogleSheetsConfig({ 
  onRoutesLoaded, 
  onRouteSave, 
  currentRoutes 
}: GoogleSheetsConfigProps) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const { toast } = useToast();

  const handleLoadRoutes = async () => {
    if (!sheetUrl.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter a Google Sheets URL first.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await fetchRoutesFromGoogleSheet(sheetUrl);
      
      if (result.success && result.data) {
        onRoutesLoaded(result.data);
        toast({
          title: 'Routes Loaded',
          description: `Successfully loaded ${result.data.length} routes from Google Sheets. Make sure you have the corresponding polygons loaded to edit hexagons.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Failed to load routes',
          description: result.error || 'An unknown error occurred.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load routes from Google Sheets.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAllRoutes = async () => {
    if (!sheetUrl.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter a Google Sheets URL first.',
      });
      return;
    }

    if (currentRoutes.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No routes to save',
        description: 'Create some routes first before saving to Google Sheets.',
      });
      return;
    }

    setIsSaving(true);
    try {
      let successCount = 0;
      let errorCount = 0;
      
      // Process each route and write to Google Sheets
      for (const route of currentRoutes) {
        const result = await saveRouteToGoogleSheet(sheetUrl, route);
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Failed to save route ${route.name}:`, result.error);
        }
      }
      
      if (successCount > 0) {
        toast({
          title: 'Routes Saved',
          description: `Successfully saved ${successCount} route${successCount !== 1 ? 's' : ''} to Google Sheets.${errorCount > 0 ? ` ${errorCount} route${errorCount !== 1 ? 's' : ''} failed to save.` : ''}`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Failed to Save Routes',
          description: `All ${currentRoutes.length} routes failed to save. Please check your Google Sheets URL and permissions.`,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to save routes',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    setIsTesting(true);
    try {
      const result = await testGoogleSheetsWebhook(sheetUrl);
      
      if (result.success) {
        toast({
          title: 'Webhook Test Successful',
          description: result.message || 'Google Apps Script is working correctly.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Webhook Test Failed',
          description: result.error || 'Failed to connect to Google Apps Script.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Test Error',
        description: 'Failed to test webhook connection.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          Google Sheets Integration
        </CardTitle>
        <CardDescription>
          Connect to Google Sheets to load existing routes or save your current routes directly to the sheet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sheet-url">Google Sheets URL</Label>
          <Input
            id="sheet-url"
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Make sure the sheet has the required columns: Terminal ID, Route Name, hexagon_id, Start Time, End Time, Ordering
          </p>
          <p className="text-xs text-muted-foreground">
            💡 Tip: Load your polygons first, then load routes to enable hexagon editing
          </p>
          <p className="text-xs text-green-600">
            ✅ Google Apps Script configured - direct writing enabled
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleLoadRoutes}
            disabled={isLoading || !sheetUrl.trim()}
            variant="outline"
            className="flex-1"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Load Routes
          </Button>
          
          <Button
            onClick={handleTestWebhook}
            disabled={isTesting || !sheetUrl.trim()}
            variant="outline"
            size="sm"
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <LinkIcon className="h-4 w-4 mr-2" />
            )}
            Test
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleSaveAllRoutes}
            disabled={isSaving || !sheetUrl.trim() || currentRoutes.length === 0}
            className="flex-1"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Save to Google Sheets
          </Button>
        </div>
        
        {currentRoutes.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {currentRoutes.length} route{currentRoutes.length !== 1 ? 's' : ''} ready to save to Google Sheets
          </p>
        )}
      </CardContent>
    </Card>
  );
}
