export default {
  fetch(request) {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://web.messagram.pp.ua",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  },
};
