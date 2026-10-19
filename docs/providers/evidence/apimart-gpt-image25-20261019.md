> ## Documentation Index
> Fetch the complete documentation index at: https://docs.apimart.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# GPT-Image-2.5 Image Generation

>  - Choose between gpt-image-2.5-flare and gpt-image-2.5-sunburst
- Asynchronous processing returns a task_id for status queries
- Supports text-to-image and image editing with up to 16 reference images
- Supports local inpainting with transparent PNG masks
- Supports 15 aspect ratios, exact pixel dimensions, and 1K / 2K / 4K resolution tiers
- Supports low / medium / high / xhigh / max quality levels 

<Info>
  **Model selection:** `gpt-image-2.5-flare` is faster and works well for everyday high-quality images, batch generation, and rapid prototyping. `gpt-image-2.5-sunburst` prioritizes editing precision for production assets, advertising creatives, and detailed multi-turn editing. Both models use the same pricing.
</Info>

<RequestExample>
  ```bash cURL theme={null}
  curl --request POST \
    --url https://api.apimart.ai/v1/images/generations \
    --header 'Authorization: Bearer <token>' \
    --header 'Content-Type: application/json' \
    --data '{
      "model": "gpt-image-2.5-flare",
      "prompt": "a cozy reading nook by a rainy window, warm lamp light, cinematic lighting",
      "size": "1:1",
      "resolution": "1k",
      "quality": "medium",
      "n": 1
    }'
  ```

  ```python Python theme={null}
  import requests

  response = requests.post(
      "https://api.apimart.ai/v1/images/generations",
      headers={
          "Authorization": "Bearer <token>",
          "Content-Type": "application/json",
      },
      json={
          "model": "gpt-image-2.5-flare",
          "prompt": "a cozy reading nook by a rainy window, warm lamp light, cinematic lighting",
          "size": "1:1",
          "resolution": "1k",
          "quality": "medium",
          "n": 1,
      },
  )

  print(response.json())
  ```

  ```javascript JavaScript theme={null}
  const response = await fetch(
    "https://api.apimart.ai/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer <token>",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2.5-flare",
        prompt: "a cozy reading nook by a rainy window, warm lamp light, cinematic lighting",
        size: "1:1",
        resolution: "1k",
        quality: "medium",
        n: 1,
      }),
    },
  );

  console.log(await response.json());
  ```
</RequestExample>

<ResponseExample>
  ```json 200 theme={null}
  {
    "code": 200,
    "data": [
      {
        "status": "submitted",
        "task_id": "task_01KXXXXXXXXXXXXXXX"
      }
    ]
  }
  ```

  ```json 400 theme={null}
  {
    "error": {
      "code": 400,
      "message": "Invalid request parameters",
      "type": "invalid_request_error"
    }
  }
  ```

  ```json 401 theme={null}
  {
    "error": {
      "code": 401,
      "message": "Authentication failed. Check your API key.",
      "type": "authentication_error"
    }
  }
  ```

  ```json 402 theme={null}
  {
    "error": {
      "code": 402,
      "message": "Insufficient account balance",
      "type": "payment_required"
    }
  }
  ```

  ```json 429 theme={null}
  {
    "error": {
      "code": 429,
      "message": "Too many requests. Try again later.",
      "type": "rate_limit_error"
    }
  }
  ```
</ResponseExample>

## Authentication

