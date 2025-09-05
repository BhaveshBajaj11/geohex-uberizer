
'use client';

import {Copy} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ScrollArea} from '@/components/ui/scroll-area';
import {useToast} from '@/hooks/use-toast';
import {Checkbox} from './ui/checkbox';
import {Label} from './ui/label';
import {Separator} from './ui/separator';

type HexCodeListProps = {
  allH3Indexes: string[];
  selectedH3Indexes: Set<string>;
  onSelectionChange: (index: string, selected: boolean) => void;
  onSelectAll: (allIndexes: string[], selectAll: boolean) => void;
  onHexHover: (index: string | null) => void;
};

export default function HexCodeList({
  allH3Indexes,
  selectedH3Indexes,
  onSelectionChange,
  onSelectAll,
  onHexHover,
}: HexCodeListProps) {
  const {toast} = useToast();

  const handleCopy = () => {
    const selectedInThisList = allH3Indexes.filter((idx) => selectedH3Indexes.has(idx));
    navigator.clipboard.writeText(selectedInThisList.join('\n'));
    toast({
      title: 'Copied!',
      description: `${selectedInThisList.length} H3 indexes from this polygon copied to clipboard.`,
    });
  };

  const selectedCount = allH3Indexes.filter((idx) => selectedH3Indexes.has(idx)).length;
  const allSelectedInThisList = allH3Indexes.length > 0 && selectedCount === allH3Indexes.length;

  return (
    <div className="space-y-4">
      <div className="text-sm">
        {selectedCount} of {allH3Indexes.length} hexagons selected.
      </div>
      <div className="flex items-center space-x-2 pb-2">
        <Checkbox
          id={`select-all-${allH3Indexes[0]}`}
          checked={allSelectedInThisList}
          onCheckedChange={(checked) => onSelectAll(allH3Indexes, Boolean(checked))}
          aria-label="Select all in this polygon"
        />
        <Label htmlFor={`select-all-${allH3Indexes[0]}`} className="font-medium">
          Select All
        </Label>
      </div>
      <Separator />
      <ScrollArea className="h-48 w-full rounded-md border" onMouseLeave={() => onHexHover(null)}>
        <div className="p-2 font-code text-xs">
          {allH3Indexes.map((hex, index) => (
            <div
              key={hex}
              className="flex items-center space-x-2 hover:bg-muted/50 rounded-sm p-1"
              onMouseEnter={() => onHexHover(hex)}
            >
              <Checkbox
                id={hex}
                checked={selectedH3Indexes.has(hex)}
                onCheckedChange={(checked) => onSelectionChange(hex, Boolean(checked))}
              />
              <Label htmlFor={hex} className="w-full">
                {index + 1} - {hex}
              </Label>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Button
        className="w-full"
        onClick={handleCopy}
        disabled={selectedCount === 0}
      >
        <Copy className="mr-2 h-4 w-4" />
        Copy Selected ({selectedCount})
      </Button>
    </div>
  );
}
