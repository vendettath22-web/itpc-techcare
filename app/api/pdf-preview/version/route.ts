import { stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const file = await stat(join(process.cwd(), 'lib', 'behavior-observation-pdf.ts'), {
    bigint: true,
  });

  return Response.json(
    { revision: `${file.mtimeNs}:${file.size}` },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
