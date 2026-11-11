---
dataset_info:
  features:
  - name: prompt
    dtype: string
  - name: image1
    dtype: image
  - name: image2
    dtype: image
  - name: votes_image1
    dtype: int64
  - name: votes_image2
    dtype: int64
  - name: model1
    dtype: string
  - name: model2
    dtype: string
  - name: detailed_results
    dtype: string
  - name: image1_path
    dtype: string
  - name: image2_path
    dtype: string
  splits:
  - name: train_0001
    num_bytes: 238423283
    num_examples: 1000
  - name: train_0002
    num_bytes: 258408624
    num_examples: 1000
  - name: train_0003
    num_bytes: 259408157
    num_examples: 1000
  - name: train_0004
    num_bytes: 269976915
    num_examples: 1000
  - name: train_0005
    num_bytes: 312749669
    num_examples: 1000
  - name: train_0006
    num_bytes: 333659964
    num_examples: 1000
  - name: train_0007
    num_bytes: 324083998
    num_examples: 1000
  - name: train_0008
    num_bytes: 334409484
    num_examples: 1000
  - name: train_0009
    num_bytes: 321436280
    num_examples: 1000
  - name: train_0010
    num_bytes: 304937129
    num_examples: 1000
  - name: train_0011
    num_bytes: 336937839
    num_examples: 1000
  - name: train_0012
    num_bytes: 320205763
    num_examples: 1000
  - name: train_0013
    num_bytes: 285413532
    num_examples: 1000
  - name: train_0014
    num_bytes: 236941497
    num_examples: 1000
  - name: train_0015
    num_bytes: 260086908
    num_examples: 1000
  - name: train_0016
    num_bytes: 247452595
    num_examples: 1000
  - name: train_0017
    num_bytes: 239925643
    num_examples: 1000
  - name: train_0018
    num_bytes: 288589778
    num_examples: 1000
  - name: train_0019
    num_bytes: 329187230
    num_examples: 1000
  - name: train_0020
    num_bytes: 300662332
    num_examples: 1000
  - name: train_0021
    num_bytes: 284815865
    num_examples: 1000
  - name: train_0022
    num_bytes: 241495700
    num_examples: 1000
  - name: train_0023
    num_bytes: 221274497
    num_examples: 1000
  - name: train_0024
    num_bytes: 253627356
    num_examples: 1000
  - name: train_0025
    num_bytes: 228000153
    num_examples: 1000
  - name: train_0026
    num_bytes: 143833894
    num_examples: 622
  download_size: 1989350951
  dataset_size: 7175944085
configs:
- config_name: default
  data_files:
  - split: train_0001
    path: data/train_0001-*
  - split: train_0002
    path: data/train_0002-*
  - split: train_0003
    path: data/train_0003-*
  - split: train_0004
    path: data/train_0004-*
  - split: train_0005
    path: data/train_0005-*
  - split: train_0006
    path: data/train_0006-*
  - split: train_0007
    path: data/train_0007-*
  - split: train_0008
    path: data/train_0008-*
  - split: train_0009
    path: data/train_0009-*
  - split: train_0010
    path: data/train_0010-*
  - split: train_0011
    path: data/train_0011-*
  - split: train_0012
    path: data/train_0012-*
  - split: train_0013
    path: data/train_0013-*
  - split: train_0014
    path: data/train_0014-*
  - split: train_0015
    path: data/train_0015-*
  - split: train_0016
    path: data/train_0016-*
  - split: train_0017
    path: data/train_0017-*
  - split: train_0018
    path: data/train_0018-*
  - split: train_0019
    path: data/train_0019-*
  - split: train_0020
    path: data/train_0020-*
  - split: train_0021
    path: data/train_0021-*
  - split: train_0022
    path: data/train_0022-*
  - split: train_0023
    path: data/train_0023-*
  - split: train_0024
    path: data/train_0024-*
  - split: train_0025
    path: data/train_0025-*
  - split: train_0026
    path: data/train_0026-*
license: cdla-permissive-2.0
task_categories:
- text-to-image
- image-to-text
- image-to-image
- image-classification
- reinforcement-learning
language:
- en
tags:
- Human
- Preference
- country
- language
- flux
- midjourney
- dalle3
- stabeldiffusion
size_categories:
- 100K<n<1M
pretty_name: Flux vs. Dalle3 vs. Midjourney vs. Stabel Diffusion - Human Preference Dataset
---

## **NOTE:** A newer version of this dataset is available [Imagen3_Flux1.1_Flux1_SD3_MJ_Dalle_Human_Preference_Dataset](https://huggingface.co/datasets/Rapidata/Imagen3_Flux1.1_Flux1_SD3_MJ_Dalle_Human_Preference_Dataset)

