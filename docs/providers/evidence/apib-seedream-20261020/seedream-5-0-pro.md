> ## Documentation Index
> Fetch the complete documentation index at: https://docs.apimart.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Seedream-5.0-Pro Image Generation

>  - Asynchronous processing mode, returns a task ID for subsequent queries
- Supports text-to-image, single-image-to-image, and multi-reference image-to-image (up to 10 reference images)
- Supports 1K / 1.5K / 2K resolution tiers, or exact pixels via `size`
- Single-image model: one image per request; PNG / JPEG output
- Generated image links are valid for 72 hours; please save them promptly 

<RequestExample>
  ```bash cURL theme={null}
  curl --request POST \
    --url https://api.apimart.ai/v1/images/generations \
    --header 'Authorization: Bearer <token>' \
    --header 'Content-Type: application/json' \
    --data '{
      "model": "seedream-5-0-pro",
      "prompt": "A cyberpunk city night scene, neon lights reflecting on wet streets",
      "size": "16:9",
      "resolution": "2K"
    }'
  ```

  ```python Python theme={null}
  import requests

  url = "https://api.apimart.ai/v1/images/generations"

  payload = {
      "model": "seedream-5-0-pro",
      "prompt": "A cyberpunk city night scene, neon lights reflecting on wet streets",
      "size": "16:9",
      "resolution": "2K"
  }

  headers = {
      "Authorization": "Bearer <token>",
      "Content-Type": "application/json"
  }

  response = requests.post(url, json=payload, headers=headers)

  print(response.json())
  ```

  ```javascript JavaScript theme={null}
  const url = "https://api.apimart.ai/v1/images/generations";

  const payload = {
    model: "seedream-5-0-pro",
    prompt: "A cyberpunk city night scene, neon lights reflecting on wet streets",
    size: "16:9",
    resolution: "2K"
  };

  const headers = {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json"
  };

  fetch(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload)
  })
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error('Error:', error));
  ```

  ```go Go theme={null}
  package main

  import (
      "bytes"
      "encoding/json"
      "fmt"
      "io/ioutil"
      "net/http"
  )

  func main() {
      url := "https://api.apimart.ai/v1/images/generations"

      payload := map[string]interface{}{
          "model":      "seedream-5-0-pro",
          "prompt":     "A cyberpunk city night scene, neon lights reflecting on wet streets",
          "size":       "16:9",
          "resolution": "2K",
      }

      jsonData, _ := json.Marshal(payload)

      req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
      req.Header.Set("Authorization", "Bearer <token>")
      req.Header.Set("Content-Type", "application/json")

      client := &http.Client{}
      resp, err := client.Do(req)
      if err != nil {
          panic(err)
      }
      defer resp.Body.Close()

      body, _ := ioutil.ReadAll(resp.Body)
      fmt.Println(string(body))
  }
  ```

  ```java Java theme={null}
  import java.net.http.HttpClient;
  import java.net.http.HttpRequest;
  import java.net.http.HttpResponse;
  import java.net.URI;

  public class Main {
      public static void main(String[] args) throws Exception {
          String url = "https://api.apimart.ai/v1/images/generations";

          String payload = """
          {
            "model": "seedream-5-0-pro",
            "prompt": "A cyberpunk city night scene, neon lights reflecting on wet streets",
            "size": "16:9",
            "resolution": "2K"
          }
          """;

          HttpClient client = HttpClient.newHttpClient();
          HttpRequest request = HttpRequest.newBuilder()
              .uri(URI.create(url))
              .header("Authorization", "Bearer <token>")
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(payload))
              .build();

          HttpResponse<String> response = client.send(request,
              HttpResponse.BodyHandlers.ofString());

          System.out.println(response.body());
      }
  }
  ```

  ```php PHP theme={null}
  <?php

  $url = "https://api.apimart.ai/v1/images/generations";

  $payload = [
      "model" => "seedream-5-0-pro",
      "prompt" => "A cyberpunk city night scene, neon lights reflecting on wet streets",
      "size" => "16:9",
      "resolution" => "2K"
  ];

  $ch = curl_init($url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
  curl_setopt($ch, CURLOPT_HTTPHEADER, [
      "Authorization: Bearer <token>",
      "Content-Type: application/json"
  ]);

  $response = curl_exec($ch);
  curl_close($ch);

  echo $response;
  ?>
  ```

  ```ruby Ruby theme={null}
  require 'net/http'
  require 'json'
  require 'uri'

  url = URI("https://api.apimart.ai/v1/images/generations")

  payload = {
    model: "seedream-5-0-pro",
    prompt: "A cyberpunk city night scene, neon lights reflecting on wet streets",
    size: "16:9",
    resolution: "2K"
  }

  http = Net::HTTP.new(url.host, url.port)
  http.use_ssl = true

  request = Net::HTTP::Post.new(url)
  request["Authorization"] = "Bearer <token>"
  request["Content-Type"] = "application/json"
  request.body = payload.to_json

  response = http.request(request)
  puts response.body
  ```

  ```swift Swift theme={null}
  import Foundation

  let url = URL(string: "https://api.apimart.ai/v1/images/generations")!

  let payload: [String: Any] = [
      "model": "seedream-5-0-pro",
      "prompt": "A cyberpunk city night scene, neon lights reflecting on wet streets",
      "size": "16:9",
      "resolution": "2K"
  ]

  var request = URLRequest(url: url)
  request.httpMethod = "POST"
  request.setValue("Bearer <token>", forHTTPHeaderField: "Authorization")
  request.setValue("application/json", forHTTPHeaderField: "Content-Type")
  request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

  let task = URLSession.shared.dataTask(with: request) { data, response, error in
      if let error = error {
          print("Error: \(error)")
          return
      }

      if let data = data, let responseString = String(data: data, encoding: .utf8) {
          print(responseString)
      }
  }

  task.resume()
  ```

  ```csharp C# theme={null}
  using System;
  using System.Net.Http;
  using System.Text;
  using System.Threading.Tasks;

  class Program
  {
      static async Task Main(string[] args)
      {
          var url = "https://api.apimart.ai/v1/images/generations";

          var payload = @"{
              ""model"": ""seedream-5-0-pro"",
              ""prompt"": ""A cyberpunk city night scene, neon lights reflecting on wet streets"",
              ""size"": ""16:9"",
              ""resolution"": ""2K""
          }";

          using var client = new HttpClient();
          client.DefaultRequestHeaders.Add("Authorization", "Bearer <token>");

          var content = new StringContent(payload, Encoding.UTF8, "application/json");
          var response = await client.PostAsync(url, content);
          var result = await response.Content.ReadAsStringAsync();

          Console.WriteLine(result);
      }
  }
  ```

  ```c C theme={null}
  #include <stdio.h>
  #include <curl/curl.h>

  int main(void) {
      CURL *curl;
      CURLcode res;

      curl_global_init(CURL_GLOBAL_DEFAULT);
      curl = curl_easy_init();

      if(curl) {
          const char *url = "https://api.apimart.ai/v1/images/generations";
          const char *payload = "{"
              "\"model\":\"seedream-5-0-pro\","
              "\"prompt\":\"A cyberpunk city night scene, neon lights reflecting on wet streets\","
              "\"size\":\"16:9\","
              "\"resolution\":\"2K\""
          "}";

          struct curl_slist *headers = NULL;
          headers = curl_slist_append(headers, "Authorization: Bearer <token>");
          headers = curl_slist_append(headers, "Content-Type: application/json");

          curl_easy_setopt(curl, CURLOPT_URL, url);
          curl_easy_setopt(curl, CURLOPT_POSTFIELDS, payload);
          curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

          res = curl_easy_perform(curl);

          if(res != CURLE_OK) {
              fprintf(stderr, "curl_easy_perform() failed: %s\n",
                      curl_easy_strerror(res));
          }

          curl_slist_free_all(headers);
          curl_easy_cleanup(curl);
      }

      curl_global_cleanup();
      return 0;
  }
  ```

  ```objectivec Objective-C theme={null}
  #import <Foundation/Foundation.h>

  int main(int argc, const char * argv[]) {
      @autoreleasepool {
          NSURL *url = [NSURL URLWithString:@"https://api.apimart.ai/v1/images/generations"];

          NSDictionary *payload = @{
              @"model": @"seedream-5-0-pro",
              @"prompt": @"A cyberpunk city night scene, neon lights reflecting on wet streets",
              @"size": @"16:9",
              @"resolution": @"2K"
          };

          NSError *error;
          NSData *jsonData = [NSJSONSerialization dataWithJSONObject:payload
                                                            options:0
                                                              error:&error];

          NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
          [request setHTTPMethod:@"POST"];
          [request setValue:@"Bearer <token>" forHTTPHeaderField:@"Authorization"];
          [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
          [request setHTTPBody:jsonData];

          NSURLSessionDataTask *task = [[NSURLSession sharedSession]
              dataTaskWithRequest:request
              completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
                  if (error) {
                      NSLog(@"Error: %@", error);
                      return;
                  }
                  NSString *result = [[NSString alloc] initWithData:data
                                                          encoding:NSUTF8StringEncoding];
                  NSLog(@"%@", result);
              }];

          [task resume];
          [[NSRunLoop mainRunLoop] run];
      }
      return 0;
  }
  ```

  ```ocaml OCaml theme={null}
  (* Requires cohttp and yojson libraries *)
  open Lwt
  open Cohttp
  open Cohttp_lwt_unix

  let url = "https://api.apimart.ai/v1/images/generations"

  let payload = {|{
    "model": "seedream-5-0-pro",
    "prompt": "A cyberpunk city night scene, neon lights reflecting on wet streets",
    "size": "16:9",
    "resolution": "2K"
  }|}

  let () =
    let headers = Header.init ()
      |> fun h -> Header.add h "Authorization" "Bearer <token>"
      |> fun h -> Header.add h "Content-Type" "application/json"
    in
    let body = Cohttp_lwt.Body.of_string payload in

    let response = Client.post ~headers ~body (Uri.of_string url) >>= fun (resp, body) ->
      body |> Cohttp_lwt.Body.to_string >|= fun body_str ->
      print_endline body_str
    in
    Lwt_main.run response
  ```

  ```dart Dart theme={null}
  import 'dart:convert';
  import 'package:http/http.dart' as http;

  void main() async {
    final url = Uri.parse('https://api.apimart.ai/v1/images/generations');

    final payload = {
      'model': 'seedream-5-0-pro',
      'prompt': 'A cyberpunk city night scene, neon lights reflecting on wet streets',
      'size': '16:9',
      'resolution': '2K'
    };

    final response = await http.post(
      url,
      headers: {
        'Authorization': 'Bearer <token>',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(payload),
    );

    print(response.body);
  }
  ```

  ```r R theme={null}
  library(httr)
  library(jsonlite)

  url <- "https://api.apimart.ai/v1/images/generations"

  payload <- list(
    model = "seedream-5-0-pro",
    prompt = "A cyberpunk city night scene, neon lights reflecting on wet streets",
    size = "16:9",
    resolution = "2K"
  )

  response <- POST(
    url,
    add_headers(
      Authorization = "Bearer <token>",
      `Content-Type` = "application/json"
    ),
    body = toJSON(payload, auto_unbox = TRUE),
    encode = "raw"
  )

  cat(content(response, "text"))
  ```
