
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import GoogleSheetForm from './google-sheet-form';

const formSchema = z.object({
  wkt: z
    .string()
    .min(1, 'WKT input cannot be empty.')
    .refine(
      (val) => val.trim().toUpperCase().startsWith('POLYGON'),
      { message: 'Input must be a valid WKT POLYGON string.' }
    ),
  resolution: z.coerce.number().min(0).max(15),
});

type ManualPolygonFormProps = {
  onSubmit: (values: { wkts: string[]; resolution: number }) => void;
};

const defaultWkt =
  'POLYGON ((78.8232031 11.0973196, 78.823187 11.0964142, 78.8234606 11.0963879, 78.823407 11.0972091, 78.8232031 11.0973196))';

function ManualPolygonForm({ onSubmit }: ManualPolygonFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      wkt: defaultWkt,
      resolution: 10,
    },
  });

  const { isSubmitting } = form.formState;

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        onSubmit({ wkts: [values.wkt], resolution: values.resolution });
        resolve();
      }, 500);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 px-2">
        <FormField
          control={form.control}
          name="wkt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Polygon WKT</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Paste your WKT here..."
                  className="min-h-[200px] h-72 font-code text-xs"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Input a valid Well-Known Text (WKT) Polygon.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="resolution"
          render={({ field }) => (
            <FormItem>
              <FormLabel>H3 Resolution</FormLabel>
              <Select onValueChange={(val) => field.onChange(parseInt(val, 10))} defaultValue={String(field.value)}>
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
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate Hexagons
        </Button>
      </form>
    </Form>
  );
}


export default function PolygonForm({ onSubmit }: ManualPolygonFormProps) {
  return (
    <Tabs defaultValue="manual" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="manual">Manual Input</TabsTrigger>
        <TabsTrigger value="sheet">Google Sheet</TabsTrigger>
      </TabsList>
      <TabsContent value="manual" className="pt-4">
        <ManualPolygonForm onSubmit={onSubmit} />
      </TabsContent>
      <TabsContent value="sheet" className="pt-4">
        <GoogleSheetForm onSubmit={onSubmit} />
      </TabsContent>
    </Tabs>
  )
}
