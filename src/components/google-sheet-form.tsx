
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
  selectedPitstopKey: z.string().optional(),
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

  const watchedSelectedPitstopKey = watch('selectedPitstopKey');
  const watchedSelectedTerminalId = watch('selectedTerminalId');

  type Pitstop = { key: string; psName: string; pitstopId: string };

  const uniquePitstops: Pitstop[] = useMemo(() => {
    if (!sheetData) return [];
    const psNameIndex = sheetData.headers.indexOf('PS Name');
    const pitstopIdIndex = sheetData.headers.indexOf('Pitstop ID');
    if (psNameIndex === -1) return [];

    const map = new Map<string, Pitstop>();
    sheetData.rows.forEach(row => {
      const psName = row[psNameIndex] || '';
      const pitstopId = pitstopIdIndex !== -1 ? (row[pitstopIdIndex] || '') : '';
      if (!psName) return;
      const key = `${psName}:::${pitstopId}`;
      if (!map.has(key)) {
        map.set(key, { key, psName, pitstopId });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.psName.localeCompare(b.psName));
  }, [sheetData]);

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

  const filteredTerminalIds = useMemo(() => {
    if (!sheetData) return [];
    if (!watchedSelectedPitstopKey) return [];
    const [selectedPsName, selectedPitstopId] = watchedSelectedPitstopKey.split(':::');

    const terminalIdIndex = sheetData.headers.indexOf('Terminal ID');
    const psNameIndex = sheetData.headers.indexOf('PS Name');
    const pitstopIdIndex = sheetData.headers.indexOf('Pitstop ID');
    if (terminalIdIndex === -1 || psNameIndex === -1) return [];

    const ids = new Set<string>();
    sheetData.rows.forEach(row => {
      const psName = row[psNameIndex] || '';
      const pitId = pitstopIdIndex !== -1 ? (row[pitstopIdIndex] || '') : '';
      const matchesPs = psName === selectedPsName;
      const matchesPit = pitstopIdIndex !== -1 ? (pitId === selectedPitstopId) : true;
      if (matchesPs && matchesPit) {
        const id = row[terminalIdIndex];
        if (id) ids.add(id);
      }
    });
    return Array.from(ids).sort();
  }, [sheetData, watchedSelectedPitstopKey]);

  // When pitstop changes, clear terminal selection
  useEffect(() => {
    if (watchedSelectedPitstopKey) {
      form.setValue('selectedTerminalId', undefined);
    }
  }, [watchedSelectedPitstopKey]);


  const handleFetchSheet = async () => {
    setIsFetching(true);
    setSheetData(null);
    form.reset({ 
        ...form.getValues(), 
        selectedPitstopKey: undefined,
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
      
      const hasPsName = result.data.headers.includes('PS Name');
      toast({
        title: 'Sheet Loaded',
        description: hasPsName
          ? `Found ${result.data.rows.length} rows. Please select a Pitstop.`
          : `Found ${result.data.rows.length} rows. Please select a Terminal ID.`,
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

        {sheetData && uniquePitstops.length > 0 && (
          <FormField
            control={form.control}
            name="selectedPitstopKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Select Pitstop</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a Pitstop" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {uniquePitstops.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.pitstopId ? `${p.psName} (${p.pitstopId})` : p.psName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {sheetData && (!uniquePitstops.length || watchedSelectedPitstopKey) && (
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
                    {(uniquePitstops.length && watchedSelectedPitstopKey
                      ? filteredTerminalIds
                      : uniqueTerminalIds).map((id) => (
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
