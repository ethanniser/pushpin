export const GET = (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const topic = url.pathname.split("/").pop();

  if (!topic) {
    return Promise.resolve(new Response("Topic required", { status: 400 }));
  }

  console.log(`[SUBSCRIBE] Topic: ${topic}`);

  // Return GRIP hold stream response
  // This tells Pushpin to hold the connection and subscribe to the channel
  return Promise.resolve(new Response("", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Grip-Hold": "stream",
      "Grip-Channel": topic,
      "Grip-Keep-Alive": "\\n; format=cstring; timeout=20",
    },
  }));
};

