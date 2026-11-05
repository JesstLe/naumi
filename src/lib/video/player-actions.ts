/** Media UI commands; shared by Canvas projection and video controls. */
export type VideoPlayerAction={action:"frame"|"extract_audio"|"separate"|"trim"|"concat"|"ffmpeg"|"ffprobe";timestamp?:number|"first"|"last"};
