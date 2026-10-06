import { NextResponse } from 'next/server';

export async function GET() {
  return new NextResponse('Auth callback', { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
