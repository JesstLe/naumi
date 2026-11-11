---
dataset_info:
  features:
  - name: prompt
    dtype: string
  - name: video
    dtype: string
  - name: video_annotated
    dtype: string
  - name: likert_score_normalized_alignment
    dtype: float64
  - name: likert_score_normalized_physics
    dtype: float64
  - name: likert_score_normalized_style
    dtype: float64
  - name: weighted_ration_normal
    dtype: float64
  - name: weighted_ration_slow
    dtype: float64
  - name: weighted_ration_fast
    dtype: float64
  - name: confidence_normal
    dtype: float64
  - name: confidence_slow
    dtype: float64
  - name: confidence_fast
    dtype: float64
  - name: aligned_words_results
    list:
    - name: selectedAmount
      dtype: int64
    - name: word
      dtype: string
    - name: wordIndex
      dtype: int64
  - name: likert_score_alignment
    dtype: float64
  - name: likert_score_physics
    dtype: float64
  - name: likert_score_style
    dtype: float64
  - name: filename
    dtype: string
  - name: category
    dtype: string
  splits:
  - name: train
    num_bytes: 64616
    num_examples: 198
  download_size: 42146
  dataset_size: 64616
configs:
- config_name: default
  data_files:
  - split: train
    path: data/train-*
license: apache-2.0
task_categories:
- video-classification
- text-to-video
- text-classification
language:
- en
tags:
- videos
- t2v
- text-2-video
- text2video
- text-to-video
- human
- annotations
- preferences
- likert
- coherence
- alignment
- detail
- time
- speed
- physics
- insteractions
- collisions
pretty_name: T2V Rich Human Feedback
size_categories:
- 10K<n<100K
---
<style>

.vertical-container {
    display: flex;  
    flex-direction: column;
    gap: 60px;  
}

.image-container img {
  height: 250px; /* Set the desired height */
  margin:0;
  object-fit: contain; /* Ensures the aspect ratio is maintained */
  width: auto; /* Adjust width automatically based on height */
}

.image-container {
  display: flex; /* Aligns images side by side */
  justify-content: space-around; /* Space them evenly */
  align-items: center; /* Align them vertically */
}

  .container {
    width: 90%;
    margin: 0 auto;
  }

  .prompt {
    width: 100%;
    text-align: center;
    font-weight: bold;
    font-size: 16px;
    min-height: 60px;
  }

  .score-amount {
    margin: 0;
    margin-top: 10px;
  }

  .score-percentage {
    font-size: 12px;
    font-weight: semi-bold;
    text-align: right;
  }
  .score-container {
    display: flex;
    gap: 1rem;
    min-height: 30px;
  }

  .main-container {
    display: flex;  
    flex-direction: row;
    gap: 60px;  
}

  .good {
    color: #18c54f;
  }
  .bad {
    color: red;
  }
  
</style>

# Rapidata Video Generation Rich Human Feedback Dataset

<a href="https://rapidata.ai/?utm_source=huggingface&utm_medium=referral&utm_campaign=text_2_video_rich_human_feedback&utm_content=dataset_card">
<img src="https://cdn-uploads.huggingface.co/production/uploads/66f5624c42b853e73e0738eb/jfxR79bOztqaC6_yNNnGU.jpeg" width="300" alt="Dataset visualization">
</a>

<a href="https://huggingface.co/datasets/Rapidata/text-2-image-Rich-Human-Feedback">
</a>

<p>
If you get value from this dataset and would like to see more in the future, please consider liking it.
</p>

