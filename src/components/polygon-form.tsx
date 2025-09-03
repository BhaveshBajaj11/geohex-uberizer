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
  geoJson: z
    .string()
    .min(1, 'GeoJSON input cannot be empty.')
    .refine(
      (val) => {
        try {
          JSON.parse(val);
          return true;
        } catch (e) {
          return false;
        }
      },
      {message: 'Invalid JSON format.'}
    ),
});

type PolygonFormProps = {
  onSubmit: (values: z.infer<typeof formSchema>) => void;
};

const defaultGeoJson = `{
  "type": "Feature",
  "properties": {},
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [-74.047285, 40.683921],
        [-74.047285, 40.735129],
        [-73.97115, 40.735129],
        [-73.97115, 40.683921],
        [-74.047285, 40.683921]
      ]
    ]
  }
}`;

export default function PolygonForm({onSubmit}: PolygonFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      geoJson: defaultGeoJson,
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
          name="geoJson"
          render={({field}) => (
            <FormItem>
              <FormLabel>Polygon GeoJSON</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Paste your GeoJSON here..."
                  className="min-h-[200px] h-96 font-code text-xs"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Input a valid GeoJSON Polygon, Feature, or FeatureCollection.
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
