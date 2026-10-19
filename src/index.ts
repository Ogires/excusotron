export default {
  async fetch(): Promise<Response> {
    return new Response("No hay nada que excusar aquí (404)", { status: 404 });
  },
} satisfies ExportedHandler;
