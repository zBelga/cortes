import { Global, Module } from '@nestjs/common';
import { FfmpegService } from './ffmpeg.service';
import { FfprobeService } from './ffprobe.service';
import { YtdlpService } from './ytdlp.service';

@Global()
@Module({
  providers: [FfmpegService, FfprobeService, YtdlpService],
  exports: [FfmpegService, FfprobeService, YtdlpService],
})
export class MediaModule {}
