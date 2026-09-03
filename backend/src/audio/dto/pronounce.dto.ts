import { IsString, IsNotEmpty, MaxLength, IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';
import { CHIRP3_HD_JA_VOICES } from '../google-tts.service';

export class PronounceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @IsIn(['clear', 'paced'])
  mode: 'clear' | 'paced';

  @IsOptional()
  @IsInt()
  @Min(150)
  @Max(1000)
  pauseMs?: number;

  @IsOptional()
  @IsIn(CHIRP3_HD_JA_VOICES)
  voice?: string;
}
