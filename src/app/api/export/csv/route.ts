import { NextResponse } from "next/server";
export async function GET() { return new NextResponse("csv", { headers: { "Content-Type": "text/csv" } }); }