This dataset was collected in ~4 hours total using the [Rapidata Python API](https://docs.rapidata.ai/?utm_source=huggingface&utm_medium=referral&utm_campaign=text_2_video_rich_human_feedback&utm_content=dataset_card), accessible to anyone and ideal for large scale data annotation.

# Overview

In this dataset, ~22'000 human annotations were collected to evaluate AI-generated videos (using Sora) in 5 different categories. 

- Prompt - Video Alignment
- Word for Word Prompt Alignment
- Style
- Speed of Time flow
- Quality of Physics

# Prompt - Video Alignment

Evaluators were asked to evaluate AI-generated videos based on how well the generated video matches the prompt. The specific question posed was: "How well does the video match the description?"

## Calculation Details

Evaluators were given five response options ranging from "Perfectly" to "Not at all", with numerical values assigned as follows:

- "1: Perfectly" = 1
- "2: Very well" = 2
- "3: Moderately" = 3
- "4: A little" = 4
- "5: Not at all" = 5

The final Likert score was calculated based on the evaluators' responses using these assigned numerical values as well as their userScore.

Note that this means the lower the score, the better the performance.

## Examples
<h3>
How well does the video match the description?
</h3>

<div class="main-container">

  <div class="container">
      <div class="prompt">
          <q>Sea lions high-fiving surfers in big waves</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/017_20250114_sora.gif" width=500>
              <div class="score-percentage bad">Score: 3.6981</div>
          </div>
      </div>
  </div>

  <div class="container">
      <div class="prompt">
          <q>Flamenco dancers spinning in space station</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/139_20250114_sora.gif" width=500>
              <div class="score-percentage good">Score: 1.7045</div>
          </div>
      </div>
  </div>

</div>

<br/>
<br/>

<div class="main-container">

  <div class="container">
      <div class="prompt">
          <q>Camera falls out of hand into the water</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/049_20250114_sora.gif" width=500>
              <div class="score-percentage bad">Score: 3.7419</div>
          </div>
      </div>
  </div>

  <div class="container">
      <div class="prompt">
          <q>Bird's eye view spinning over chess players in park</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/033_20250114_sora.gif" width=500>
              <div class="score-percentage good">Score: 1.8021</div>
          </div>
      </div>
  </div>
  
</div>

# Word for Word Prompt Alignment

Evaluators were asked to evaluate AI-generated videos based on what part of the prompt did not align the video. The specific instruction was: "The video is based on the text below. Select mistakes, i.e., words that are not aligned with the video."

Only videos that scored above a 0.5 (were worse) in the above mentioned general Prompt Video Alignment were selected to be analyzed in detail. 

## Examples
<h3>
The video is based on the text below. Select mistakes, i.e., words that are not aligned with the video.
</h3>

<div class="main-container">

  <div class="container">
      <div class="image-container">
          <div>
              <img src="https://cdn-uploads.huggingface.co/production/uploads/672b7d79fd1e92e3c3567435/L5ncdW_-mKfT14Rn2-0X1.gif" width=500>
          </div>
      </div>
  </div>

  <div class="container">
      <div class="image-container">
          <div>
              <img src="https://cdn-uploads.huggingface.co/production/uploads/672b7d79fd1e92e3c3567435/WTkh6PSn84c9KOK9EnhbV.gif" width=500>
          </div>
      </div>
  </div>

</div>

</br>

# Style

evaluators were asked to rate AI-generated videos based on their visual appeal, without seeing the prompts used to generate them. The specific question posed was: "How much do you like the way this video looks visually?"

## Calculation Details

Evaluators were given five response options ranging from "Strongly Dislike" to "Strongly Like", with numerical values assigned as follows:

- "Strongly Dislike" = 1
- "Dislike" = 2
- "Neutral" = 3
- "Like" = 4
- "Strongly Like" = 5

The final Likert score was calculated based on the evaluators' responses using these assigned numerical values as well as their userScore.

Note that this means the lower the score, the better the performance.

# Speed of time flow

Evaluators were asked to evaluate AI-generated videos based on how time flows in the video. The specific question posed was: "How does time pass in this video?"

## Calculation Details
### Weighted Ratio

The weighted ratio is calculated using the responses and their associated userScores. This metric provides insight into how annotator responses are distributed across different options and indicates how ambiguously a video might fit into various categories.

### Confidence

The confidence metric serves to binarize the results. While it considers all responses and their Scores like the weighted ratio, its purpose is to determine the most likely correct category based on response patterns rather than simple weighted averaging.

It was also used in the data collection, which continued until either reaching 30 responses per datapoint or achieving a confidence level of >0.999, whichever occurred first.

## Examples
<h3>
How does time pass in this video?
</h3>

<div class="main-container">

  <div class="container">
      <div class="prompt">
          <q>Floating up past window washers on skyscraper floors</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/036_20250114_sora.gif" width=500>
            <div class="score-container">
                <div class="score-percentage good">confidence_normal: 0.5053</div>
                <div class="score-percentage good">confidence_slow: 0.4947</div>
            </div>
          </div>
      </div>
       <div>The confidence score was split between "normal" and "slow" timing. While the static human figures suggest slow motion, the rope moves at normal speed, creating this ambiguity.</div>
  </div>

  <div class="container">
      <div class="prompt">
          <q>Rose blooming and spreading petals in time lapse</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/070_20250114_sora.gif" width=500>
            <div class="score-container">
                <div class="score-percentage good">confidence_fast: 0.9993</div>
            </div>
          </div>
      </div>
       <div>This video demonstrates an interesting contrast: while the footage appears to be in slow motion, it actually shows a time-lapse sequence, leading annotators to correctly label it as "fast."</div>
  </div>

</div>

</br>

# Quality of Physics

Evaluators were asked to rate AI-generated videos based on if gravity and colisions make sense, without seeing the prompts used to generate them. The specific question posed was: "Does gravity, movements, collisions, and interactions make physical sense in this video?"

## Calculation Details

Evaluators were given five response options ranging from "Make total sense" to "Don't make any sense", with numerical values assigned as follows:

- Make total sense = 1
- Mostly make sense = 2
- Somewhat make sense = 3
- Rarely make sense = 4
- Don't make any sense = 5

The final Likert score was calculated based on the evaluators' responses using these assigned numerical values as well as their userScore.

Note that this means the lower the score, the better the performance.

## Examples
<h3>
Does gravity, movements, collisions, and interactions make physical sense in this video?
</h3>

<div class="main-container">

  <div class="container">
      <div class="prompt">
          <q>Mouse in chef hat cooking cat dinner in fancy restaurant</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/180_20250114_sora.gif" width=500>
              <div class="score-percentage bad">Score: 3.9797</div>
          </div>
      </div>
  </div>

  <div class="container">
      <div class="prompt">
          <q>Old TV screen size, faded colors, waves crashing over rocks</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/170_20250114_sora.gif" width=500>
              <div class="score-percentage good">Score: 2.2683</div>
          </div>
      </div>
  </div>

</div>

<br/>
<br/>

<div class="main-container">

  <div class="container">
      <div class="prompt">
          <q>Cats playing intense chess tournament, in the background giant hourglass drains between floating islands</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/206_20250114_sora.gif" width=500>
              <div class="score-percentage bad">Score: 4.1136</div>
          </div>
      </div>
  </div>

  <div class="container">
      <div class="prompt">
          <q>Butterfly emerging from blue to gold in morning light</q>
      </div>
      <div class="image-container">
          <div>
              <img src="https://assets.rapidata.ai/067_20250114_sora.gif" width=500>
              <div class="score-percentage good">Score: 2.4006</div>
          </div>
      </div>
  </div>
  
</div>

# Videos
The videos in the dataset viewer are previewed as scaled down gifs. The original videos are stored under ["Files and versions"](https://huggingface.co/datasets/Rapidata/text-2-video-Rich-Human-Feedback/tree/main/Videos).