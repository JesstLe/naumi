import type {MediaProbe} from "./media-job-schema";

export function mediaExtension(mime:string){
  const extensions:Record<string,string>={"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","video/mp2t":"ts","video/x-matroska":"mkv","image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif","image/avif":"avif","audio/wav":"wav","audio/x-wav":"wav","audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/flac":"flac","audio/webm":"webm","audio/aac":"aac"};
  const extension=extensions[mime.split(";",1)[0].toLowerCase()];if(!extension)throw new Error("媒体格式无法确认");return extension;
}
/** Derive the container/type from actual streams, not a supplier's MIME label. */
export function inspectedMediaMime(probe:MediaProbe,kind:"video"|"image"|"audio"):string{
  const formats=probe.formatName.split(","),is=(...names:string[])=>names.some(name=>formats.includes(name));
  if(kind==="image"){
    if(!probe.width||!probe.height)throw new Error("图片没有有效媒体流");
    if(is("png_pipe")&&probe.videoCodec==="png")return "image/png";
    if(is("jpeg_pipe","image2")&&probe.videoCodec==="mjpeg")return "image/jpeg";
    if(is("webp_pipe")&&probe.videoCodec==="webp")return "image/webp";
    if(is("gif")&&probe.videoCodec==="gif")return "image/gif";
    if(is("mov","avif")&&["av1","avif"].includes(probe.videoCodec||"")&&!probe.durationSeconds)return "image/avif";
    throw new Error("图片产物格式无法确认");
  }
  if(kind==="video"&&(!probe.videoCodec||!probe.width||!probe.height||!probe.durationSeconds))throw new Error("视频没有有效可播放流");
  if(kind==="audio"&&!probe.audioCodecs.length)throw new Error("音频没有有效媒体流");
  if(is("mov","mp4"))return kind==="video"?"video/mp4":"audio/mp4";
  if(is("webm","matroska"))return kind==="video"?"video/webm":"audio/webm";
  if(kind==="video"&&is("mpegts"))return "video/mp2t";
  if(kind==="audio")for(const [format,mime] of [["wav","audio/wav"],["mp3","audio/mpeg"],["ogg","audio/ogg"],["flac","audio/flac"],["aac","audio/aac"]])if(is(format))return mime;
  throw new Error("媒体产物格式与预期类型不一致");
}
