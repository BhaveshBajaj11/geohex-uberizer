
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useState, useMemo } from 'react';

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
  sheetUrl: z.string().url('Please enter a valid URL.'),
  terminalIdColumn: z.string().optional(),
  wktColumn: z.string().optional(),
  selectedTerminalId: z.string().optional(),
  resolution: z.coerce.number().min(0).max(15),
});

type SheetData = {
  headers: string[];
  rows: string[][];
};

type GoogleSheetFormProps = {
  onSubmit: (values: { wkts: string[]; resolution: number }) => void;
};

export default function GoogleSheetForm({ onSubmit }: GoogleSheetFormProps) {
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sheetUrl: '',
      resolution: 10,
    },
  });

  const { watch, formState } = form;
  const { isSubmitting } = formState;

  const watchedTerminalIdColumn = watch('terminalIdColumn');
  const watchedWktColumn = watch('wktColumn');
  const watchedSelectedTerminalId = watch('selectedTerminalId');

  const uniqueTerminalIds = useMemo(() => {
    if (!sheetData || !watchedTerminalIdColumn) return [];
    const terminalIdColumnIndex = sheetData.headers.indexOf(watchedTerminalIdColumn);
    if (terminalIdColumnIndex === -1) return [];
    
    const ids = new Set<string>();
    sheetData.rows.forEach(row => {
        const id = row[terminalIdColumnIndex];
        if (id) {
            ids.add(id);
        }
    });
    return Array.from(ids).sort();
  }, [sheetData, watchedTerminalIdColumn]);


  const handleFetchSheet = async () => {
    const url = form.getValues('sheetUrl');
    if (!url) {
      form.setError('sheetUrl', {
        type: 'manual',
        message: 'Please enter a URL first.',
      });
      return;
    }

    setIsFetching(true);
    setSheetData(null);
    form.reset({ 
        ...form.getValues(), 
        terminalIdColumn: undefined,
        wktColumn: undefined, 
        selectedTerminalId: undefined 
    });

    const result = await fetchGoogleSheetData(url);

    if (result.success && result.data) {
      setSheetData(result.data);
      toast({
        title: 'Sheet Loaded',
        description: `Found ${result.data.rows.length} rows. Please select the required columns.`,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Failed to fetch sheet',
        description: result.error,
      });
      form.setError('sheetUrl', { type: 'manual', message: result.error });
    }
    setIsFetching(false);
  };

  const handleSubmit = () => {
    const { terminalIdColumn, wktColumn, selectedTerminalId, resolution } = form.getValues();
    if (!terminalIdColumn || !wktColumn || !selectedTerminalId || !sheetData) {
      toast({
          variant: 'destructive',
          title: 'Incomplete selection',
          description: 'Please select all required fields.',
      });
      return;
    }
    
    const terminalIdColIndex = sheetData.headers.indexOf(terminalIdColumn);
    const wktColIndex = sheetData.headers.indexOf(wktColumn);

    const wkts = sheetData.rows
        .filter(row => row[terminalIdColIndex] === selectedTerminalId)
        .map(row => row[wktColIndex])
        .filter((wkt): wkt is string => !!wkt);


    if (wkts.length === 0) {
        toast({
            variant: 'destructive',
            title: 'No polygons found',
            description: `Could not find any polygons for Terminal ID "${selectedTerminalId}".`,
        });
        return;
    }
    
    onSubmit({ wkts, resolution });
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
        <FormField
          control={form.control}
          name="sheetUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Google Sheet URL</FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://docs.google.com/..."
                    {...field}
                  />
                  <Button
                    type="button"
                    onClick={handleFetchSheet}
                    disabled={isFetching}
                  >
                    {isFetching ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      'Fetch'
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormDescription>
                Paste the URL of a public Google Sheet. Make sure sharing is set to 'Anyone with the link can view'.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {sheetData && (
          <>
             <FormField
              control={form.control}
              name="terminalIdColumn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Terminal ID Column</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select terminal ID column" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sheetData.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="wktColumn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Polygon (WKT) Column</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column with WKT data" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sheetData.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchedTerminalIdColumn && watchedWktColumn && (
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
          </>
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
