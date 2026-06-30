declare namespace Deno {
  function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;

  namespace env {
    function get(name: string): string | undefined;
  }
}