<ParamField header="Authorization" type="string" required>
  All endpoints use Bearer Token authentication. Get your key from the [API Key page](https://apimart.ai/keys).

  ```
  Authorization: Bearer YOUR_API_KEY
  ```
</ParamField>

## Choose a model

| Model | Strength | Recommended use |
| - | - | - |
| `gpt-image-2.5-flare` | Default option with faster generation | Social content, product images, visual search, rapid prototypes, and batch generation |
| `gpt-image-2.5-sunburst` | Prioritizes editing precision | Production product images, advertising creatives, and detailed multi-turn editing |

The two models have identical token usage and pricing for the same parameters. Select one based on the speed-versus-quality tradeoff.

Compared with `gpt-image-2`, GPT-Image-2.5 adds the `xhigh` and `max` quality levels. Its `medium` and `high` levels use roughly one quarter of the output tokens of the previous generation's levels with the same names.

## Request parameters

<ParamField body="model" type="string" required>
  Image model name: `gpt-image-2.5-flare` or `gpt-image-2.5-sunburst`.
</ParamField>

<ParamField body="prompt" type="string" required>
  Text description of the image to generate or edit. Describe the subject, scene, composition, style, lighting, and anything that must be preserved or changed.
</ParamField>

<ParamField body="size" type="string" default="auto">
  Output aspect ratio or exact pixel dimensions.

  * `auto`: let the model choose from the prompt or reference images
  * Aspect ratio: `1:1`, `3:2`, `2:3`, `4:3`, `3:4`, `5:4`, `4:5`, `16:9`, `9:16`, `2:1`, `1:2`, `21:9`, `9:21`, `3:1`, `1:3`
  * Exact dimensions, such as `1600x1200`

  <Tip>
    For image-to-image requests, omit `size` to let the service calculate dimensions from the input aspect ratio and `resolution`.
  </Tip>
</ParamField>

<ParamField body="resolution" type="string" default="1k">
  Resolution tier used with an aspect-ratio `size`: `1k`, `2k`, or `4k`. This field is ignored for exact pixel dimensions.
</ParamField>

<ParamField body="quality" type="string" default="auto">
  Image quality: `low`, `medium`, `high`, `xhigh`, `max`, or `auto`.

  <Warning>
    `xhigh` and `max` are exclusive to GPT-Image-2.5. Sending them to `gpt-image-2` returns HTTP 400; the request is not silently downgraded.
  </Warning>
</ParamField>

<ParamField body="n" type="integer" default="1">
  Number of images to generate. Range: `1` to `4`. Pass a number, not a string.
</ParamField>

<ParamField body="output_format" type="string" default="png">
  Output file format: `png`, `jpeg`, or `webp`.
</ParamField>

<ParamField body="output_compression" type="integer">
  Compression level from `0` to `100`. Only applies to `jpeg` and `webp`.
</ParamField>

<ParamField body="background" type="string">
  Background mode: `transparent`, `opaque`, or `auto`.

  <Warning>
    `background: "transparent"` requires `output_format: "png"` or `output_format: "webp"`. JPEG has no alpha channel.
  </Warning>
</ParamField>

<ParamField body="moderation" type="string" default="low">
  Content moderation level: `auto` or `low`. APIMart explicitly sends `low` when omitted; an explicit `auto` value is passed through.
</ParamField>

<ParamField body="image_urls" type="string[]">
  Reference image URLs for image-to-image generation or editing. Up to `16` images are accepted, and including this field activates editing mode.

  Only publicly accessible HTTP(S) URLs are accepted. Upload local images with `POST /v1/uploads/images`, then use the returned `url`.
</ParamField>

<ParamField body="mask_url" type="string">
  Mask image for local inpainting. It only takes effect when `image_urls` is also provided. Both `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst` support this parameter.

  Pass a single string in either format:

  * An HTTP(S) image URL that the server can download directly
  * A PNG Data URL in the form `data:image/png;base64,...`

  Mask requirements:

  * Use a PNG with an alpha channel; PNG is also recommended for the source image
  * Its pixel dimensions must exactly match `image_urls[0]`. Match the first input image, not the output `size`
  * Fully transparent pixels (`alpha=0`) mark the area to edit; the remaining area is used for preservation
  * Send one mask per request. With multiple reference images, the mask only applies to the first input image
  * The general file-size guide says under `50 MB`, while the `mask` parameter reference says under `4 MB`. Until verified, use the stricter `4 MB` limit

  <Warning>
    A plain black-and-white image without an alpha channel cannot be used directly as a mask. APIMart does not add an alpha channel and currently does not prevalidate that the mask dimensions match the source image; the caller must ensure both.
  </Warning>

  <Note>
    An HTTP(S) URL must work without cookies or additional authorization headers. Signed URLs should remain valid throughout queueing and execution. The default download limit is `20 MB` with a `60`-second timeout; a deployment may override these defaults.

    The mask guides editing, but the model does not guarantee that pixels outside the mask boundary remain completely unchanged.
  </Note>
</ParamField>

## Size rules

Exact pixel dimensions must satisfy all of these constraints:

* Width and height are both multiples of `16`
* Neither side exceeds `3840` pixels
* Long-side to short-side ratio is at most `3:1`
* Total pixel count is between `655,360` and `8,294,400`

<Warning>
  Resolutions above 2560×1440 are experimental and may be less stable than common sizes.
</Warning>

### Aspect ratio and resolution mapping

| `size` | `1k` | `2k` | `4k` |
| - | - | - | - |
| `1:1` | 1024×1024 | 2048×2048 | 2880×2880 |
| `3:2` | 1536×1024 | 2048×1360 | 3520×2336 |
| `2:3` | 1024×1536 | 1360×2048 | 2336×3520 |
| `4:3` | 1024×768 | 2048×1536 | 3312×2480 |
| `3:4` | 768×1024 | 1536×2048 | 2480×3312 |
| `5:4` | 1280×1024 | 2560×2048 | 3216×2576 |
| `4:5` | 1024×1280 | 2048×2560 | 2576×3216 |
| `16:9` | 1536×864 | 2048×1152 | 3840×2160 |
| `9:16` | 864×1536 | 1152×2048 | 2160×3840 |
| `2:1` | 2048×1024 | 2688×1344 | 3840×1920 |
| `1:2` | 1024×2048 | 1344×2688 | 1920×3840 |
| `21:9` | 2016×864 | 2688×1152 | 3840×1648 |
| `9:21` | 864×2016 | 1152×2688 | 1648×3840 |
| `3:1` | 1536×512 | 3072×1024 | 3840×1280 |
| `1:3` | 512×1536 | 1024×3072 | 1280×3840 |

You may also pass any exact dimensions that satisfy the size rules; they do not need to appear in this table.

## Usage examples

### Text to image

```json theme={null}
{
  "model": "gpt-image-2.5-flare",
  "prompt": "a sky garden in a futuristic city, morning mist, architectural photography",
  "size": "16:9",
  "resolution": "2k",
  "quality": "high",
  "n": 1
}
```

### Precision editing with Sunburst

```json theme={null}
{
  "model": "gpt-image-2.5-sunburst",
  "prompt": "preserve the product and package text, replace the background with a soft off-white studio, and add a natural shadow",
  "image_urls": ["https://example.com/product.png"],
  "resolution": "2k",
  "quality": "xhigh"
}
```

### Local inpainting with a mask

This example edits only the fully transparent area of the mask. The mask dimensions must match `product.png`:

```json theme={null}
{
  "model": "gpt-image-2.5-sunburst",
  "prompt": "replace only the area covered by the transparent mask with a gold ribbon, preserving the product and the rest of the background",
  "image_urls": [
    "https://example.com/product.png"
  ],
  "mask_url": "https://example.com/product-mask.png",
  "quality": "xhigh"
}
```

### Transparent background

```json theme={null}
{
  "model": "gpt-image-2.5-flare",
  "prompt": "e-commerce product photo of white sneakers, complete subject, transparent background",
  "size": "1:1",
  "resolution": "2k",
  "quality": "high",
  "background": "transparent",
  "output_format": "png"
}
```

## Submission and task query

Successful submission immediately returns an asynchronous task ID. `data` is an array; read `data[0].task_id`.

Call the [task status endpoint](/en/api-reference/tasks/status) with the returned ID. Poll every 2–5 seconds until the status becomes `completed` or `failed`. Use `POST /v1/tasks/batch` to query multiple tasks.

```json theme={null}
{
  "code": 200,
  "data": {
    "id": "task_01KXXXXXXXXXXXXXXX",
    "status": "completed",
    "progress": 100,
    "cost": 0.01325,
    "credits_cost": 0.1325,
    "result": {
      "images": [
        {
          "url": ["https://upload.apimart.ai/f/image/example.png"],
          "expires_at": 1789000000
        }
      ]
    },
    "usage": {
      "input_tokens": 16,
      "output_tokens": 439,
      "total_tokens": 455
    }
  }
}
```

Image URLs are located at `data.result.images[].url[]`. Download and store them promptly instead of relying on temporary URLs.

| Status | Meaning |
| - | - |
| `submitted` | Task submitted |
| `processing` | Generation in progress |
| `completed` | Generation succeeded; `result.images` is available |
| `failed` | Generation failed; check `error.message`; reserved funds are refunded |

## Billing

GPT-Image-2.5 is billed by actual token usage. Flare and Sunburst use identical rates. Check the [pricing page](https://apimart.ai/pricing) or `/api/pricing` for current account pricing.

| Item | Price per 1M tokens |
| - | - |
| Image output | \$30.00 |
| Image input | \$8.00 |
| Cached image input | \$2.00 |
| Text input | \$5.00 |
| Cached text input | \$1.25 |

### 1024×1024 output token reference

| `quality` | Output tokens | Official output cost |
| - | - | - |
| `low` | 196 | \$0.00588 |
| `medium` | 439 | \$0.01317 |
| `high` | 1756 | \$0.05268 |
| `xhigh` | 3122 | \$0.09366 |
| `max` | 7024 | \$0.21072 |

<Warning>
  With `quality: "auto"`, the model chooses the actual level at runtime. The service reserves funds using the `max` level for the selected size and settles against actual usage when the task finishes. Specify `quality` when available balance matters.
</Warning>

For `n > 1`, the reservation scales linearly with the requested image count. Final billing uses the number of images actually generated, and failed tasks are refunded automatically.

## Output token reference

Values are per generated image. Actual billing also includes prompt and reference-image input tokens.

| Size | Pixels | low | medium | high | xhigh | max |
| - | - | - | - | - | - | - |
| `1:1` | 1024×1024 | 196 | 439 | 1756 | 3122 | 7024 |
| `3:2` | 1536×1024 | 158 | 343 | 1372 | 2459 | 5488 |
| `2:3` | 1024×1536 | 158 | 343 | 1372 | 2459 | 5488 |
| `4:3` | 1024×768 | 134 | 301 | 1204 | 2140 | 4815 |
| `3:4` | 768×1024 | 134 | 301 | 1204 | 2140 | 4815 |
| `5:4` | 1280×1024 | 173 | 378 | 1510 | 2702 | 6119 |
| `4:5` | 1024×1280 | 173 | 378 | 1510 | 2702 | 6119 |
| `16:9` | 1536×864 | 120 | 280 | 1078 | 1917 | 4312 |
| `9:16` | 864×1536 | 120 | 280 | 1078 | 1917 | 4312 |
| `2:1` | 2048×1024 | 132 | 295 | 1180 | 2098 | 4720 |
| `1:2` | 1024×2048 | 132 | 295 | 1180 | 2098 | 4720 |
| `21:9` | 2016×864 | 105 | 225 | 943 | 1617 | 3682 |
| `9:21` | 864×2016 | 105 | 225 | 943 | 1617 | 3682 |
| `3:1` | 1536×512 | 56 | 134 | 535 | 937 | 2140 |
| `1:3` | 512×1536 | 56 | 134 | 535 | 937 | 2140 |
| `1:1@2k` | 2048×2048 | 397 | 892 | 3568 | 6343 | 14272 |
| `3:2@2k` | 2048×1360 | 211 | 460 | 1838 | 3216 | 7351 |
| `2:3@2k` | 1360×2048 | 211 | 460 | 1838 | 3216 | 7351 |
| `4:3@2k` | 2048×1536 | 247 | 556 | 2223 | 3952 | 8892 |
| `3:4@2k` | 1536×2048 | 247 | 556 | 2223 | 3952 | 8892 |
| `5:4@2k` | 2560×2048 | 377 | 826 | 3303 | 5911 | 13385 |
| `4:5@2k` | 2048×2560 | 377 | 826 | 3303 | 5911 | 13385 |
| `16:9@2k` | 2048×1152 | 157 | 367 | 1413 | 2511 | 5650 |
| `9:16@2k` | 1152×2048 | 157 | 367 | 1413 | 2511 | 5650 |
| `2:1@2k` | 2688×1344 | 180 | 405 | 1617 | 2874 | 6466 |
| `1:2@2k` | 1344×2688 | 180 | 405 | 1617 | 2874 | 6466 |
| `21:9@2k` | 2688×1152 | 143 | 306 | 1285 | 2202 | 5016 |
| `9:21@2k` | 1152×2688 | 143 | 306 | 1285 | 2202 | 5016 |
| `3:1@2k` | 3072×1024 | 103 | 247 | 988 | 1729 | 3952 |
| `1:3@2k` | 1024×3072 | 103 | 247 | 988 | 1729 | 3952 |
| `1:1@4k` | 2880×2880 | 659 | 1483 | 5930 | 10542 | 23719 |
| `3:2@4k` | 3520×2336 | 450 | 982 | 3926 | 6870 | 15703 |
| `2:3@4k` | 2336×3520 | 450 | 982 | 3926 | 6870 | 15703 |
| `4:3@4k` | 3312×2480 | 491 | 1104 | 4413 | 7845 | 17650 |
| `3:4@4k` | 2480×3312 | 491 | 1104 | 4413 | 7845 | 17650 |
| `5:4@4k` | 3216×2576 | 535 | 1173 | 4690 | 8393 | 19006 |
| `4:5@4k` | 2576×3216 | 535 | 1173 | 4690 | 8393 | 19006 |
| `16:9@4k` | 3840×2160 | 371 | 865 | 3336 | 5930 | 13342 |
| `9:16@4k` | 2160×3840 | 371 | 865 | 3336 | 5930 | 13342 |
| `2:1@4k` | 3840×1920 | 300 | 675 | 2700 | 4799 | 10798 |
| `1:2@4k` | 1920×3840 | 300 | 675 | 2700 | 4799 | 10798 |
| `21:9@4k` | 3840×1648 | 234 | 500 | 2099 | 3598 | 8196 |
| `9:21@4k` | 1648×3840 | 234 | 500 | 2099 | 3598 | 8196 |
| `3:1@4k` | 3840×1280 | 139 | 332 | 1328 | 2324 | 5311 |
| `1:3@4k` | 1280×3840 | 139 | 332 | 1328 | 2324 | 5311 |

## Limits and common errors

| Item | Limit or handling |
| - | - |
| Images per request (`n`) | 1–4 |
| Reference images | Up to 16 |
| Output format | PNG / JPEG / WebP |
| Transparent background | PNG / WebP only |
| Partial streaming images | Not supported |
| Unsupported `quality` | `xhigh` / `max` require GPT-Image-2.5 |
| Invalid exact dimensions | Use multiples of 16 within the pixel and aspect-ratio limits |

## Response

<ResponseField name="code" type="integer">
  Response status code; 200 when submission succeeds.
</ResponseField>

<ResponseField name="data" type="array">
  Submission response data.

  <Expandable title="Array item">
    <ResponseField name="status" type="string">
      Initially `submitted`.
    </ResponseField>

    <ResponseField name="task_id" type="string">
      Unique task ID used to query generation status and results.
    </ResponseField>
  </Expandable>
</ResponseField>


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.