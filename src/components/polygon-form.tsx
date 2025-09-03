
'use client';

import {zodResolver} from '@hookform/resolvers/zod';
import {Loader2} from 'lucide-react';
import {useForm} from 'react-hook-form';
import * as z from 'zod';

import {Button} from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {Textarea} from '@/components/ui/textarea';

const formSchema = z.object({
  wkt: z
    .string()
    .min(1, 'WKT input cannot be empty.')
    .refine(
      (val) => val.trim().toUpperCase().startsWith('POLYGON'),
      {message: 'Input must be a valid WKT POLYGON string.'}
    ),
});

type PolygonFormProps = {
  onSubmit: (values: z.infer<typeof formSchema>) => void;
};

const defaultWkt = 'POLYGON ((78.8232031 11.0973196, 78.823187 11.0964142, 78.8234606 11.0963879, 78.823407 11.0972091, 78.8232031 11.0973196))';


export default function PolygonForm({onSubmit}: PolygonFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      wkt: defaultWkt,
    },
  });

  const {isSubmitting} = form.formState;

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        onSubmit(values);
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
          render={({field}) => (
            <FormItem>
              <FormLabel>Polygon WKT</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Paste your WKT here..."
                  className="min-h-[200px] h-96 font-code text-xs"
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
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate Hexagons
        </Button>
      </form>
    </Form>
  );
}
