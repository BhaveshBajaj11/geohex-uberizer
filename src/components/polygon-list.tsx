
'use client';

import type {PolygonData} from '@/app/page';
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from '@/components/ui/accordion';
import {Card} from '@/components/ui/card';
import HexCodeList from './hex-code-list';
import {Button} from './ui/button';
import {Trash2} from 'lucide-react';
import {Separator} from './ui/separator';

type PolygonListProps = {
  polygons: PolygonData[];
  selectedH3Indexes: Set<string>;
  onSelectionChange: (index: string, selected: boolean) => void;
  onSelectAll: (polygonIndexes: string[], selectAll: boolean) => void;
  onHexHover: (index: string | null) => void;
  onRemovePolygon: (id: number) => void;
  onClearAll: () => void;
};

export default function PolygonList({
  polygons,
  selectedH3Indexes,
  onSelectionChange,
  onSelectAll,
  onHexHover,
  onRemovePolygon,
  onClearAll,
}: PolygonListProps) {
  if (polygons.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <p>No polygons added yet.</p>
        <p className="mt-2">Use the form above to generate H3 hexagons from a WKT polygon.</p>
      </div>
    );
  }

  return (
    <>
      <Separator className="my-4" />
      <div className="px-2 mb-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={onClearAll}
          >
            Clear All Polygons ({polygons.length})
        </Button>
      </div>
      <Accordion type="multiple" className="mx-2 space-y-2">
        {polygons.map((poly, index) => (
          <AccordionItem value={`item-${poly.id}`} key={poly.id} className="border-none">
            <Card>
              <AccordionTrigger className="p-4 hover:no-underline">
                <div className="flex justify-between items-center w-full">
                  <div className="text-left flex-grow">
                    <h4 className="font-semibold">Polygon {index + 1}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Res {poly.resolution} &bull; {poly.allH3Indexes.length} Hexagons
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePolygon(poly.id);
                    }}
                    className="ml-2 hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-4 pt-0">
                <HexCodeList
                  allH3Indexes={poly.allH3Indexes}
                  selectedH3Indexes={selectedH3Indexes}
                  onSelectionChange={onSelectionChange}
                  onSelectAll={onSelectAll}
                  onHexHover={onHexHover}
                />
              </AccordionContent>
            </Card>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}
