import { getModels } from "@/lib/actions/api-keys";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  const models = await getModels();
  return NextResponse.json(models);
}
