import { NextRequest, NextResponse } from "next/server";
import PptxGenJS from 'pptxgenjs';
export async function GET(req: NextRequest) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Aurexa';
  const s = pptx.addSlide();
  s.addText('aurexa');
  const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': 'attachment; filename="aurexa-pitch-deck.pptx"',
    },
  });
}