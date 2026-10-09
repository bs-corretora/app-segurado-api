import { NextResponse } from 'next/server';

export function successResponse(data: unknown, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta ? { meta } : {}),
      error: null,
    },
    { status }
  );
}

export function errorResponse(message: string, status = 400, details: unknown = null) {
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: { message, details },
    },
    { status }
  );
}