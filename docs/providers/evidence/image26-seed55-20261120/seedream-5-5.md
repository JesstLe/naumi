> ## Documentation Index
> Fetch the complete documentation index at: https://docs.apimart.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Seedream 5.5 Image Generation

> Generate images from text or up to 10 references, use transparent backgrounds, and decompose images into configurable layers with text OCR. Submit and query asynchronous tasks.

```bash cURL theme={null}
curl --request POST \
  --url https://api.apimart.ai/v1/images/generations \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "seedream-5-5",
  "prompt": "An orange cat sticker with clean edges",
  "size": "2K",
  "background": "transparent",
  "output_format": "png",
  "nsfw_check": true
}'
```

```python Python theme={null}
import requests

payload = {
  "model": "seedream-5-5",
  "prompt": "An orange cat sticker with clean edges",
  "size": "2K",
  "background": "transparent",
  "output_format": "png",
  "nsfw_check": True
}
response = requests.post(
    "https://api.apimart.ai/v1/images/generations",
    headers={"Authorization": "Bearer <token>"},
    json=payload,
    timeout=60,
)
response.raise_for_status()
print(response.json())
```

```javascript JavaScript theme={null}
const payload = {
  "model": "seedream-5-5",
  "prompt": "An orange cat sticker with clean edges",
  "size": "2K",
  "background": "transparent",
  "output_format": "png",
  "nsfw_check": true
};
const response = await fetch("https://api.apimart.ai/v1/images/generations", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());
```

```json 200 theme={null}
{
  "code": 200,
  "data": [
    {
      "status": "submitted",
      "task_id": "task_example_seedream55"
    }
  ]
}
```

Submit to `POST /v1/images/generations`, read the task ID from `data[0].task_id`, then query `GET /v1/tasks/{task_id}` for results.

## Modes

| Mode | Trigger | Input images | Prompt |
| - | - | - | - |
| Image generation | Default | 0–10 | Required |
| Layer decomposition | `layer_decomposition: true` | Exactly 1 | Optional |

## Authentication

**Authorization** `string` *required*

Use `Authorization: Bearer <token>`, where `<token>` is your APIMart API Key.

## Request parameters

**model** `string` *required*

Set to `seedream-5-5`.

**nsfw\_check** `boolean` (default: false)

Whether to run content moderation before submitting the image task.

* `true`: use `omni-moderation-latest` to review prompts and input images
* `false` or omitted: do not send a moderation request, adding no moderation cost or latency (default)

**prompt** `string`

Required for text-to-image and image-to-image. Optional for layer decomposition: the model identifies subjects, text, and backgrounds automatically, or you can describe which elements to separate.

**image\_urls** `string[]`

