export const GET = (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const topic = url.pathname.split("/").pop();

  if (!topic) {
    return Promise.resolve(new Response("Topic required", { 
      status: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      }
    }));
  }

  console.log(`[SUBSCRIBE] Topic: ${topic}`);

  // Return GRIP hold stream response for Server-Sent Events
  // This tells Pushpin to hold the connection and subscribe to the channel
  return Promise.resolve(new Response("", {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Grip-Hold": "stream",
      "Grip-Channel": topic,
      "Grip-Keep-Alive": "\\n; format=cstring; timeout=20",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "Grip-Hold, Grip-Channel, Grip-Keep-Alive",
    },
  }));
};

