
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

type HexCodeListProps = {
  h3Indexes: string[];
  resolution: number;
};

export default function HexCodeList({h3Indexes, resolution}: HexCodeListProps) {
  const {toast} = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(h3Indexes.join('\n'));
    toast({
      title: 'Copied!',
      description: 'H3 indexes copied to clipboard.',
    });
  };

  return (
    <Card className="mx-2 mt-4">
      <CardHeader>
        <CardTitle>H3 Indexes (Res {resolution})</CardTitle>
        <CardDescription>
          {h3Indexes.length} hexagons generated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48 w-full rounded-md border p-2 font-code text-xs">
          {h3Indexes.map((hex) => (
            <div key={hex}>{hex}</div>
          ))}
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy All
        </Button>
      </CardFooter>
    </Card>
  );
}
