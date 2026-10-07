export function modelCostPhase(binding?: string, modality?: string) {
  if(binding==='vision.reference')return 'classification';
  if(binding==='vision.review')return 'quality-check';
  if(binding==='vision.ocr')return 'ocr';
  if(modality==='text')return 'text-generation';
  if(modality==='video')return 'video-generation';
  return binding==='image.edit'?'edit':'generation';
}
