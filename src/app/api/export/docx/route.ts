import type { NextRequest } from 'next/server'
import { exportDocument } from '@/lib/exports/route'
export const runtime = 'nodejs'
export const maxDuration = 60
export function GET(request: NextRequest) { return exportDocument(request, 'docx') }
