// WEConverge v1 extension entry point.
// OMP resolves `<ext>/index.ts` as the extension entry; this re-export keeps the
// real implementation in src/extension.ts and prevents OMP from scanning src/core/*.
export { default } from "./src/extension";