</RequestExample>

<ResponseExample>
  ```json 200 theme={null}
  {
    "code": 200,
    "data": [
      {
        "status": "submitted",
        "task_id": "task_01K8SGYNNNVBQTXNR4MM964S7K"
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
      "message": "Invalid authentication credentials",
      "type": "authentication_error"
    }
  }
  ```

  ```json 402 theme={null}
  {
    "error": {
      "code": 402,
      "message": "Insufficient balance. Please top up your account",
      "type": "payment_required"
    }
  }
  ```

  ```json 403 theme={null}
  {
    "error": {
      "code": 403,
      "message": "Access forbidden. You don't have permission to access this resource",
      "type": "permission_error"
    }
  }
  ```

  ```json 429 theme={null}
  {
    "error": {
      "code": 429,
      "message": "Rate limit exceeded. Please try again later",
      "type": "rate_limit_error"
    }
  }
  ```

  ```json 500 theme={null}
  {
    "error": {
      "code": 500,
      "message": "Internal server error. Please try again later",
      "type": "server_error"
    }
  }
  ```

  ```json 502 theme={null}
  {
    "error": {
      "code": 502,
      "message": "Bad gateway. The server is temporarily unavailable",
      "type": "bad_gateway"
    }
  }
  ```
</ResponseExample>

