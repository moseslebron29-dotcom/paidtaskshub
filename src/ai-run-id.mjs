// Adapted from the Lovable AI Gateway SDK run-ID helper for Node.js.
const HEADER = 'X-Lovable-AIG-Run-ID';
export function createLovableAiGatewayRunIdFetch() {
    let runId;
    return {
        getRunId: () => runId,
        fetch: async (input, init) => {
            const headers = new Headers(init?.headers);
            if (runId && !headers.has(HEADER)) headers.set(HEADER, runId);
            const response = await fetch(input, { ...init, headers });
            runId ??= response.headers.get(HEADER)?.trim() || undefined;
            return response;
        }
    };
}