Up to 10 references for image generation; exactly 1 input for layer decomposition. Accepts public image URLs or image Base64 Data URIs. For local files, use the [image upload endpoint](https://docs.apimart.ai/en/api-reference/uploads/images.md) and pass the returned `url`.

References must use publicly accessible `http(s)` URLs or `data:image/<format>;base64,…` with a lowercase format name.

* Supported: JPEG, PNG, WebP, BMP, TIFF, GIF, HEIC, and HEIF. AVIF and JP2 are unsupported.
* Each image must be at most **30 MiB (31,457,280 bytes)** and **36 million total pixels**. Check width × height; this is not a 6000-pixel limit on each side.
* Exceeding the byte or pixel limit returns HTTP 400 synchronously. AVIF and JP2 may create a task before the upstream rejects them; failed tasks are refunded. Convert these formats before submitting.

The image upload endpoint has its own format restrictions. For model-supported formats that it cannot upload, use a public URL or Data URI.

**size** `string`

Image generation defaults to `2K` and accepts a tier, aspect ratio, or exact pixels as described below. Layer decomposition defaults to `auto` and accepts only `1K` / `1.5K` / `2K` / `auto`, not aspect ratios or exact pixels.

For image generation, `size: "auto"` means `2K`. An aspect-ratio `size` without `resolution` also uses `2K`. Omit `resolution` for exact pixel dimensions, and use positive integers for width and height.

**resolution** `string`

For image generation, use `1K` / `1.5K` / `2K` with an aspect-ratio `size`. For decomposition, this is a platform alias for `size`: `size` takes precedence, `resolution` is used only when `size` is omitted, and omitting both defaults to `auto`. Decomposition accepts `1K` / `1.5K` / `2K` / `auto`; aspect ratios or pixel dimensions are rejected synchronously with HTTP 400. `3K` / `4K` are unsupported.

**background** `string`

Image generation supports `auto` (default), `transparent`, or `opaque`. Both text-to-image and image-to-image can produce transparency. Transparent output requires PNG and cannot use `output_format: "jpeg"`. Omit this field entirely for layer decomposition, including `auto`.

**output\_format** `string` (default: png)

`png` (default) or `jpeg`. For layer decomposition this controls only the base image; extracted layers are always transparent PNGs.

**n** `integer`

Must be `1`. Image generation produces one image per request; use `layer_decomposition_options.max_images` to control decomposition output count.

**watermark** `boolean` (default: false)

Optional flag to add a watermark.

**optimize\_prompt\_options** `object`

Only `{"mode":"standard"}` is supported. Omitting this parameter still enables the upstream default `standard`; prompt optimization cannot be disabled in Seedream 5.5. The upstream rejects `disabled` / `none` / `off` with HTTP 400 and `must be one of: standard`. The platform rejects `fast` immediately with HTTP 400.

**layer\_decomposition** `boolean`

Set to `true` to separate the input into a base image and transparent layers. Requires exactly one input image and no `background` field. `output_format` controls only the base image.

**layer\_decomposition\_options** `object`

Only valid with `layer_decomposition: true`; otherwise returns HTTP 400.

**Request parameters**

**max\_images** `integer` (default: 30)

Integer `2`–`100`, default `30`. The maximum total number of output images, including the base image, not a guaranteed output count.

**text\_recognition** `boolean` (default: false)

Optional boolean. Set to `true` to request rich-text OCR for text layers. `text_recognition` may appear only for recognizable regular text; do not assume every layer contains it.

With OCR enabled, including `prompt` may prevent text-recognition results from being returned. If OCR is your priority, try omitting the decomposition prompt. This does not guarantee OCR results; continue treating them as optional.

## Size formats

| Format | Example | Rules |
| - | - | - |
| Tier | `"size": "2K"` | `1K` / `1.5K` / `2K`; image generation defaults to `2K`, with the model choosing a ratio from the prompt. |
| Aspect ratio + tier | `"size": "16:9", "resolution": "1.5K"` | Image generation only; supported ratios are listed below. The `16x9` notation is also accepted. |
| Exact pixels | `"size": "2048x1152"` | Image generation only; total pixels must be 921,600–4,624,220 and width/height must be 1/16–16. |

Supported ratios: `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`, `2:3`, `21:9`, `2:1`, `1:2`.

Exact-size validation uses pixel area and aspect ratio. Decomposition accepts only tiers or `auto`, not aspect-ratio or exact-pixel notation.

### Decomposition output sizes

* Precedence: `size` → `resolution` → `auto`. `resolution` is a platform alias; the upstream receives only `size`. For example, `size: "1K"` with `resolution: "2K"` uses `1K`; `resolution: "1.5K"` alone uses `1.5K`.

* With `1K` / `1.5K` / `2K`, the base and every layer are output at the selected tier, each preserving its own aspect ratio. One measured `1K` base was `840×1248`, with each layer also around 1.05 million pixels. These are representative results, not fixed dimensions.

* `auto` uses the original input dimensions, upscaling inputs below `1K` to `1K` and downscaling inputs above `2K` to `2K`.

## Request examples

### Image editing and reference fusion

```bash theme={null}
curl --request POST \
  --url https://api.apimart.ai/v1/images/generations \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "seedream-5-5",
  "prompt": "Combine the product in the first image with the setting in the second image",
  "image_urls": ["https://example.com/product.png", "https://example.com/setting.jpg"],
  "size": "16:9",
  "resolution": "1.5K",
  "output_format": "png"
}'
```

### Layer decomposition with text OCR

This request returns at most 10 images, including the base. `prompt` is optional; omit `background` in layer mode. Replace the image URL with an accessible file.

```bash theme={null}
curl --request POST \
  --url https://api.apimart.ai/v1/images/generations \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "seedream-5-5",
  "image_urls": ["https://example.com/poster.png"],
  "layer_decomposition": true,
  "layer_decomposition_options": {
    "max_images": 10,
    "text_recognition": true
  },
  "size": "1K"
}'
```

## Query a task

Use the [task status endpoint](https://docs.apimart.ai/en/api-reference/tasks/status.md). Poll every 3 seconds for the first 30 seconds, then every 5–10 seconds. Decomposition can take several minutes; the server waits up to 13 minutes per operation. Save `task_id` and keep polling for a terminal state without resubmitting the generation request.

```bash theme={null}
curl --request GET \
  --url 'https://api.apimart.ai/v1/tasks/task_example_seedream55' \
  --header 'Authorization: Bearer <token>'
```

Read `data.status` from the unified task endpoint: `pending` / `processing` means work is ongoing, `completed` means success, and `failed` exposes the reason in `data.error.message` with an automatic refund. Read successful image URLs from `data.result.images[].url[]`.

> [!WARNING]
>
> Result images are retained for **3 days**; download them promptly. Task records are also retained for only 3 days, after which they cannot be queried by `task_id`.
>
> `data.result.images[].expires_at` currently returns a Unix timestamp in seconds equal to task completion + 24 hours. This is a conservative timestamp earlier than actual deletion. Do not use it to calculate the actual retention period or a deletion countdown.

## Layer results and OCR

This example illustrates the response structure, not a recorded model run. Dimensions, coordinates, and text are illustrative. Metadata fields may be absent; handle them as optional.

```json theme={null}
{
  "code": 200,
  "data": {
    "id": "task_example_seedream55",
    "status": "completed",
    "progress": 100,
    "completed": 1794302642,
    "result": {
      "images": [
        {
          "url": ["https://example.com/base.png", "https://example.com/title.png"],
          "sizes": ["840x1248", "1512x702"],
          "output_formats": ["png", "png"],
          "backgrounds": ["opaque", "transparent"],
          "expires_at": 1794389042,
          "layer_decomposition": true,
          "layers": [
            {
              "z_index": 0,
              "size": "840x1248",
              "output_format": "png",
              "background": "opaque"
            },
            {
              "z_index": 1,
              "size": "1512x702",
              "output_format": "png",
              "background": "transparent",
              "name": "Sale title",
              "description": "Printed sale title",
              "bounding_box": {
                "absolute": [84, 156, 756, 468],
                "normalized": [100, 125, 900, 375]
              },
              "text_recognition": {
                "text": "SUMMER SALE",
                "lines": [
                  {
                    "bounding_box": {
                      "absolute": [126, 156, 714, 468],
                      "normalized": [150, 125, 850, 375]
                    },
                    "runs": [
                      {
                        "text": "SUMMER SALE",
                        "style": {
                          "similar_font_family": "Arial",
                          "foreground_color": "#222222",
                          "bold": true,
                          "italic": false,
                          "underline": false,
                          "strikethrough": false,
                          "shadow": false,
                          "translucent": false
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  }
}
```

Within each `data.result.images[]` object, `url`, `sizes`, `output_formats`, `backgrounds`, and `layers` correspond by index. Metadata arrays may be omitted when their length does not match `url`; do not assume every array is present.

| Field | Description |
| - | - |
| `url[]` | Platform image URLs. In layer mode, index 0 is the base image, followed by layers. Download and save the files promptly. |
| `sizes[]` / `output_formats[]` | Actual dimensions and format of each image. |
| `backgrounds[]` | Actual background per image: `opaque` / `transparent`. Use the returned value for requests with `background: "auto"`. |
| `expires_at` | Currently a Unix timestamp equal to task completion + 24 hours (86400 seconds). This conservative timestamp does not represent actual image deletion; do not use it for a deletion countdown. |
| `layer_decomposition` | Whether this is a decomposition result. |
| `layers[i].z_index` | Stacking order, with the base at 0. Composite in ascending order. |
| `layers[i].background` | The base is `opaque`; extracted layers are `transparent`. |
| `layers[i].name` / `description` | Optional layer name and description. |
| `layers[i].bounding_box` | `absolute` is `[left, top, right, bottom]` in base-image pixels; `normalized` is the same box mapped to 0–1000. The base image has no box. |
| `layers[i].text_recognition` | May appear only when OCR is enabled and regular text is recognized; absent for artistic lettering, handwriting, and non-text layers. |

With absolute coordinates, use `x=left`, `y=top`, `w=right-left`, `h=bottom-top`. For a `W × H` canvas, use normalized coordinates:

```text theme={null}
x = left / 1000 * W
y = top / 1000 * H
w = (right - left) / 1000 * W
h = (bottom - top) / 1000 * H
```

Layer files are sized independently at the selected tier, so their dimensions may differ from their `bounding_box`. To composite, resize each layer to the box’s `w × h` and place it at `(x, y)`; do not use layer-file pixels directly as base-image coordinates.

### Text recognition fields

`text_recognition` follows the upstream model’s OCR structure. The platform passes through fields such as `text`, `lines`, `runs`, and `style` unchanged.

| Field | Description |
| - | - |
| `text` | Plain text for the entire layer, with lines separated by `\n`. |
| `lines[].bounding_box` | Line bounds in the base image using the same coordinate system. |
| `lines[].runs[]` | Text spans with distinct styles within one line; each has `text` and `style`. |
| `runs[].style.similar_font_family` | Closest recognized font family, or `unknown` when unidentified. |
| `runs[].style.foreground_color` | Text color as `#RRGGBB`. |
| `runs[].style.bold` / `italic` / `underline` / `strikethrough` / `shadow` / `translucent` | Boolean style flags inferred by the model; they may be inaccurate. |

OCR and font information can assist display, copying, or editing, but may not exactly match the source. Layer images remain usable when OCR is absent.

## Billing

Output images and input references are charged separately. **Every reference image is charged, including the first** and the single input used for layer decomposition.

* Each output is billed by its actual pixel area: at most **2,610,000** pixels uses the lower tier; larger outputs use the higher tier. `1K` / `1.5K` map to the lower tier and `2K` to the higher tier. Exact dimensions use width × height.
* Image generation reserves the selected output-tier charge plus reference count × input-image price. Omitting `size` or using `auto` reserves at `2K`.
* Decomposition reserves `max_images` × output reservation-tier price **plus one input-image charge**. `max_images` defaults to 30, includes the base image, and may exceed the actual output count.
* Decomposition uses the effective `size`, or `resolution` when `size` is omitted: `1K` / `1.5K` reserve at the lower tier; `2K` / `auto` at the higher tier. Omitting both defaults to the higher-tier `auto` reservation.
* Settlement uses the actual output count, each output's actual pixel tier, and the input count, refunding or charging the difference. The base and every layer count as separate images; do not apply the requested tier to every output indiscriminately. Failed tasks receive a full refund.

See [Model Pricing](https://apimart.ai/pricing) for rates.

## Common parameter errors

These include platform and upstream validation errors. Read `error.message` for submission failures and `data.error.message` for asynchronous task failures.

| Error fragment | Resolution |
| - | - |
| `does not support optimize_prompt_options.mode=fast` | The platform returns HTTP 400 synchronously. Use only `standard`; omission also leaves optimization enabled. |
| `must be one of: standard` | Upstream HTTP 400: `disabled` / `none` / `off` are unsupported; optimization cannot be disabled. |
| `only supports background auto, transparent or opaque` | Use `auto`, `transparent`, or `opaque`. |
| `cannot combine background=transparent with output_format=jpeg` | Use `output_format: "png"` for transparency. |
| `does not accept background when layer_decomposition=true` | Remove `background` from layer requests, including `auto`. |
| `layer_decomposition_options requires layer_decomposition=true` | Send this object only in layer decomposition mode. |
| `layer_decomposition_options.max_images must be within [2, 100]` | Use an integer from 2 to 100 for `max_images`, including the base. |
| `invalid layer_decomposition_options` | Use correct types: integer `max_images`, not a string or decimal, and boolean `text_recognition`. |
| `with layer_decomposition=true requires exactly 1 input image` | Provide exactly one image for decomposition. |
| `only supports size 1K, 1.5K, 2K or auto` | For decomposition, use `size` first, otherwise `resolution`. Only `1K` / `1.5K` / `2K` / `auto` are allowed; ratios or pixel dimensions return HTTP 400 synchronously. |
| `` `n` must be 1 `` | Set `n` to `1`; batch image generation is unsupported. |
| `does not support stream` / `does not support tools` | Remove `sequential_image_generation`, `stream`, and `tools`. |
| `supports up to 10 reference images` | Provide at most 10 reference images. |
| `reference image too large for seedream-5-5` | Each reference must be at most 30 MiB and 36 million total pixels. Compress or resize it before retrying. |
| `does not support size` / `requires total pixels` / `requires aspect ratio` | Check pixel area, aspect ratio, and size notation. 3K / 4K are unsupported. |
| `` `prompt` parameter is required `` | Image generation requires a prompt. Only layer decomposition allows omission. |

## Task failure reasons

When `data.status` is `failed`, read `data.error.message` and use `data.error.reason` to choose an action. Failed tasks are refunded automatically. If `reason` is absent or unrecognized, fall back to `message`.

| `data.error.reason` | Action |
| - | - |
| `content_policy_violation` | Input or output failed content review. Revise the prompt or images before resubmitting. |
| `invalid_parameter` / `unsupported_option` | Unsupported parameter or combination. Adjust the request before resubmitting. |
| `invalid_media` | Damaged or unsupported input image. Check and convert it. |
| `media_unreachable` | Image URL could not be accessed. Check public access or upload it again. |
| `generation_timeout` | Generation timed out. Retry later. |
| `service_unavailable` | Service temporarily busy. Retry later. |
| `delivery_failed` / `internal_error` / `unknown_error` | Delivery or internal platform error. Follow the returned message and retry later. |


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.