
'use client';

import {Copy} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {ScrollArea} from '@/components/ui/scroll-area';
import {useToast} from '@/hooks/use-toast';
import {Checkbox} from './ui/checkbox';
import {Label} from './ui/label';
import {Separator} from './ui/separator';

type HexCodeListProps = {
  allH3Indexes: string[];
  selectedH3Indexes: Set<string>;
  resolution: number;
  onSelectionChange: (index: string, selected: boolean) => void;
  onSelectAll: (selectAll: boolean) => void;
};

export default function HexCodeList({
  allH3Indexes,
  selectedH3Indexes,
  resolution,
  onSelectionChange,
  onSelectAll,
}: HexCodeListProps) {
  const {toast} = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(Array.from(selectedH3Indexes).join('\n'));
    toast({
      title: 'Copied!',
      description: `${selectedH3Indexes.size} H3 indexes copied to clipboard.`,
    });
  };

  const allSelected = allH3Indexes.length > 0 && selectedH3Indexes.size === allH3Indexes.length;
  const isIndeterminate = selectedH3Indexes.size > 0 && !allSelected;

  return (
    <Card className="mx-2 mt-4">
      <CardHeader>
        <CardTitle>H3 Indexes (Res {resolution})</CardTitle>
        <CardDescription>
          {selectedH3Indexes.size} of {allH3Indexes.length} hexagons selected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2 pb-2">
          <Checkbox
            id="select-all"
            checked={allSelected}
            onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
            aria-label="Select all"
          />
          <Label htmlFor="select-all" className="font-medium">
            Select All
          </Label>
        </div>
        <Separator className="mb-2" />
        <ScrollArea className="h-48 w-full rounded-md border">
          <div className="p-2 font-code text-xs">
            {allH3Indexes.map((hex) => (
              <div key={hex} className="flex items-center space-x-2 hover:bg-muted/50 rounded-sm p-1">
                <Checkbox
                  id={hex}
                  checked={selectedH3Indexes.has(hex)}
                  onCheckedChange={(checked) => onSelectionChange(hex, Boolean(checked))}
                />
                <Label htmlFor={hex} className="w-full">
                  {hex}
                </Label>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          onClick={handleCopy}
          disabled={selectedH3Indexes.size === 0}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy Selected
        </Button>
      </CardFooter>
    </Card>
  );
}
