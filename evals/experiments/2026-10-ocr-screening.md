# OCR screening: operational data

Part of #335, #264. Interim: acceptance gate, cost, latency and tokens. No quality scores yet.

## Evaluated
- Agent `ocr`, prompt v1.1.0, hash `00c5d3d9df8b031655e33e207df14c1216f40937cb452afe9bd2565ae65a6753`.
- All samples on tier `flex`, temperature 1, max tokens 32000.
- Rejected = fails the OCR agent's own acceptance rules (page confidence below 0.5, unreadable text, unsupported language), re-applied to each stored sample.
- Photos differ between models; not a matched set.

## Results
Cost and tokens are per OCR call. Latency is `median (p95)`.

| Model | Samples | Rejected | Cost per page, $ | Cost per accepted page, $ | Latency, s | Total tokens (mean) |
|---|---|---|---|---|---|---|
| gpt-6-luna | 20 | 0 | 0.0009 | 0.0009 | 21 (48) | 5457 |
| gpt-5-nano | 20 | 0 | 0.0010 | 0.0010 | 61 (87) | 9424 |
| gpt-5.4-nano | 20 | 2 (10%) | 0.0010 | 0.0011 | 11 (15) | 4206 |
| gpt-5-mini | 20 | 0 | 0.0029 | 0.0029 | 18 (23) | 6296 |
| gpt-5.4-mini | 20 | 0 | 0.0034 | 0.0034 | 8 (11) | 4184 |
| gpt-6.1-sol | 20 | 0 | 0.0107 | 0.0107 | 24 (38) | 4608 |
| gemini-3.5-flash-lite | 4 | 0 | 0.0010 | 0.0010 | 5 (5) | 1967 |

Both `gpt-5.4-nano` rejections: page confidence 0.46.
`gemini-3.1-flash-lite` and `gemini-3.8-flash` have no samples yet; local models are excluded.
