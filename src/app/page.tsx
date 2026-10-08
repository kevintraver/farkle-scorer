"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { DieFace } from "@/components/die-face";
import { Disclosure } from "@/components/disclosure";
import { AnalysisDetails } from "@/components/analysis-details";
import { FACE_VALUES, isFaceValue } from "@/lib/dice";
import { resolvedDice, REVIEW_THRESHOLD, type CropDecision, type DraftDie, type AnalysisResponse, type AnalysisResult } from "@/lib/recognition";
import { SCORING_RULES, scoreRoll } from "@/lib/scoring";
import { ACCEPTED_IMAGE_TYPES, validateImage } from "@/lib/upload";
import { resizeImageForUpload } from "@/lib/resize-upload";
import { cn } from "@/lib/utils";

type Photo = { file: File; url: string };

export default function Playground() {
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [dice, setDice] = useState<DraftDie[]>([]);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<{ size: number; width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [manualConfirmed, setManualConfirmed] = useState(false);

  // Object URLs and in-flight requests are the only effects to clean up.
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => () => activeRequest.current?.abort(), []);

  const needsCorrection = analysis?.recognition.status === "needs_correction";
  const completeDice = resolvedDice(dice);
  const score = completeDice && (!needsCorrection || manualConfirmed) ? scoreRoll(completeDice) : null;
  const usedIds = new Set(score?.groups.flatMap((group) => group.dice.map((die) => die.id)));
  const crops = new Map(analysis?.segmentation.crops.map((crop) => [crop.id, crop]));
  const decisions = new Map(analysis?.diagnostics.decisions.map((decision) => [decision.id, decision]));

  function choosePhoto(file: File) {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(false);
    setPreparing(false);
    setUploadInfo(null);
    setAnalysis(null);
    setDice([]);
    setEdited(false);
    setManualConfirmed(false);
    setDragging(false);
    const validationError = validateImage(file, { checkSize: false });
    setError(validationError);
    setPhoto(validationError ? null : { file, url: URL.createObjectURL(file) });
  }

  async function analyze() {
    if (!photo || busy) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setPreparing(true);
    setUploadInfo(null);
    setError(null);
    setAnalysis(null);
    setDice([]);
    setEdited(false);
    setManualConfirmed(false);
    let photoPrepared = false;

    try {
      const prepared = await resizeImageForUpload(photo.file);
      if (controller.signal.aborted) return;
      const validationError = validateImage(prepared.file);
      if (validationError) {
        setError(validationError);
        return;
      }
      photoPrepared = true;
      setPreparing(false);
      if (prepared.resized) setUploadInfo({ size: prepared.file.size, width: prepared.width, height: prepared.height });
      const form = new FormData();
      form.set("image", prepared.file);
      const response = await fetch("/api/analyze", { method: "POST", body: form, signal: controller.signal });
      const payload: AnalysisResponse = await response.json();
      if (controller.signal.aborted) return;
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      setAnalysis(payload);
      setDice(payload.recognition.dice);
    } catch {
      if (!controller.signal.aborted) setError(photoPrepared
        ? "The request couldn't finish. Check your connection and try again."
        : "This photo couldn't be prepared for upload. Choose another JPEG, PNG, or WebP image.");
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
        setPreparing(false);
      }
    }
  }

  function updateDice(next: DraftDie[]) {
    setDice(next);
    setEdited(true);
  }

  return <div className="min-h-dvh">
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="text-teal-800"><DieFace value={5} small /></span>
          <span className="text-lg font-bold">farkle<span className="text-teal-700">.</span></span>
          <span className="hidden border-l border-stone-200 pl-3 text-sm text-stone-500 sm:inline">Photo playground</span>
        </div>
        <span className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600">Single roll · Regular dice</span>
      </div>
    </header>

    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-9 max-w-2xl">
        <p className="mb-3 text-sm font-semibold text-teal-800">From tabletop to total</p>
        <h1 className="font-serif text-4xl sm:text-5xl">What did you roll?</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-stone-600">Upload a photo of your dice. Check what we see, make any corrections, and get the score for this roll.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="photo-heading" className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-stone-100 px-6 py-5">
            <Step number="1" />
            <h2 id="photo-heading" className="font-semibold">Your roll</h2>
          </div>
          <div className="p-5 sm:p-6">
            <input ref={inputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-label="Upload a dice photo"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) choosePhoto(file);
                event.currentTarget.value = "";
              }} />
            <div
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) choosePhoto(file);
              }}
              className={cn("relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed", dragging ? "border-teal-700 bg-teal-50" : "border-stone-200 bg-stone-50")}
            >
              {photo ? <img src={photo.url} alt="Your uploaded dice roll" className="size-full object-contain"
                onError={() => {
                  activeRequest.current?.abort();
                  activeRequest.current = null;
                  setBusy(false);
                  setPreparing(false);
                  setUploadInfo(null);
                  setPhoto(null);
                  setAnalysis(null);
                  setDice([]);
                  setError("This photo couldn't be opened. Choose another JPEG, PNG, or WebP image.");
                }} />
                : <div className="px-6 py-8 text-center">
                  <div aria-hidden="true" className="mb-6 flex justify-center gap-3 text-stone-500"><DieFace value={1} /><DieFace value={5} /><DieFace value={3} /></div>
                  <h3 className="text-lg font-semibold">Start with a dice photo</h3>
                  <p className="mx-auto mb-5 mt-2 max-w-xs text-sm leading-6 text-stone-500">Drop it here, or choose a photo from your device.</p>
                  <Button variant="secondary" onClick={() => inputRef.current?.click()}>Choose photo</Button>
                  <p className="mt-4 text-xs text-stone-500">JPEG, PNG, or WebP · Large photos resize automatically</p>
                </div>}
              {analysis && <svg aria-label="Detected dice locations" role="img" viewBox={`0 0 ${analysis.segmentation.width} ${analysis.segmentation.height}`} className="pointer-events-none absolute inset-0 size-full">
                {dice.map((die, index) => {
                  const crop = crops.get(die.id);
                  if (!crop) return null;
                  const { left, top, right, bottom } = crop.bounds;
                  const labelSize = Math.max(16, analysis.segmentation.width / 32);
                  return <g key={die.id}>
                    <rect x={left} y={top} width={right - left} height={bottom - top} fill="none" stroke="#0f766e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    <rect x={left} y={top} width={labelSize} height={labelSize} fill="#0f766e" />
                    <text x={left + labelSize / 2} y={top + labelSize * 0.74} fill="white" fontSize={labelSize * 0.7} textAnchor="middle">{index + 1}</text>
                  </g>;
                })}
              </svg>}
            </div>

            {photo && <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{photo.file.name}</p>
                <p className="mt-0.5 text-xs tabular-nums text-stone-500">{Math.max(1, Math.round(photo.file.size / 1024)).toLocaleString("en-US")} KB</p>
                {uploadInfo && <p className="mt-1 text-xs leading-5 tabular-nums text-teal-800">Resized for upload: {uploadInfo.width.toLocaleString("en-US")} × {uploadInfo.height.toLocaleString("en-US")} · {Math.max(1, Math.round(uploadInfo.size / 1024)).toLocaleString("en-US")} KB</p>}
              </div>
              <Button variant="quiet" onClick={() => inputRef.current?.click()}>Change photo</Button>
            </div>}

            <p className="my-5 text-sm leading-6 text-stone-500">For a clear read, include 1–6 dice with their top faces visible. Keep dice from earlier rolls out of the photo.</p>
            {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{error}</p>}
            <Button className="w-full" disabled={!photo || busy} onClick={analyze}>
              {preparing ? "Preparing photo…" : busy ? "Reading your dice…" : "Analyze roll"}
              {!busy && <span aria-hidden="true">↗</span>}
            </Button>
            <p className="mt-3 text-center text-xs leading-5 text-stone-500">The photo goes to Meta for segmentation. Individual die crops go to OpenAI. Photos aren’t saved by this app.</p>
          </div>
        </section>

        <section aria-labelledby="result-heading" aria-busy={busy} className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-6 py-5">
            <div className="flex items-center gap-3"><Step number="2" /><h2 id="result-heading" className="font-semibold">Dice & score</h2></div>
            {analysis && <span className="text-xs text-stone-500">{edited ? "Manually edited" : "Photo result"}</span>}
          </div>

          {!analysis ? <div className="flex min-h-96 flex-col items-center justify-center px-6 py-12 text-center" role="status">
            {busy ? <>
              <div aria-hidden="true" className="mb-7 flex gap-3">{[0, 1, 2].map((key) => <div key={key} className="size-16 rounded-xl bg-stone-100" />)}</div>
              <h3 className="text-lg font-semibold">{preparing ? "Preparing your photo" : "Separating and reading your dice"}</h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-stone-500">{preparing ? "Large photos are resized on your device before uploading." : "Meta isolates each die, then OpenAI reads its top face. Your crops and score will appear here."}</p>
            </> : <>
              <div aria-hidden="true" className="mb-6 rounded-2xl bg-stone-100 p-4 text-stone-400"><DieFace value={6} /></div>
              <h3 className="text-lg font-semibold">A fresh roll awaits</h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-stone-500">Your recognized dice and scoring breakdown will show up here after analysis.</p>
            </>}
          </div> : <div className="p-5 sm:p-6">
            {analysis.recognition.issues.length > 0 && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="status">
              <p className="font-semibold">{needsCorrection ? "Enter the dice to finish this roll" : "Check this result"}</p>
              <ul className="mt-1 list-inside list-disc">{analysis.recognition.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>}

            <div className="mb-4 flex items-start justify-between gap-3">
              <div><h3 className="text-sm font-semibold">{needsCorrection ? "Check each die" : "Recognized dice"}</h3><p className="mt-1 text-xs leading-5 text-stone-500">SAM found {analysis.segmentation.detectedCount} objects. Check each crop and add any missed dice.</p></div>
              <span className="shrink-0 text-sm tabular-nums text-stone-500">{dice.length} / 6</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {dice.map((die, index) => <div key={die.id} className={cn("relative flex flex-col items-center rounded-2xl border p-3 pt-7", score && usedIds.has(die.id) ? "border-teal-200 bg-teal-50/50" : "border-stone-200 bg-stone-50")}>
                <span className="absolute left-3 top-2 text-xs tabular-nums text-stone-400">{index + 1}</span>
                <button type="button" aria-label={`Remove die ${index + 1}`} onClick={() => updateDice(dice.filter((item) => item.id !== die.id))}
                  className="absolute right-0 top-0 flex size-9 items-center justify-center rounded-lg text-lg text-stone-400 hover:bg-stone-100 hover:text-stone-900">×</button>
                {crops.has(die.id)
                  ? <img src={crops.get(die.id)?.imageUrl} alt={`Segmented crop for die ${index + 1}`} className="aspect-square w-full rounded-lg bg-white object-contain" />
                  : die.value === null ? <span aria-label="Unread die" className="flex size-16 items-center justify-center text-3xl text-stone-400">?</span> : <DieFace value={die.value} />}
                <label className="sr-only" htmlFor={`value-${die.id}`}>Die {index + 1} value</label>
                <select id={`value-${die.id}`} value={die.value ?? ""} className="mt-3 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm tabular-nums"
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    if (event.currentTarget.value === "" || isFaceValue(value)) updateDice(dice.map((item) => item.id === die.id ? { ...item, value: isFaceValue(value) ? value : null } : item));
                  }}>
                  <option value="">Choose face</option>
                  {FACE_VALUES.map((face) => <option key={face} value={face}>{face}</option>)}
                </select>
                <DieConfidence die={die} decision={decisions.get(die.id)} />
              </div>)}
            </div>

            <Button variant="quiet" className="mt-3" disabled={dice.length >= 6} onClick={() => updateDice([...dice, { id: crypto.randomUUID(), value: null }])}>+ Add die</Button>
            {needsCorrection && !manualConfirmed && <Button className="mt-3 w-full" disabled={!completeDice} onClick={() => setManualConfirmed(true)}>Score entered dice</Button>}

            <div className="mt-6 border-t border-stone-200 pt-6" role="status" aria-live="polite" aria-atomic="true">
              {score ? <>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-stone-500">{score.isFarkle ? "Farkle" : "Roll score"}</p>
                    <p className="mt-1 text-5xl font-semibold tabular-nums text-teal-900" aria-label={`Roll score: ${score.total.toLocaleString("en-US")} points`}>{score.total.toLocaleString("en-US")}<span className="ml-2 text-base font-normal text-stone-500">pts</span></p>
                  </div>
                  {score.unusedDice.length === 0 && <span className="mb-1 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800">All dice score</span>}
                </div>
                {score.isFarkle ? <p className="mt-4 text-sm leading-6 text-stone-500">No scoring combinations in this roll.</p> : <ul className="mt-5 space-y-3">
                  {score.groups.map((group) => <li key={group.dice.map((die) => die.id).join("-")} className="flex items-center justify-between gap-3 text-sm">
                    <span>{group.label}</span><span className="font-medium tabular-nums">+{group.points.toLocaleString("en-US")}</span>
                  </li>)}
                </ul>}
                {score.unusedDice.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
                  <span className="mr-1 text-xs text-stone-500">Not scoring</span>
                  {score.unusedDice.map((die) => <DieFace key={die.id} value={die.value} small muted />)}
                </div>}
              </> : <p className="text-sm leading-6 text-stone-500">{dice.length === 0 ? "Add the dice from your photo to calculate a score." : "Check that all dice are entered, then score the roll."}</p>}
            </div>
          </div>}
        </section>
      </div>

      <div className="mt-6 space-y-4">
        {analysis && <AnalysisDetails analysis={analysis} />}
        <Disclosure title="Scoring rules for this playground">
          <p className="mb-4 text-sm leading-6 text-stone-500">The highest available score from this roll, with each die counted once. Three 1s score 300. Pip colors have no effect.</p>
          <div className="grid gap-x-12 sm:grid-cols-2">{SCORING_RULES.map(([label, points]) => <div key={label} className="flex items-start justify-between gap-4 border-b border-stone-100 py-3 text-sm"><span>{label}</span><span className="shrink-0 text-right font-medium tabular-nums">{typeof points === "number" ? points.toLocaleString("en-US") : points}</span></div>)}</div>
        </Disclosure>
      </div>
      <footer className="mt-8 flex flex-wrap justify-between gap-2 text-xs leading-6 text-stone-500"><span>One photo. One roll.</span><span>Recognition can make mistakes. Your corrections update the score instantly.</span></footer>
    </main>
  </div>;
}

function Step({ number }: { number: string }) {
  return <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold tabular-nums text-stone-500">{number}</span>;
}

function DieConfidence({ die, decision }: { die: DraftDie; decision?: CropDecision }) {
  const answer = decision?.response?.answers.find((item) => item.name === "top_face");
  if (die.value === null || answer?.type !== "choice" || answer.choice !== String(die.value)) {
    return <p className="mt-2 text-center text-xs leading-5 text-stone-500">{die.value === null ? "Needs a value" : "Manually set"}</p>;
  }
  const lowConfidence = answer.confidence < REVIEW_THRESHOLD;
  return <p className={cn("mt-2 w-full rounded-lg px-2 py-1.5 text-center text-xs leading-5 tabular-nums", lowConfidence ? "bg-amber-50 text-amber-900" : "text-stone-500")}>
    <span className="font-medium">{Math.round(answer.confidence * 100)}% confidence</span>
    {lowConfidence && <span className="block">Check this die</span>}
  </p>;
}
