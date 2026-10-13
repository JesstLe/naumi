import type {MediaProbe} from "./media-job-schema";

export function mediaExtension(mime:string){
  const extensions:Record<string,string>={"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","video/mp2t":"ts","video/x-matroska":"mkv","image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif","image/avif":"avif","audio/wav":"wav","audio/x-wav":"wav","audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/flac":"flac","audio/webm":"webm","audio/aac":"aac"};
  Object.assign(extensions,{"video/x-msvideo":"avi","video/x-flv":"flv","video/ogg":"ogv","video/mpeg":"mpg","video/x-ms-asf":"asf","image/bmp":"bmp","image/tiff":"tiff","image/apng":"apng","audio/x-matroska":"mka","audio/aiff":"aiff","audio/x-ms-wma":"wma"});
  const extension=extensions[mime.split(";",1)[0].toLowerCase()];if(!extension)throw new Error("媒体格式无法确认");return extension;
}
/** Derive the container/type from actual streams, not a supplier's MIME label. */
export function inspectedMediaMime(probe:MediaProbe,kind:"video"|"image"|"audio",declaredMime?:string):string{
  const formats=probe.formatName.split(","),is=(...names:string[])=>names.some(name=>formats.includes(name));
  if(kind==="image"){
    if(!probe.width||!probe.height)throw new Error("图片没有有效媒体流");
    if(is("png_pipe")&&probe.videoCodec==="png")return "image/png";
    if(is("jpeg_pipe","image2")&&probe.videoCodec==="mjpeg")return "image/jpeg";
    if(is("webp_pipe")&&probe.videoCodec==="webp")return "image/webp";
    if(is("gif")&&probe.videoCodec==="gif")return "image/gif";
    if(is("bmp_pipe","image2")&&probe.videoCodec==="bmp")return "image/bmp";
    if(is("tiff_pipe","image2")&&probe.videoCodec==="tiff")return "image/tiff";
    if(is("apng")&&probe.videoCodec==="apng")return "image/apng";
    if(is("mov","avif")&&["av1","avif"].includes(probe.videoCodec||"")&&!probe.durationSeconds)return "image/avif";
    throw new Error("图片产物格式无法确认");
  }
  if(kind==="video"&&(!probe.videoCodec||!probe.width||!probe.height||!probe.durationSeconds))throw new Error("视频没有有效可播放流");
  if(kind==="audio"&&!probe.audioCodecs.length)throw new Error("音频没有有效媒体流");
  if(is("mov","mp4"))return kind==="video"?"video/mp4":"audio/mp4";
  if(is("webm","matroska")){
    const webmVideo=!probe.videoCodec||["vp8","vp9","av1"].includes(probe.videoCodec),webmAudio=probe.audioCodecs.every(codec=>["opus","vorbis"].includes(codec));
    const matroska=declaredMime?.split(";",1)[0].endsWith("x-matroska")||!webmVideo||!webmAudio;
    return kind==="video"?matroska?"video/x-matroska":"video/webm":matroska?"audio/x-matroska":"audio/webm";
  }
  if(kind==="video"&&is("mpegts"))return "video/mp2t";
  if(kind==="video")for(const [format,mime] of [["avi","video/x-msvideo"],["flv","video/x-flv"],["ogg","video/ogg"],["mpeg","video/mpeg"],["asf","video/x-ms-asf"]])if(is(format))return mime;
  if(kind==="audio")for(const [format,mime] of [["wav","audio/wav"],["mp3","audio/mpeg"],["ogg","audio/ogg"],["flac","audio/flac"],["aac","audio/aac"],["aiff","audio/aiff"],["asf","audio/x-ms-wma"]])if(is(format))return mime;
  throw new Error("媒体产物格式与预期类型不一致");
}
