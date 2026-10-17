import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("auth_user");
  response.cookies.delete("__sites_local_auth");
  return response;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const response = NextResponse.redirect(new URL("/", url.origin));
  response.cookies.delete("auth_user");
  response.cookies.delete("__sites_local_auth");
  return response;
}
