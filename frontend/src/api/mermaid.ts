// One parser/configuration for generated output, saved diagrams and manual edits.
export const mermaidReady = import("mermaid").then(({ default: mermaid }) => {
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
  return mermaid;
});

export async function prepareDiagram(original: string): Promise<{ code: string; repaired: boolean; error?: string }> {
  const mermaid = await mermaidReady;
  try {
    await mermaid.parse(original);
    return { code: original, repaired: false };
  } catch (reason) {
    const error = reason instanceof Error ? reason.message : String(reason);
    const fence = original.trim().match(/^```(?:mermaid)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
    let candidate = fence ? fence[1] : original;
    // Only flowchart node declarations with an unambiguous duplicate quote pair.
    // Do not rewrite embedded quotes, edges, comments, or other diagram languages.
    if (/^\s*(?:graph|flowchart)\s+(?:TD|TB|BT|LR|RL)\b/.test(candidate)) {
      candidate = candidate.replace(/^(\s*[A-Za-z_][\w-]*\s*\[)""([^"\r\n]+)""(\])/gm, '$1"$2"$3');
    }
    if (candidate !== original) {
      try {
        await mermaid.parse(candidate);
        return { code: candidate, repaired: true };
      } catch { /* Never accept a repair merely because its text looks plausible. */ }
    }
    return { code: original, repaired: false, error };
  }
}
