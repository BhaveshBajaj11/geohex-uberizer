'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, Link as LinkIcon } from 'lucide-react';
import { saveRouteToGoogleSheet, fetchRoutesFromGoogleSheet } from '@/app/actions';
import type { HexagonSchedule } from '@/types/scheduling';

interface GoogleSheetsConfigProps {
  onRouteSave: (route: HexagonSchedule) => Promise<void>;
  onRoutesLoaded: (routes: HexagonSchedule[]) => void;
  currentRoutes: HexagonSchedule[];
  selectedTerminalId?: string;
}

export default function GoogleSheetsConfig({ 
  onRouteSave, 
  onRoutesLoaded,
  currentRoutes,
  selectedTerminalId
}: GoogleSheetsConfigProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedRoutes = useRef(false);
  const { toast } = useToast();

  // Automatically load routes when terminal ID is available
  useEffect(() => {
    const loadRoutes = async () => {
      if (!selectedTerminalId) {
        return;
      }

      // Only load if we haven't loaded routes yet and don't already have routes
      if (hasLoadedRoutes.current || currentRoutes.length > 0) {
        return;
      }

      setIsLoading(true);
      try {
        const result = await fetchRoutesFromGoogleSheet(selectedTerminalId);
        
        if (result.success && result.data) {
          onRoutesLoaded(result.data);
          hasLoadedRoutes.current = true;
          toast({
            title: 'Routes Loaded',
            description: `Successfully loaded ${result.data.length} routes for Terminal ID "${selectedTerminalId}".`,
          });
        } else {
          console.error('Failed to load routes:', result.error);
          // Don't show error toast for automatic loading to avoid spam
        }
      } catch (error) {
        console.error('Error loading routes:', error);
        // Don't show error toast for automatic loading to avoid spam
      } finally {
        setIsLoading(false);
      }
    };

    loadRoutes();
  }, [selectedTerminalId, onRoutesLoaded, toast, currentRoutes.length]);


  const handleSaveAllRoutes = async () => {
    if (currentRoutes.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No routes to save',
        description: 'Create some routes first before saving to Google Sheets.',
      });
      return;
    }

    if (isSaving) {
      toast({
        variant: 'destructive',
        title: 'Save in progress',
        description: 'Please wait for the current save operation to complete.',
      });
      return;
    }

    setIsSaving(true);
    try {
      let successCount = 0;
      let errorCount = 0;
      
      // Process each route and write to Google Sheets
      for (const route of currentRoutes) {
        const result = await saveRouteToGoogleSheet(route);
        
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


  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          Google Sheets Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedTerminalId && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Terminal ID:</span> {selectedTerminalId}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="animate-spin mr-2" />
            <span>Loading routes from Google Sheets...</span>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button
            onClick={handleSaveAllRoutes}
            disabled={isSaving || currentRoutes.length === 0}
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
