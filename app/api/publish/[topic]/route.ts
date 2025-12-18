// HTTP streaming publish handler (v2)
// Uses @fanoutio/grip's Publisher abstraction

import { Publisher } from "@fanoutio/grip";
import { NextRequest } from "next/server";

// Initialize GRIP publisher
const publisher = new Publisher({
  control_uri: process.env.PUBLISH_URL || "http://pushpin:5561/",
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topic: string }> }
): Promise<Response> {
  const { topic } = await params;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };

  if (!topic) {
    return new Response("Topic required", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const body = await req.text();
  console.log(`[Publish-v2] Topic: ${topic}, Message: ${body}`);

  try {
    // Format message as proper SSE (Server-Sent Events)
    const sseMessage = `data: ${body}\n\n`;

    // Publish directly to Pushpin using GRIP
    await publisher.publishHttpStream(topic, sseMessage);

    return new Response(
      JSON.stringify({
        success: true,
        topic,
        message: "Published via GRIP",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error("[Publish-v2 ERROR]", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
}
