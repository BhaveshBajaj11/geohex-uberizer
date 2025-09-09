
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useState, useMemo, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from './ui/input';
import { useToast } from '@/hooks/use-toast';
import { fetchGoogleSheetData } from '@/app/actions';

const formSchema = z.object({
  selectedTerminalId: z.string().optional(),
  resolution: z.coerce.number().min(0).max(15),
});

type SheetData = {
  headers: string[];
  rows: string[][];
};

type GoogleSheetFormProps = {
  onSubmit: (values: { wkts: string[]; resolution: number; terminalId?: string }) => void;
};

export default function GoogleSheetForm({ onSubmit }: GoogleSheetFormProps) {
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      resolution: 10,
    },
  });

  // Automatically fetch sheet data on component mount
  useEffect(() => {
    handleFetchSheet();
  }, []);

  const { watch, formState } = form;
  const { isSubmitting } = formState;

  const watchedSelectedTerminalId = watch('selectedTerminalId');

  const uniqueTerminalIds = useMemo(() => {
    if (!sheetData) return [];
    const terminalIdColumnIndex = sheetData.headers.indexOf('Terminal ID');
    if (terminalIdColumnIndex === -1) return [];
    
    const ids = new Set<string>();
    sheetData.rows.forEach(row => {
        const id = row[terminalIdColumnIndex];
        if (id) {
            ids.add(id);
        }
    });
    return Array.from(ids).sort();
  }, [sheetData]);


  const handleFetchSheet = async () => {
    setIsFetching(true);
    setSheetData(null);
    form.reset({ 
        ...form.getValues(), 
        selectedTerminalId: undefined 
    });

    const result = await fetchGoogleSheetData();

    if (result.success && result.data) {
      setSheetData(result.data);
      
      // Check if required columns exist
      const hasTerminalIdColumn = result.data.headers.includes('Terminal ID');
      const hasPolygonColumn = result.data.headers.includes('Polygon');
      
      if (!hasTerminalIdColumn || !hasPolygonColumn) {
        toast({
          variant: 'destructive',
          title: 'Missing Required Columns',
          description: 'The sheet must contain "Terminal ID" and "Polygon" columns.',
        });
        setIsFetching(false);
        return;
      }
      
      toast({
        title: 'Sheet Loaded',
        description: `Found ${result.data.rows.length} rows. Please select a Terminal ID.`,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Failed to fetch sheet',
        description: result.error,
      });
    }
    setIsFetching(false);
  };

  const handleSubmit = () => {
    const { selectedTerminalId, resolution } = form.getValues();
    if (!selectedTerminalId || !sheetData) {
      toast({
          variant: 'destructive',
          title: 'Incomplete selection',
          description: 'Please select a Terminal ID.',
      });
      return;
    }
    
    const terminalIdColIndex = sheetData.headers.indexOf('Terminal ID');
    const polygonColIndex = sheetData.headers.indexOf('Polygon');

    const wkts = sheetData.rows
        .filter(row => row[terminalIdColIndex] === selectedTerminalId)
        .map(row => row[polygonColIndex])
        .filter((wkt): wkt is string => !!wkt);


    if (wkts.length === 0) {
        toast({
            variant: 'destructive',
            title: 'No polygons found',
            description: `Could not find any polygons for Terminal ID "${selectedTerminalId}".`,
        });
        return;
    }
    
    onSubmit({ wkts, resolution, terminalId: selectedTerminalId });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-6 px-2"
      >
        {isFetching && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="animate-spin mr-2" />
            <span>Loading polygon data from Google Sheets...</span>
          </div>
        )}

        {sheetData && (
          <FormField
            control={form.control}
            name="selectedTerminalId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Select Terminal ID</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a Terminal ID" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {uniqueTerminalIds.map((id) => (
                        <SelectItem key={id} value={id}>
                          {id}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="resolution"
          render={({ field }) => (
            <FormItem>
              <FormLabel>H3 Resolution</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(parseInt(value, 10))}
                defaultValue={String(field.value)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a resolution" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Array.from({ length: 16 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Select the H3 resolution (0 is largest, 15 is smallest).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || isFetching || !watchedSelectedTerminalId}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate Hexagons
        </Button>
      </form>
    </Form>
  );
}
