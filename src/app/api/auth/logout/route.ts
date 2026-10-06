import { NextResponse } from "next/server";
import { clearSession } from "../shared";

export async function POST() {
  return clearSession(NextResponse.json({ status: 200, error: false }));
}
