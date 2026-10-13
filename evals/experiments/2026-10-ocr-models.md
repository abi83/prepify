# OCR across models (POC)

Part of #313. Proof of concept: the decision is not final.

## Evaluated
- Agent `ocr`, prompt hash `00c5d3d9df8b031655e33e207df14c1216f40937cb452afe9bd2565ae65a6753`.
- Input: 6 textbook photos. French: `20260805_151639`, `151650`, `151654`, `151702 (2)`. Physics: `20260913_131759`, `131803`.
- Judge: `gpt-5.4-mini` on flex, score 0–1 per sample (evaluator `d9c661d2…`).
- Local models via LM Studio. Gemma: temperature 0.2, max tokens 4096, repeat penalty 1.2, reasoning off. Qwen: reasoning off.
- Code: samples recorded at `6ea5ff4` (luna, qwen), `7bf1c20` (gemma), `70619e8` (nano, mini); evals at the same SHAs.

## Results
One sample = one photo = one OCR call. Score and latency show `mean (median)` over the samples: the mean is the plain average (sum / count), the median is the middle value, so it is robust to one slow or bad outlier. Example: latency `81 (78)` = 81 s on average, 78 s for the middle sample. Score is the judge's, 0–1. Tokens and cost are per sample (per OCR call), not totals for the run.

| Model | Tier | Samples | Score | Latency, s | Total tokens (mean) | Cost per sample, $ (mean) |
|---|---|---|---|---|---|---|
| gpt-5-nano | flex | 6 | 0.63 (0.60) | 81 (78) | 9156 | 0.0009 |
| gpt-5-mini | flex | 6 | 0.91 (0.93) | 18 (17) | 6440 | 0.0029 |
| gpt-6-luna | default | 6 | 0.90 (0.96) | 32 (31) | 5309 | 0.0013 |
| qwen3.8-27b (local) | n/a | 6 | 0.71 (0.72) | 147 (130) | 1033* | n/a** |
| gemma-4-26b-a4b (local) | n/a | 4 of 6 | 0.47 (0.46) | 21 (20) | 842* | n/a** |

\* Local servers omit image tokens from usage (#318), so not comparable.
\*\* The recorded local cost is a fallback rate, meaningless (#325).
Luna is on the default tier, the OpenAI models otherwise on flex: costs and latency are not like-for-like.
Gemma failed both physics pages on the 4096-token cap; its score covers the French pages only.

## Agreed
- `gpt-5-nano` is not the way to go: low score, slow on flex, long outputs.
- Local models are not the way to go: lower scores, qwen very slow, gemma fails on dense pages.
- `gpt-5-mini` and `gpt-6-luna` are the candidates; no pick yet.
- Judge reliability is unverified (#331); 6 samples per cell is a small set.

## Artifacts
Local only, not shareable (textbook photos): samples under `data/samples/`, results under `data/evals/results/`, runs from `data/runs/`.
