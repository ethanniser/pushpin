import { S2 } from "@s2-dev/streamstore";

const s2 = new S2({ accessToken: process.env.S2_AUTH_TOKEN! });
const basin = process.env.S2_BASIN!;

export const POST = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const topic = url.pathname.split("/").pop();

  if (!topic) {
    return new Response("Topic required", { status: 400 });
  }

  const body = await req.text();
  console.log(`[PUBLISH] Topic: ${topic}, Message: ${body}`);

  try {
    // Append record to S2 stream (stream name = topic)
    await s2.records.append({
      s2Basin: basin,
      stream: `v1/${topic}`,
      appendInput: { records: [{ body: body }] },
    });

    return new Response(
      JSON.stringify({
        success: true,
        topic,
        message: "Published to S2 stream",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[PUBLISH ERROR]", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

