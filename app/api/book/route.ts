import { NextResponse } from "next/server";
import { sampleBook } from "@/lib/ingest/demo";
import { fetchWalletBook } from "@/lib/ingest/live";
import { isTerminalId } from "@/lib/terminals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const terminalParam = searchParams.get("terminal");
  const terminal = isTerminalId(terminalParam) ? terminalParam : "axiom";
  const depth = Number(searchParams.get("depth") ?? "200");
  if (searchParams.get("demo") === "1") {
    return NextResponse.json(sampleBook(terminal));
  }
  try {
    const book = await fetchWalletBook(address, terminalParam, depth);
    return NextResponse.json(book);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The wallet could not be read.";
    const status = /address/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
