import { NextResponse } from 'next/server';
import { POST as fetchHex } from '../hex/route';

export async function POST(req: Request) {
  try {
    const { hexIndexes, concurrency = 4 } = await req.json();
    if (!Array.isArray(hexIndexes)) return NextResponse.json({}, { status: 400 });

    const results: Record<string, any> = {};
    let i = 0;
    async function worker() {
      while (i < hexIndexes.length) {
        const idx = i++;
        const hex = hexIndexes[idx];
        try {
          const res = await fetchHex(new Request('http://local', { method: 'POST', body: JSON.stringify({ hexIndex: hex }) }));
          const data = await res.json();
          results[hex] = data;
        } catch {
          results[hex] = { hexIndex: hex, polylines: [], totalMeters: 0 };
        }
        await new Promise(r => setTimeout(r, 120));
      }
    }
    const workers = Array.from({ length: Math.min(concurrency, hexIndexes.length) }, () => worker());
    await Promise.all(workers);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({});
  }
}



