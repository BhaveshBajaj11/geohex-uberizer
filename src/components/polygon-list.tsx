
'use client';

import type {PolygonData} from '@/app/page';
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from '@/components/ui/accordion';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
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
  totalHexagonArea: number;
};

export default function PolygonList({
  polygons,
  selectedH3Indexes,
  onSelectionChange,
  onSelectAll,
  onHexHover,
  onRemovePolygon,
  totalHexagonArea,
}: PolygonListProps) {
  if (polygons.length === 0) {
    return null;
  }

  const totalPolygonArea = polygons.reduce((sum, p) => sum + p.area, 0);

  return (
    <>
      <Card className="mx-2 mt-4">
        <CardHeader>
          <CardTitle>Area Calculation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium">Total Polygon Area</h3>
            <p>{(totalPolygonArea / 1_000_000).toFixed(4)} km²</p>
            <p className="text-sm text-muted-foreground">{totalPolygonArea.toFixed(2)} m²</p>
          </div>
          <div>
            <h3 className="font-medium">Total Selected Hexagon Area</h3>
            <p>{(totalHexagonArea / 1_000_000).toFixed(4)} km²</p>
            <p className="text-sm text-muted-foreground">{totalHexagonArea.toFixed(2)} m²</p>
          </div>
        </CardContent>
      </Card>
      <Separator className="my-4" />
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
