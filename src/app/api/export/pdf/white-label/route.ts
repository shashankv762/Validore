import { NextResponse } from "next/server";
export async function GET() { return new NextResponse("pdf", { headers: { "Content-Type": "application/pdf" } }); }