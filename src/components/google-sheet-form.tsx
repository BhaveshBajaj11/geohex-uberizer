
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useState } from 'react';

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
  wktColumn: z.string().optional(),
  selectedRow: z.string().optional(),
  resolution: z.coerce.number().min(0).max(15),
});

type SheetData = {
  headers: string[];
  rows: string[][];
};

type GoogleSheetFormProps = {
  onSubmit: (values: { wkt: string; resolution: number }) => void;
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

  const { isSubmitting, watch } = form.formState;
  const watchedWktColumn = watch('wktColumn');
  const watchedSelectedRow = watch('selectedRow');

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
    form.reset({ ...form.getValues(), wktColumn: undefined, selectedRow: undefined });

    const result = await fetchGoogleSheetData(url);

    if (result.success && result.data) {
      setSheetData(result.data);
      toast({
        title: 'Sheet Loaded',
        description: `Found ${result.data.rows.length} rows. Please select the polygon column and row.`,
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
    const { wktColumn, selectedRow, resolution } = form.getValues();
    if (!wktColumn || !selectedRow || !sheetData) {
      toast({
          variant: 'destructive',
          title: 'Incomplete selection',
          description: 'Please select a column and a row.',
      });
      return;
    }
    const columnIndex = sheetData.headers.indexOf(wktColumn);
    const rowIndex = parseInt(selectedRow, 10);
    const wkt = sheetData.rows[rowIndex]?.[columnIndex];

    if (!wkt) {
        toast({
            variant: 'destructive',
            title: 'WKT data not found',
            description: 'Could not find WKT data at the selected column and row.',
        });
        return;
    }
    
    onSubmit({ wkt, resolution });
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
                Publish your sheet to the web as a CSV and paste the link here.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {sheetData && (
          <>
            <FormField
              control={form.control}
              name="wktColumn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Polygon Column</FormLabel>
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

            {watchedWktColumn && (
              <FormField
                control={form.control}
                name="selectedRow"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Polygon Row</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a row" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sheetData.rows.map((row, index) => {
                          const wktColumnIndex = sheetData.headers.indexOf(
                            watchedWktColumn
                          );
                          const cellValue =
                            row[wktColumnIndex]?.substring(0, 40) + '...';
                          return (
                            <SelectItem key={index} value={String(index)}>
                              Row {index + 2}: {cellValue}
                            </SelectItem>
                          );
                        })}
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
                onValueChange={field.onChange}
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
          disabled={isSubmitting || isFetching || !watchedWktColumn || !watchedSelectedRow}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate Hexagons
        </Button>
      </form>
    </Form>
  );
}
