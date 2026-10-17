# OCR screening: model slots per provider

Part of #335, #264, #330. Intermediate: slots are provisional, see Not decided.

## Evaluated
- Agent `ocr`, prompt v1.1.0, hash `00c5d3d9df8b031655e33e207df14c1216f40937cb452afe9bd2565ae65a6753`.
- 17 to 20 samples per model, tier `flex`, temperature 1, max tokens 32000. Photos differ between models; not a matched set.
- Samples rejected by the OCR agent's acceptance rules (page confidence below 0.5, unreadable text, unsupported language) are removed before judging: 2 of 20 for `gpt-5.4-nano`, both at page confidence 0.46.
- Judges: OCR text and OCR visual elements, rubric v1.1.0 each, model `gpt-6.1-sol` on flex. Score 0 to 1 per sample.
- Judge validation: 18 samples hand-reviewed against the page images. Agreement within 0.15: `gpt-6.1-sol` 15 of 18; `gpt-5.4-mini` with the same rubrics 8 of 18; `gpt-5.4-mini` with the first rubrics 12 of 18. With the first rubrics, `gpt-5.4-mini` scored two outputs of one page 0.2 and 0.98, and the 0.2 output was the more complete one.

## Results
Scores are `mean (median)`. Cost is per accepted page, latency `median (p95)`.

| Model | Samples | Text | Visual elements | Cost, $ | Latency, s |
|---|---|---|---|---|---|
| gpt-6.1-sol | 20 | 0.925 (0.900) | 0.690 (0.600) | 0.0107 | 24 (38) |
| gpt-5.4-mini | 20 | 0.868 (0.900) | 0.575 (0.600) | 0.0034 | 8 (11) |
| gpt-6-luna | 20 | 0.798 (0.800) | 0.660 (0.600) | 0.0009 | 21 (48) |
| gpt-5-mini | 20 | 0.782 (0.850) | 0.665 (0.600) | 0.0029 | 18 (23) |
| gpt-5.4-nano | 18 | 0.664 (0.750) | 0.550 (0.600) | 0.0011 | 11 (15) |
| gpt-5-nano | 20 | 0.528 (0.500) | 0.750 (0.800) | 0.0010 | 61 (87) |
| gemini-3.8-flash | 17 | 0.936 (0.970) | 0.953 (1.000) | 0.0038 | 25 (115) |
| gemini-3.5-flash-lite | 20 | 0.912 (0.900) | 0.870 (1.000) | 0.0014 | 6 (9) |
| gemini-3.1-flash-lite | 20 | 0.782 (0.800) | 0.818 (0.900) | 0.0008 | 6 (9) |

`gemini-3.8-flash` has 17 of 20: three jobs failed on 503 (high demand), then 429 (quota), on a free-tier key.
`gemini-3.1-flash-lite` had one 120 s timeout before its 20th sample was added on a re-run.
Gemini reports page confidence of 0.95 or higher on every page, so the confidence gate rarely applies to it.
Local models (qwen, gemma) were excluded after the first round.

## Slots
One model may fill several slots.

| Provider | Best | Default | Cheapest |
|---|---|---|---|
| OpenAI | gpt-6.1-sol | gpt-5.4-mini | gpt-6-luna |
| Gemini | gemini-3.8-flash | gemini-3.5-flash-lite | gemini-3.1-flash-lite |

- Dropped for OCR: `gpt-5-nano` (text 0.53, slowest), `gpt-5.4-nano` (lowest visual score, 10% rejected), `gpt-5-mini` (luna matches it at a third of the cost).
- `gemini-3.1-flash-lite` as cheapest: text is 0.15 below the best Gemini, and it saves $0.0006 per page against the default. Accepted.

## Not decided
- OpenAI default, `gpt-5.4-mini` vs `gpt-6-luna`: mini is +0.07 on text and 8 s against 21 s, but -0.085 on visual elements and 3.8x the cost. Both gaps are within noise at n=20.
- Gemini best vs default: text gap 0.024, visual gap 0.083. `gemini-3.8-flash` has 17 samples and a 115 s p95 on a free-tier key.
- The visual-elements column depends on how a model lists elements: the OpenAI models list exercise expressions as formula elements, which the rubric counts as spurious.
