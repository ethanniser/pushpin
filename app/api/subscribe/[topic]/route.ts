// HTTP streaming subscription handler (v2)
// Uses @fanoutio/grip's GripInstruct abstraction

import { GripInstruct } from "@fanoutio/grip";
import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ topic: string }> },
): Promise<Response> {
  const { topic } = await params;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "Grip-Hold, Grip-Channel, Grip-Keep-Alive",
  };

  if (!topic) {
    return new Response("Topic required", {
      status: 400,
      headers: corsHeaders,
    });
  }

  console.log(`[Subscribe-v2] Topic: ${topic}`);

  // Use GripInstruct to build GRIP headers properly
  const gripInstruct = new GripInstruct(topic);
  gripInstruct.setHoldStream();
  gripInstruct.setKeepAlive("\n", 20);

  return new Response("", {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...gripInstruct.toHeaders(),
      ...corsHeaders,
    },
  });
}
