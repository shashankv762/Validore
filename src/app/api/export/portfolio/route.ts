import { NextResponse } from "next/server";
import JSZip from "jszip";
export async function GET() {
  const zip = new JSZip();
  zip.file("index.html", "<html><body>Portfolio</body></html>");
  const content = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="portfolio.zip"'
    }
  });
}