## Authorizations

<ParamField header="Authorization" type="string" required>
  All API endpoints require Bearer Token authentication

  Get your API Key:

  Visit the [API Key Management Page](https://apimart.ai/keys) to get your API Key

  Add it to the request header:

  ```
  Authorization: Bearer YOUR_API_KEY
  ```
</ParamField>

<Info>
  **Single-image model**: `seedream-5-0-pro` generates only 1 image per request (except layer decomposition). The following are **rejected** (HTTP 400, no task, no charge):

  * `n > 1`
  * `sequential_image_generation` (group generation is not supported)
  * `stream` (streaming is not supported)
  * `tools` (web search is not supported)
  * more than 10 items in `image_urls`
</Info>

<CardGroup cols={2}>
  <Card title="Interactive editing" icon="crosshairs">
    Use `<point>` / `<bbox>` coordinates in the prompt, or upload an image with hand-drawn annotations, to target edits precisely.

    * Point coordinates: `<point>x y</point>` (specify a single point; the model determines the affected area)
    * Bounding-box coordinates: `<bbox>x1 y1 x2 y2</bbox>` (specify the top-left and bottom-right coordinates to precisely control the size of the edit area)
  </Card>

  <Card title="Layer decomposition" icon="layer-group">
    Split one image into a base image and up to 16 transparent PNG layers, with position and stacking information.
  </Card>
</CardGroup>

## Body

<ParamField body="model" type="string" default="seedream-5-0-pro" required>
  Image generation model name

  * `seedream-5-0-pro` (recommended)
  * Also accepted: `seedream-5.0-pro`
</ParamField>

<ParamField body="nsfw_check" type="boolean" default="false">
  Whether to run content moderation before submitting the image task.

  * `true`: use `omni-moderation-latest` to review prompts and input images
  * `false` or omitted: do not send a moderation request, adding no moderation cost or latency (default)
</ParamField>

<ParamField body="prompt" type="string" required>
  Text description for image generation

  Optional when `layer_decomposition: true`; if omitted, the model automatically identifies and separates the main elements in the image.

  In addition to Chinese and English, native text generation supports Russian, Arabic, Filipino, Thai, Turkish, Korean, Malay, Spanish, Portuguese, Indonesian, French, German, Vietnamese, and Japanese.

  > **Tip:** Keep it within 600 English words; overly long descriptions may lose detail.
</ParamField>

<ParamField body="resolution" type="string" default="1K">
  Resolution tier (lowercase accepted). This is an API Mart extension equivalent to placing the tier directly in `size`.

  * `1K` (default)
  * `1.5K` (same price as 1K, better quality — prefer 1.5K unless you have a reason not to)
  * `2K`

  Unsupported tiers such as 3K / 4K return 400.

  If both a tier-style `size` and `resolution` are provided, `size` takes precedence.

  <Warning>
    When `size` is an **exact pixel value** (e.g. `2048x1024`), this field is **ignored** and dimensions come only from `size`.
  </Warning>
</ParamField>

<ParamField body="size" type="string" default="auto">
  A tier keyword, aspect ratio, `auto`, or **exact pixel dimensions**.

  ### Style ①: resolution tier (recommended)

  The tier can be placed directly in `size`, or supplied through the API Mart extension field `resolution`:

  ```json theme={null}
  { "size": "2K" }
  ```

  ```json theme={null}
  { "resolution": "2K" }
  ```

  These forms are equivalent. When only a tier is specified, describe the intended layout in the prompt (for example, "portrait poster" or "landscape cover") and let the model choose the aspect ratio.

  ### Style ②: tier + aspect ratio

  Used with `resolution`. Supported ratios:

  * `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`, `2:3`, `2:1`, `1:2`, `21:9`
  * Also accepts `16x9`-style `x` separators
  * `2x1` is equivalent to `2:1`, and `1x2` is equivalent to `1:2`. The `x` must be lowercase and spaces are not allowed.
  * `auto` (default): only the resolution tier is applied; final aspect ratio is chosen from the prompt / references

  Ratios outside the list (e.g. `9:21`) return 400 — **no silent fallback to 1:1**.

  **Tier × ratio → output pixels:**

  | Resolution | 1:1 | 4:3 | 3:4 | 16:9 | 9:16 | 3:2 | 2:3 | 2:1 | 1:2 | 21:9 |
  | - | - | - | - | - | - | - | - | - | - | - |
  | **1K** | 1024×1024 | 1152×864 | 864×1152 | 1312×736 | 736×1312 | 1248×832 | 832×1248 | 1440×720 | 720×1440 | 1568×672 |
  | **1.5K** | 1536×1536 | 1792×1344 | 1344×1792 | 2048×1152 | 1152×2048 | 1872×1248 | 1248×1872 | 2176×1088 | 1088×2176 | 2352×1008 |
  | **2K** | 2048×2048 | 2304×1728 | 1728×2304 | 2560×1440 | 1440×2560 | 2496×1664 | 1664×2496 | 2880×1440 | 1440×2880 | 3024×1296 |

  ```json theme={null}
  { "resolution": "2K", "size": "2:1" }
  ```

  ### Style ③: exact pixels

  When `size` is `widthxheight`, pixels are used as-is and `resolution` does not apply. Accepts `2048X1024` / `2048×1024`.

  | Constraint | Range |
  | - | - |
  | Total pixels (width × height) | `[921600, 4624220]` (about `1280×720` \~ `2048×2048×1.1025`) |
  | Aspect ratio (width / height) | `[1/16, 16]` |

  <Warning>
    Limits apply to the **product** of width and height, not each edge alone. Example: `512×512` is too small (400); `2048×1024` is valid.
  </Warning>
</ParamField>

<ParamField body="background" type="string" default="opaque">
  Output background mode:

  * `opaque`: solid background (default)
  * `transparent`: transparent background

  `transparent` is available only for image-to-image requests with exactly one input image that already has an alpha channel; `output_format: "png"` is also required.
</ParamField>

<ParamField body="layer_decomposition" type="boolean" default="false">
  Whether to decompose the image into layers. When enabled, the model returns one base image and up to 16 PNG layers with alpha channels.

  Exactly one PNG or JPEG image is required. It must contain `[262144, 36000000]` total pixels and be no larger than 30 MB. `size` accepts only `1K`, `1.5K`, `2K`, or `auto` and defaults to `auto`. `output_format` controls only the base image format; decomposed layers are always PNG.
</ParamField>

<ParamField body="optimize_prompt_options" type="object" default={'{"mode":"standard"}'}>
  Prompt optimization mode:

  * `standard`: standard mode with better quality (default)

  The flattened form `"optimize_prompt_options.mode": "standard"` is also accepted.
</ParamField>

<ParamField body="n" type="integer" default="1">
  Number of images to generate. Only `1` is supported; use `seedream-5-0-lite` for grouped image generation.
</ParamField>

<ParamField body="image_urls" type="array">
  Reference image URL list for single / multi-reference image-to-image, **up to 10**

  Two formats:

  **1. Public URL**

  * `http://` or `https://`
  * Example: `https://example.com/image.jpg`

  **2. Base64 (Data URI)**

  * Format: `data:image/<format>;base64,<data>` — `<format>` must be **lowercase**
  * Example: `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABg...`

  **Per-image limits:**

  * Formats: jpeg / png / webp / bmp / tiff / gif / heic / heif
  * Aspect ratio (w/h): `[1/16, 16]`
  * Each edge > 14 px
  * Size ≤ 30 MB
  * Total pixels ≤ `6000×6000` (36,000,000)

  > **Billing:** First reference image free; each additional image has a fixed surcharge.
</ParamField>

<ParamField body="output_format" type="string" default="jpeg">
  Output image format

  * `jpeg` (default)
  * `png`

  > **Compatibility:** `response_format` is equivalent to `output_format`; other values are treated as `jpeg`.
</ParamField>

<ParamField body="watermark" type="boolean" default="false">
  Whether to add an "AI generated" watermark at the bottom-right

  * `true`: add watermark
  * `false`: no watermark (default)
</ParamField>

## Request Examples

### Text-to-image (tier + ratio)

```json theme={null}
{
  "model": "seedream-5-0-pro",
  "prompt": "Cyberpunk city night scene, neon reflections on wet streets",
  "resolution": "2K",
  "size": "2:1",
  "output_format": "png"
}
```

### Text-to-image (exact pixels)

```json theme={null}
{
  "model": "seedream-5-0-pro",
  "prompt": "Minimal e-commerce hero image, white background, product centered",
  "size": "1600x1600"
}
```

### Multi-reference

```json theme={null}
{
  "model": "seedream-5-0-pro",
  "prompt": "Replace the outfit in image 1 with the outfit in image 2",
  "image_urls": [
    "https://example.com/person.jpg",
    "https://example.com/dress.jpg"
  ],
  "resolution": "2K",
  "size": "auto"
}
```

### Recommended: 1.5K same price, better quality

```json theme={null}
{
  "model": "seedream-5-0-pro",
  "prompt": "A cute orange cat on a windowsill in afternoon sun, cinematic",
  "resolution": "1.5K",
  "size": "16:9"
}
```

### Layer decomposition

```json theme={null}
{
  "model": "seedream-5-0-pro",
  "image_urls": ["https://example.com/poster.png"],
  "layer_decomposition": true,
  "size": "2K"
}
```

You can also use `<bbox>` coordinates normalized to `0–1000` to identify elements to extract precisely:

```json theme={null}
{
  "model": "seedream-5-0-pro",
  "prompt": "Separate the image into precise layers. The text is at <bbox>180 64 812 198</bbox>; the parrot is at <bbox>347 305 642 997</bbox>.",
  "image_urls": ["https://example.com/poster.png"],
  "layer_decomposition": true
}
```

### Interactive editing

Describe hand-drawn annotations in the image using natural language:

```json theme={null}
{
  "model": "seedream-5-0-pro",
  "prompt": "Edit the image according to the sketch. Add a stack of magazines in the marked area at the lower left and a cup of coffee in the marked area on the right. Remove all sketch lines and preserve the composition.",
  "image_urls": ["https://example.com/sketch.png"],
  "size": "2K",
  "output_format": "png"
}
```

Or target locations precisely with `<point>` / `<bbox>`:

```json theme={null}
{
  "model": "seedream-5-0-pro",
  "prompt": "Place the subject from image 1 at <bbox>179 283 796 986</bbox> into image 2 at <bbox>118 331 933 871</bbox>.",
  "image_urls": [
    "https://example.com/a.png",
    "https://example.com/b.png"
  ]
}
```

### Alpha-channel editing

```json theme={null}
{
  "model": "seedream-5-0-pro",
  "prompt": "Change the parrot into a peacock while preserving the transparent background",
  "image_urls": ["https://cdn.example.com/images/layer.png"],
  "background": "transparent",
  "output_format": "png",
  "size": "2K"
}
```

## Complete example: submit a task and retrieve the image

The following script shows the full flow: submit an asynchronous task, poll its status, handle failure states, and read the final image URL. Replace `YOUR_API_KEY` before running it.

```python Python theme={null}
import time
import requests

API_KEY = "YOUR_API_KEY"
BASE_URL = "https://api.apimart.ai"
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# 1. Submit the generation task
create_response = requests.post(
    f"{BASE_URL}/v1/images/generations",
    headers=headers,
    json={
        "model": "seedream-5-0-pro",
        "prompt": "A Jiangnan water town in ink-wash style, with light morning mist",
        "resolution": "1.5K",
        "size": "16:9",
        "output_format": "png",
    },
    timeout=30,
)
create_response.raise_for_status()
task_id = create_response.json()["data"][0]["task_id"]
print(f"Task submitted: {task_id}")

# 2. Poll task status
while True:
    task_response = requests.get(
        f"{BASE_URL}/v1/tasks/{task_id}",
        headers=headers,
        timeout=30,
    )
    task_response.raise_for_status()
    task = task_response.json()
    status = task["status"]
    print(f"Status: {status}; progress: {task.get('progress', 0)}%")

    if status == "success":
        image = task["result"]["images"][0]
        print("Image URL:", image["url"][0])
        print("Image size:", image["sizes"][0])
        print("Image format:", image["output_formats"][0])
        break

    if status in {"failed", "cancelled"}:
        raise RuntimeError(task.get("error", f"Task {status}"))

    time.sleep(5)
```

On success, the task query endpoint returns:

```json theme={null}
{
  "id": "task_01JFXYZ123456789ABCDEF",
  "status": "success",
  "progress": 100,
  "cost": 0.045,
  "result": {
    "images": [
      {
        "url": ["https://cdn.example.com/images/image_task_xxx_0.png"],
        "sizes": ["2048x1152"],
        "output_formats": ["png"],
        "expires_at": 1784696685
      }
    ]
  }
}
```

<Note>
  Returned images are mirrored to storage managed by the platform. You should still download and persist them in your own system promptly; do not treat the result URL as permanent storage.
</Note>

## Complete cURL scenarios

### Multi-image composition (up to 10 references)

```bash theme={null}
curl -X POST "https://api.apimart.ai/v1/images/generations" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-5-0-pro",
    "prompt": "Place the person from image 1 into the scene from image 2 and unify the lighting at dusk",
    "image_urls": [
      "https://example.com/person.jpg",
      "https://example.com/scene.jpg"
    ],
    "resolution": "1.5K",
    "size": "16:9",
    "output_format": "png"
  }'
```

### Exact pixels, prompt optimization, and watermark

```bash theme={null}
curl -X POST "https://api.apimart.ai/v1/images/generations" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-5-0-pro",
    "prompt": "A cyberpunk city skyline with neon lights reflected on wet streets",
    "size": "2048x1024",
    "optimize_prompt_options": { "mode": "standard" },
    "watermark": true
  }'
```

### Decompose and edit a transparent layer independently

First, decompose the source image:

```bash theme={null}
curl -X POST "https://api.apimart.ai/v1/images/generations" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-5-0-pro",
    "image_urls": ["https://example.com/poster.png"],
    "layer_decomposition": true,
    "size": "2K"
  }'
```

Then retrieve the URL of a transparent layer and edit it independently:

```bash theme={null}
curl -X POST "https://api.apimart.ai/v1/images/generations" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-5-0-pro",
    "prompt": "Change the parrot in the image into a peacock",
    "image_urls": ["https://cdn.example.com/images/image_task_xxx_4.png"],
    "background": "transparent",
    "output_format": "png",
    "size": "2K"
  }'
```

## Layer-decomposition response and reconstruction

The `url`, `sizes`, `output_formats`, and `layers` arrays correspond by index; index `0` is always the base image:

```json theme={null}
{
  "result": {
    "images": [{
      "url": [
        "https://cdn.example.com/images/image_task_xxx_0.jpeg",
        "https://cdn.example.com/images/image_task_xxx_1.png",
        "https://cdn.example.com/images/image_task_xxx_2.png"
      ],
      "sizes": ["2048x2048", "1273x265", "492x98"],
      "output_formats": ["jpeg", "png", "png"],
      "layer_decomposition": true,
      "layers": [
        { "z_index": 0, "size": "2048x2048", "output_format": "jpeg" },
        {
          "z_index": 1,
          "size": "1273x265",
          "output_format": "png",
          "name": "Title text",
          "description": "Large yellow title text in a serif typeface",
          "bounding_box": {
            "absolute": [383, 120, 1655, 384],
            "normalized": [187, 59, 808, 188]
          }
        },
        {
          "z_index": 2,
          "size": "492x98",
          "output_format": "png",
          "name": "Upper-left tagline",
          "description": "Two-line English tagline in white",
          "bounding_box": {
            "absolute": [140, 451, 631, 548],
            "normalized": [68, 220, 308, 268]
          }
        }
      ]
    }]
  }
}
```

Composite layers in ascending `z_index` order. To reconstruct them on the output base image with absolute coordinates:

```text theme={null}
x = left
y = top
w = right - left
h = bottom - top
```

To reconstruct them on any `W × H` canvas, use normalized coordinates:

```text theme={null}
x = left / 1000 × W
y = top / 1000 × H
w = (right - left) / 1000 × W
h = (bottom - top) / 1000 × H
```

<Warning>
  Layer decomposition is billed per image. Up to 17 images are preauthorized when the task is submitted. After completion, each output is assigned a tier based on its actual pixel count and settled individually; any excess preauthorization is refunded automatically. Your balance must cover the 17-image preauthorization, and `size: "auto"` is preauthorized at the 2K tier.
</Warning>

## Billing Notes

```
Total = output unit price + reference surcharge × max(0, ref_count − 1)
```

Output is priced by **actual total pixels** (\~2.61M = 2,601,124):

| Condition | Unit price |
| - | - |
| ≤ 2.61 million pixels (1.5K or lower: `resolution` `1K` / `1.5K` / omit, or exact pixels ≤ 2,601,124) | **\$0.045** / image |
| > 2.61 million pixels (higher than 1.5K: `resolution: "2K"`, or exact pixels > 2,601,124) | **\$0.09** / image |

* **1.5K costs the same as 1K** (\$0.045).
* With exact-pixel `size`, billing uses **actual output area**; `resolution` is ignored (e.g. `size: "2048x2048"` → \$0.09).
* First reference image is free; each additional reference has a surcharge.
* Failed tasks are fully refunded.

### Layer-decomposition preauthorization and settlement

Because the final number and dimensions of layers are unknown when a task is submitted, preauthorization uses conservative rules based on the request:

* Exact pixels: tiered by the requested pixel area.
* `1K` / `1.5K`: preauthorized at the 1K tier.
* `2K`: preauthorized at the 2K tier.
* `auto`: can output up to 2K, so it is preauthorized at the 2K tier.

After completion, the base image and every actual layer are **tiered and summed individually** using their real pixel areas. Excess preauthorization is refunded automatically. Layers are usually much smaller than the base image, so even a task preauthorized at the 2K tier may ultimately settle entirely at the 1K tier.

<Info>
  Example: a `1080×1080` input is decomposed into 10 images. The task is preauthorized as `17 images × 2K tier`. If all 10 final images contain no more than 2.61 million pixels, settlement uses `10 images × 1K tier` and the remaining credit is refunded automatically.
</Info>

## Common Errors

| Case | Notes |
| - | - |
| Unsupported `resolution` tier | e.g. 3K / 4K → 400 |
| Unsupported `size` value | Neither `1K` / `1.5K` / `2K` / `auto`, a supported aspect ratio, nor valid pixel dimensions → 400 |
| Exact-pixel total out of range | Must be in `[921600, 4624220]` |
| Exact-pixel aspect out of range | Must be in `[1/16, 16]` |
| `n > 1` / grouped-image parameters | Rejected by the single-image model |
| More than 10 reference images | Rejected |
| Layer decomposition without an image or with multiple images | Exactly one image is required |
| Layer decomposition with a ratio or exact pixels | `size` supports only `1K` / `1.5K` / `2K` / `auto` |
| Transparent background for text-to-image or multiple inputs | Exactly one input image with an alpha channel is required |
| Transparent background with JPEG | Set `output_format: "png"` |
| `stream` / `tools` | Not supported by this model; returns 400 |
| Invalid prompt optimization mode | Only `standard` is supported |

<Note>
  ⏱️ **Slower generation**: \~90s for 1K, \~160s for 2K (quality first). Poll [Get Task Status](/en/api-reference/tasks/status) every 5–10 seconds; set the client timeout to **5 minutes**. Save generated results promptly.
</Note>

## Response

<ResponseField name="code" type="integer">
  Response status code
</ResponseField>

<ResponseField name="data" type="array">
  Response data array

  <Expandable title="Properties">
    <ResponseField name="status" type="string">
      Task status

      * `submitted` - Submitted
    </ResponseField>

    <ResponseField name="task_id" type="string">
      Unique task identifier
    </ResponseField>
  </Expandable>
</ResponseField>


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.