# Rapidata Image Generation Preference Dataset

> **Size:** 25,622 rows · 674,543 individual human votes in total (verified against the parquet files on 2026-11-03)


<a href="https://rapidata.ai/?utm_source=huggingface&utm_medium=referral&utm_campaign=700k_human_preference_dataset_flux_sd3_mj_dalle3&utm_content=dataset_card">
<img src="https://cdn-uploads.huggingface.co/production/uploads/66f5624c42b853e73e0738eb/jfxR79bOztqaC6_yNNnGU.jpeg" width="400" alt="Dataset visualization">
</a>

This Dataset is a 1/3 of a 2M+ human annotation dataset that was split into three modalities: Preference, Coherence, Text-to-Image Alignment. 
- Link to the Coherence dataset: https://huggingface.co/datasets/Rapidata/Flux_SD3_MJ_Dalle_Human_Coherence_Dataset
- Link to the Text-2-Image Alignment dataset: https://huggingface.co/datasets/Rapidata/Flux_SD3_MJ_Dalle_Human_Alignment_Dataset

It was collected in ~2 Days using the Rapidata Python API [https://docs.rapidata.ai](https://docs.rapidata.ai/?utm_source=huggingface&utm_medium=referral&utm_campaign=700k_human_preference_dataset_flux_sd3_mj_dalle3&utm_content=dataset_card)

If you get value from this dataset and would like to see more in the future, please consider liking it.

## Overview
One of the largest human preference datasets for text-to-image models, this release contains over 700,000 human preference votes - one third of our complete 2 million vote collection. This preference dataset is part of a larger evaluation comparing images from leading AI models including Flux.1, DALL-E 3, MidJourney, and Stable Diffusion. The complete collection includes two additional datasets of equal size focusing on image coherence and text-image alignment, available on our profile. This extensive dataset was collected in just 2 days using Rapidata's groundbreaking annotation technology, demonstrating unprecedented efficiency in large-scale human feedback collection.

Explore our latest model rankings on our [website](https://www.benchmark.ai/image?utm_source=huggingface&utm_medium=referral&utm_campaign=700k_human_preference_dataset_flux_sd3_mj_dalle3&utm_content=dataset_card).

## Key Features
- **Massive Scale**: 700,000+ individual human preference votes collected in 48 hours
- **Global Representation**: Collected from 144,292 participants across 145 countries
- **Diverse Prompts**: 282 carefully curated prompts testing various aspects of image generation
- **Leading Models**: Comparisons between four state-of-the-art image generation models
- **Rigorous Methodology**: Uses pairwise comparisons with built-in quality controls
- **Rich Demographic Data**: Includes annotator information about age, gender, and geographic location


<img src="https://cdn-uploads.huggingface.co/production/uploads/66f5624c42b853e73e0738eb/1LVQj_G5bFio7w4WXPxsC.png" alt="Image description" width="650">
**Figure:** Overview of the distribution of annotators by continent (left) compared to the world population distribution(right)

## Applications
This dataset is invaluable for:
- Training and fine-tuning image generation models
- Understanding global preferences in AI-generated imagery
- Developing better evaluation metrics for generative models
- Researching cross-cultural aesthetic preferences
- Benchmarking new image generation models

## Data Collection Powered by Rapidata
What traditionally would take weeks or months of data collection was accomplished in just 48 hours through Rapidata's innovative annotation platform. Our technology enables:
- Lightning-fast data collection at massive scale
- Global reach across 145+ countries
- Built-in quality assurance mechanisms
- Comprehensive demographic representation
- Cost-effective large-scale annotation

## Citation
If you use this dataset in your research, please cite our Startup Rapidata and our paper: "Finding the Subjective Truth: Collecting 2 Million Votes for Comprehensive Gen-AI Model Evaluation" (arXiv:2409.11904v2)
```
@misc{christodoulou2024findingsubjectivetruthcollecting,
      title={Finding the Subjective Truth: Collecting 2 Million Votes for Comprehensive Gen-AI Model Evaluation}, 
      author={Dimitrios Christodoulou and Mads Kuhlmann-Jørgensen},
      year={2024},
      eprint={2409.11904},
      archivePrefix={arXiv},
      primaryClass={cs.CV},
      url={https://arxiv.org/abs/2409.11904}, 
}
```

## About Rapidata
Rapidata's technology makes collecting human feedback at scale faster and more accessible than ever before. Visit [rapidata.ai](https://rapidata.ai/?utm_source=huggingface&utm_medium=referral&utm_campaign=700k_human_preference_dataset_flux_sd3_mj_dalle3&utm_content=dataset_card) to learn more about how we're revolutionizing human feedback collection for AI development.