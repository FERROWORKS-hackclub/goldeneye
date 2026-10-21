import { NextRequest, NextResponse } from 'next/server';

// Bookmarked Auth0 URLs lead to the current tool's sign-in screen.
export function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get('returnTo');
  const destination = returnTo && ['/', '/ferroai', '/printer-lab'].includes(returnTo) ? returnTo : '/';
  return NextResponse.redirect(new URL(destination, request.url));
}
