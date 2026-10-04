import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Needed by the payload-totp plugin: it reads the pathname from this header.
export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.append('x-pathname', request.nextUrl.pathname)
  return response
}
