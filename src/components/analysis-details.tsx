import { Disclosure } from "./disclosure";
import { IMAGE_INSTRUCTIONS, MODEL, QUESTIONS, type AnalysisResult } from "@/lib/recognition";
import { SAM_MODEL, SAM_PROMPT } from "@/lib/segmentation-types";

export function AnalysisDetails({ analysis }: { analysis: AnalysisResult }) {
  const { segmentation, diagnostics } = analysis;
  const usage = diagnostics.decisions.reduce((sum, item) => ({
    input: sum.input + (item.response?.usage.input_tokens ?? 0),
    total: sum.total + (item.response?.usage.total_tokens ?? 0),
  }), { input: 0, total: 0 });
  return <Disclosure title="API details">
    <div className="mb-5 flex flex-wrap gap-x-8 gap-y-3 text-sm tabular-nums">
      <div><span className="text-stone-500">Segmentation </span><span className="font-medium">{segmentation.model}</span></div>
      <div><span className="text-stone-500">Face reader </span><span className="font-medium">{MODEL}</span></div>
      <div><span className="text-stone-500">Total time </span><span className="font-medium">{(diagnostics.elapsedMs / 1000).toFixed(2)} s</span></div>
      <div><span className="text-stone-500">SAM time </span><span className="font-medium">{(segmentation.elapsedMs / 1000).toFixed(2)} s</span></div>
      <div><span className="text-stone-500">Reading time </span><span className="font-medium">{(diagnostics.recognitionMs / 1000).toFixed(2)} s</span></div>
      <div><span className="text-stone-500">Decisions input tokens </span><span className="font-medium">{usage.input.toLocaleString("en-US")}</span></div>
      <div><span className="text-stone-500">Decisions total tokens </span><span className="font-medium">{usage.total.toLocaleString("en-US")}</span></div>
    </div>
    <p className="mb-4 text-sm leading-6 text-stone-500">One SAM request, followed by {diagnostics.decisions.length} individual crop requests. These are the original answers; edits do not change them. Confidence is a model estimate, not verified accuracy. Token totals include successful Decisions responses only.</p>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <caption className="sr-only">Original recognition answers</caption>
        <thead><tr className="border-b border-stone-200 text-stone-500"><th className="pb-3 pr-4 font-medium">Crop</th><th className="pb-3 pr-4 font-medium">Answer</th><th className="pb-3 pr-4 font-medium">Confidence</th><th className="pb-3 font-medium">Choice probabilities</th></tr></thead>
        <tbody>{diagnostics.decisions.map((decision, index) => {
          const answer = decision.response?.answers.find((item) => item.name === "top_face");
          return <tr key={decision.id} className="border-b border-stone-100">
            <td className="whitespace-nowrap py-3 pr-4">{index + 1} ({decision.id})</td>
            <td className="py-3 pr-4">{answer?.type === "choice" ? String(answer.choice) : decision.error ?? "Refused / missing"}</td>
            <td className="py-3 pr-4">{answer?.type === "choice" ? `${Math.round(answer.confidence * 100)}%` : "—"}</td>
            <td className="min-w-64 py-3 text-xs leading-5 text-stone-500">{answer?.type === "choice" ? answer.probabilities.map((option) => `${option.value}: ${(option.probability * 100).toFixed(1)}%`).join(" · ") : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="mt-5 space-y-3">
      <Disclosure title="Exact instructions and questions"><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-stone-50 p-4 font-mono text-xs leading-6">{JSON.stringify({
        segmentation: { endpoint: "https://api.meta.ai/v1/responses", model: SAM_MODEL, prompt: SAM_PROMPT, mask_encoding: "one_bit" },
        eachCrop: { model: MODEL, instructions: IMAGE_INSTRUCTIONS, questions: QUESTIONS },
      }, null, 2)}</pre></Disclosure>
      <Disclosure title="Response JSON"><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-stone-50 p-4 font-mono text-xs leading-6">{JSON.stringify({
        segmentation: { ...segmentation, crops: segmentation.crops.map(({ imageUrl: _imageUrl, ...crop }) => crop) },
        ...diagnostics,
      }, null, 2)}</pre></Disclosure>
    </div>
  </Disclosure>;
}
